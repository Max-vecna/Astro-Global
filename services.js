import { LANG_MAP } from './config.js';

// Cache simples para traduções
const translationCache = {};

// Função auxiliar para Timeout em fetch
async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// Núcleo das requisições para IA (Pollinations.ai)
export async function aiRequest(promptText, seed = true) {
    const prompt = encodeURIComponent(promptText);
    const url = `https://text.pollinations.ai/${prompt}${seed ? '?seed='+Math.random() : ''}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error("Erro na API");
    return await res.text();
}

// Extrator de JSON robusto
export function extractJSON(text) {
    text = text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) return JSON.parse(text.slice(start, end + 1));
    const startArr = text.indexOf("[");
    const endArr = text.lastIndexOf("]");
    if (startArr !== -1 && endArr !== -1) return JSON.parse(text.slice(startArr, endArr + 1));
    throw new Error("JSON inválido");
}

// --- Funções de Negócio ---

export async function reescreverTexto(texto) {
    const prompt = `Reescreva o texto abaixo para torná-lo mais claro e natural. Mantenha o idioma. Texto: "${texto}"`;
    const result = await aiRequest(prompt);
    return result.replace(/^"|"$/g, '').trim();
}

export async function verificarGramatica(texto) {
    if(texto.length < 3) return { tem_erros: false };

    const prompt = `Analise a seguinte frase buscando erros de gramática, ortografia ou concordância. Retorne APENAS um JSON neste formato: { "tem_erros": boolean, "sugestao": "frase corrigida aqui", "explicacao": "breve explicação do erro" }. Frase: "${texto}"`;
    
    try {
        const res = await aiRequest(prompt);
        return extractJSON(res);
    } catch (e) {
        console.error("Erro no parse JSON gramática", e);
        return { tem_erros: false, explicacao: "Não foi possível analisar no momento." };
    }
}

export async function traduzir(texto, targetLang) {
    const cacheKey = `${texto}_${targetLang}`;
    if(translationCache[cacheKey]) return translationCache[cacheKey];

    const idioma = LANG_MAP[targetLang] || targetLang;
    const prompt = `Traduza o texto a seguir para  ${idioma}: "${texto}". Produza SOMENTE a tradução, sem comentários ou explicações`;
    
    try {
        const res = await aiRequest(prompt, false);
        translationCache[cacheKey] = res;
        return res;
    } catch(e) {
        return texto;
    }
}

export async function analisarContexto(texto, targetLang) {
    const idioma = LANG_MAP[targetLang] || "português";
    const prompt = `Explique o contexto/intenção da frase: "${texto}". Responda em ${idioma}.`;
    return await aiRequest(prompt);
}

export async function gerarVariacoes(texto, targetLang) {
    const idioma = LANG_MAP[targetLang] || "português";
    const prompt = `Gere 3 variações da tradução para ${idioma} de: "${texto}".`;
    const txt = await aiRequest(prompt);
    return txt.split("\n").filter(t => t.trim().length > 0);
}

export async function segmentarTexto(texto) {
    const prompt = `Divida em palavras/tokens JSON array: "${texto}"`;
    try {
        const res = await aiRequest(prompt);
        return extractJSON(res);
    } catch {
        return texto.split(/(\s+|[.,!?;:"()]+)/).filter(t => t.trim().length > 0);
    }
}

export async function explorarPalavra(palavra, frase, userLang) {
    const idiomaUsuario = LANG_MAP[userLang] || "português";
    const prompt = `Analise a palavra "${palavra}" no contexto "${frase}". Retorne JSON: { "traducao_contextual": "...", "explicacao": "...", "classe_gramatical": "...", "exemplo_uso": "...", "idioma_origem_iso": "..." } (Responda em ${idiomaUsuario})`;
    const res = await aiRequest(prompt);
    return extractJSON(res);
}