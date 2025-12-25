// dom.js
// Centraliza todas as referências aos elementos do DOM

export const DOMElements = {
    splash: document.getElementById('splash-screen'),
    app: document.getElementById('app-container'),
    
    // Telas
    nicknameScreen: document.getElementById('nickname-screen'),
    lobbyScreen: document.getElementById('lobby-screen'),
    chat: document.getElementById('chat-screen'),
    
    // Inputs e Containers
    nicknameInput: document.getElementById('nickname-input'),
    messagesContainer: document.getElementById('messages-container'),
    messagesList: document.getElementById('messages-list'),
    messageInput: document.getElementById('message-input'),
    typingIndicatorContainer: document.getElementById('typing-indicator-container'),
    replyPreview: document.getElementById('reply-preview'),
    
    // Displays de Texto
    roomNameDisplay: document.querySelector('.room-name-display'), // Novo: Nome da sala no chat
    roomCodeDisplay: document.querySelector('.room-code-value'),
    userCountDisplay: document.getElementById('user-count-display'),
    userAvatarsContainer: document.getElementById('user-avatars-container'),
    roomListContainer: document.getElementById('room-list-container'),
    lobbyNickname: document.getElementById('lobby-nickname'),
    
    // Modals
    roomActionsModal: document.getElementById('room-actions-modal'),
    modalRoomNameInput: document.getElementById('modal-room-name-input'), // Novo: Input de nome da sala
    modalRoomCodeInput: document.getElementById('modal-room-code-input'),
    settingsModal: document.getElementById('settings-modal'),
    studyModal: document.getElementById('study-modal'),
    grammarModal: document.getElementById('grammar-modal'),
    genericModal: document.getElementById('generic-modal'),
    
    // Toast Container
    toastContainer: document.getElementById('toast-container'),
    
    // Botões
    rewriteBtn: document.getElementById('rewrite-btn'),
    grammarBtn: document.getElementById('grammar-check-btn'),
    sendBtn: document.getElementById('send-btn'),
    leaveBtn: document.getElementById('leave-btn'),
    notifBtn: document.getElementById('notif-btn'),
    newConversationBtn: document.getElementById('new-conversation-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    saveNicknameBtn: document.getElementById('save-nickname-btn'),
    changeNicknameBtn: document.getElementById('change-nickname-btn'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    
    // Modals Buttons
    closeRoomActionsModalBtn: document.getElementById('close-room-actions-modal-btn'),
    modalCreateRoomBtn: document.getElementById('modal-create-room-btn'),
    modalConfirmJoinBtn: document.getElementById('modal-confirm-join-btn'),
    closeSettingsModalBtn: document.getElementById('close-settings-modal-btn'),
    closeStudyModalBtn: document.getElementById('close-study-modal'),
    closeGrammarModalBtn: document.getElementById('close-grammar-modal'),
    closeGenericModalBtn: document.getElementById('close-generic-modal'),
    
    // Seletores
    roomLangSelector: document.getElementById('room-lang-selector'),
    introLangSelector: document.getElementById('intro-lang-selector'),
    themeBtns: document.querySelectorAll('.theme-btn'),
    bubbleStyleSelector: document.getElementById('bubble-style-selector'),
    bgStyleSelector: document.getElementById('bg-style-selector'),
    
    // Grammar Specifics
    grammarLoading: document.getElementById('grammar-loading'),
    grammarResult: document.getElementById('grammar-result'),
    grammarSuccess: document.getElementById('grammar-success'),
    grammarErrors: document.getElementById('grammar-errors'),
    grammarOriginal: document.getElementById('grammar-original'),
    grammarSuggestion: document.getElementById('grammar-suggestion'),
    grammarExplanation: document.getElementById('grammar-explanation'),
    applyCorrectionBtn: document.getElementById('apply-correction-btn'),

    // Generic Modal Specifics
    genericModalTitle: document.getElementById('generic-modal-title'),
    genericModalContent: document.getElementById('generic-modal-content'),

    // Study Specifics
    studyOriginalText: document.getElementById('study-original-text'),
    studyResultArea: document.getElementById('study-result-area'),
    studyLoading: document.getElementById('study-loading'),
    wordTranslation: document.getElementById('word-translation'),
    wordSpeakContainer: document.getElementById('word-speak-container'),
    wordExplanation: document.getElementById('word-explanation'),
    wordExample: document.getElementById('word-example'),
    wordClassBadge: document.getElementById('word-class-badge'),
    wordLangBadge: document.getElementById('word-lang-badge')
};