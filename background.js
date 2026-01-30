// Aletheia rev_1.4 - Asistente Local
// ═══════════════════════════════════════════════════════════════════════════════
// NATURALEZA DEL PROYECTO: ARQUITECTURA DE INTERFAZ DUAL
// --------------------------------------------------------------------------
// Este sistema implementa una "Arquitectura de Interfaz Dual" diseñada para 
// el investigador inmersivo. Combina dos modos de interacción:
// 1. Panel de Control (Popup): La "Montura" para operaciones explícitas.
// 2. Widget Contextual (Overlay): El "Lente" in-page para flujo continuo.
// 
// El objetivo es eliminar la fricción del cambio de contexto (context switching)
// y garantizar la hermeticidad absoluta de los datos (Privacidad Zero-Trust).
// Al integrar Phi-3 Mini vía Ollama, operamos con latencia mínima y costo 
// operativo nulo.
//
// GOBIERNO DE RECURSOS ("Panóptico"):
// Ante la restricción de hardware local, el sistema se apoya en el script 
// "Panóptico 1.0" (*.ps1) en PowerShell. Este guardián gestiona el ciclo de 
// vida de los modelos, liberando VRAM/RAM de forma proactiva para mantener 
// el equilibrio entre la inferencia de IA y el rendimiento del navegador.
//
// "Luz al sótano, sin cables, seguro y al mínimo costo."
// Diciembre 2025.
// --------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════════
const OLLAMA_API_URL = "http://localhost:11434/api/generate";
const TARGET_MODEL = "phi3:mini"; 

// Derivar base URL para health checks
const OLLAMA_BASE = OLLAMA_API_URL.replace(/\/api\/.*$/i, '');

// Helper: fetch con timeout usando AbortController
function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    return fetch(url, options).finally(() => clearTimeout(id));
}

// Health check sencillo a Ollama (usa /api/tags como endpoint ligero)
async function checkOllamaStatus(timeoutMillis = 3000) {
    try {
        const resp = await fetchWithTimeout(OLLAMA_BASE + '/api/tags', { method: 'GET' }, timeoutMillis);
        return resp && resp.ok;
    } catch (e) {
        return false;
    }
}

// Inicialización de estadísticas 
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['tde_stats'], (res) => {
        if (!res.tde_stats) {
            chrome.storage.local.set({
                tde_stats: {
                    totalRequests: 0,
                    completedRequests: 0,
                    failedRequests: 0,
                    totalLatency: 0,
                    maxLatency: 0,
                    requests: [],
                    roleStats: {}
                }
            });
        }
    });
});

// Listener Principal de Mensajes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Logging seguro que no rompe si sender.tab no existe
    const origin = sender.tab ? `Tab ${sender.tab.id}` : 'Popup';
    console.log(`[BACKGROUND] Petición recibida desde: ${origin} | Acción: ${request.action}`);

    if (request.action === 'processRequest') {
        // ✅ Estadísticas: Detectar interfaz automáticamente
        const interfaceType = (sender && sender.tab) ? 'Overlay' : 'Popup';
        handleOllamaRequest(request, sendResponse, interfaceType);
        return true; // CRÍTICO: Mantiene el canal de comunicación abierto
    }
});

/**
 * Obtiene la configuración de parámetros según el modo
 * @param {string} mode - El modo de la solicitud (translate, explain, etc.)
 * @returns {object} Objeto con temperature, top_p, top_k, num_predict, stop
 */
function getModelConfig(mode) {
    console.log(`[CONFIG] Buscando configuración para modo: "${mode}"`);
    
    if (!mode) {
        console.warn(`[CONFIG] No se especificó modo, usando DEFAULT_CONFIG`);
        return DEFAULT_CONFIG;
    }
    
    const config = MODEL_CONFIG[mode];
    
    if (config) {
        console.log(`[CONFIG] ✓ Configuración encontrada para "${mode}"`);
        return config;
    } else {
        console.warn(`[CONFIG] Modo "${mode}" no reconocido, usando DEFAULT_CONFIG`);
        return DEFAULT_CONFIG;
    }
}
// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DINÁMICA DE PARÁMETROS POR MODO
// La configuración actual se encuentra basada en pruebas realizadas en diciembre 2025 
// orientadas a satisfacer a un perfil ocupado de la mejora continua, control de la dimensión 
// total del costo y la hermeticidad de los datos.
// Para estos efectos, adicional a las pruebas realizadas, se consideró el informe técnico:
// 'A Highly Capable Language Model Locally on Your Phone' de phi3:mini (publicado en 2024)
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_CONFIG = {
    'translate': {
        temperature: 0.05,
        top_p: 0.6,
        top_k: 30,
        num_predict: 100,
        stop: ["Task:", "System:", "<|end|>", "Español:", "Spanish:"]
    },
    'translate_tech': {
        temperature: 0.09,
        top_p: 0.65,
        top_k: 35,
        num_predict: 150,
        stop: ["Task:", "System:", "<|end|>", "Español:", "Spanish:", "```"]
    },
    'explain': {
        temperature: 0.1,
        top_p: 0.7,
        top_k: 40,
        num_predict: 200,
        stop: ["Task:", "System:", "<|end|>", "\nCode:", "```", "Example:"]
    },
    'docstring': {
        temperature: 0.1,
        top_p: 0.7,
        top_k: 40,
        num_predict: 300,
        stop: ['Task:', 'System:', 'end', 'Español', 'Spanish']
    },
    'define': {
        temperature: 0.05,
        top_p: 0.6,
        top_k: 30,
        num_predict: 100,
        stop: ["Task:", "System:", "<|end|>", "\n\nExample:", "\n\nContext:", "Definition:"]
    },
    'synonym': {
        temperature: 0.1,
        top_p: 0.7,
        top_k: 40,
        num_predict: 80,
        stop: ["Task:", "System:", "<|end|>", "Synonyms:", "\n\n"]
    },
    'translate_es': {
    temperature: 0.02,
    top_p: 0.5,
    top_k: 20,
    num_predict: 120,
    stop: ["Task:", "System:", "<|end|>",
        
        // Patrones de explicación que el modelo tiende a agregar
        "\n\nExplanation:",    // CRÍTICO
        "\n\nExample:",         // CRÍTICO
        "\n\nDefinition:",
        "\n\nNote:",
        "\n\nContext:",
        "\n\nUsage:",
        
        // Palabras que inician digresiones
        "However:", "But:", "Additionally:",
        "Furthermore:", "Specifically:",
        
        // Señal universal de fin
        "\n\n"]
    }
};

// Configuración por defecto si no se especifica modo
const DEFAULT_CONFIG = {
    temperature: 0.1,
    top_p: 0.7,
    top_k: 40,
    num_predict: 512,
    stop: ["Task:", "System:", "<|end|>"]
};

/**
 * Maneja la solicitud a Ollama con parámetros dinámicos
 * @param {object} request - {mode, prompt}
 * @param {function} sendResponse - Callback para responder al cliente
 */
async function handleOllamaRequest(request, sendResponse, interfaceType) {
    const startTime = Date.now();
    const cleanPrompt = request.prompt.trim();
    
    // ✅ AGREGAR: Validar y normalizar mode
    const mode = request.mode || 'unknown';
    if (!request.mode) {
        console.warn('[BACKGROUND] ⚠️ MODE no definido en request, usando fallback: "unknown"');
    }

    try {
        console.log(`[BACKGROUND] Conectando a Ollama (${TARGET_MODEL})...`);
        console.log(`[BACKGROUND] Modo: ${mode}`);
        const modeConfig = getModelConfig(mode);
        
        console.log(`[BACKGROUND] Parámetros aplicados:`, {
            temperature: modeConfig.temperature,
            top_p: modeConfig.top_p,
            top_k: modeConfig.top_k,
            num_predict: modeConfig.num_predict,
            stop_tokens_count: modeConfig.stop.length
        });
        
        // Construir el body de la solicitud con parámetros dinámicos
        const requestBody = {
            model: TARGET_MODEL,
            prompt: cleanPrompt,
            stream: false,
            options: {
                temperature: modeConfig.temperature,
                top_p: modeConfig.top_p,
                top_k: modeConfig.top_k,
                num_predict: modeConfig.num_predict,
                stop: modeConfig.stop,
                num_ctx: 2048
            }
        };

        // Debug: Mostrar el payload exacto en desarrollo
        console.log("[DEBUG] Payload completo:", JSON.stringify(requestBody, null, 2));

        // Antes de ejecutar la solicitud, comprobar salud y reintentar si es necesario
        const MAX_HEALTH_RETRIES = 3;
        let healthy = false;
        for (let attempt = 0; attempt < MAX_HEALTH_RETRIES; attempt++) {
            if (await checkOllamaStatus(2000)) { healthy = true; break; }
            // backoff exponencial
            const delay = 500 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
        }

        if (!healthy) {
            throw new Error('Ollama no disponible (health check fallido)');
        }

        // Ejecutar la solicitud a Ollama con timeout y protección
        const response = await fetchWithTimeout(OLLAMA_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        }, 20000);

        if (!response.ok) {
            throw new Error(`Ollama Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Validación de respuesta vacía
        if (!data.response) {
            throw new Error("Ollama devolvió una respuesta vacía.");
        }

        const latency = Date.now() - startTime;

        const cleanedResponse = data.response
            .trim()
            .replace(/^["']|["']$/g, '')
            .replace(/^(Español:|Spanish:|Definition:|Explanation:)\s*/i, '');

        console.log(`[BACKGROUND] ✓ Éxito. Latencia: ${latency}ms`);

        // Guardar estadísticas
        await updateStats(mode, latency, true, cleanPrompt, cleanedResponse, interfaceType, request);


        // Responder al cliente
        sendResponse({ 
            success: true, 
            result: cleanedResponse,
            mode: mode,
            latency: latency
        });

    } catch (error) {
        console.error("[BACKGROUND] ✗ Error Crítico:", error.message);
        console.error("[BACKGROUND] Stack trace:", error.stack);
        
        // Registrar el fallo en estadísticas
       await updateStats(mode, 0, false, cleanPrompt, "ERROR: " + error.message, interfaceType, request);

        // Responder con error (distingue Ollama no disponible de otros errores)
        sendResponse({ 
            success: false, 
            error: error.message.includes("Failed to fetch") 
                ? "❌ No se detecta Ollama. ¿Ejecutaste ollama en de acuerdo con parámetros de 'Panóptico'? ¿asegúrate de ejecutar 'ollama serve'?" 
                : `❌ Error: ${error.message}`,
            mode: mode
        });
    }
}


// Función Estadísticas
async function updateStats(mode, latency, success, inputText, outputText, interfaceType, request = {}) {
    try {
        const data = await chrome.storage.local.get(['tde_stats']);
        let stats = data.tde_stats || {
            totalRequests: 0,
            completedRequests: 0,
            failedRequests: 0,
            totalLatency: 0,
            maxLatency: 0,
            minLatency: Infinity,
            requests: [],
            roleStats: {}
        };
        
        // Actualizar KPIs
        stats.totalRequests = (stats.totalRequests || 0) + 1;
        if (success) {
            stats.completedRequests = (stats.completedRequests || 0) + 1;
            stats.totalLatency = (stats.totalLatency || 0) + latency;
            stats.maxLatency = Math.max((stats.maxLatency || 0), latency);
            stats.minLatency = Math.min((stats.minLatency || Infinity), latency);
        } else {
            stats.failedRequests = (stats.failedRequests || 0) + 1;
        }
        
        // CREAR REGISTRO CON TODOS LOS DATOS NECESARIOS
        const now = new Date();
        // Priorizar la categoría enviada por el request (si existe), si no, mapear desde el mode
        let categoria;
        if (request && request.categoria) {
            categoria = request.categoria;
        } else {
            // Mapear modo a una categoría persistente y consistente
            const m = (mode || '').toString().toLowerCase();
            if (m === 'es->en' || m === 'es→en' || m === 'es_en') categoria = 'ES->EN';
            else if (m === 'en->es' || m === 'en→es') categoria = 'translate_es';
            else if (m === 'translate' || m === 'translate_es' || m === 'traducir') categoria = 'translate_es';
            else if (m === 'translate_tech' || m === 'translate-tech' || m.includes('tech')) categoria = 'translate_tech';
            else if (m === 'explain' || m.includes('explic')) categoria = 'explain';
            else if (m === 'define' || m.includes('defin')) categoria = 'define';
            else if (m === 'synonym' || m === 'synonyms' || m.includes('sinon')) categoria = 'synonym';
            else if (m === 'docstring') categoria = 'docstring';
            else categoria = mode || 'unknown';
        }

        const categoriaSource = (request && request.categoria) ? 'request' : 'modeMap';
        console.log(`[STATS] Guardando nuevo registro. Modo: "${mode}", Categoria elegida: "${categoria}" (source: ${categoriaSource})`);
        const newRecord = {
            timestamp: Date.now(),
            date: now.toLocaleDateString('es-CL'),           // DD-MM-YYYY
            time: now.toLocaleTimeString('es-CL'),           // HH:MM:SS
            interfaz: interfaceType || request.interfaz || 'Unknown', 
            version: chrome.runtime.getManifest().version,
            mode: mode || 'unknown',
            categoria: categoria,                      
            concepto: (request.concepto && request.concepto !== 'N/A') ? request.concepto : (inputText ? inputText.substring(0, 100) : 'N/A'), 
            input: request.input || inputText || 'N/A',       // Input original (si existe) o Prompt
            output: outputText || 'N/A',                      // Output COMPLETO
            latency: Math.round(latency),                     // ms entero
            latencySeconds: (latency / 1000).toFixed(3).replace('.', ','), // Segundos con 3 decimales
            success: success
        };
        
        stats.requests = stats.requests || [];
        stats.requests.unshift(newRecord);
        if (stats.requests.length > 500) stats.requests.pop();
        
        // Actualizar estadísticas por modo
        stats.roleStats = stats.roleStats || {};
        if (!stats.roleStats[mode]) {
            stats.roleStats[mode] = { count: 0, totalLatency: 0, avgLatency: 0 };
        }
        stats.roleStats[mode].count++;
        stats.roleStats[mode].totalLatency = (stats.roleStats[mode].totalLatency || 0) + latency;
        stats.roleStats[mode].avgLatency = (stats.roleStats[mode].totalLatency / stats.roleStats[mode].count).toFixed(0);
        // También contabilizar por categoría persistente cuando difiere del mode
        if (categoria && categoria !== mode) {
            if (!stats.roleStats[categoria]) {
                stats.roleStats[categoria] = { count: 0, totalLatency: 0, avgLatency: 0 };
            }
            stats.roleStats[categoria].count++;
            stats.roleStats[categoria].totalLatency = (stats.roleStats[categoria].totalLatency || 0) + latency;
            stats.roleStats[categoria].avgLatency = (stats.roleStats[categoria].totalLatency / stats.roleStats[categoria].count).toFixed(0);
        }
        
        // Guardar en storage
        await chrome.storage.local.set({ tde_stats: stats });
        
        console.log(`[STATS] ✅ Interfaz: ${interfaceType} | Input: ${inputText ? inputText.substring(0, 30) : 'N/A'}...`);
        console.log(`[STATS] ✅ Output: ${outputText ? outputText.substring(0, 30) : 'N/A'}...`);
        console.log(`[STATS] ✅ Latencia: ${latency}ms (${(latency/1000).toFixed(3)}s) | Éxito: ${success}`);

    } catch (e) {
        console.error("[STATS] Error guardando estadísticas:", e);
    }
}
// ===== MANEJO DE COMANDOS =====
if (chrome.commands) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'open_stats') {
        chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
        console.log('BACKGROUND: Dashboard abierto por comando');
      }
    });
}
