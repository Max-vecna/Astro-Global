// utils.js
// Funções auxiliares de interface, sons e notificações

import { DOMElements } from './dom.js';
import { state } from './state.js';
import * as Room from './room.js'; // Para renderRoomList ao trocar tela

export const notificationAudio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
notificationAudio.volume = 0.5;

// --- Toasts ---
export const showToast = (msg, type='info') => {
    const toast = document.createElement('div'); 
    toast.className = 'toast';
    let icon = type === 'success' ? 'fa-check-circle text-green-400' : 
               type === 'error' ? 'fa-exclamation-circle text-red-400' : 'fa-info-circle';
    
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    DOMElements.toastContainer.appendChild(toast); 
    setTimeout(() => toast.remove(), 4000);
};

// --- Screen Switching ---
export const switchScreen = (screen) => {
    ['nickname', 'lobby', 'chat'].forEach(s => {
        const el = DOMElements[s === 'chat' ? 'chat' : `${s}Screen`];
        el.classList.toggle('hidden', s !== screen);
        el.classList.toggle('flex', s === screen);
    });
    
    if (screen === 'lobby') Room.renderRoomList();
    if (screen === 'chat') {
        state.onlineUsersInRoom = {};
        state.loadTime = Date.now();
    }
};

// --- Scrolling ---
export const scrollToBottom = () => {
    DOMElements.messagesContainer.scrollTop = DOMElements.messagesContainer.scrollHeight;
};

// --- Notifications & Audio ---
export function updateNotifIcon() {
    if (Notification.permission === 'granted') {
        DOMElements.notifBtn.innerHTML = '<i class="fas fa-bell text-[var(--primary-color)]"></i>';
        DOMElements.notifBtn.title = "Notificações Ativadas";
    } else {
        DOMElements.notifBtn.innerHTML = '<i class="fas fa-bell-slash text-[var(--text-muted-color)]"></i>';
        DOMElements.notifBtn.title = "Ativar Notificações";
    }
}

export async function unlockAudioAndRequestPermission() {
    if (!state.audioUnlocked) {
        try {
            await notificationAudio.play();
            notificationAudio.pause();
            notificationAudio.currentTime = 0;
            state.audioUnlocked = true;
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

export function checkAndNotify(msgData) {
    const isNew = msgData.timestamp > state.loadTime;
    const isOther = msgData.userId !== state.userId;
    // Em sala de IA, não notificamos via push browser se for o proprio usuario,
    // mas se for a IA (Astro Mentor) podemos notificar
    
    if (isNew && isOther) {
        if (state.audioUnlocked) try { notificationAudio.play().catch(e => {}); } catch(e) {}
        if (document.hidden && "serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then(reg => 
                reg.showNotification(`Astro: ${msgData.nickname}`, { body: msgData.text, icon: "https://cdn-icons-png.flaticon.com/512/2554/2554978.png" })
            );
        }
    }
}

// --- Theme ---
export const updateThemeButtons = (theme) => {
    DOMElements.themeBtns.forEach(btn => {
        if(btn.dataset.theme === theme) btn.classList.add('ring-2', 'ring-[var(--primary-color)]');
        else btn.classList.remove('ring-2', 'ring-[var(--primary-color)]');
    });
}