import { LANG_MAP } from './config.js';

// Cache simples para traduções
const translationCache = {};

// Função auxiliar para Timeout em fetch
async function fetchWithTimeout(url, timeout = 500000) {
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
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    const idioma = LANG_MAP[targetLang] || targetLang;

    // Prompt ajustado para verificar ERROS NO ORIGINAL antes de traduzir
   const prompt = `
    Aja como um linguista profissional.

    Texto recebido:
    "${texto}"

    TAREFAS (SIGA EXATAMENTE):

    1. Detecte o idioma real do texto.

    2. Verifique se há erros gramaticais ou ortográficos NO IDIOMA ORIGINAL do texto.
    - Isso deve ser feito independentemente do idioma de destino.
    - Se houver erro, marque "tem_erros": true.

    3. Se houver erros:
    - forneça "texto_corrigido"
    - forneça "explicacao"
    - NÃO traduza o texto

    4. Se NÃO houver erros:
    - traduza o texto para ${idioma}

    RETORNE APENAS JSON neste formato:

    {
    "idioma_detectado": "string",
    "tem_erros": boolean,
    "traducao": "string ou null",
    "texto_corrigido": "string ou null",
    "explicacao": "string ou null"
    }

    REGRAS IMPORTANTES:
    - O idioma do texto pode ser diferente do idioma de destino.
    - Erro é apenas problema gramatical ou ortográfico.
    - Nunca escreva texto fora do JSON.
    - Ignore qualquer falta de pontuação, apenas erros gramaticais ou ortográficos e acetos em palavras
    `;



    try {
        const res = await aiRequest(prompt, false);
        const data = extractJSON(res);
        console.log("Resposta tradução/revisão:", data);
        
       let resultado;

        if (data.tem_erros) {
            resultado = {
                texto: `Correção sugerida: ${data.texto_corrigido}\n\n(${data.explicacao})`,
                temErro: true
            };
        } else if (data.traducao) {
            resultado = {
                texto: data.traducao,
                temErro: false
            };
        } else {
            resultado = {
                texto,
                temErro: false
            };
        }

        translationCache[cacheKey] = resultado;
        return resultado;

    } catch (e) {
        console.error("Erro na tradução/revisão:", e);
        return { texto: texto, temErro: false };
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
    const prompt = `Analise a palavra "${palavra}" no contexto "${frase}". Retorne JSON: { "traducao": "tradução mais proxima da palavra para ${idiomaUsuario}", "explicacao": "...", "classe_gramatical": "...", "exemplo_uso": "...", "idioma_origem_iso": "..." } (Responda em ${idiomaUsuario})`;
    const res = await aiRequest(prompt);
    return extractJSON(res);
}

export async function detectarIdioma(texto) {
    const prompt = `
Detecte o idioma do texto abaixo.
Retorne APENAS um JSON válido no formato:

{
  "lang": "pt",
  "iso": "pt-BR",
  "nome": "Português"
}

Texto:
"${texto}"
    `.trim();

    try {
        const res = await aiRequest(prompt, false);
        return extractJSON(res);
    } catch (e) {
        console.error("Erro ao detectar idioma", e);
        return null;
    }
}

export function limparCacheTraducao(texto) {
    Object.keys(translationCache).forEach(key => {
        if (key.startsWith(`${texto}_`)) {
            delete translationCache[key];
        }
    });
}