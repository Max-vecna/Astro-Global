import { db } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import * as Utils from './utils.js';
import * as Services from './services.js';
import * as Chat from './chat.js';
import * as Room from './room.js';
import * as Modals from './modals.js';
import { ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Service Worker Registration ---
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
}

// --- Initialization ---
window.onload = async () => {
    Utils.updateThemeButtons(document.body.dataset.theme || 'dark');
    if ("Notification" in window) Utils.updateNotifIcon();
    else DOMElements.notifBtn.style.display = 'none';

    DOMElements.roomLangSelector.value = state.currentTranslationLang;
    DOMElements.introLangSelector.value = state.currentTranslationLang;

    // Splash Animation
    await new Promise(res => setTimeout(res, 1200));
    DOMElements.splash.style.opacity = 0;
    DOMElements.app.style.opacity = 1;
    setTimeout(() => DOMElements.splash.classList.add('hidden'), 500);

    if (state.nickname) {
        DOMElements.lobbyNickname.textContent = state.nickname;
        Utils.switchScreen('lobby');
    } else {
        Utils.switchScreen('nickname');
    }

    // Restaurar Estilos
    const savedStyle = localStorage.getItem('astroBubbleStyle') || 'astro';
    document.body.setAttribute('data-bubble-style', savedStyle);
    if(DOMElements.bubbleStyleSelector) DOMElements.bubbleStyleSelector.value = savedStyle;

    const savedBg = localStorage.getItem('astroBgStyle') || 'cosmos';
    document.body.setAttribute('data-bg-style', savedBg);
    if(DOMElements.bgStyleSelector) DOMElements.bgStyleSelector.value = savedBg;
    
    // Init Voices
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
};

// --- Event Listeners ---

// Input de Mensagem e Digitação
DOMElements.messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    
    // Na sala IA, não enviamos "typing" para outros usuários, apenas local ou mockado se quisessemos
    if (state.isAiRoom) return;

    const typingRef = ref(db, `typing/${state.currentRoom}/${state.userId}`);
    if (this.value) {
        set(typingRef, { nickname: state.nickname, text: this.value.substring(0, 60) });
        if (state.typingTimeout) clearTimeout(state.typingTimeout);
        state.typingTimeout = setTimeout(() => set(typingRef, null), 3000);
    } else { set(typingRef, null); 
        }
});

DOMElements.messageInput.onkeydown = (e) => { 
    if(e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        Chat.sendMessage(); 
    } 
};

DOMElements.sendBtn.onclick = Chat.sendMessage;

// Seletores de Idioma e Estilo
DOMElements.roomLangSelector.addEventListener('change', (e) => {
    state.currentTranslationLang = e.target.value;
    localStorage.setItem('astroUserLang', e.target.value);
    Utils.showToast(`Idioma alterado para ${e.target.value.toUpperCase()}`, 'success');
    Chat.retranslateAllMessages(e.target.value);
});

DOMElements.bubbleStyleSelector?.addEventListener('change', (e) => {
    document.body.setAttribute('data-bubble-style', e.target.value);
    localStorage.setItem('astroBubbleStyle', e.target.value);
});

DOMElements.bgStyleSelector?.addEventListener('change', (e) => {
    document.body.setAttribute('data-bg-style', e.target.value);
    localStorage.setItem('astroBgStyle', e.target.value);
});

// Botões de IA
DOMElements.grammarBtn.addEventListener('click', Modals.handleGrammarCheck);

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
        input.value = novoTexto; input.focus(); Utils.showToast("Melhorado!", "success");
    } catch (error) { Utils.showToast("Erro.", "error"); } 
    finally {
        input.disabled = false; input.style.opacity = "1";
        btnIcon.className = "fas fa-magic"; DOMElements.rewriteBtn.classList.remove('magic-pulse');
    }
});

// Botões de Navegação e Configuração
DOMElements.saveNicknameBtn.onclick = async () => {
    const val = DOMElements.nicknameInput.value.trim();
    const langVal = DOMElements.introLangSelector.value;
    if(val) { 
        await Room.updateNicknameHistory(val);
        localStorage.setItem('astroNickname', val);
        localStorage.setItem('astroUserLang', langVal);
        localStorage.setItem('astroUserLangGlobal', langVal);
        location.reload(); 
    }
};

DOMElements.changeNicknameBtn.onclick = () => { localStorage.removeItem('astroNickname'); location.reload(); };
DOMElements.clearDataBtn.onclick = () => { if(confirm('Tem certeza?')) { localStorage.clear(); location.reload(); } };
DOMElements.notifBtn.onclick = Utils.unlockAudioAndRequestPermission;
document.body.addEventListener('click', () => { if(!state.audioUnlocked) Utils.unlockAudioAndRequestPermission(); }, { once: true });

// Modals Triggers
DOMElements.newConversationBtn.onclick = () => { DOMElements.roomActionsModal.classList.remove('hidden'); DOMElements.roomActionsModal.classList.add('flex'); };
// Evento para o botão de Sala IA (NOVO)
DOMElements.aiRoomBtn.onclick = Room.joinAiRoom;

DOMElements.closeRoomActionsModalBtn.onclick = () => { DOMElements.roomActionsModal.classList.add('hidden'); DOMElements.roomActionsModal.classList.remove('flex'); };

DOMElements.modalCreateRoomBtn.onclick = async () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const name = DOMElements.modalRoomNameInput.value.trim() || "Nova Sala";

    await Room.createRoom(code, name);

    DOMElements.roomActionsModal.classList.add('hidden');
    DOMElements.roomActionsModal.classList.remove('flex');

    navigator.clipboard.writeText(code);
};


DOMElements.modalConfirmJoinBtn.onclick = () => { 
    const code = DOMElements.modalRoomCodeInput.value.trim().toUpperCase(); 
    if(code) { 
        Room.joinRoom(code); 
        DOMElements.roomActionsModal.classList.add('hidden'); DOMElements.roomActionsModal.classList.remove('flex'); 
    } 
};

DOMElements.settingsBtn.onclick = () => { DOMElements.settingsModal.classList.remove('hidden'); DOMElements.settingsModal.classList.add('flex'); };
DOMElements.closeSettingsModalBtn.onclick = () => { DOMElements.settingsModal.classList.add('hidden'); DOMElements.settingsModal.classList.remove('flex'); };

DOMElements.themeBtns.forEach(btn => btn.onclick = () => { localStorage.setItem('astroTheme', btn.dataset.theme); location.reload(); });
DOMElements.leaveBtn.onclick = Room.leaveRoom;
DOMElements.roomCodeDisplay.onclick = () => { 
    if (state.isAiRoom) return;
    navigator.clipboard.writeText(state.currentRoom); Utils.showToast("Código copiado!"); 
};

// Fechamento de Modals
DOMElements.closeStudyModalBtn.onclick = () => { DOMElements.studyModal.classList.add('hidden'); DOMElements.studyModal.classList.remove('flex'); };
DOMElements.closeGrammarModalBtn.onclick = () => { DOMElements.grammarModal.classList.add('hidden'); DOMElements.grammarModal.classList.remove('flex'); };
DOMElements.closeGenericModalBtn.onclick = () => { DOMElements.genericModal.classList.add('hidden'); DOMElements.genericModal.classList.remove('flex'); };

// ===============================
// FUNDO DO CHAT (WhatsApp style)
// ===============================

const chatBgSelector = document.getElementById("chat-bg-selector");

// aplicar fundo salvo
const savedChatBg = localStorage.getItem("chatBgStyle") || "whatsapp";
document.body.setAttribute("data-chat-bg", savedChatBg);
const preview = document.getElementById("preview-background");
if (preview) preview.setAttribute("data-bg-style", savedChatBg);

// sincronizar select, se existir
if (chatBgSelector) {
    chatBgSelector.value = savedChatBg;

    chatBgSelector.addEventListener("change", (e) => {
    const value = e.target.value;

    document.body.setAttribute("data-chat-bg", value);
    localStorage.setItem("chatBgStyle", value);

    const preview = document.getElementById("preview-background");
    if (preview) preview.setAttribute("data-bg-style", value);
});

}