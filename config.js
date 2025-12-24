import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// Configurações e Constantes
export const firebaseConfig = {
    apiKey: "AIzaSyAxb2s4tzbtD1arG9UAf7UrzhFqbRrrsl8",
    authDomain: "astro-642b6.firebaseapp.com",
    databaseURL: "https://astro-642b6-default-rtdb.firebaseio.com",
    projectId: "astro-642b6",
    storageBucket: "astro-642b6.appspot.com",
    messagingSenderId: "141832763492",
    appId: "1:141832763492:web:c8f6a529849bab54ee8771"
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