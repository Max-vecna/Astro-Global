// chat.js
// Gerencia envio, renderização, tradução e TTS de mensagens com persistência de estado de erro

import { db } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import * as Utils from './utils.js';
import * as Services from './services.js';
import * as Modals from './modals.js';
import { ref, push, set, update, get, query, limitToLast, orderByKey } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Envio de Mensagens ---
export const sendMessage = async () => {
    const text = DOMElements.messageInput.value.trim();
    if (!text || !state.currentRoom) return;
 
    const payload = {
        text,
        nickname: state.nickname,
        userId: state.userId,
        timestamp: Date.now()
    };
 
    if (state.replyingToMessage) {
        payload.repliedTo = {
            msgId: state.replyingToMessage.msgId,
            nickname: state.replyingToMessage.nickname,
            text: state.replyingToMessage.text
        };
    }
 
    await push(ref(db, `messages/${state.currentRoom}`), payload);

    // 🔥 LIMPA O "digitando..." imediatamente
    await set(ref(db, `typing/${state.currentRoom}/${state.userId}`), null);

    DOMElements.messageInput.value = '';
    clearReply();

    // === Lógica de Resposta da IA (Modo Mentor) ===
    if (state.isAiRoom) {
        triggerAiResponse(text);
    }
};

const triggerAiResponse = async (userText) => {
    // Simula digitação da IA
    const aiId = 'AI_BOT';
    const typingRef = ref(db, `typing/${state.currentRoom}/${aiId}`);
    
    // Pequeno delay natural antes de começar a digitar
    setTimeout(() => {
        set(typingRef, { nickname: 'Astro Mentor', text: 'Digitando...' });
    }, 600);

    try {
        // Recupera contexto recente (últimas 6 mensagens)
        const msgsRef = query(ref(db, `messages/${state.currentRoom}`), orderByKey(), limitToLast(6));
        const snap = await get(msgsRef);
        const history = [];
        snap.forEach(c => {
            const v = c.val();
            history.push({ role: v.userId === aiId ? 'Astro Mentor' : 'User', text: v.text });
        });

        // Chama o serviço de IA
        const responseText = await Services.conversarComIA(history, state.currentTranslationLangGlobal);

        // Remove digitação e envia resposta
        await set(typingRef, null);
        
        await push(ref(db, `messages/${state.currentRoom}`), {
            text: responseText,
            nickname: 'Astro Mentor',
            userId: aiId,
            timestamp: Date.now()
        });

    } catch (e) {
        set(typingRef, null);
    }
};

export const startReply = (msgId, text) => {
    const msgEl = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if (!msgEl) return;

    const nicknameEl = msgEl.querySelector('.nickname-display');
    const nickname = nicknameEl ? nicknameEl.textContent : 'Você';

    state.replyingToMessage = { msgId, nickname, text };

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
};

export const clearReply = () => {
    state.replyingToMessage = null;
    DOMElements.replyPreview.classList.add('hidden');
    DOMElements.replyPreview.innerHTML = '';
};

export async function updateMessageText(msgId, newText) {
    if (!state.currentRoom || !msgId || !newText.trim()) return;

    const msgRef = ref(db, `messages/${state.currentRoom}/${msgId}`);

    await update(msgRef, {
        text: newText.trim(),
        timestamp: Date.now(),
        hasError: null // Remove o estado de erro ao editar
    });
}

// --- Renderização ---
export const renderTypingIndicator = (typingUsers) => {
    const container = DOMElements.typingIndicatorContainer;
    container.innerHTML = '';
    Object.entries(typingUsers).forEach(([typingUserId, userData]) => {
        if (!userData || !userData.nickname) return;
        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col items-start mb-2 animate-pulse max-w-[80%]';
        wrapper.innerHTML = `<div class="text-xs text-muted-color mb-1 ml-2">${userData.nickname} digitando...</div><div class="chat-bubble bg-[var(--bubble-other-bg)] text-[var(--bubble-other-text)] rounded-2xl py-2 px-4 opacity-70 italic text-sm border border-white/10">${userData.text || '...'}</div>`;
        container.appendChild(wrapper);
    });
    if (Object.keys(typingUsers).length > 0) Utils.scrollToBottom();
};

function applyErrorState(wrapper) {
    if (!wrapper) return;
    wrapper.dataset.hasCorrection = "true";
    wrapper.classList.add('has-correction');
    wrapper.classList.add('locked-error');
}

export const renderMessage = (msgData, msgId) => {
    if (!msgData || !msgData.text) return;

    const existingMsgEl = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    const isSelf = msgData.userId === state.userId;
    const isSameUserAsPrevious = state.lastRenderedUserId === msgData.userId;

    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper items-${isSelf ? 'end' : 'start'} bublle`;
    messageWrapper.dataset.msgId = msgId;
    messageWrapper.dataset.userId = msgData.userId;
    
    if (msgData.hasError) {
        applyErrorState(messageWrapper);
    }

    if (existingMsgEl && existingMsgEl.classList.contains('grouped-message')) {
        messageWrapper.classList.add('grouped-message');
    } else if (!existingMsgEl && isSameUserAsPrevious) {
        messageWrapper.classList.add('grouped-message');
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble selectable-text';

    if (!state.userColors[msgData.userId]) state.userColors[msgData.userId] = `hsl(${Math.random() * 360}, 70%, 60%)`;

    let contentHTML = '';
    if (msgData.repliedTo) {
       contentHTML += `<div class="mb-2 pl-2 border-l-2 border-white/30 text-xs opacity-70"><strong class="block" style="white-space: nowrap;">${msgData.repliedTo.nickname}</strong><span class="truncate block max-w-[200px]">${msgData.repliedTo.text}</span></div>`;
    }

    const showName = !isSelf && (!existingMsgEl ? !isSameUserAsPrevious : !messageWrapper.classList.contains('grouped-message'));

    if (showName) {
        const isAI = msgData.userId === 'AI_BOT';
        contentHTML += `<div class="nickname-display text-xs font-bold mb-1 opacity-90"
            style="color: ${isAI ? '#a78bfa' : state.userColors[msgData.userId]};">
            ${isAI ? '<i class="fas fa-robot mr-1"></i>' : ''}${msgData.nickname}
        </div>`;
    }

    const safeText = msgData.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
    const translationId = `trans-${msgId}`;
    
    // Na sala de IA, mudamos a estrutura para NÃO mostrar tradução automaticamente
    // Se isAiRoom for true, o layout é mais simples (texto direto), sem o bloco 'translated-text' dominante
    
    if (state.isAiRoom) {
         contentHTML += `
            <div class="original-text" style="font-size: 1rem; font-style: normal; opacity: 1; border: none; padding-top: 0;">${safeText}</div>
            
            <div class="flex items-center gap-2 mt-1 opacity-50 hover:opacity-100 transition-opacity">
                 <button class="speak-btn text-xs hover:text-white" title="Ouvir" onclick="window.Chat.speakText('${msgId}')">
                    <i class="fas fa-volume-high"></i>
                </button>
            </div>
            <!-- Container oculto caso o usuario peça tradução manual depois -->
            <div id="${translationId}" class="translated-text hidden text-xs text-yellow-300 mt-2 border-t border-white/10 pt-2"></div>
        `;
    } else {
        // Layout Padrão com Tradução
        let currentTrans = '';
        let textChanged = false;

        if (existingMsgEl) {
            const oldOriginalEl = existingMsgEl.querySelector('.original-text');
            if (oldOriginalEl && oldOriginalEl.innerText.replace(/<br>/g, '\n').trim() !== msgData.text.trim()) {
                textChanged = true;
            } else {
                const oldTransEl = existingMsgEl.querySelector('.translated-text');
                if (oldTransEl) currentTrans = oldTransEl.innerHTML;
            }
        }

        contentHTML += `
        <div class="flex items-start gap-2">
            <div id="${translationId}" class="translated-text flex-1">
                ${currentTrans ? currentTrans.trim().trimStart() : ''}
            </div>
            <button class="speak-btn text-xs opacity-60 hover:opacity-100 transition" title="Ouvir tradução" data-msg-id="${msgId}">
                <i class="fas fa-volume-high"></i>
            </button>
        </div>
        <div class="original-text">${safeText}</div>
        `;
    }

    const time = new Date(msgData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const meta = document.createElement('div');
    meta.className = `message-meta ${isSelf ? 'meta-self' : 'meta-other'}`;
    meta.innerHTML = `<span class="message-time">${time}</span>`;

    bubble.innerHTML = contentHTML;
    
    if (!state.isAiRoom) {
        const speakBtn = bubble.querySelector('.speak-btn');
        if (speakBtn) {
            speakBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopImmediatePropagation(); });
            speakBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); speakTranslatedMessage(msgId); });
        }
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

    // Se estivermos em sala comum, checa botão de falar
    if (!state.isAiRoom) {
        const existingTranslation = existingMsgEl?.querySelector('.translated-text')?.textContent?.trim();
        if (existingTranslation) {
            const btn = bubble.querySelector('.speak-btn');
            if (btn) btn.classList.add('ready');
        }
    }


    if (existingMsgEl) {
        DOMElements.messagesList.replaceChild(messageWrapper, existingMsgEl);
        if (!state.isAiRoom && textChanged) {
            performTranslation(msgId, msgData.text, state.currentTranslationLang);
        }

    } else {
        DOMElements.messagesList.insertBefore(messageWrapper, DOMElements.typingIndicatorContainer);
        Utils.scrollToBottom();
        if (!state.isAiRoom) {
            performTranslation(msgId, msgData.text, state.currentTranslationLang);
        }
    }

    // === REAÇÕES ===
    if (msgData.reactions) {
        const reactionsBar = document.createElement("div");
        reactionsBar.className = "reaction-bar";

        Object.entries(msgData.reactions).forEach(([emoji, users]) => {
            const count = Object.keys(users || {}).length;
            if (count === 0) return;

            const btn = document.createElement("button");
            btn.className = "reaction-pill";
            btn.textContent = `${emoji} ${count}`;

            if (users[state.userId]) {
                btn.classList.add("active");
                messageWrapper.dataset[`react_${emoji}`] = "true";
            }

            btn.addEventListener("mousedown", e => e.stopPropagation());
            btn.addEventListener("click", e => {
                e.stopPropagation();
                toggleReaction(msgId, emoji);
            });

            reactionsBar.appendChild(btn);
        });

         meta.appendChild(reactionsBar);
    }

    state.lastRenderedUserId = msgData.userId;
};

// --- Tradução ---
export const performTranslation = async (msgId, originalText, lang) => {
    // Se for sala de IA, ignoramos tradução automática
    if (state.isAiRoom) return;

    const el = document.getElementById(`trans-${msgId}`);
    if (!el) return;

    const wrapper = el.closest('.message-wrapper');
    const speakBtn = wrapper?.querySelector('.speak-btn');

    // esconder botão enquanto carrega
    if (speakBtn && el.textContent.trim() === '') {
        speakBtn.classList.remove('ready');
    }

    // loading
    el.classList.add('loading');
    el.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>';

    try {
        const result = await Services.traduzir(originalText, lang);

        const translatedText =
            typeof result === 'string' ? result : result.texto;

        const hasCorrection =
            typeof result === 'object' && result.temErro === true;

        // remove loading ANTES de renderizar o conteúdo
        el.classList.remove('loading');

        el.textContent = translatedText;

        if (speakBtn && !hasCorrection) {
            speakBtn.classList.add('ready');
        }

        const wrapper = el.closest('.message-wrapper');
        const msgUserId = wrapper.dataset.userId;
        const isOwner = state.userId === msgUserId;

        const alreadyHasError = wrapper.dataset.hasCorrection === "true";

        if (alreadyHasError) {
            wrapper.classList.add('has-correction');
            return;
        }

        if (hasCorrection) {
            applyErrorState(wrapper);

            if (isOwner) {
                const msgRef = ref(db, `messages/${state.currentRoom}/${msgId}`);
                update(msgRef, { hasError: true });
            }
            return;
        }

        const origEl = el.nextElementSibling;
        if (origEl && origEl.classList.contains('original-text')) {
            if (
                translatedText.trim().toLowerCase() ===
                originalText.trim().toLowerCase()
            ) {
                origEl.style.display = 'none';
                el.style.marginBottom = '0';
            } else {
                origEl.style.display = 'block';
            }
        }

    } catch (err) {
        el.classList.remove('loading');
        if (speakBtn) speakBtn.classList.remove('ready');
         el.style.display = 'none';
    }
};


export const retranslateAllMessages = (newLang) => {
    if(state.isAiRoom) return;
    Utils.showToast(`Traduzindo para ${newLang.toUpperCase()}...`, 'info');
    document.querySelectorAll('.message-wrapper').forEach(wrapper => {
        const msgId = wrapper.dataset.msgId;
        const originalTextEl = wrapper.querySelector('.original-text');
        if (originalTextEl && msgId) performTranslation(msgId, originalTextEl.innerText, newLang);
    });
};

// --- TTS ---
function setSpeakIdle(msgId) {
    const btn = document.querySelector(`.speak-btn[data-msg-id="${msgId}"] i`);
    if (btn) btn.className = 'fas fa-volume-high';
}

function setSpeakLoading(msgId) {
    const btn = document.querySelector(`.speak-btn[data-msg-id="${msgId}"] i`);
    if (btn) btn.className = 'fas fa-circle-notch fa-spin';
}

async function speakTranslatedMessage(msgId) {
    const transEl = document.getElementById(`trans-${msgId}`);
    if (!transEl) return;
    const text = transEl.textContent.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    speakGeneric(text, msgId);
}

// === LÓGICA DE SELEÇÃO DE TEXTO (DESKTOP + MOBILE) ===

let selectionBtn = null;
let selectionTimeout = null;

// Remove botão se clicar fora
document.addEventListener('mousedown', e => {
    if (selectionBtn && !selectionBtn.contains(e.target)) {
        selectionBtn.remove();
        selectionBtn = null;
    }
});

document.addEventListener('touchstart', e => {
    if (selectionBtn && !selectionBtn.contains(e.target)) {
        selectionBtn.remove();
        selectionBtn = null;
    }
});

// Desktop
document.addEventListener('mouseup', () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleTextSelection, 80);
});

// Mobile (dispara após seleção por long-press)
document.addEventListener('touchend', () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleTextSelection, 120);
});

// iOS / Android disparam isso quando a seleção muda
document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleTextSelection, 150);
});

function handleTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const text = selection.toString().trim();
    if (!text) return;

    // remove botão antigo
    if (selectionBtn) {
        selectionBtn.remove();
        selectionBtn = null;
    }

    // garante que a seleção esteja dentro de uma mensagem
    const anchorNode = selection.anchorNode;
    const anchorEl =
        anchorNode?.nodeType === 3 ? anchorNode.parentElement : anchorNode;

    if (!anchorEl) return;

    const bubble = anchorEl.closest('.chat-bubble');
    if (!bubble) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    if (!rect || rect.width === 0 || rect.height === 0) return;

    selectionBtn = document.createElement('button');
    selectionBtn.className =
        'fixed z-[9999] bg-[var(--primary-color)] hover:opacity-90 text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-bold flex items-center gap-2 border border-white/20 select-none';

    selectionBtn.innerHTML = '<i class="fas fa-volume-high"></i> Ouvir seleção';

    // posição segura (funciona no mobile)
    const top = rect.top - 42;
    const left = rect.left + rect.width / 2 - 60;

    selectionBtn.style.top = `${Math.max(10, top)}px`;
    selectionBtn.style.left = `${Math.max(10, left)}px`;

    // evita perder seleção no toque
    selectionBtn.addEventListener('touchstart', e => {
        e.preventDefault();
        e.stopPropagation();
    });

    selectionBtn.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
    });

    selectionBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        speakGeneric(text, null, selectionBtn);
    });

    document.body.appendChild(selectionBtn);
}

// Exposto para uso no HTML (ex: window.Chat.speakText)
window.Chat = window.Chat || {};
window.Chat.speakText = (msgId) => {
    // Na sala IA, lê o texto original do balão
    const wrapper = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if(!wrapper) return;
    const text = wrapper.querySelector('.original-text').innerText;
    speakGeneric(text, msgId);
};

async function speakGeneric(text, msgId) {
    setSpeakLoading(msgId);
    speechSynthesis.cancel();

    let detectedLang = null;
    try {
        const detectionResult = await Services.detectarIdioma(text);
        detectedLang = typeof detectionResult === 'string' ? detectionResult : detectionResult?.lang;
    } catch (err) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = detectedLang || 'en-US';
    utterance.rate = 0.9;

    utterance.onstart = () => setSpeakIdle(msgId);
    utterance.onend = () => setSpeakIdle(msgId);
    utterance.onerror = () => setSpeakIdle(msgId);

    speechSynthesis.speak(utterance);
}


function openReactionPicker(msgId) {
    const emojis = ['👍','😂','🔥','❤️','😮','😢','👏'];

    const menu = document.createElement('div');
    menu.className = 'reaction-picker';

    emojis.forEach(e => {
        const btn = document.createElement('button');
        btn.textContent = e;
        btn.onclick = () => {
            toggleReaction(msgId, e);
            menu.remove();
        };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    const wrapper = document.querySelector(`[data-msg-id="${msgId}"]`);
    const bubble = wrapper.querySelector('.chat-bubble');
    const rect = bubble.getBoundingClientRect();
    const isSelf = wrapper.classList.contains('items-end');
    const top = rect.bottom + 6;
    let left;
    if (isSelf) {
        left = rect.right - menu.offsetWidth;
    } else {
        left = rect.left;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - menu.offsetWidth - 8));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    setTimeout(() => {
        document.addEventListener("click", () => menu.remove(), { once: true });
    }, 50);
}


// --- Menu de Ações ---
const openActionsMenu = (triggerEl, msgId, text) => {
    const wrapper = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if (!wrapper) return;

    const hasCorrection = wrapper.dataset.hasCorrection === "true";
    const msgUserId = wrapper.dataset.userId;
    const isOwner = msgUserId === state.userId;

    if (hasCorrection && !isOwner) {
        Utils.showToast("Aguardando correção do autor.", "info");
        return;
    }

    if(state.activeMessageMenu) state.activeMessageMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'options-menu';
    
    let options = [];

    // Menu Simplificado para Sala de IA
    if (state.isAiRoom) {
         options = [
            { icon: 'fa-copy', label: 'Copiar', action: () => navigator.clipboard.writeText(text) },
            { icon: 'fa-graduation-cap', label: 'Estudar Frase', class: 'opt-study', action: () => Modals.openStudyModal(text) },
            { icon: 'fa-globe', label: 'Traduzir manualmente', action: () => Modals.openTranslateToModal(text) },
         ];
         if (msgUserId !== state.userId) {
             options.push({
                 icon: 'fa-magnifying-glass-chart', // Ícone de análise
                 label: 'Revisar Resposta',
                 class: 'text-yellow-400', // Destaque visual (ajuste se não usar Tailwind)
                 action: () => requestReview(text)
             });
         }
    } else {
        // Menu Padrão
        options = hasCorrection
        ? [
            { icon: 'fa-pen', label: 'Corrigir mensagem', action: () => Modals.openEditMessageModal(msgId, text) }
          ]
        : [
            { icon: 'fa-reply', label: 'Responder', action: () => startReply(msgId, text) },
            { icon: 'fa-language', label: 'Retraduzir', class: 'opt-translate', action: () => Modals.handleAction('translate', text, msgId) },
            { icon: 'fa-globe', label: 'Traduzir para...', action: () => Modals.openTranslateToModal(text) },
            { icon: 'fa-lightbulb', label: 'Contexto', class: 'opt-context', action: () => Modals.handleAction('context', text, msgId) },
            { icon: 'fa-graduation-cap', label: 'Estudar', class: 'opt-study', action: () => Modals.handleAction('study', text, msgId) },
            { icon: 'fa-random', label: 'Variações', class: 'opt-vars', action: () => Modals.handleAction('variations', text, msgId) },
            { icon: 'fa-copy', label: 'Copiar', action: () => navigator.clipboard.writeText(text) },
            {
                icon: 'fa-face-smile',
                label: 'Reagir',
                action: () => openReactionPicker(msgId)
            }
        ];
    }

    options.forEach(opt => {
        const item = document.createElement('div');
        item.className = `options-item ${opt.class || ''}`;
        item.innerHTML = `<i class="fas ${opt.icon}"></i> ${opt.label}`;
        item.onclick = (e) => { e.stopPropagation(); opt.action(); menu.remove(); state.activeMessageMenu = null; };
        menu.appendChild(item);
    });

    document.body.appendChild(menu);
    menu.classList.add('show'); 
    state.activeMessageMenu = menu;
    
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
            menu.remove(); state.activeMessageMenu = null; document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 100);
};

export async function toggleReaction(msgId, emoji) {
    if (!state.currentRoom || !msgId) return;

    const path = `messages/${state.currentRoom}/${msgId}/reactions/${emoji}/${state.userId}`;
    
    const wrapper = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    const hasReacted = wrapper?.dataset?.[`react_${emoji}`] === "true";

    await update(ref(db), {
        [path]: hasReacted ? null : true
    });
}

async function requestReview(originalText) {
    if (!state.isAiRoom) return; // Só funciona em salas de IA

    Utils.showToast("Solicitando revisão...", "info");
    
    // Mostra indicador de digitação visualmente (opcional, mas bom para UX)
    const typingContainer = document.getElementById('typing-indicator-container');
    if(typingContainer) typingContainer.classList.remove('hidden');

    try {
        // Prompt específico para a IA corrigir a si mesma
        const prompt = `O usuário sinalizou sua resposta anterior como incorreta ou imprecisa,não precisa se desculpar aepnas retornar o texto corrigir ou ajustado.\n\nTexto original: "${originalText}"\n\nTarefa: Analise criticamente o texto original. Verifique erros gramaticais, factuais ou de lógica. Forneça uma versão revisada e melhorada do texto. retorne o texto em "${state.currentTranslationLangGlobal}". Seja claro e conciso em sua revisão.`;
        
        // Usa o serviço de IA existente
        const response = await Services.aiRequest(prompt);

        // Envia a resposta da revisão para o Firebase como uma mensagem do Astro Mentor
        await push(ref(db, `messages/${state.currentRoom}`), {
            text: `🔍 **Revisão:**\n${response}`,
            nickname: "Astro Mentor",
            userId: "astro_mentor", // ID fixo da IA
            timestamp: Date.now(),
            type: 'review'
        });

    } catch (error) {
        console.error(error);
        Utils.showToast("Erro ao processar revisão.", "error");
    } finally {
        if(typingContainer) typingContainer.classList.add('hidden');
    }
}
