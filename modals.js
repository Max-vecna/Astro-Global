// modals.js
// Gerencia a abertura e lógica dos modais (Estudo, Edição, Gramática)

import { DOMElements } from './dom.js';
import { state } from './state.js';
import * as Services from './services.js';
import * as Utils from './utils.js';
import * as Chat from './chat.js';

// --- Modal Genérico ---
export function showGenericModal(title, content) {
    DOMElements.genericModalTitle.textContent = title;
    DOMElements.genericModalContent.innerHTML = content;
    DOMElements.genericModal.classList.remove('hidden'); 
    DOMElements.genericModal.classList.add('flex');
}

// --- Modal de Edição ---
export function openEditMessageModal(msgId, originalText) {
    // Usamos a estrutura existente do modal genérico para não quebrar referências
    DOMElements.genericModalTitle.textContent = "Editar mensagem";
    
    DOMElements.genericModalContent.innerHTML = `
        <div class="flex flex-col gap-4 w-full">
            <textarea id="edit-message-text" class="w-full min-h-[120px] p-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white resize-none">${originalText}</textarea>
            <div class="flex gap-2 justify-end">
                <button id="cancel-edit" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition">Cancelar</button>
                <button id="confirm-edit" class="px-4 py-2 rounded-lg bg-[var(--primary-color)] font-bold hover:opacity-90 transition">Salvar</button>
            </div>
        </div>
    `;

    DOMElements.genericModal.classList.remove('hidden'); 
    DOMElements.genericModal.classList.add('flex');

    const close = () => { 
        DOMElements.genericModal.classList.add('hidden'); 
        DOMElements.genericModal.classList.remove('flex');
    };
    
    // Configura botões internos
    const cancelBtn = DOMElements.genericModalContent.querySelector('#cancel-edit');
    const confirmBtn = DOMElements.genericModalContent.querySelector('#confirm-edit');
    const textarea = DOMElements.genericModalContent.querySelector('#edit-message-text');

    if(cancelBtn) cancelBtn.onclick = close;
    
    if(confirmBtn) confirmBtn.onclick = async () => {
        const newText = textarea.value;
        if (!newText.trim()) return;
        await Chat.updateMessageText(msgId, newText);
        close();
    };
}

// --- Modal Traduzir Para ---
export function openTranslateToModal(originalText) {
    // Mesma correção: injetar no Content ao invés de destruir o modal pai
    DOMElements.genericModalTitle.textContent = "Traduzir para";

    DOMElements.genericModalContent.innerHTML = `
        <div class="flex flex-col gap-4 w-full">
            <select id="translate-target-lang" class="w-full p-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white">
                <option value="pt">Português</option><option value="en">English</option><option value="es">Español</option>
                <option value="fr">Français</option><option value="de">Deutsch</option><option value="it">Italiano</option>
                <option value="ja">日本語</option><option value="zh">中文</option><option value="ru">Русский</option>
                <option value="ar">العربية</option>
            </select>
            <button id="confirm-translate-btn" class="bg-[var(--primary-color)] text-white p-3 rounded-xl font-bold hover:opacity-90 transition">Traduzir</button>
        </div>
    `;

    DOMElements.genericModal.classList.remove('hidden'); 
    DOMElements.genericModal.classList.add('flex');

    // Configura o botão de ação
    const confirmBtn = DOMElements.genericModalContent.querySelector('#confirm-translate-btn');
    const select = DOMElements.genericModalContent.querySelector('#translate-target-lang');

    if(confirmBtn) confirmBtn.onclick = async () => {
        const lang = select.value;
        
        // Exibe estado de carregamento REUSANDO a função correta
        showGenericModal('Tradução', '<div class="flex flex-col items-center justify-center p-4"><i class="fas fa-circle-notch fa-spin text-3xl mb-3 text-[var(--primary-color)]"></i><p>Traduzindo...</p></div>');
        
        try {
            const translated = await Services.traduzir(originalText, lang);
            // Atualiza o conteúdo com o resultado
            DOMElements.genericModalContent.textContent = translated.texto;
        } catch (e) {
            DOMElements.genericModalContent.textContent = 'Erro ao traduzir. Tente novamente.';
        }
    };
}

// --- Modal de Estudo ---
export async function openStudyModal(text) {
    DOMElements.studyModal.classList.remove('hidden'); 
    DOMElements.studyModal.classList.add('flex');
    const originalArea = DOMElements.studyOriginalText;
    originalArea.innerHTML = '<span class="text-sm opacity-50">Carregando...</span>';
    DOMElements.studyResultArea.classList.add('hidden');
    
    try {
        const tokens = await Services.segmentarTexto(text);
        originalArea.innerHTML = '';
        tokens.forEach(token => {
            const span = document.createElement('span');
            span.textContent = token; span.className = 'word-token';
            span.onclick = () => selectToken(span, token, text);
            originalArea.appendChild(span);
        });
    } catch (e) { originalArea.textContent = text; }
}

async function selectToken(el, token, contextPhrase) {
    document.querySelectorAll('.word-token').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    DOMElements.studyLoading.classList.remove('hidden');
    DOMElements.studyResultArea.classList.add('hidden');
    
    try {
        const data = await Services.explorarPalavra(token, contextPhrase, state.currentTranslationLangGlobal);
        DOMElements.wordTranslation.textContent = data.traducao;
        
        DOMElements.wordSpeakContainer.innerHTML = ''; 
        const btn = document.createElement('button');
        btn.className = "speaker-btn bg-white/10 hover:bg-white/20 w-8 h-8 rounded-full flex items-center justify-center transition-all text-white";
        btn.innerHTML = '<i class="fas fa-volume-high"></i>';
        btn.onclick = () => {
            const utterance = new SpeechSynthesisUtterance(token);
            utterance.lang = data.idioma_origem_iso || 'en-US';
            window.speechSynthesis.speak(utterance);
        };
        DOMElements.wordSpeakContainer.appendChild(btn);
        
        DOMElements.wordExplanation.textContent = data.explicacao;
        DOMElements.wordExample.textContent = `"${data.exemplo_uso}"`;
        DOMElements.wordClassBadge.textContent = data.classe_gramatical;
        DOMElements.wordLangBadge.textContent = (data.idioma_origem_iso || 'unk').toUpperCase();
        
        DOMElements.studyLoading.classList.add('hidden');
        DOMElements.studyResultArea.classList.remove('hidden');
    } catch (e) { 
        Utils.showToast("Erro ao analisar.", "error"); 
        DOMElements.studyLoading.classList.add('hidden'); 
    }
}

// --- Ações de Botão (Handle Action) ---
export async function handleAction(type, text, msgId = null) {
    const targetLang = state.currentTranslationLangGlobal; 
    Utils.showToast("Processando...", "info");
    try {
        if (type === 'translate') {
            if (msgId) {
                const el = document.getElementById(`trans-${msgId}`);
                if(el) { 
                    el.innerHTML = '<i class="fas fa-circle-notch fa-spin text-xs opacity-50"></i>'; 
                    await Chat.performTranslation(msgId, text, targetLang); 
                    Utils.showToast("Atualizado!", "success"); 
                }
            } else {
                const trad = await Services.traduzir(text, targetLang); 
                showGenericModal(`Tradução (${targetLang})`, typeof trad === 'string' ? trad : trad.texto);
            }
        } else if (type === 'context') {
            const ctx = await Services.analisarContexto(text, targetLang); 
            showGenericModal('Contexto', ctx);
        } else if (type === 'variations') {
            const vars = await Services.gerarVariacoes(text, targetLang); 
            showGenericModal('Variações', vars.map(v => `• ${v}`).join('<br><br>'));
        } else if (type === 'study') {
            openStudyChoiceModal(text, msgId);
        }

    } catch (e) { console.error(e); Utils.showToast("Erro na IA.", "error"); }
}

export function openStudyChoiceModal(originalText, msgId) {
    const translatedEl = document.getElementById(`trans-${msgId}`);
    const translatedText = translatedEl?.textContent?.trim();

    DOMElements.genericModalTitle.textContent = "Estudar frase";

    DOMElements.genericModalContent.innerHTML = `
        <div class="flex flex-col gap-3">
            <button id="study-original-btn"
                class="p-3 rounded-xl bg-indigo-600 hover:opacity-90 text-white font-semibold">
                📘 Estudar texto original
            </button>

            ${translatedText ? `
            <button id="study-translation-btn"
                class="p-3 rounded-xl bg-emerald-600 hover:opacity-90 text-white font-semibold">
                🌍 Estudar tradução
            </button>` : ''}

            <button id="cancel-study-btn"
                class="p-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white">
                Cancelar
            </button>
        </div>
    `;

    DOMElements.genericModal.classList.remove('hidden');
    DOMElements.genericModal.classList.add('flex');

    document.getElementById('cancel-study-btn').onclick = closeGeneric;

    document.getElementById('study-original-btn').onclick = () => {
        closeGeneric();
        openStudyModal(originalText);
    };

    if (translatedText) {
        document.getElementById('study-translation-btn').onclick = () => {
            closeGeneric();
            openStudyModal(translatedText);
        };
    }
}

function closeGeneric() {
    DOMElements.genericModal.classList.add('hidden');
    DOMElements.genericModal.classList.remove('flex');
}

// --- Gramática ---
export const handleGrammarCheck = async () => {
    const input = DOMElements.messageInput;
    const originalText = input.value.trim();
    if (!originalText) { Utils.showToast("Digite algo primeiro!", "info"); return; }

    DOMElements.grammarModal.classList.remove('hidden'); 
    DOMElements.grammarModal.classList.add('flex');
    DOMElements.grammarLoading.classList.remove('hidden');
    DOMElements.grammarResult.classList.add('hidden');

    try {
        const data = await Services.verificarGramatica(originalText);
        DOMElements.grammarLoading.classList.add('hidden');
        DOMElements.grammarResult.classList.remove('hidden');
        DOMElements.grammarResult.classList.add('flex');

        if (data.tem_erros) {
            DOMElements.grammarSuccess.classList.add('hidden');
            DOMElements.grammarErrors.classList.remove('hidden');
            DOMElements.grammarErrors.classList.add('flex');
            DOMElements.grammarOriginal.textContent = originalText;
            DOMElements.grammarSuggestion.textContent = data.sugestao;
            DOMElements.grammarExplanation.textContent = data.explicacao;
            DOMElements.applyCorrectionBtn.onclick = () => {
                input.value = data.sugestao;
                DOMElements.grammarModal.classList.add('hidden'); 
                DOMElements.grammarModal.classList.remove('flex');
                Utils.showToast("Correção aplicada!", "success"); 
                input.focus();
            };
        } else {
            DOMElements.grammarSuccess.classList.remove('hidden');
            DOMElements.grammarSuccess.classList.add('flex');
            DOMElements.grammarErrors.classList.add('hidden');
            DOMElements.grammarErrors.classList.remove('flex');
        }
    } catch (e) {
        Utils.showToast("Erro na verificação.", "error");
        DOMElements.grammarModal.classList.add('hidden'); 
        DOMElements.grammarModal.classList.remove('flex');
    }
};