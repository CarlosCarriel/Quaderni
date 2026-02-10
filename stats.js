// QUADERNI 1.1.0 - Asistente Local
// Componente: Dashboard de Estadísticas
// Función: Visualización de métricas de uso y rendimiento.

const defaultData = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    totalLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    requests: [],
    roleStats: {}
};

// ============ VARIABLES GLOBALES ============
let latencyChartInstance = null;
let rolesChartInstance = null;
let selectedMode = '📊 Total';
let lastLoadedStats = null;

// ============ CONFIG (Modo liviano) ============
const ENABLE_CHARTS = true; //cambiar a false para desactivar gráficos.
const MAX_HISTORY_ROWS = 30;

// SISTEMA DE FILTRADO
/**
 * Detecta dirección de traducción en texto
 * @param {string} text - Texto a analizar
 * @param {string} direction - 'esToEn' o 'enToEs'
 * @returns {boolean}
 */
function hasTranslationDirection(text, direction) {
    if (!text) return false;
    const lc = text.toLowerCase();
    
    // Patrones explícitos
    const patterns = {
        esToEn: ['es->en', 'es→en', 'es to en', 'es - en', 'es/en', 'spanish to english', 'español a inglés'],
        enToEs: ['en->es', 'en→es', 'en to es', 'en - es', 'en/es', 'english to spanish', 'inglés a español']
    };
    
    if (patterns[direction].some(p => lc.includes(p))) {
        return true;
    }
    
    // Regex contextual (máx 10 caracteres entre idiomas)
    const regex = {
        esToEn: /\bes\b.{0,10}\ben\b/,
        enToEs: /\ben\b.{0,10}\bes\b/
    };
    
    const match = lc.match(regex[direction]);
    if (!match) return false;
    
    // Verificar orden correcto
    if (direction === 'esToEn') {
        return lc.indexOf('es') < lc.indexOf('en');
    } else {
        return lc.indexOf('en') < lc.indexOf('es');
    }
}

/**
 * Diccionario de estrategias de filtrado
 * Retorna true si el registro coincide con filtro
 */
const FILTER_STRATEGIES = {
    '📊 Total': () => true,
    
    '🔍 Traducción': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'translate_es' || 
               cat === 'translate_en' || 
               cat === 'translate_tech' ||
               cat === 'translate' || 
               cat.includes('translate');
    },
    
    'ES->EN': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        if (cat === 'translate_en') return true;
        
        // Fallback: análisis contextual
        const fields = [r.concepto, r.input, r.output].filter(Boolean).join(' ');
        return hasTranslationDirection(fields, 'esToEn');
    },
    
    'EN->ES': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        if (cat === 'translate_es') return true;
        
        // Fallback: análisis contextual
        const fields = [r.concepto, r.input, r.output].filter(Boolean).join(' ');
        return hasTranslationDirection(fields, 'enToEs');
    },
    
    '⚙️ Técnica': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'translate_tech' || cat.includes('tech');
    },
    
    'Sinónimos': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'synonym' || cat.includes('sinon');
    },
    
    '📖 Definir': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'define' || cat.includes('defin');
    },
    
    '💡 Explicar': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'explain' || cat.includes('explic');
    },
    
    'Docstring': (r) => {
        const cat = (r.categoria || '').toLowerCase();
        return cat === 'docstring' || cat.includes('doc');
    }
};

// ============ CARGA INICIAL ============
function loadData() {
    chrome.storage.local.get(['tde_stats'], (result) => {
        const stats = result.tde_stats || defaultData;
        lastLoadedStats = stats;
        console.log('[DASHBOARD] Datos cargados:', stats);
        updateKPIs(stats);
    });
}

// Listener opcional para cambios en storage (actualiza UI en tiempo real)
chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.tde_stats) {
        const stats = changes.tde_stats.newValue || defaultData;
        lastLoadedStats = stats;
        console.log('[DASHBOARD] Datos actualizados (onChanged):', stats && stats.requests ? stats.requests.length : 0, 'records');
        const s = summarizeStats(stats);
        console.log('[DASHBOARD] summary onChanged:', s);
        // show debug UI if present
        const debug = document.getElementById && document.getElementById('debugInfo');
        if (debug) {
            const debugCount = document.getElementById('debugCount');
            const debugSamples = document.getElementById('debugSamples');
            debug.style.display = 'block';
            debugCount.textContent = 'Registros: ' + (s.count || 0) + ` (withDateTime:${s.withDateTime} withoutTs:${s.withoutTs})`;
            const raw = stats && stats.requests ? stats.requests.slice() : [];
            const sorted = raw.map(r => {
                let ts = null;
                if (r._computedTs) ts = r._computedTs;
                else if (r.timestamp) ts = Number(r.timestamp);
                else if (r.date && r.time) { const p = Date.parse(r.date + ' ' + r.time); ts = isNaN(p) ? null : p; }
                if (!ts) ts = 0;
                return { r, ts };
            }).sort((a,b) => b.ts - a.ts).slice(0,5);
            const samples = sorted.map(({r, ts}) => {
                const date = r.date || new Date(ts || Date.now()).toLocaleDateString('es-CL');
                const time = r.time || new Date(ts || Date.now()).toLocaleTimeString('es-CL');
                const cat = r.categoria || r.mode || 'unknown';
                return `• ${cat} — ${date} ${time} — ${r.latency||0}ms`;
            });
            debugSamples.innerHTML = samples.join('<br>') || 'Sin muestras disponibles';
        }
        updateKPIs(stats);
    }
});

// APLICACIÓN DE FILTROS
/**
 * Filtra registros según modo seleccionado
 * @param {Array} requests - Arreglo de registros
 * @returns {Array} Registros filtrados
 */
function filterRequests(requests) {
    if (!requests || !Array.isArray(requests)) return [];
    if (selectedMode === '📊 Total') return requests;
    
    const strategy = FILTER_STRATEGIES[selectedMode];
    
    if (!strategy) {
        console.warn(`[DASHBOARD] Modo de filtro desconocido: "${selectedMode}"`);
        return requests;
    }
    
    return requests.filter(strategy);
}
// HELPERS DE TIMESTAMP
/**
 * Computa timestamp Unix (ms) desde registro
 * Prioridad: _computedTs > timestamp > date+time > 0 (fallback)
 */
function computeTimestamp(record) {
    if (!record) return 0;
    
    if (record._computedTs) return record._computedTs;
    
    if (record.timestamp) {
        const ts = Number(record.timestamp);
        return isNaN(ts) ? 0 : ts;
    }
    
    if (record.date && record.time) {
        const parsed = Date.parse(`${record.date} ${record.time}`);
        return isNaN(parsed) ? 0 : parsed;
    }
    
    return 0;
}

/**
 * Enriquece arreglo con _computedTs
 * @param {Array} records - Arreglo de registros
 * @returns {Array} El mismo arreglo enriquecido
 */
function enrichWithTimestamps(records) {
    if (!Array.isArray(records)) return [];
    records.forEach(r => {
        if (!r._computedTs) {
            r._computedTs = computeTimestamp(r);
        }
    });
    return records;
}

// Resumen rápido para depuración: min/max timestamp, conteos
function summarizeStats(stats) {
    const arr = stats && stats.requests ? stats.requests : [];
    const n = arr.length;
    if (n === 0) return { count: 0 };
    let minTs = Infinity, maxTs = -Infinity, withDateTime = 0, withoutTs = 0;
    for (const r of arr) {
        if (r.date && r.time) withDateTime++;
        if (!r.timestamp) withoutTs++;
        const ts = r.timestamp || (r.date && r.time ? Date.parse(r.date + ' ' + r.time) : null);
        if (typeof ts === 'number' && !isNaN(ts)) {
            if (ts < minTs) minTs = ts;
            if (ts > maxTs) maxTs = ts;
        }
    }
    return {
        count: n,
        withDateTime,
        withoutTs,
        minTs: isFinite(minTs) ? minTs : null,
        maxTs: isFinite(maxTs) ? maxTs : null
    };
}

// ============ ACTUALIZAR TODO ============
function updateKPIs(stats) {
    lastLoadedStats = stats;
    const totalReqs = stats.totalRequests || 0;
    const completedReqs = stats.completedRequests || 0;
    const failedReqs = stats.failedRequests || 0;
    const totalLatency = stats.totalLatency || 0;
    const maxLatency = stats.maxLatency && stats.maxLatency !== Infinity ? stats.maxLatency : 0;
    const successRate = totalReqs > 0 ? ((completedReqs / totalReqs) * 100).toFixed(1) : '--';
    const avgLatency = completedReqs > 0 ? (totalLatency / completedReqs).toFixed(0) : '--';

    const setSafe = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setSafe('totalRequests', totalReqs);
    setSafe('completedRequests', completedReqs);
    setSafe('failedRequests', failedReqs);
    setSafe('successRate', successRate + '%');
    setSafe('avgLatency', avgLatency + 'ms');
    setSafe('maxLatency', maxLatency + 'ms');
    setSafe('lastUpdate', 'Última sinc: ' + new Date().toLocaleTimeString('es-ES'));

    // Actualizar tabla y gráficos
    updateTable(stats);
    updateCharts(stats);
}

// ============ GRÁFICOS CON CHART.JS ============
function updateCharts(stats) {
    if (!ENABLE_CHARTS) return;
    if (typeof Chart === 'undefined') {
        console.warn('[DASHBOARD] Chart.js no cargado');
        return;
    }
    try {
        updateLatencyChart(stats);
        updateRolesChart(stats);
    } catch (e) {
        console.error('[DASHBOARD] Error actualizando gráficos:', e);
    }
}

// ============ TABLA HISTORIAL ============
function updateTable(stats) {
    const tbody = document.getElementById('historyTable');
    if (!tbody) return;
    
    const allReqs = stats && stats.requests ? [...stats.requests] : [];
    const filtered = filterRequests(allReqs);
    
    // Enriquecer y ordenar (usa helpers)
    enrichWithTimestamps(filtered);
    filtered.sort((a, b) => b._computedTs - a._computedTs);
    
    // Limitar historial
    const limited = filtered.slice(0, MAX_HISTORY_ROWS);
    
    if (limited.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: #666;">Sin actividad reciente</td></tr>`;
        return;
    }


    tbody.innerHTML = limited.map(req => {

        const ts = req._computedTs || req.timestamp || Date.now();
        const date = new Date(Number(ts)).toLocaleDateString('es-CL');
        const time = new Date(Number(ts)).toLocaleTimeString('es-CL');
        const estado = req.success ? '✅ Éxito' : '❌ Error';
        const rawCat = (req.categoria || req.mode || 'unknown').toString();
        const catLc = rawCat.toLowerCase();
        // etiquetas amigables para categoría
        const category = (function(){
            if (catLc === 'translate_es' || catLc === 'translate-es' || catLc === 'translatees') return 'translate_es';
            if (catLc === 'translate_en' || catLc === 'translate-en' || catLc === 'translateen') return 'translate_en';
            if (catLc.includes('translate_tech') || catLc.includes('translate-tech')) return 'translate_tech';
            if (catLc.includes('synonym')) return 'synonym';
            if (catLc.includes('define')) return 'define';
            if (catLc.includes('explain')) return 'explain';
            if (catLc.includes('docstring')) return 'docstring';
            return rawCat;
        })();

        // Evitar mostrar como "concepto" las etiquetas de dirección cortas como "EN->ES" o "ES→EN"
        const rawConcept = req.concepto || '';
        const dirRe = /^\s*[A-Za-z]{2}\s*([\-→]|->)\s*[A-Za-z]{2}\s*$/;
        let conceptoDisplay = 'N/A';
        if (rawConcept && !dirRe.test(rawConcept) && rawConcept.trim().length > 3) {
            conceptoDisplay = rawConcept;
        } else if (req.input && req.input.toString().trim().length > 0) {
            const s = req.input.toString(); conceptoDisplay = s.length > 80 ? s.slice(0,80) + '…' : s;
        } else if (req.output && req.output.toString().trim().length > 0) {
            const s = req.output.toString(); conceptoDisplay = s.length > 80 ? s.slice(0,80) + '…' : s;
        } else if (rawConcept && rawConcept.trim().length > 0) {
            conceptoDisplay = rawConcept; // último recurso
        }

        const latency = req.latency || 0;

        return `<tr>
            <td>${category}</td>
            <td>${conceptoDisplay}</td>
            <td>${latency}ms</td>
            <td>${date}</td>
            <td>${time}</td>
            <td>${estado}</td>
        </tr>`;
    }).join('');
}

function updateLatencyChart(stats) {
    const ctx = document.getElementById('latencyChart');
    if (!ctx) return;
    const recent = stats.requests ? stats.requests.slice(-30) : [];
    const labels = recent.map((_, i) => i + 1);
    const data = recent.map(r => r.latency || 0);
    
    if (latencyChartInstance) {
        latencyChartInstance.data.labels = labels;
        latencyChartInstance.data.datasets[0].data = data;
        latencyChartInstance.update();
    } else {
        latencyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Latencia (ms)',
                    data: data,
                    borderColor: '#00a676',
                    backgroundColor: 'rgba(0, 166, 118, 0.08)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

function updateRolesChart(stats) {
    const ctx = document.getElementById('rolesChart');
    if (!ctx) return;
    const roleStats = stats.roleStats || {};
    const labels = Object.keys(roleStats).map(k => k.toUpperCase());
    const data = Object.values(roleStats).map(v => v.count || 0);
    if (labels.length === 0) { labels.push('Sin Datos'); data.push(1); }
    if (rolesChartInstance) {
        rolesChartInstance.data.labels = labels;
        rolesChartInstance.data.datasets[0].data = data;
        rolesChartInstance.update();
    } else {
        rolesChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#667eea','#764ba2','#4facfe','#43e97b','#fa709a','#fee140'], borderWidth:0 }] },
            options: { responsive:true, maintainAspectRatio:false }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTACIÓN / IMPORTACIÓN / UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════

function initDashboard() {
    // Botón Descargar CSV
    const btnCsv = document.getElementById('export-csv');
    if (btnCsv) btnCsv.addEventListener('click', exportToCSV);
    // Botón Descargar JSON
    const btnJson = document.getElementById('export-json');
    if (btnJson) btnJson.addEventListener('click', exportToJSON);
    // Botón Importar
    const btnImport = document.getElementById('import-stats');
    if (btnImport) btnImport.addEventListener('click', () => document.getElementById('file-input').click());
    // Input file para importar
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', importStats);

    // Selector de modo (dashboard)
    const modeSelect = document.getElementById('modeSelect');
    if (modeSelect) {
        modeSelect.value = selectedMode;
        modeSelect.addEventListener('change', (e) => {
            selectedMode = e.target.value;
            if (lastLoadedStats) updateKPIs(lastLoadedStats);
        });
    }

    // Botón de refresco (si existe) - ahora hace un reload forzado y debug
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            console.log('[DASHBOARD] Refresh button clicked');
            // Forzar lectura directa y actualización
            chrome.storage.local.get(['tde_stats'], (result) => {
                const stats = result && result.tde_stats ? result.tde_stats : defaultData;
                lastLoadedStats = stats;
                console.log('[DASHBOARD] Refresh loaded stats:', stats && stats.requests ? stats.requests.length : 0, 'requests');
                updateKPIs(stats);
                showMessage('🔄 Datos refrescados', 'success');
                // Mostrar info de depuración en UI
                const debug = document.getElementById('debugInfo');
                const debugCount = document.getElementById('debugCount');
                const debugSamples = document.getElementById('debugSamples');
                if (debug && debugCount && debugSamples) {
                    const n = stats && stats.requests ? stats.requests.length : 0;
                    debug.style.display = 'block';
                    debugCount.textContent = 'Registros: ' + n;
                    const raw = stats && stats.requests ? stats.requests.slice() : [];
                    const sorted = raw.map(r => {
                        let ts = null;
                        if (r._computedTs) ts = r._computedTs;
                        else if (r.timestamp) ts = Number(r.timestamp);
                        else if (r.date && r.time) { const p = Date.parse(r.date + ' ' + r.time); ts = isNaN(p) ? null : p; }
                        if (!ts) ts = 0;
                        return { r, ts };
                    }).sort((a,b) => b.ts - a.ts).slice(0,5);
                    const samples = sorted.map(({r, ts}) => {
                        const date = r.date || new Date(ts || Date.now()).toLocaleDateString('es-CL');
                        const time = r.time || new Date(ts || Date.now()).toLocaleTimeString('es-CL');
                        const cat = r.categoria || r.mode || 'unknown';
                        return `• ${cat} — ${date} ${time} — ${r.latency||0}ms`;
                    });
                    debugSamples.innerHTML = samples.join('<br>') || 'Sin muestras disponibles';
                }
            });
        });
    }

    // Cargar datos iniciales
    loadData();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

function exportToCSV() {
    chrome.storage.local.get(['tde_stats'], (result) => {
        const stats = result.tde_stats;
        console.log('[EXPORT] Exportando', stats && stats.requests ? stats.requests.length : 0, 'registros');
        
        if (!stats || !stats.requests || stats.requests.length === 0) {
            showMessage('❌ No hay datos para exportar', 'error');
            return;
        }
        
        const headers = ['Interfaz', 'Versión', 'Categoría', 'Concepto', 'Input (Consulta)', 'Resultado (Output)', 'Fecha', 'Hora', 'Latencia (ms)', 'Latencia (s)', 'Estado'];
        
        // Enriquecer con timestamps y ordenar
        const records = [...stats.requests];
        enrichWithTimestamps(records);
        records.sort((a, b) => b._computedTs - a._computedTs);
        
        const rowsData = records.map(req => {
            const latenciaMs = req.latency || 0;
            const latenciaS = req.latencySeconds || (latenciaMs / 1000).toFixed(3).replace('.', ',');
            const estado = req.success ? 'Éxito' : 'Error';
            const ts = req._computedTs || 0;
            const date = req.date || (ts ? new Date(ts).toLocaleDateString('es-CL') : '');
            const time = req.time || (ts ? new Date(ts).toLocaleTimeString('es-CL') : '');
            
            return [
                req.interfaz || 'Unknown',
                req.version || chrome.runtime.getManifest().version,
                req.categoria || 'unknown',
                req.concepto || 'N/A',
                req.input || 'N/A',
                req.output || 'N/A',
                date,
                time,
                latenciaMs,
                latenciaS,
                estado
            ];
        });
        
        let csv = headers.map(h => `"${h}"`).join(',') + '\n';
        rowsData.forEach(row => {
            csv += row.map(cell => {
                const escaped = String(cell).replace(/"/g, '""');
                return `"${escaped}"`;
            }).join(',') + '\n';
        });
           
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `quaderni_stats_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        showMessage(`✅ CSV descargado: ${records.length} registros`, 'success');

    });
}

function exportToJSON() {
    chrome.storage.local.get(['tde_stats'], (result) => {
        const stats = result.tde_stats;
        if (!stats) { showMessage('❌ No hay datos para exportar', 'error'); return; }
        const json = JSON.stringify(stats, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `tde_stats_backup_${new Date().toISOString().split('T')[0]}.json`; link.click();
        showMessage('✅ JSON descargado exitosamente', 'success');
    });
}

function importStats(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            chrome.storage.local.set({ tde_stats: data }, () => { showMessage('✅ Datos importados correctamente', 'success'); loadData(); console.log('[IMPORT] ' + (data.requests?data.requests.length:0) + ' registros restaurados'); });
        } catch (err) { showMessage('❌ Error: archivo JSON inválido', 'error'); console.error('[IMPORT] Error:', err); }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function showMessage(message, type) {
    const el = document.getElementById('status-message'); if (!el) return;
    el.textContent = message; el.className = 'status-message status-' + type;
    setTimeout(() => { el.className = 'status-message'; }, 3000);
}
