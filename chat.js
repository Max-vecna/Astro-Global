// chat.js
// Gerencia envio, renderização, tradução e TTS de mensagens com persistência de estado de erro

import { db } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import * as Utils from './utils.js';
import * as Services from './services.js';
import * as Modals from './modals.js';
import { ref, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
        wrapper.className = 'flex flex-col items-start mb-2 ml-1 animate-pulse max-w-[80%]';
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
    messageWrapper.className = `message-wrapper items-${isSelf ? 'end' : 'start'}`;
    messageWrapper.dataset.msgId = msgId;
    messageWrapper.dataset.userId = msgData.userId;
    
    // Aplica classe de erro se o dado persistido no Firebase indicar erro
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
        contentHTML += `<div class="nickname-display text-xs font-bold mb-1 opacity-90"
            style="color: ${state.userColors[msgData.userId]};">
            ${msgData.nickname}
        </div>`;
    }

    const safeText = msgData.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
    const translationId = `trans-${msgId}`;
    
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
            ${currentTrans || '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>'}
        </div>
        <button class="speak-btn text-xs opacity-60 hover:opacity-100 transition" title="Ouvir tradução" data-msg-id="${msgId}">
            <i class="fas fa-volume-high"></i>
        </button>
    </div>
    <div class="original-text">${safeText}</div>
    `;

    const time = new Date(msgData.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const meta = document.createElement('div');
    meta.className = `message-meta ${isSelf ? 'meta-self' : 'meta-other'}`;
    meta.innerHTML = `<span class="message-time">${time}</span>${isSelf ? '<i class="fas fa-check ml-1"></i>' : ''}`;

    bubble.innerHTML = contentHTML;
    
    const speakBtn = bubble.querySelector('.speak-btn');
    if (speakBtn) {
        speakBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopImmediatePropagation(); });
        speakBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); speakTranslatedMessage(msgId); });
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
        DOMElements.messagesList.replaceChild(messageWrapper, existingMsgEl);
        if (textChanged || currentTrans.includes('fa-spin') || !currentTrans) {
            performTranslation(msgId, msgData.text, state.currentTranslationLang);
        }
    } else {
        DOMElements.messagesList.insertBefore(messageWrapper, DOMElements.typingIndicatorContainer);
        Utils.scrollToBottom();
        performTranslation(msgId, msgData.text, state.currentTranslationLang);
    }

    state.lastRenderedUserId = msgData.userId;
};

// --- Tradução ---
export const performTranslation = async (msgId, originalText, lang) => {
    const el = document.getElementById(`trans-${msgId}`);
    if (!el) return;

    const wrapper = el.closest('.message-wrapper');
    const speakBtn = wrapper?.querySelector('.speak-btn');

    // esconder botão enquanto carrega
    if (speakBtn) speakBtn.classList.remove('ready');

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

    setSpeakLoading(msgId);
    speechSynthesis.cancel();

    let detectedLang = null;
    try {
        const detectionResult = await Services.detectarIdioma(text);
        detectedLang = typeof detectionResult === 'string' ? detectionResult : detectionResult?.lang;
    } catch (err) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = detectedLang || 'en-US';
    utterance.rate = 0.8;

    utterance.onstart = () => setSpeakIdle(msgId);
    utterance.onend = () => setSpeakIdle(msgId);
    utterance.onerror = () => setSpeakIdle(msgId);

    speechSynthesis.speak(utterance);
}

// --- Menu de Ações ---
const openActionsMenu = (triggerEl, msgId, text) => {
    const wrapper = document.querySelector(`.message-wrapper[data-msg-id="${msgId}"]`);
    if (!wrapper) return;

    const hasCorrection = wrapper.dataset.hasCorrection === "true";
    const msgUserId = wrapper.dataset.userId;
    const isOwner = msgUserId === state.userId;

    // Lógica de bloqueio: Se tem erro e você NÃO é o dono, impede interação
    if (hasCorrection && !isOwner) {
        Utils.showToast("Aguardando correção do autor.", "info");
        return;
    }

    if(state.activeMessageMenu) state.activeMessageMenu.remove();
    
    const menu = document.createElement('div');
    menu.className = 'options-menu';
    
    // Se tem erro e você É o dono, mostra APENAS a opção de editar
    const options = hasCorrection
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
        { icon: 'fa-copy', label: 'Copiar', action: () => navigator.clipboard.writeText(text) }
    ];

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