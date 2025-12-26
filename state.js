// state.js
// Gerencia o estado global da aplicação para evitar variáveis soltas

export const state = {
    currentRoom: null,
    isAiRoom: false, // Nova flag para identificar sala de IA
    nickname: localStorage.getItem('astroNickname'),
    userId: null,
    loadTime: Date.now(),
    currentTranslationLang: localStorage.getItem('astroUserLang') || "pt",
    currentTranslationLangGlobal: localStorage.getItem('astroUserLangGlobal'),
    
    // Referências e Caches
    roomUnsubscribes: [],
    replyingToMessage: null,
    activeMessageMenu: null,
    userColors: {},
    onlineUsersInRoom: {},
    typingTimeout: null,
    lastRenderedUserId: null,

    // Audio State
    audioUnlocked: false,
    
    // Cache de detecção de idioma para evitar chamadas repetidas
    detectedLangCache: {}
};

// Inicializa o ID do usuário se não existir
let storedUserId = localStorage.getItem('astroUserId');
if (!storedUserId) {
    storedUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    localStorage.setItem('astroUserId', storedUserId);
}
state.userId = storedUserId;