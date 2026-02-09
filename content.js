// QUADERNI 1.1.0 - Asistente Local
//LENTE INMERSIVO (Overlay / Widget Contextual)
const VERSION = '1.1.0';
console.log(`[CONTENT] QUADERNI v${VERSION}: selección de texto activo.`);

// 1. DICCIONARIO DE PROMPTS (Mapeo de intenciones)
const INTENT_PROMPTS = {
    'translate': (text) => 
        `Translate to Spanish:\n${text}\nSpanish:`,
    'translate_tech': (text) => 
        `System: You are a technical translator. Translate to Spanish..\n` +
        `Task: Translate to Technical Spanish.\n` +
        `Rules:\n` +
        `1. PRESERVE: Keep variable names, functions, APIs, acronyms in English.\n` +
        `2. TRANSLATE: Translate comments and explanations.\n` +
        `3. LANGUAGE PRIORITY: prefer Python. If input is code, keep its language.\n` +
        `Input:\n<code_block>${text}</code_block>\n` +
        `Output:`,
        
    'explain': (text) => 
        `Task: Explain the functionality of this code snippet in Spanish (max 50 words).\n` +
        `Target Audience: Junior Developer.\n` +
        `Format: A single paragraph describing inputs, logic, and outputs.\n` +
        `Code:\n<code>${text}</code>\n` +
        `Explanation:`,
        
    'define': (text) => 
        `You are a technical dictionary.\n` +
        `Task: Define the following term in Spanish.\n` +
        `Rules:\n` +
        `1. Provide definition in Spanish ONLY. No English.\n` +
        `2. Keep the definition concise (max 40 words).\n` +
        `3. If it's a programming concept, explain its technical meaning.\n` +
        `4. If it's a code term (variable, function), clarify its role.\n` +
        `<term>${text}</term>\n` +
        `Definition in Spanish:`,
    
    'translate_es': (text) => 
        `Translate to English:\n${text}\nEnglish:`,

    'synonym': (text) => 
        `List 3 technical synonyms in Spanish (comma-separated):\n${text}\nSynonyms:`,
};


let activeTooltip = null;
let activeIcon = null;

// 2. LISTENER DE SELECCIÓN
document.addEventListener('mouseup', (event) => {
    if (event.target.closest('#tde-host-container')) return;

    // Limpiar UI anterior
    removeUI();

    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 1) { // Ignorar clics vacíos
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Calcular posición (justo encima de la selección)
        const x = rect.left + window.scrollX;
        const y = rect.top + window.scrollY - 40; 

        showFloatingIcon(x, y, text);
    }
});

// 3. UI: BOTÓN FLOTANTE
function showFloatingIcon(x, y, text) {
    const container = createHost();
    
    const menu = document.createElement('div');
    menu.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        background: rgba(30, 30, 30, 0.65);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 0.5px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 6px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
        display: flex;
        gap: 4px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        cursor: move; /* Cursor de movimiento */
    `;

    // Botones de acción
    const actions = [
        { id: 'translate', icon: '🌐', label: 'Traducir' },
        { id: 'translate_tech', icon: '💻', label: 'Técnico' },
        { id: 'define', icon: '📖', label: 'Definir' },
        { id: 'explain', icon: '🧐', label: 'Explicar' },
        { id: 'translate_es', icon: '🔁', label: 'EN→ES' },
        { id: 'synonym', icon: '📚', label: 'Sinónimos' }
    ];

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.innerText = action.icon;
        btn.title = action.label;
        btn.style.cssText = `
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.9);
            cursor: pointer;
            font-size: 15px;
            padding: 6px 10px;
            border-radius: 6px;
            transition: all 0.2s ease;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(255, 255, 255, 0.15)';
        btn.onmouseout = () => btn.style.background = 'transparent';
        
        btn.onclick = () => handleAction(action.id, text, x, y);
        
        menu.appendChild(btn);
    });

    container.appendChild(menu);
    activeIcon = menu;

    // Habilitar arrastre
    makeDraggable(menu);
}

// 4. LÓGICA DE ENVÍO
function handleAction(mode, text, x, y) {
    console.log(`[CONTENT] Acción disparada: ${mode}`);
    removeUI(); // Quitamos el menú
    showTooltip(x, y, "⏳ Pensando...", true); // Mostramos "Cargando"

    // Construir el prompt final aquí mismo
    const promptTemplate = INTENT_PROMPTS[mode] || INTENT_PROMPTS['translate'];
    const finalPrompt = promptTemplate(text);

    const conceptoMap = {
        'translate': 'Traducción general',
        'translate_tech': 'Traducción técnica',
        'explain': 'Explicar código',
        'define': 'Definir término',
        'translate_es': 'EN→ES',
        'synonym': 'Sinónimos'
    };
    const concepto = conceptoMap[mode] || mode;

    // Verificación de actividad de la extensión para evitar errores en recarga.
    if (!chrome?.runtime?.id) {
        showTooltip(x, y, "⚠️ Extensión desconectada. Por favor, recarga esta página.");
        return;
    }


    chrome.runtime.sendMessage({
        action: 'processRequest',
        prompt: finalPrompt,
        metadata: {
            mode: mode,
            category: concepto,
            interface: 'Overlay',
            version: VERSION,
            input: text
        }
    }, (response) => {
        // Validación crítica de conexión
        if (chrome.runtime.lastError) {
            removeUI();
            showTooltip(x, y, "❌ Error: " + chrome.runtime.lastError.message);
            return;
        }

        if (response && response.success) {
            removeUI(); // Quitar el "Cargando..."
            showTooltip(x, y, response.result); // Mostrar resultado real
        } else {
            removeUI();
            showTooltip(x, y, "❌ Error: " + (response?.error || "Desconocido"));
        }
});
}
// 5. UI: TOOLTIP DE RESPUESTA
function showTooltip(x, y, content, isLoading = false) {
    const container = createHost();
    
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        background: rgba(30, 30, 30, 0.75); /* Más transparente */
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        color: #f5f5f7;
        border: 0.5px solid rgba(255, 255, 255, 0.2);
        padding: 14px;
        border-radius: 12px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        z-index: 2147483647;
        animation: fadeIn 0.2s ease-out;
        cursor: move; /* Indica que se puede mover */
    `;

    // Contenedor flex para texto + botones
    const contentWrapper = document.createElement('div');
    contentWrapper.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
    `;

    const textDiv = document.createElement('div');
    textDiv.innerText = content;
    textDiv.style.flex = '1';
    textDiv.style.cursor = 'text'; // El texto sigue siendo seleccionable
    contentWrapper.appendChild(textDiv);

    // Botón copiar (solo si NO está cargando)
    if (!isLoading) {
        const copyBtn = document.createElement('button');
        copyBtn.innerText = '📋';
        copyBtn.title = 'Copiar al portapapeles';
        copyBtn.style.cssText = `
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            padding: 4px 6px;
            border-radius: 3px;
            transition: all 0.2s ease;
            flex-shrink: 0;
            color: rgba(255, 255, 255, 0.6);
        `;
        
        copyBtn.onmouseover = () => {
            copyBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            copyBtn.style.color = '#fff';
        };
        copyBtn.onmouseout = () => {
            copyBtn.style.background = 'none';
            copyBtn.style.color = 'rgba(255, 255, 255, 0.6)';
        };
        
        copyBtn.onclick = (e) => {
            navigator.clipboard.writeText(content).then(() => {
                copyBtn.innerText = '✓';
                copyBtn.style.color = '#34c759'; // macOS Green
                setTimeout(() => {
                    copyBtn.innerText = '📋';
                    copyBtn.style.color = 'rgba(255, 255, 255, 0.6)';
                }, 2000);
            }).catch(() => {
                copyBtn.innerText = '✗';
                copyBtn.style.color = '#ef4444';
            });
            e.stopPropagation();
        };
        
        contentWrapper.appendChild(copyBtn);
    }

    tooltip.appendChild(contentWrapper);


    // Botón cerrar
    if (!isLoading) {
        const closeBtn = document.createElement('div');
        closeBtn.innerText = '×';
        closeBtn.style.cssText = `
            position: absolute;
            top: 2px;
            right: 5px;
            cursor: pointer;
            font-weight: bold;
            color: rgba(255, 255, 255, 0.4);
        `;
        closeBtn.onclick = removeUI;
        tooltip.appendChild(closeBtn);
    }

    container.appendChild(tooltip);
    activeTooltip = tooltip;

    // Habilitar arrastre (evitando el área de texto seleccionable)
    makeDraggable(tooltip, (e) => e.target !== textDiv);
}

// UTILIDADES
function createHost() {
    let host = document.getElementById('tde-host-container');
    if (!host) {
        host = document.createElement('div');
        host.id = 'tde-host-container';
        document.body.appendChild(host);
    }
    return host;
}

function removeUI() {
    const host = document.getElementById('tde-host-container');
    if (host) host.innerHTML = '';
    activeIcon = null;
    activeTooltip = null;
}

function makeDraggable(element, conditionFn = () => true) {
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;

    element.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        // Evitar arrastrar si se hace clic en botones o si la condición falla
        if (e.target.tagName === 'BUTTON' || !conditionFn(e)) return;
        
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
        document.addEventListener("mousemove", drag);
        document.addEventListener("mouseup", dragEnd);
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;
            element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", dragEnd);
    }
}

// Estilos globales para animación
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);