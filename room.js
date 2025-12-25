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

export const createRoom = async (roomCode, roomName) => {
    const roomRef = ref(db, `rooms/${roomCode}`);

    await set(roomRef, {
        name: roomName,
        createdAt: Date.now()
    });

    await joinRoom(roomCode);
};

// --- Salas ---
export const joinRoom = async (roomCode, name) => {
    await cleanupRoomListeners();
    if (!roomCode) return;
    
    state.currentRoom = roomCode;

    const roomSnap = await get(ref(db, `rooms/${roomCode}`));
    const roomData = roomSnap.exists() ? roomSnap.val() : null;

    if (roomData?.name) {
        DOMElements.roomNameDisplay.textContent = roomData.name;
    } else {
        DOMElements.roomNameDisplay.textContent = `#${roomCode}`;
    }


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
    
    allRooms.forEach(async roomCode => {
        const el = document.createElement('div');
        const roomSnap = await get(ref(db, `rooms/${roomCode}`));
        const roomName = roomSnap.exists() ? roomSnap.val().name : null;

        el.className = "group flex items-center p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all border border-white/5 hover:border-blue-500/30 mb-3 animate-in fade-in slide-in-from-bottom-2";
        
        el.innerHTML = `
            <div class="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg mr-4 group-hover:scale-110 transition-transform">
                <i class="fas fa-rocket text-lg"></i>
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-white truncate text-base">${roomName || "Sala sem nome"}</h3>
                <p class="text-[10px] text-slate-500 font-mono mt-0.5 tracking-wider">#${roomCode}</p>
            </div>
            <button class="del-room w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:text-red-500 hover:bg-red-500/10 transition-all">
                <i class="fas fa-trash-can text-sm"></i>
            </button>
        `;
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