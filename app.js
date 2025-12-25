import { db, LANG_MAP } from './config.js';
import * as Services from './services.js';
import { ref, set, get, onValue, onChildAdded, onChildChanged, serverTimestamp, onDisconnect, push, query, orderByKey, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Service Worker Registration ---
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
}

// --- State Variables ---
let lastRenderedUserId = null;
let currentRoom, nickname, userId, presenceRef, typingTimeout;
let roomUnsubscribes = [];
let replyingToMessage = null;
let activeMessageMenu = null;
let loadTime = Date.now();
let currentTranslationLang = localStorage.getItem('astroUserLang') || "pt"; 
let currentTranslationLangGlobal = localStorage.getItem('astroUserLangGlobal'); 
const userColors = {};
let onlineUsersInRoom = {};

// Audio
let notificationAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
notificationAudio.volume = 0.5;
let audioUnlocked = false;

// --- Cache de Elementos DOM ---
const DOMElements = {
    splash: document.getElementById('splash-screen'),
    app: document.getElementById('app-container'),
    nicknameScreen: document.getElementById('nickname-screen'),
    lobbyScreen: document.getElementById('lobby-screen'),
    chat: document.getElementById('chat-screen'),
    nicknameInput: document.getElementById('nickname-input'),
    messagesContainer: document.getElementById('messages-container'),
    messagesList: document.getElementById('messages-list'),
    messageInput: document.getElementById('message-input'),
    typingIndicatorContainer: document.getElementById('typing-indicator-container'),
    replyPreview: document.getElementById('reply-preview'),
    roomCodeDisplay: document.querySelector('.room-code-value'),
    userCountDisplay: document.getElementById('user-count-display'),
    userAvatarsContainer: document.getElementById('user-avatars-container'),
    roomListContainer: document.getElementById('room-list-container'),
    lobbyNickname: document.getElementById('lobby-nickname'),
    roomActionsModal: document.getElementById('room-actions-modal'),
    modalRoomCodeInput: document.getElementById('modal-room-code-input'),
    settingsModal: document.getElementById('settings-modal'),
    toastContainer: document.getElementById('toast-container'),
    rewriteBtn: document.getElementById('rewrite-btn'),
    grammarBtn: document.getElementById('grammar-check-btn'),
    roomLangSelector: document.getElementById('room-lang-selector'),
    introLangSelector: document.getElementById('intro-lang-selector'),
    studyModal: document.getElementById('study-modal'),
    grammarModal: document.getElementById('grammar-modal'),
    genericModal: document.getElementById('generic-modal'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    notifBtn: document.getElementById('notif-btn')
};

// --- Notificações ---
function updateNotifIcon() {
    if (Notification.permission === 'granted') {
        DOMElements.notifBtn.innerHTML = '<i class="fas fa-bell text-[var(--primary-color)]"></i>';
        DOMElements.notifBtn.title = "Notificações Ativadas";
    } else {
        DOMElements.notifBtn.innerHTML = '<i class="fas fa-bell-slash text-[var(--text-muted-color)]"></i>';
        DOMElements.notifBtn.title = "Ativar Notificações";
    }
}

async function unlockAudioAndRequestPermission() {
    if (!audioUnlocked) {
        try {
            await notificationAudio.play();
            notificationAudio.pause();
            notificationAudio.currentTime = 0;
            audioUnlocked = true;
        } catch (e) {}
    }
    if ("Notification" in window && Notification.permission !== "granted") {
        try {
            const permission = await Notification.requestPermission();
            updateNotifIcon();
            if (permission === 'granted') {
                new Notification("Astro Chat", { body: "Notificações ativadas!" });
                notificationAudio.play().catch(e => {});
            }
        } catch (e) {}
    }
}

function checkAndNotify(msgData) {
    const isNew = msgData.timestamp > loadTime;
    const isOther = msgData.userId !== userId;
    if (isNew && isOther) {
        if (audioUnlocked) try { notificationAudio.play().catch(e => {}); } catch(e) {}
        if (document.hidden && "serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(reg => 
                reg.showNotification(`Astro: ${msgData.nickname}`, { body: msgData.text, icon: "https://cdn-icons-png.flaticon.com/512/2554/2554978.png" })
            );
        }
    }
}

// --- UI Helpers ---
const showToast = (msg, type='info') => {
    const toast = document.createElement('div'); toast.className = 'toast';
    let icon = type === 'success' ? 'fa-check-circle text-green-400' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    DOMElements.toastContainer.appendChild(toast); setTimeout(() => toast.remove(), 4000);
};

const switchScreen = (screen) => {
    ['nickname', 'lobby', 'chat'].forEach(s => {
        const el = DOMElements[s === 'chat' ? 'chat' : `${s}Screen`];
        el.classList.toggle('hidden', s !== screen);
        el.classList.toggle('flex', s === screen);
    });
    if (screen === 'lobby') renderRoomList();
    if (screen === 'chat') {
        onlineUsersInRoom = {};
        loadTime = Date.now();
    }
};

const scrollToBottom = () => DOMElements.messagesContainer.scrollTop = DOMElements.messagesContainer.scrollHeight;

// --- User & Room Logic ---
const initializeUser = () => {
    let storedUserId = localStorage.getItem('astroUserId');
    if (!storedUserId) { storedUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`; localStorage.setItem('astroUserId', storedUserId); }
    userId = storedUserId;
};

const initializeTheme = () => {
    const savedTheme = localStorage.getItem('astroTheme') || 'dark';
    document.body.dataset.theme = savedTheme;
    updateThemeButtons(savedTheme);
};

const updateThemeButtons = (theme) => {
    document.querySelectorAll('.theme-btn').forEach(btn => {
        if(btn.dataset.theme === theme) btn.classList.add('ring-2', 'ring-[var(--primary-color)]');
        else btn.classList.remove('ring-2', 'ring-[var(--primary-color)]');
    });
}

const initializePresence = () => {
    presenceRef = ref(db, `presence/${currentRoom}/${userId}`);
    set(presenceRef, { nickname, isOnline: true });
    onDisconnect(presenceRef).update({ isOnline: false });
};

const updatePresenceUI = (users) => {
    const online = Object.entries(users).filter(([, u]) => u && u.isOnline);
    DOMElements.userCountDisplay.textContent = `${online.length} online`;
    const container = DOMElements.userAvatarsContainer; container.innerHTML = '';
    online.slice(0, 4).forEach(([id, user]) => {
        if (!user.nickname) return;
        const div = document.createElement('div');
        div.className = "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-[var(--surface-color)] shadow-sm";
        div.style.backgroundColor = userColors[id] || '#666';
        div.textContent = user.nickname.charAt(0).toUpperCase();
        container.appendChild(div);
    });
};

const joinRoom = async (roomCode) => {
    await cleanupRoomListeners();
    if (!roomCode) return;
    currentRoom = roomCode;
    updateRecentRooms(roomCode);
    switchScreen('chat');
    DOMElements.roomCodeDisplay.textContent = roomCode;
    DOMElements.messagesList.innerHTML = '';
    DOMElements.messagesList.appendChild(DOMElements.typingIndicatorContainer);
    initializePresence();
    
    const messagesRef = query(ref(db, `messages/${currentRoom}`), orderByKey());
    const unsubMessages = onChildAdded(messagesRef, s => {
        const data = s.val(); renderMessage(data, s.key); checkAndNotify(data);
    });
    const unsubChanged = onChildChanged(messagesRef, s => renderMessage(s.val(), s.key));
    const unsubPresence = onValue(ref(db, `presence/${currentRoom}`), snapshot => {
        const data = snapshot.val() || {}; onlineUsersInRoom = data; updatePresenceUI(data);
    });
    const unsubTyping = onValue(ref(db, `typing/${currentRoom}`), snapshot => {
        const typingUsers = snapshot.val() || {}; delete typingUsers[userId]; renderTypingIndicator(typingUsers);
    });
    roomUnsubscribes.push(unsubPresence, unsubTyping, unsubMessages, unsubChanged);
};

const cleanupRoomListeners = async () => {
    if (presenceRef) await set(presenceRef, null);
    roomUnsubscribes.forEach(unsub => unsub()); roomUnsubscribes = [];
};

const leaveRoom = async () => { await cleanupRoomListeners(); currentRoom = null; switchScreen('lobby'); };

const updateRecentRooms = (roomCode) => {
    let recent = JSON.parse(localStorage.getItem("recentRooms") || "[]").filter(r => r !== roomCode);
    recent.unshift(roomCode); localStorage.setItem("recentRooms", JSON.stringify(recent.slice(0, 10)));
};

async function updateNicknameHistory(newNickname) {
    if (!userId) return;
    const recentRooms = JSON.parse(localStorage.getItem("recentRooms") || "[]");
    for (const roomCode of recentRooms) {
        try {
            const msgsRef = ref(db, `messages/${roomCode}`);
            const snapshot = await get(msgsRef);
            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach((childSnap) => {
                    const msg = childSnap.val();
                    if (msg.userId === userId && msg.nickname !== newNickname) updates[`${childSnap.key}/nickname`] = newNickname;
                });
                if (Object.keys(updates).length > 0) await update(msgsRef, updates);
            }
        } catch(e) {}
    }
}

const renderRoomList = () => {
    const list = DOMElements.roomListContainer; list.innerHTML = '';
    const allRooms = JSON.parse(localStorage.getItem("recentRooms") || "[]");
    if (allRooms.length === 0) {
        list.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-muted-color opacity-50 mt-10"><i class="fas fa-wind text-4xl mb-2"></i><p>Nenhuma sala recente.</p></div>`; return;
    }
    allRooms.forEach(roomCode => {
        const el = document.createElement('div');
        el.className = "flex items-center p-4 bg-[var(--surface-color)] rounded-xl cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 mb-2";
        el.innerHTML = `<div class="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-md mr-3"><i class="fas fa-hashtag"></i></div><div class="flex-1"><h3 class="font-bold text-[var(--text-color)]">#${roomCode}</h3><p class="text-xs text-muted-color">Clique para entrar</p></div><button class="del-room w-8 h-8 rounded-full hover:text-red-500"><i class="fas fa-trash"></i></button>`;
        el.onclick = (e) => { if (e.target.closest('.del-room')) { e.stopPropagation(); const n = allRooms.filter(r => r !== roomCode); localStorage.setItem("recentRooms", JSON.stringify(n)); renderRoomList(); } else joinRoom(roomCode); };
        list.appendChild(el);
    });
};

// --- Chat & Rendering Logic ---

const renderTypingIndicator = (typingUsers) => {
    const container = DOMElements.typingIndicatorContainer;
    container.innerHTML = '';
    Object.entries(typingUsers).forEach(([typingUserId, userData]) => {
        if (!userData || !userData.nickname) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-start mb-2 ml-1 animate-pulse max-w-[80%]';
        wrapper.innerHTML = `<div class="text-xs text-muted-color mb-1 ml-2">${userData.nickname} digitando...</div><div class="chat-bubble bg-[var(--bubble-other-bg)] text-[var(--bubble-other-text)] rounded-2xl py-2 px-4 opacity-70 italic text-sm border border-white/10">${userData.text || '...'}</div>`;
        container.appendChild(wrapper);
    });
    if (Object.keys(typingUsers).length > 0) scrollToBottom();
};

const performTranslation = async (msgId, originalText, lang) => {
    const el = document.getElementById(`trans-${msgId}`);
    if (!el) return;
    // Se já tiver texto traduzido e não for spinner, evita re-traduzir desnecessariamente se o idioma for o mesmo
    // Mas aqui como é chamada ao renderizar, mantemos o spinner se necessário.
    if (!el.textContent || el.querySelector('.fa-spin')) el.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>';

    try {
        const translated = await Services.traduzir(originalText, lang);
        if(translated.toLowerCase().trim() === originalText.toLowerCase().trim()) {
            el.textContent = translated;
            const origEl = el.nextElementSibling;
            if(origEl && origEl.classList.contains('original-text')) {
                origEl.style.display = 'none'; el.style.marginBottom = '0'; 
            }
        } else {
            el.textContent = translated;
            const origEl = el.nextElementSibling;
            if(origEl && origEl.classList.contains('original-text')) origEl.style.display = 'block'; 
        }
    } catch (err) {
        el.style.display = 'none';
    }
}

const retranslateAllMessages = (newLang) => {
    showToast(`Traduzindo para ${newLang.toUpperCase()}...`, 'info');
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
        const msgId = wrapper.dataset.msgId;
        const originalTextEl = wrapper.querySelector('.original-text');
        if (originalTextEl && msgId) performTranslation(msgId, originalTextEl.innerText, newLang);
    });
};

const renderMessage = (msgData, msgId) => {
    if (!msgData || !msgData.text) return;

    // --- CORREÇÃO DE DUPLICAÇÃO ---
    // Verificamos se a mensagem já existe no DOM.
    // Isso acontece quando o Firebase dispara 'onChildChanged' (ex: atualização de timestamp).
    const existingMsgEl = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);

    const isSelf = msgData.userId === userId;
    // Se estamos atualizando, mantemos a lógica visual anterior ou reavaliamos se for necessário
    // Simplificação: recalculamos isSameUserAsPrevious apenas para novos elementos ou assumimos desconectado
    const isSameUserAsPrevious = lastRenderedUserId === msgData.userId;

    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper items-${isSelf ? 'end' : 'start'}`;
    messageWrapper.dataset.msgId = msgId;
    messageWrapper.dataset.userId = msgData.userId;

    // Se estiver substituindo, tentamos preservar a classe 'grouped-message' se ela já existia
    if (existingMsgEl && existingMsgEl.classList.contains('grouped-message')) {
        messageWrapper.classList.add('grouped-message');
    } else if (!existingMsgEl && isSameUserAsPrevious) {
        messageWrapper.classList.add('grouped-message');
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble selectable-text';

    if (!userColors[msgData.userId]) userColors[msgData.userId] = `hsl(${Math.random() * 360}, 70%, 60%)`;

    let contentHTML = '';
    if (msgData.repliedTo) {
       contentHTML += `<div class="mb-2 pl-2 border-l-2 border-white/30 text-xs opacity-70"><strong class="block" style="white-space: nowrap;">${msgData.repliedTo.nickname}</strong><span class="truncate block max-w-[200px]">${msgData.repliedTo.text}</span></div>`;
    }

    // Só mostra o nome se não for eu e não for agrupada (mesmo usuário anterior)
    // Nota: Ao substituir (update), a lógica de agrupamento visual pode ficar ligeiramente imprecisa sem re-renderizar a lista toda,
    // mas para evitar duplicidade, substituir o elemento é o correto.
    const showName = !isSelf && (!existingMsgEl ? !isSameUserAsPrevious : !messageWrapper.classList.contains('grouped-message'));

    if (showName) {
        contentHTML += `<div class="nickname-display text-xs font-bold mb-1 opacity-90"
            style="color: ${userColors[msgData.userId]};">
            ${msgData.nickname}
        </div>`;
    }

    const safeText = msgData.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
    const translationId = `trans-${msgId}`;
    
    // Se já existia, podemos tentar recuperar a tradução atual para não piscar o loading
    let currentTrans = '';
    if (existingMsgEl) {
        const oldTransEl = existingMsgEl.querySelector('.translated-text');
        if (oldTransEl) currentTrans = oldTransEl.innerHTML;
    }

   contentHTML += `
    <div class="flex items-start gap-2">
        <div id="${translationId}" class="translated-text flex-1">
            ${currentTrans || '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>'}
        </div>

        <button 
            class="speak-btn text-xs opacity-60 hover:opacity-100 transition"
            title="Ouvir tradução"
            data-msg-id="${msgId}">
            <i class="fas fa-volume-high"></i>
        </button>
    </div>

    <div class="original-text">${safeText}</div>
    `;

    const time = new Date(msgData.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const meta = document.createElement('div');
    meta.className = `message-meta ${isSelf ? 'meta-self' : 'meta-other'}`;
    meta.innerHTML = `
        <span class="message-time">${time}</span>
        ${isSelf ? '<i class="fas fa-check ml-1"></i>' : ''}
    `;

    bubble.innerHTML = contentHTML;
    const speakBtn = bubble.querySelector('.speak-btn');

    if (speakBtn) {
        speakBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
        });

        speakBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            speakTranslatedMessage(msgId);
        });
    }

    if(!isSelf) {
        messageWrapper.appendChild(bubble);
        messageWrapper.appendChild(meta);
    } else {
        messageWrapper.appendChild(meta);
        messageWrapper.appendChild(bubble);
    }

    bubble.addEventListener('click', (e) => {
        if (e.target.closest('.speak-btn')) return;
        if (window.getSelection().toString().length > 0) return;

        openActionsMenu(bubble, msgId, msgData.text);
    });

    if (existingMsgEl) {
        // SUBSTITUI a mensagem existente em vez de adicionar uma nova
        DOMElements.messagesList.replaceChild(messageWrapper, existingMsgEl);
        // Se não tinha tradução (era loading ou nova), busca agora
        if (currentTrans.includes('fa-spin') || !currentTrans) {
            performTranslation(msgId, msgData.text, currentTranslationLang);
        }
    } else {
        // Adiciona nova mensagem
        DOMElements.messagesList.insertBefore(messageWrapper, DOMElements.typingIndicatorContainer);
        scrollToBottom();
        performTranslation(msgId, msgData.text, currentTranslationLang);
    }

    lastRenderedUserId = msgData.userId;
};

// --- Actions & Modals ---
const detectedLangCache = {};

/**
 * Executa a síntese de voz baseada no idioma detetado do texto.
 * @param {string} msgId - O ID do elemento que contém o texto.
 */

function setSpeakLoading(msgId) {
    const btn = document.querySelector(
        `.speak-btn[data-msg-id="${msgId}"] i`
    );
    if (!btn) return;

    btn.className = 'fas fa-circle-notch fa-spin';
}

function setSpeakIdle(msgId) {
    const btn = document.querySelector(
        `.speak-btn[data-msg-id="${msgId}"] i`
    );
    if (!btn) return;

    btn.className = 'fas fa-volume-high';
}

async function speakTranslatedMessage(msgId) {
    const transEl = document.getElementById(`trans-${msgId}`);
    if (!transEl) return;

    const text = transEl.textContent.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;

    // 🔄 Ícone de carregamento
    setSpeakLoading(msgId);

    // Cancela qualquer fala anterior
    speechSynthesis.cancel();

    let detectedLang = null;

    try {
        const detectionResult = await Services.detectarIdioma(text);
        detectedLang =
            typeof detectionResult === 'string'
                ? detectionResult
                : detectionResult?.lang;
    } catch (err) {
        console.warn('Falha ao detectar idioma:', err);
    }

    const langMap = {
        pt: 'pt-BR',
        en: 'en-US',
        es: 'es-ES',
        fr: 'fr-FR',
        de: 'de-DE',
        it: 'it-IT',
        ru: 'ru-RU',
        ja: 'ja-JP',
        zh: 'zh-CN',
        ko: 'ko-KR'
    };

    const targetLang = langMap[detectedLang] || detectedLang || 'en-US';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLang;
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 1;

    const getBestVoice = () => {
        const voices = speechSynthesis.getVoices();
        return (
            voices.find(v =>
                v.lang === targetLang &&
                /natural|google|microsoft|premium/i.test(v.name)
            ) ||
            voices.find(v => v.lang === targetLang) ||
            voices.find(v => v.lang.startsWith(targetLang.split('-')[0])) ||
            null
        );
    };

    utterance.onstart = () => {
        // 🔊 Começou a falar → ícone normal
        setSpeakIdle(msgId);
    };

    utterance.onend = () => {
        setSpeakIdle(msgId);
    };

    utterance.onerror = () => {
        setSpeakIdle(msgId);
    };

    const speak = () => {
        const voice = getBestVoice();
        if (voice) utterance.voice = voice;
        speechSynthesis.speak(utterance);
    };

    if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.onvoiceschanged = speak;
    } else {
        speak();
    }
}


const openActionsMenu = (triggerEl, msgId, text) => {
    if(activeMessageMenu) activeMessageMenu.remove();
    const menu = document.createElement('div');
    menu.className = 'options-menu';
    
    const options = [
        {
            icon: 'fa-reply',
            label: 'Responder',
            action: () => {
                startReply(msgId, text);
            }
        },
        { icon: 'fa-language', label: 'Retraduzir', class: 'opt-translate', action: () => handleAction('translate', text, msgId) },
        { icon: 'fa-lightbulb', label: 'Contexto', class: 'opt-context', action: () => handleAction('context', text, msgId) },
        { icon: 'fa-graduation-cap', label: 'Estudar', class: 'opt-study', action: () => handleAction('study', text, msgId) },
        { icon: 'fa-random', label: 'Variações', class: 'opt-vars', action: () => handleAction('variations', text, msgId) },
        { icon: 'fa-copy', label: 'Copiar', class: '', action: () => { navigator.clipboard.writeText(text); showToast('Copiado!'); } }
    ];

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = `options-item ${opt.class || ''}`;
        item.innerHTML = `<i class="fas ${opt.icon}"></i> ${opt.label}`;
        item.onclick = (e) => { e.stopPropagation(); opt.action(); menu.remove(); activeMessageMenu = null; };
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    menu.classList.add('show'); 
    activeMessageMenu = menu;
    const rect = triggerEl.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    
    let top = rect.bottom + 5;
    let left = rect.left;
    if (top + menuRect.height > window.innerHeight) top = rect.top - menuRect.height - 5;
    if (left + menuRect.width > window.innerWidth - 10) left = window.innerWidth - menuRect.width - 10;
    
    menu.style.top = top + 'px';
    menu.style.left = Math.max(10, left) + 'px';

    const closeMenu = (e) => {
        if(!menu.contains(e.target)) {
            menu.remove(); activeMessageMenu = null; document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
};

function startReply(msgId, text) {
    const msgEl = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if (!msgEl) return;

    const nicknameEl = msgEl.querySelector('.nickname-display');
    const nickname = nicknameEl ? nicknameEl.textContent : 'Você';

    replyingToMessage = {
        msgId,
        nickname,
        text
    };

    DOMElements.replyPreview.innerHTML = `
        <div class="flex justify-between items-start gap-2">
            <div class="flex-1">
                <div class="text-xs font-bold opacity-80">${nickname}</div>
                <div class="text-xs truncate opacity-70">${text}</div>
            </div>
            <button id="cancel-reply" class="text-xs opacity-60 hover:opacity-100">&times;</button>
        </div>
    `;
    DOMElements.replyPreview.classList.remove('hidden');

    document.getElementById('cancel-reply').onclick = clearReply;
    DOMElements.messageInput.focus();
}
function clearReply() {
    replyingToMessage = null;
    DOMElements.replyPreview.classList.add('hidden');
    DOMElements.replyPreview.innerHTML = '';
}


async function handleAction(type, text, msgId = null) {
    const targetLang = currentTranslationLang; 
    showToast("Processando...", "info");
    try {
        if (type === 'translate') {
            if (msgId) {
                const el = document.getElementById(`trans-${msgId}`);
                if(el) { el.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>'; await performTranslation(msgId, text, targetLang); showToast("Atualizado!", "success"); }
            } else {
                const trad = await Services.traduzir(text, targetLang); showGenericModal(`Tradução (${targetLang})`, trad);
            }
        } else if (type === 'context') {
            const ctx = await Services.analisarContexto(text, targetLang); showGenericModal('Contexto', ctx);
        } else if (type === 'variations') {
            const vars = await Services.gerarVariacoes(text, targetLang); showGenericModal('Variações', vars.map(v => `• ${v}`).join('<br><br>'));
        } else if (type === 'study') {
            openStudyModal(text);
        }
    } catch (e) { console.error(e); showToast("Erro na IA.", "error"); }
}

function showGenericModal(title, content) {
    document.getElementById('generic-modal-title').textContent = title;
    document.getElementById('generic-modal-content').innerHTML = content;
    DOMElements.genericModal.classList.remove('hidden'); DOMElements.genericModal.classList.add('flex');
}

async function openStudyModal(text) {
    DOMElements.studyModal.classList.remove('hidden'); DOMElements.studyModal.classList.add('flex');
    const originalArea = document.getElementById('study-original-text');
    originalArea.innerHTML = '<span class="text-sm opacity-50">Carregando...</span>';
    document.getElementById('study-result-area').classList.add('hidden');
    try {
        const tokens = await Services.segmentarTexto(text);
        originalArea.innerHTML = '';
        tokens.forEach(token => {
            const span = document.createElement('span');
            span.textContent = token; span.className = 'word-token';
            span.onclick = () => selectToken(span, token, text);
            originalArea.appendChild(span);
        });
    } catch (e) { originalArea.textContent = text; }
}

async function selectToken(el, token, contextPhrase) {
    document.querySelectorAll('.word-token').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('study-loading').classList.remove('hidden');
    document.getElementById('study-result-area').classList.add('hidden');
    try {
        const data = await Services.explorarPalavra(token, contextPhrase, currentTranslationLangGlobal);
        document.getElementById('word-translation').textContent = data.traducao;
        const speakContainer = document.getElementById('word-speak-container');
        speakContainer.innerHTML = ''; 
        const btn = document.createElement('button');
        btn.className = "speaker-btn bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-all text-white";
        btn.innerHTML = '<i class="fas fa-volume-high"></i>';
        btn.onclick = () => {
            const utterance = new SpeechSynthesisUtterance(token);
            utterance.lang = data.idioma_origem_iso || 'en-US';
            window.speechSynthesis.speak(utterance);
        };
        speakContainer.appendChild(btn);
        document.getElementById('word-explanation').textContent = data.explicacao;
        document.getElementById('word-example').textContent = `"${data.exemplo_uso}"`;
        document.getElementById('word-class-badge').textContent = data.classe_gramatical;
        document.getElementById('word-lang-badge').textContent = (data.idioma_origem_iso || 'unk').toUpperCase();
        document.getElementById('study-loading').classList.add('hidden');
        document.getElementById('study-result-area').classList.remove('hidden');
    } catch (e) { showToast("Erro ao analisar.", "error"); document.getElementById('study-loading').classList.add('hidden'); }
}

// --- Initialization & Event Listeners ---

window.onload = async () => {
    initializeUser();
    initializeTheme();
    if ("Notification" in window) updateNotifIcon();
    else DOMElements.notifBtn.style.display = 'none';

    DOMElements.roomLangSelector.value = currentTranslationLang;
    DOMElements.introLangSelector.value = currentTranslationLang;

    // Splash Animation
    await new Promise(res => setTimeout(res, 1200));
    DOMElements.splash.style.opacity = 0;
    DOMElements.app.style.opacity = 1;
    setTimeout(() => DOMElements.splash.classList.add('hidden'), 500);

    nickname = localStorage.getItem('astroNickname');
    if (nickname) {
        DOMElements.lobbyNickname.textContent = nickname;
        switchScreen('lobby');
    } else {
        switchScreen('nickname');
    }

    // Styles & Background Logic
    const styleSelector = document.getElementById('bubble-style-selector');
    const bgSelector = document.getElementById('bg-style-selector');
    
    if (styleSelector) {
        const savedStyle = localStorage.getItem('astroBubbleStyle') || 'astro';
        document.body.setAttribute('data-bubble-style', savedStyle);
        styleSelector.value = savedStyle;
        styleSelector.addEventListener('change', (e) => {
            document.body.setAttribute('data-bubble-style', e.target.value);
            localStorage.setItem('astroBubbleStyle', e.target.value);
        });
    }

    if (bgSelector) {
        const savedBg = localStorage.getItem('astroBgStyle') || 'cosmos';
        document.body.setAttribute('data-bg-style', savedBg);
        bgSelector.value = savedBg;
        bgSelector.addEventListener('change', (e) => {
            document.body.setAttribute('data-bg-style', e.target.value);
            localStorage.setItem('astroBgStyle', e.target.value);
        });
    }

    if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
    };
}
};

// Event Listeners Binding
DOMElements.messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    const typingRef = ref(db, `typing/${currentRoom}/${userId}`);
    if (this.value) {
        set(typingRef, { nickname, text: this.value.substring(0, 60) });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => set(typingRef, null), 3000);
    } else { set(typingRef, null); }
});

DOMElements.roomLangSelector.addEventListener('change', (e) => {
    const newLang = e.target.value;
    currentTranslationLang = newLang;
    localStorage.setItem('astroUserLang', newLang);
    showToast(`Idioma alterado para ${newLang.toUpperCase()}`, 'success');
    retranslateAllMessages(newLang);
});

// Botões de IA
DOMElements.rewriteBtn.addEventListener('click', async () => {
    const input = DOMElements.messageInput;
    const originalText = input.value.trim();
    if (!originalText) return;
    const btnIcon = DOMElements.rewriteBtn.querySelector('i');
    btnIcon.className = "fas fa-spinner fa-spin";
    DOMElements.rewriteBtn.classList.add('magic-pulse');
    input.disabled = true; input.style.opacity = "0.7";
    try {
        const novoTexto = await Services.reescreverTexto(originalText);
        input.value = novoTexto; input.focus(); showToast("Melhorado!", "success");
    } catch (error) { showToast("Erro.", "error"); } 
    finally {
        input.disabled = false; input.style.opacity = "1";
        btnIcon.className = "fas fa-magic"; DOMElements.rewriteBtn.classList.remove('magic-pulse');
    }
});

DOMElements.grammarBtn.addEventListener('click', async () => {
    const input = DOMElements.messageInput;
    const originalText = input.value.trim();
    if (!originalText) { showToast("Digite algo primeiro!", "info"); return; }

    DOMElements.grammarModal.classList.remove('hidden'); DOMElements.grammarModal.classList.add('flex');
    document.getElementById('grammar-loading').classList.remove('hidden');
    document.getElementById('grammar-result').classList.add('hidden');

    try {
        const data = await Services.verificarGramatica(originalText);
        document.getElementById('grammar-loading').classList.add('hidden');
        document.getElementById('grammar-result').classList.remove('hidden');
        document.getElementById('grammar-result').classList.add('flex');

        if (data.tem_erros) {
            document.getElementById('grammar-success').classList.add('hidden');
            document.getElementById('grammar-errors').classList.remove('hidden');
            document.getElementById('grammar-errors').classList.add('flex');
            document.getElementById('grammar-original').textContent = originalText;
            document.getElementById('grammar-suggestion').textContent = data.sugestao;
            document.getElementById('grammar-explanation').textContent = data.explicacao;
            document.getElementById('apply-correction-btn').onclick = () => {
                input.value = data.sugestao;
                DOMElements.grammarModal.classList.add('hidden'); DOMElements.grammarModal.classList.remove('flex');
                showToast("Correção aplicada!", "success"); input.focus();
            };
        } else {
            document.getElementById('grammar-success').classList.remove('hidden');
            document.getElementById('grammar-success').classList.add('flex');
            document.getElementById('grammar-errors').classList.add('hidden');
            document.getElementById('grammar-errors').classList.remove('flex');
        }
    } catch (e) {
        showToast("Erro na verificação.", "error");
        DOMElements.grammarModal.classList.add('hidden'); DOMElements.grammarModal.classList.remove('flex');
    }
});

const sendMessage = async () => {
   const text = DOMElements.messageInput.value.trim();
    if (!text || !currentRoom) return;

    const payload = {
        text,
        nickname,
        userId,
        timestamp: Date.now()
    };

    // 🔁 SE estiver respondendo alguém
    if (replyingToMessage) {
        payload.repliedTo = {
            msgId: replyingToMessage.msgId,
            nickname: replyingToMessage.nickname,
            text: replyingToMessage.text
        };
    }

    await push(ref(db, `messages/${currentRoom}`), payload);

    DOMElements.messageInput.value = '';
    clearReply();
};

// Botões Gerais
document.getElementById('save-nickname-btn').onclick = async () => {
    const val = DOMElements.nicknameInput.value.trim();
    const langVal = DOMElements.introLangSelector.value;
    if(val) { 
        await updateNicknameHistory(val);
        localStorage.setItem('astroNickname', val);
        localStorage.setItem('astroUserLang', langVal);
        localStorage.setItem('astroUserLangGlobal', langVal);
        location.reload(); 
    }
};

document.getElementById('change-nickname-btn').onclick = () => { localStorage.removeItem('astroNickname'); location.reload(); };
DOMElements.clearDataBtn.onclick = () => { if(confirm('Tem certeza?')) { localStorage.clear(); location.reload(); } };
DOMElements.notifBtn.onclick = unlockAudioAndRequestPermission;
document.body.addEventListener('click', () => { if(!audioUnlocked) unlockAudioAndRequestPermission(); }, { once: true });
document.getElementById('new-conversation-btn').onclick = () => { DOMElements.roomActionsModal.classList.remove('hidden'); DOMElements.roomActionsModal.classList.add('flex'); };
document.getElementById('close-room-actions-modal-btn').onclick = () => { DOMElements.roomActionsModal.classList.add('hidden'); DOMElements.roomActionsModal.classList.remove('flex'); };
document.getElementById('modal-create-room-btn').onclick = () => { const code = Math.random().toString(36).substring(2, 7).toUpperCase(); updateRecentRooms(code); joinRoom(code); DOMElements.roomActionsModal.classList.add('hidden'); DOMElements.roomActionsModal.classList.remove('flex'); navigator.clipboard.writeText(code); };
document.getElementById('modal-confirm-join-btn').onclick = () => { const code = DOMElements.modalRoomCodeInput.value.trim().toUpperCase(); if(code) { joinRoom(code); DOMElements.roomActionsModal.classList.add('hidden'); DOMElements.roomActionsModal.classList.remove('flex'); } };
document.getElementById('settings-btn').onclick = () => { DOMElements.settingsModal.classList.remove('hidden'); DOMElements.settingsModal.classList.add('flex'); };
document.getElementById('close-settings-modal-btn').onclick = () => { DOMElements.settingsModal.classList.add('hidden'); DOMElements.settingsModal.classList.remove('flex'); };
document.querySelectorAll('.theme-btn').forEach(btn => btn.onclick = () => { localStorage.setItem('astroTheme', btn.dataset.theme); location.reload(); });

document.getElementById('send-btn').onclick = sendMessage;

document.getElementById('message-input').onkeydown = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
document.getElementById('leave-btn').onclick = leaveRoom;
document.querySelector('.room-code-value').onclick = () => { navigator.clipboard.writeText(currentRoom); showToast("Código copiado!"); };

// Modals Close
document.getElementById('close-study-modal').onclick = () => { DOMElements.studyModal.classList.add('hidden'); DOMElements.studyModal.classList.remove('flex'); };
document.getElementById('close-grammar-modal').onclick = () => { DOMElements.grammarModal.classList.add('hidden'); DOMElements.grammarModal.classList.remove('flex'); };
document.getElementById('close-generic-modal').onclick = () => { DOMElements.genericModal.classList.add('hidden'); DOMElements.genericModal.classList.remove('flex'); };