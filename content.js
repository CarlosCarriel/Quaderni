// Aletheia rev_1.4 - Asistente Local
// Componente: LENTE INMERSIVO (Overlay / Widget Contextual)
// Función: Inyección en DOM, captura de eventos y despliegue HUD (Heads-Up Display)

console.log('[CONTENT] Aletheia rev_1.4: selección de texto activo.');

// 1. DICCIONARIO DE PROMPTS (Mapeo de intenciones)
const INTENT_PROMPTS = {
        'translate': (text) => 
            `Task: Translate to Spanish.\n<text>${text}</text>\nSpanish:`,
            
        'translate_tech': (text) => 
            `Translate to Spanish. Keep code/English terms.\n<text>${text}</text>\nSpanish:`,
            
        'explain': (text) => 
            `Task: Explain code logic in Spanish (1 sentence).\n<code>${text}</code>\nExplanation:`,
            
        'define': (text) => 
            `Task: Define term in Spanish (max 20 words).\n<term>${text}</term>\nDefinition:`,
        
        'translate_es': (text) => 
            `You are a translator. ONLY translate. Do NOT explain, define, or interpret.\n`+
            `Task: Translate EXACTLY this text to English. Word-for-word if possible.\n`+
            `<text>${text}</text>\n` +
            `ENGLISH TRANSLATION ONLY (no explanations):`,

        'synonym': (text) => 
            `Task: Provide 3 technical synonyms or related terms in Spanish for the concept.\n` +
            `Format: Comma separated list. No numbering.\n` +
            `<term>${text}</term>\n` +
            `Synonyms:`,
};

let activeTooltip = null;
let activeIcon = null;

// 2. LISTENER DE SELECCIÓN (El Ojo del Sistema)
document.addEventListener('mouseup', (event) => {
    // Si el clic fue dentro de nuestro propio tooltip/icono, ignoramos para no cerrarlo
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

// 3. UI: BOTÓN FLOTANTE (El Gatillo)
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
        
        // EL MOMENTO CRÍTICO: CLICK -> BACKGROUND
        btn.onclick = () => handleAction(action.id, text, x, y);
        
        menu.appendChild(btn);
    });

    container.appendChild(menu);
    activeIcon = menu;

    // --- LÓGICA DE ARRASTRE (DRAG & DROP) PARA EL MENÚ ---
    let isDragging = false;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;

    menu.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        if (e.target.tagName === 'BUTTON') return; // Permitir clic en botones
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
            menu.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
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

// 4. LÓGICA DE ENVÍO (El Puente)
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

    // [FIX] Verificar si el contexto de la extensión sigue activo (evita el crash si recargaste la extensión)
    if (!chrome?.runtime?.id) {
        showTooltip(x, y, "⚠️ Extensión desconectada. Por favor, recarga esta página.");
        return;
    }

    // ENVIAR MENSAJE AL BACKGROUND
    chrome.runtime.sendMessage({
        action: 'processRequest',
        prompt: finalPrompt,
        mode: mode, // Para las estadísticas
        interfaz: 'Overlay',      // ← Corregido: Esto es el Overlay
        version: '1.4',           // ← Agregar: Versión constante
        categoria: mode,          // ← Agregar: La categoría es el 'mode'
        concepto: concepto,       // ← Modificado: Nombre legible
        input: text               // ← Agregar: El texto original (INPUT)
    }, (response) => {
        if (response && response.success) {
            removeUI(); // Quitar el "Cargando..."
            showTooltip(x, y, response.result); // Mostrar resultado real
        } else {
            removeUI();
            showTooltip(x, y, "❌ Error: " + (response?.error || "Desconocido"));
        }
});
}
// 5. UI: TOOLTIP DE RESPUESTA (El Resultado)
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

    // --- LÓGICA DE ARRASTRE (DRAG & DROP) ---
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    tooltip.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        // Evitar arrastrar si se hace clic en botones o texto seleccionable
        if (e.target.tagName === 'BUTTON' || e.target === textDiv) return;
        
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        isDragging = true;
        
        // Listeners globales temporales
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
            
            // Usar transform para mejor rendimiento que top/left
            tooltip.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
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

// Estilos globales para animación
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);