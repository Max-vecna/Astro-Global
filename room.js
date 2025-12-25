// room.js
// Lógica de Sala, Presença e Lista de Salas

import { db } from './config.js';
import { state } from './state.js';
import { DOMElements } from './dom.js';
import * as Utils from './utils.js';
import * as Chat from './chat.js';
import { ref, set, get, onValue, onChildAdded, onChildChanged, onDisconnect, query, orderByKey, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

let presenceRef;

// --- Presença ---
export const initializePresence = () => {
    presenceRef = ref(db, `presence/${state.currentRoom}/${state.userId}`);
    set(presenceRef, { nickname: state.nickname, isOnline: true });
    onDisconnect(presenceRef).update({ isOnline: false });
};

const updatePresenceUI = (users) => {
    const online = Object.entries(users).filter(([, u]) => u && u.isOnline);
    DOMElements.userCountDisplay.textContent = `${online.length} online`;
    const container = DOMElements.userAvatarsContainer; 
    container.innerHTML = '';
    online.slice(0, 4).forEach(([id, user]) => {
        if (!user.nickname) return;
        const div = document.createElement('div');
        div.className = "w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-[var(--surface-color)] shadow-sm";
        div.style.backgroundColor = state.userColors[id] || '#666';
        div.textContent = user.nickname.charAt(0).toUpperCase();
        container.appendChild(div);
    });
};

// --- Salas ---
export const joinRoom = async (roomCode) => {
    await cleanupRoomListeners();
    if (!roomCode) return;
    
    state.currentRoom = roomCode;
    updateRecentRooms(roomCode);
    Utils.switchScreen('chat');
    
    DOMElements.roomCodeDisplay.textContent = roomCode;
    DOMElements.messagesList.innerHTML = '';
    DOMElements.messagesList.appendChild(DOMElements.typingIndicatorContainer);
    
    initializePresence();
    
    // Listeners do Firebase
    const messagesRef = query(ref(db, `messages/${state.currentRoom}`), orderByKey());
    const unsubMessages = onChildAdded(messagesRef, s => {
        const data = s.val(); 
        Chat.renderMessage(data, s.key); 
        Utils.checkAndNotify(data);
    });
    const unsubChanged = onChildChanged(messagesRef, s => Chat.renderMessage(s.val(), s.key));
    
    const unsubPresence = onValue(ref(db, `presence/${state.currentRoom}`), snapshot => {
        const data = snapshot.val() || {}; 
        state.onlineUsersInRoom = data; 
        updatePresenceUI(data);
    });
    
    const unsubTyping = onValue(ref(db, `typing/${state.currentRoom}`), snapshot => {
        const typingUsers = snapshot.val() || {}; 
        delete typingUsers[state.userId]; 
        Chat.renderTypingIndicator(typingUsers);
    });
    
    state.roomUnsubscribes.push(unsubPresence, unsubTyping, unsubMessages, unsubChanged);
};

export const cleanupRoomListeners = async () => {
    if (presenceRef) await set(presenceRef, null);
    state.roomUnsubscribes.forEach(unsub => unsub()); 
    state.roomUnsubscribes = [];
};

export const leaveRoom = async () => { 
    await cleanupRoomListeners(); 
    state.currentRoom = null; 
    Utils.switchScreen('lobby'); 
};

// --- Histórico de Salas ---
const updateRecentRooms = (roomCode) => {
    let recent = JSON.parse(localStorage.getItem("recentRooms") || "[]").filter(r => r !== roomCode);
    recent.unshift(roomCode); 
    localStorage.setItem("recentRooms", JSON.stringify(recent.slice(0, 10)));
};

export async function updateNicknameHistory(newNickname) {
    if (!state.userId) return;
    const recentRooms = JSON.parse(localStorage.getItem("recentRooms") || "[]");
    for (const roomCode of recentRooms) {
        try {
            const msgsRef = ref(db, `messages/${roomCode}`);
            const snapshot = await get(msgsRef);
            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach((childSnap) => {
                    const msg = childSnap.val();
                    if (msg.userId === state.userId && msg.nickname !== newNickname) updates[`${childSnap.key}/nickname`] = newNickname;
                });
                if (Object.keys(updates).length > 0) await update(msgsRef, updates);
            }
        } catch(e) {}
    }
}

export const renderRoomList = () => {
    const list = DOMElements.roomListContainer; 
    list.innerHTML = '';
    const allRooms = JSON.parse(localStorage.getItem("recentRooms") || "[]");
    
    if (allRooms.length === 0) {
        list.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-muted-color opacity-50 mt-10"><i class="fas fa-wind text-4xl mb-2"></i><p>Nenhuma sala recente.</p></div>`; 
        return;
    }
    
    allRooms.forEach(roomCode => {
        const el = document.createElement('div');
        el.className = "flex items-center p-4 bg-[var(--surface-color)] rounded-xl cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 mb-2";
        el.innerHTML = `<div class="w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-indigo-500 text-white shadow-md mr-3"><i class="fas fa-hashtag"></i></div><div class="flex-1"><h3 class="font-bold text-[var(--text-color)]">#${roomCode}</h3><p class="text-xs text-muted-color">Clique para entrar</p></div><button class="del-room w-8 h-8 rounded-full hover:text-red-500"><i class="fas fa-trash"></i></button>`;
        
        el.onclick = (e) => { 
            if (e.target.closest('.del-room')) { 
                e.stopPropagation(); 
                const n = allRooms.filter(r => r !== roomCode); 
                localStorage.setItem("recentRooms", JSON.stringify(n)); 
                renderRoomList(); 
            } else {
                joinRoom(roomCode); 
            }
        };
        list.appendChild(el);
    });
};