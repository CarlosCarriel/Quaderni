// QUADERNI 1.1.0 - Asistente Local
// ═══════════════════════════════════════════════════════════════════════════════
/* Quaderni: Soberanía Computacional Local

Quaderni es un sistema de asistencia técnica local diseñado bajo el paradigma de 
Computación en el Borde (Edge Computing), optimizado para máxima productividad 
con recursos mínimos y mantenimiento cero.

Creado para estudiantes de ciencia de datos y docentes que valoran privacidad total,
rendimiento soberano y flujos ininterrumpidos, Quaderni ofrece respuestas instantáneas 
(3s promedio) sin salir de Jupyter —docstrings, explicaciones técnicas y traducciones— 
utilizando solo 8GB RAM total, sin GPU ni conexión a la nube (requisitos mínimos). 
Democratiza la IA para comunidades rurales con conectividad limitada, entornos de 
seguridad crítica y usuarios con hardware reacondicionado, transformando laptops 
obsoletas en estaciones de trabajo productivas.

 */
//
// CFCA
// Diciembre 2025.
// ═══════════════════════════════════════════════════════════════════════════════
const OLLAMA_API_URL = "http://127.0.0.1:11434/api/generate";
const TARGET_MODEL = "phi3:mini"; 

// Base URL para health checks
const OLLAMA_BASE = OLLAMA_API_URL.replace(/\/api\/.*$/i, '');
// Variables para health check con memoria temporal
let lastHealthCheckTime = 0;
let lastHealthCheckResult = false;
const HEALTH_CACHE_MS = 5000; // 5 segundos de memoria

// Cargar utilidades de red (fetchWithTimeout, fetchWithRetry)
try {
    importScripts('lib/network.js');
} catch (e) {
    // Fallo de dependencia crítica.
    console.error('[BACKGROUND] Fallo: No se pudo importar network.js:', e.message);
}

// Hace la petición real a la red para comprobar si Ollama responde correctamente.
async function checkOllamaStatus(timeoutMillis = 3000) {
    try {
        const resp = await fetchWithTimeout(OLLAMA_BASE + '/api/tags', { method: 'GET' }, timeoutMillis);
        return resp && resp.ok;
    } catch (e) {
        return false;
    }
}

// 2. Gestiona la memoria temporal
async function checkOllamaStatusCached(timeoutMillis = 3000) {
    const now = Date.now();
    
    // Si la última comprobación fue hace menos de 5 segundos, devolvemos lo que ya sabíamos
    if (now - lastHealthCheckTime < HEALTH_CACHE_MS) {
        console.log('[HEALTH] ⚡ Usando resultado en caché:', lastHealthCheckResult);
        return lastHealthCheckResult;
    }
    
    // Si pasó el tiempo, hacemos la consulta real llamando a la "Obrera"
    lastHealthCheckResult = await checkOllamaStatus(timeoutMillis);
    lastHealthCheckTime = now;
    return lastHealthCheckResult;
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

    // Permitir comprobaciones de salud desde popup o UI
    if (request.action === 'checkHealth') {
        checkOllamaStatusCached(3000).then((healthy) => {
            sendResponse({ success: !!healthy });
        }).catch(() => sendResponse({ success: false }));
        return true;
    }

    if (request.action === 'processRequest') {
        // Estadísticas: Detectar interfaz automáticamente
        const interfaceType = (sender && sender.tab) ? 'Overlay' : 'Popup';
        handleOllamaRequest(request, sendResponse, interfaceType);
        return true; // Mantiene el canal de comunicación abierto
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
// CONFIGURACIÓN DE PARÁMETROS POR MODO
// La configuración está optimizada para equilibrar rendimiento y fidelidad
// en un entorno de ejecución local (Edge). Cada modo tiene parámetros 
// específicos para la tarea (ej. traducción, explicación de código).
// ═══════════════════════════════════════════════════════════════════════════════

const MODEL_CONFIG = {
    'translate': {
        temperature: 0.05,
        top_p: 0.6,
        top_k: 30,
        num_predict: 150,
        stop: ["Task:", "System:", "<|end|>", "Español:", "Spanish:"]
    },
    'translate_tech': {
        temperature: 0.09,
        top_p: 0.65,
        top_k: 35,
        num_predict: 100,
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
        stop: ['Task:', 'System:', '<|end|>', 'Español', 'Spanish']
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
        "\n\nExplanation:",
        "\n\nExample:",
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
// NORMALIZACIÓN DE CATEGORÍAS
/**
 * Normaliza categorías inconsistentes a formato estándar
 * @param {string} rawCategory - Categoría cruda del registro
 * @param {object} context - Contexto adicional (concepto, input, output)
 * @returns {string} Categoría normalizada
 */
function normalizeCategory(rawCategory, context = {}) {
    if (!rawCategory) return 'unknown';
    
    const cat = rawCategory.toString().toLowerCase().trim();
    
    // Mapeo directo de variantes
    const categoryMap = {
        // Traducción EN->ES
        'translate_es': 'translate_es',
        'translate-es': 'translate_es',
        'translatees': 'translate_es',
        'trans_es': 'translate_es',
        'en->es': 'translate_es',
        'en→es': 'translate_es',
        
        // Traducción ES->EN
        'translate_en': 'translate_en',
        'translate-en': 'translate_en',
        'translateen': 'translate_en',
        'trans_en': 'translate_en',
        'es->en': 'translate_en',
        'es→en': 'translate_en',
        'es_en': 'translate_en',
        
        // Traducción técnica
        'translate_tech': 'translate_tech',
        'translate-tech': 'translate_tech',
        'translatetech': 'translate_tech',
        'technical': 'translate_tech',
        
        // Traducción genérica
        'translate': 'translate',
        'translation': 'translate',
        'traducir': 'translate',
        'traducción': 'translate',
        
        // Sinónimos
        'synonym': 'synonym',
        'synonyms': 'synonym',
        'sinonimo': 'synonym',
        'sinónimo': 'synonym',
        'sinonimos': 'synonym',
        'sinónimos': 'synonym',
        
        // Definición
        'define': 'define',
        'definition': 'define',
        'definir': 'define',
        'definición': 'define',
        
        // Explicación
        'explain': 'explain',
        'explanation': 'explain',
        'explicar': 'explain',
        'explicación': 'explain',
        
        // Docstring
        'docstring': 'docstring',
        'doc': 'docstring',
        'documentation': 'docstring',
        'documentación': 'docstring'
    };
    
    // Buscar mapeo directo
    if (categoryMap[cat]) {
        return categoryMap[cat];
    }
    
    // Detección contextual para 'translate'
    if (cat.includes('translate') || cat.includes('traducir')) {
        const fields = [
            context.concepto || '',
            context.input || '',
            context.output || ''
        ].join(' ').toLowerCase();
        
        // Detectar ES->EN
        if (fields.match(/\bes\b.{0,10}\ben\b/) && fields.indexOf('es') < fields.indexOf('en')) {
            return 'translate_en';
        }
        
        // Detectar EN->ES
        if (fields.match(/\ben\b.{0,10}\bes\b/) && fields.indexOf('en') < fields.indexOf('es')) {
            return 'translate_es';
        }
        
        // Detectar técnica
        if (fields.includes('técnica') || fields.includes('technical') || fields.includes('tech')) {
            return 'translate_tech';
        }
        
        return 'translate';
    }
    
    // Búsqueda parcial
    for (const [key, value] of Object.entries(categoryMap)) {
        if (cat.includes(key) || key.includes(cat)) {
            return value;
        }
    }
    
    // Fallback: categoría original limpia
    return rawCategory.toString().trim();
}
/**
 * Maneja la solicitud a Ollama con parámetros dinámicos
 * @param {object} request - {mode, prompt}
 * @param {function} sendResponse - Callback para responder al cliente
 */
async function handleOllamaRequest(request, sendResponse, interfaceType) {
    // 1. VALIDACIÓN DEFENSIVA (Blindaje de entrada)
    if (!request || !request.prompt) {
        const errorMsg = '❌ Solicitud inválida: no se proporcionó un prompt.';
        console.error('[BACKGROUND]', errorMsg);
        updateStats(request || {}, 'N/A', 0, false, interfaceType);
        sendResponse({ success: false, error: errorMsg });
        return;
    }

    const cleanPrompt = request.prompt.trim();
    if (cleanPrompt.length === 0) {
        const errorMsg = '⚠️ El texto seleccionado está vacío.';
        console.warn('[BACKGROUND]', errorMsg);
        updateStats(request, 'N/A', 0, false, interfaceType);
        sendResponse({ success: false, error: errorMsg });
        return;
    }

    // 2. INICIO DE PROCESAMIENTO
    const startTime = Date.now();
    const metadata = request.metadata || {};
    const mode = metadata.mode || request.mode || 'unknown';
    
    if (!mode || mode === 'unknown') {
        console.warn('[BACKGROUND] ⚠️ MODE no definido en request, usando fallback: "unknown"');
    }

    try {
        // 3. COMPROBACIÓN DE SALUD (Una sola vez, con Circuit Breaker)
        const MAX_HEALTH_RETRIES = 3;
        let healthy = false;
        for (let attempt = 0; attempt < MAX_HEALTH_RETRIES; attempt++) {
            if (await checkOllamaStatusCached(2000)) { healthy = true; break; }
            const delay = 500 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
        }

        if (!healthy) {
            throw new Error('Ollama no disponible (health check fallido)');
        }

        // 4. CONFIGURACIÓN DEL MODELO
        const modeConfig = getModelConfig(mode);
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

        console.log("[DEBUG] Payload preparado para Ollama");

        // 5. EJECUCIÓN DE LA SOLICITUD (Con reintentos de red)
        const response = await fetchWithRetry(OLLAMA_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        }, 20000, 3, 800);

        if (!response.ok) {
            throw new Error(`Ollama Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.response) throw new Error("Ollama devolvió una respuesta vacía.");

        // 6. PROCESAMIENTO DE SALIDA
        const latency = Date.now() - startTime;
        const cleanedResponse = data.response
            .trim()
            .replace(/^["']|["']$/g, '')
            .replace(/^(Español:|Spanish:|Definition:|Explanation:)\s*/i, '');

        console.log(`[BACKGROUND] ✓ Éxito. Latencia: ${latency}ms`);

        // 7. GUARDAR ESTADÍSTICAS Y RESPONDER
        await updateStats(mode, latency, true, cleanPrompt, cleanedResponse, interfaceType, request);

        sendResponse({ 
            success: true, 
            result: cleanedResponse,
            mode: mode,
            latency: latency
        });

    } catch (error) {
        console.error("[BACKGROUND] ✗ Error Crítico:", error.message);
    
        let userFriendlyError = error.message;
        if (error.message.includes("403") || error.message.includes("Failed to fetch")) {
            userFriendlyError = "Fallo de conexión: Asegúrate de ejecutar 'lanzar_quaderni.bat'.";
        }

        await updateStats(mode, 0, false, cleanPrompt, "ERROR: " + error.message, interfaceType, request);

        sendResponse({ 
            success: false, 
            error: `❌ ${userFriendlyError}`,
            mode: mode
        });
    }
}
// Función auxiliar para actualizar métricas de forma centralizada.
function updateRoleStats(statsObj, key, latency) {
    if (!statsObj[key]) {
        statsObj[key] = { count: 0, totalLatency: 0, avgLatency: 0 };
    }
    statsObj[key].count++;
    statsObj[key].totalLatency = (statsObj[key].totalLatency || 0) + latency;
    // Cálculo centralizado: evita errores de redondeo en diferentes lugares
    statsObj[key].avgLatency = (statsObj[key].totalLatency / statsObj[key].count).toFixed(0);
}

// Función Estadísticas
async function updateStats(mode, latency, success, inputText, outputText, interfaceType, request = {}) {
    try {
        const metadata = request.metadata || {};
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
        const rawCategory = (request && request.categoria) ? request.categoria : mode;
        const categoria = normalizeCategory(rawCategory, {
            concepto: metadata.category || request.concepto,
            input: inputText,
            output: outputText
        });
        
        console.log(`[STATS] Guardando registro. Modo: "${mode}", Categoría normalizada: "${categoria}"`);

        
        const conceptValue = metadata.category || request.concepto;
        const newRecord = {
            timestamp: Date.now(),
            date: now.toLocaleDateString('es-CL'),           // DD-MM-YYYY
            time: now.toLocaleTimeString('es-CL'),           // HH:MM:SS
            interfaz: metadata.interface || interfaceType || request.interfaz || 'Unknown', 
            version: metadata.version || chrome.runtime.getManifest().version,
            mode: mode || 'unknown',
            categoria: categoria,                      
            concepto: (conceptValue && conceptValue !== 'N/A') ? conceptValue : (inputText ? inputText.substring(0, 100) : 'N/A'), 
            input: metadata.input || request.input || inputText || 'N/A',       // Input original (si existe) o Prompt
            output: outputText || 'N/A',                      // Output COMPLETO
            latency: Math.round(latency),                     // ms entero
            latencySeconds: (latency / 1000).toFixed(3).replace('.', ','), // Segundos con 3 decimales
            success: success
        };
        
        stats.requests = stats.requests || [];
        stats.requests.unshift(newRecord);
        if (stats.requests.length > 500) stats.requests.pop();
        
        // Actualizar estadísticas (solo por categoría normalizada)
        stats.roleStats = stats.roleStats || {};
        updateRoleStats(stats.roleStats, categoria, latency);
     
        
        // Guardar en storage
        await chrome.storage.local.set({ tde_stats: stats });
        
        console.log(`[STATS] ✅ Interfaz: ${interfaceType} | Input: ${inputText ? inputText.substring(0, 30) : 'N/A'}...`);
        console.log(`[STATS] ✅ Output: ${outputText ? outputText.substring(0, 30) : 'N/A'}...`);
        console.log(`[STATS] ✅ Latencia: ${latency}ms (${(latency/1000).toFixed(3)}s) | Éxito: ${success}`);

    } catch (e) {
        console.error("[STATS] Error guardando estadísticas:", e);
    }
}
// ===== MANEJO DE COMANDOS DE TECLADO =====
const COMMAND_HANDLERS = {
    'open_stats': () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
        console.log('[BACKGROUND] Dashboard de estadísticas abierto.');
    },
    'run_health_check': async () => {
        // Usamos la versión Cached para ser eficientes
        const healthy = await checkOllamaStatusCached(3000);
        
        const title = healthy ? 'Quaderni: Conectado' : 'Quaderni: Error de Enlace';
        const message = healthy 
            ? `Motor local activo en ${OLLAMA_BASE}` 
            : `No se detecta respuesta en ${OLLAMA_BASE}. Verifica que el archivo .bat esté ejecutándose.`;

        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icon.png'),
                title: title,
                message: message,
                priority: 2
            });
        } else {
            console.log(`[HEALTH] ${title}: ${message}`);
        }
    }
};

if (chrome.commands) {
    chrome.commands.onCommand.addListener((command) => {
        const handler = COMMAND_HANDLERS[command];
        if (handler) {
            handler();
        } else {
            console.warn(`[BACKGROUND] Comando no reconocido: ${command}`);
        }
    });
}
