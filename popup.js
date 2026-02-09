// QUADERNI 1.1.0 - Asistente Local
// Componente: Panel de Control (Popup)

document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('input-text');
    const outputText = document.getElementById('output-text');
    const statusDiv = document.getElementById('status');
    const btns = document.querySelectorAll('.btn-mode');

    // PROMPTS
    const PROMPTS = {
        'translate': (text) => 
            `System: You are a professional translator.\n` +
            `Task: Translate to Spanish.\n<text>${text}</text>\n` +
            `Spanish Translation:`,

        'translate_tech': (text) => 
            `System: You are a technical translator. Translate to Spanish..\n` +
            `Task: Translate to Technical Spanish.\n` +
            `Rules:\n` +
            `1. PRESERVE: Keep variable names, functions, APIs, acronyms in English.\n` +
            `2. TRANSLATE: Translate comments and explanations.\n` +
            `3. LANGUAGE PRIORITY: prefer Python. If input is code, keep its language.\n` +
            `Input:\n<code_block>${text}</code_block>\n` +
            `Output:`,
            
        'define': (text) => 
            `You are a technical dictionary.\n` +
            `Task: Define the following term in Spanish.\n` +
            `Rules:\n` +
            `1. Provide definition in Spanish ONLY. No English.\n` +
            `2. Keep the definition concise (max 100 words).\n` +
            `3. If it's a programming concept, explain its technical meaning.\n` +
            `4. If it's a code term (variable, function), clarify its role.\n` +
            `<term>${text}</term>\n` +
            `Definition in Spanish:`,

        'explain': (text) => 
            `Task: Explain the functionality of this code snippet in Spanish (max 100 words).\n` +
            `Target Audience: Junior Developer.\n` +
            `Format: A single paragraph describing inputs, logic, and outputs.\n` +
            `Code:\n<code>${text}</code>\n` +
            `Explanation:`,

        'docstring': (text) => 
            `Task: Generate a docstring/comment in the code's language.\n` +
            `Language: English (Standard for code documentation).\n` +
            `Includes: @param/@type, @return/@rtype, and a brief summary.\n` +
            `Code:\n<code>${text}</code>\n` +
            `Docstring:`,
            
        'synonym': (text) =>
            `Task: Provide 3 technical synonyms or related terms in Spanish for the concept.\n` +
            `Format: Comma separated list. No numbering.\n` +
            `<term>${text}</term>\n` +
            `Synonyms:`,

        'translate_es': (text) => 
            `You are a translator. ONLY translate. Do NOT explain, define, or interpret.\n`+
            `Task: Translate EXACTLY this text to English. Word-for-word if possible.\n`+
            `<text>${text}</text>\n` +
            `ENGLISH TRANSLATION ONLY (no explanations):`
};

    // HANDLER DE BOTONES
    btns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = inputText.value.trim();
            if (!text) return;

            const mode = btn.dataset.mode;
            const promptTemplate = PROMPTS[mode];
            const finalPrompt = promptTemplate(text);
            
            // [STATS] Mapeo de Conceptos para estadísticas legibles
            const conceptoMap = {
                'translate': 'Traducción (EN→ES)',
                'translate_tech': 'Traducción técnica',
                'explain': 'Explicar código',
                'define': 'Definir término',
                'docstring': 'Generar Docstring',
                'translate_es': 'Traducción (ES→EN)',
                'synonym': 'Sinónimos'
            };
            const concepto = conceptoMap[mode] || mode;
            // Categoría persistente para estadísticas:
            // - el botón principal 'translate' se registra como 'translate_es' (EN->ES)
            // - el botón 'translate_es' se registra como 'ES->EN' (ES->EN)
            let categoria;
            if (mode === 'translate') categoria = 'translate_es';
            else if (mode === 'translate_es') categoria = 'ES->EN';
            else categoria = mode;

            // UI LOADING
            outputText.value = "⏳ Procesando con Ollama...";
            statusDiv.textContent = `Modo: ${mode}`;
            
            try {
                // ENVIAR A BACKGROUND
                const response = await chrome.runtime.sendMessage({
                action: 'processRequest',
                prompt: finalPrompt,
                mode: mode,
                interfaz: 'Popup',        // Identificador de origen
                version: '1.1.0',
                categoria: categoria,     // Categoría para la tabla (puede diferir de `mode`)
                concepto: concepto,       // Concepto legible (Adiós N/A)
                input: text,              // Texto original para registro
                options: { temperature: 0.1 }
            });

                // PROCESAR RESPUESTA
                if (response && response.success) {
                    outputText.value = response.result;
                    statusDiv.textContent = "✓ Completado";
                } else {
                    outputText.value = "❌ Error: " + (response?.error || "Desconocido");
                    statusDiv.textContent = "Error";
                }
            } catch (err) {
                outputText.value = "❌ Error de comunicación: " + err.message;
            }
        });
    });

    // COPIAR
    document.getElementById('btn-copy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(outputText.value);
            statusDiv.textContent = "✓ Copiado al portapapeles";
        } catch (err) {
            console.error('Error al copiar:', err);
            statusDiv.textContent = "❌ Error al copiar";
        }
    });

    // PEGAR
    const btnPaste = document.getElementById('btn-paste');
    if (btnPaste) {
        btnPaste.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                inputText.value = text;
                statusDiv.textContent = "Texto pegado";
                inputText.focus();
            } catch (err) {
                console.error('Error al pegar:', err);
                statusDiv.textContent = "Error al pegar (¿Permisos?)";
            }
        });
    }

    // LIMPIAR / RESET
    const btnClear = document.getElementById('btn-clear');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            inputText.value = '';
            outputText.value = '';
            statusDiv.textContent = "Lienzo limpio";
            inputText.focus();
        });
    }

    // DESACOPLAR (Hacer movible la Montura)
    const btnDetach = document.getElementById('btn-detach');
    if (btnDetach) {
        btnDetach.addEventListener('click', () => {
            chrome.windows.create({
                url: 'popup.html',
                type: 'popup',
                width: 400,  // Aumentado para evitar scroll horizontal
                height: 650
            });
            window.close(); // Cierra el popup original
        });
    }

    // ABRIR DASHBOARD DE ESTADÍSTICAS
    document.getElementById('btn-stats').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
    });

    // ==========================================
    // LÓGICA DE ARRASTRE DE VENTANA (WINDOW DRAG)
    // ==========================================
    // Permite mover la ventana desacoplada arrastrando el fondo
    let isDragging = false;
    let startScreenX, startScreenY;
    let initialWindowX, initialWindowY;

    document.addEventListener('mousedown', (e) => {
        // Solo arrastrar si no se hace clic en inputs o botones
        if (['BUTTON', 'TEXTAREA', 'INPUT'].includes(e.target.tagName)) return;
        
        isDragging = true;
        startScreenX = e.screenX;
        startScreenY = e.screenY;
        initialWindowX = window.screenX;
        initialWindowY = window.screenY;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.screenX - startScreenX;
            const dy = e.screenY - startScreenY;
            try { window.moveTo(initialWindowX + dx, initialWindowY + dy); } catch(err){}
        }
    });

    document.addEventListener('mouseup', () => isDragging = false);

    // ═══════════════════════════════════════════════════════════════════
    // SINCRONIZACIÓN DE ESTADÍSTICAS
    // ═══════════════════════════════════════════════════════════════════
    // Propósito: Sincronizar popup con chrome.storage.local en tiempo real
    
    function syncPopupStats() {
        chrome.storage.local.get(['tde_stats'], (result) => {
            const stats = result.tde_stats;
            
            // Si no hay datos, no hacer nada
            if (!stats || stats.totalRequests === 0) return;
            
            // Calcular métricas
            const avgLatency = stats.completedRequests > 0 
                ? (stats.totalLatency / stats.completedRequests).toFixed(0)
                : '--';
            
            const successRate = stats.totalRequests > 0
                ? ((stats.completedRequests / stats.totalRequests) * 100).toFixed(1)
                : '--';
            
            // Actualizar DOM de forma segura
            const updateElement = (id, value) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            };
            
            updateElement('popupTotalRequests', stats.totalRequests);
            updateElement('popupCompletedRequests', stats.completedRequests);
            updateElement('popupAvgLatency', avgLatency + 'ms');
            updateElement('popupSuccessRate', successRate + '%');
        });
    }

    // 1. Carga inicial al abrir el popup
    syncPopupStats();
    
    // 2. Listener reactivo: Actualiza si el Lente (Overlay) guarda datos
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.tde_stats) {
            // console.log('[POPUP] Sincronizando estadísticas...');
            syncPopupStats();
        }
    });

});
