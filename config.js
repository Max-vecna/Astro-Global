import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Configurações e Constantes
export const firebaseConfig = {
  apiKey: "AIzaSyC0eXt2QukMgcAJRzgflenD46JvRBfmczg",
  authDomain: "astro-chat-7d044.firebaseapp.com",
  projectId: "astro-chat-7d044",
  storageBucket: "astro-chat-7d044.firebasestorage.app",
  messagingSenderId: "64273019284",
  appId: "1:64273019284:web:c4a9ade561d5270b9edf81",
  measurementId: "G-HTNLE1C4P4"
};

// Inicialização
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Mapa de Idiomas
export const LANG_MAP = {
    ar: "árabe", pt: "português", es: "espanhol", ja: "japonês",
    zh: "chinês", en: "inglês", fr: "francês", de: "alemão",
    it: "italiano", ru: "russo"
};