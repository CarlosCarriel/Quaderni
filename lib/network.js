// Definidas en contexto global del worker para ser usadas en cualquier parte del código sin necesidad de importarlas explícitamente.
// Auxiliar: fetch con timeout usando AbortController
function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    options.signal = controller.signal;
    return fetch(url, options).finally(() => clearTimeout(id));
}

// Patrón de recuperación con reintentos, backoff exponencial y jitter.
async function fetchWithRetry(url, options = {}, timeout = 15000, retries = 3, backoffBase = 800) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const resp = await fetchWithTimeout(url, options, timeout);

            if (!resp.ok) {
                // Reintentar en errores 5xx
                if (resp.status >= 500 && resp.status < 600 && attempt < retries) {
                    const jitter = Math.random() * 300;
                    const delay = backoffBase * Math.pow(2, attempt) + jitter;
                    console.warn(`[NETWORK] 5xx recibido (${resp.status}). Reintento en ${Math.round(delay)}ms (intento ${attempt + 1}/${retries})`);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                return resp;
            }

            return resp;
        } catch (err) {
            if (attempt < retries) {
                const jitter = Math.random() * 300;
                const delay = backoffBase * Math.pow(2, attempt) + jitter;
                console.warn(`[NETWORK] Error en fetch: ${err.message}. Reintento en ${Math.round(delay)}ms (intento ${attempt + 1}/${retries})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

// Exponer en el scope global del worker
self.fetchWithTimeout = fetchWithTimeout;
self.fetchWithRetry = fetchWithRetry;
