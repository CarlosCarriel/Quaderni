# Deploy Quaderni: Dev → Runtime
$Source = $PSScriptRoot
$Target = "C:\Users\cfcar\AppData\Local\Quaderni"

Write-Host "`n[DEPLOY QUADERNI] Iniciando transferencia de artefactos..." -ForegroundColor Cyan

# 1. Validar Origen
if (-not (Test-Path $Source)) {
    Write-Host "[ERROR] Origen no encontrado: $Source" -ForegroundColor Red
    exit 1
}

# 2. Gestión de Directorio Destino
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
    Write-Host "[INFO] Directorio creado en AppData." -ForegroundColor Gray
} else {
    # OPCIONAL: Limpiar archivos antiguos para evitar residuos de versiones previas
    # Write-Host "[INFO] Limpiando runtime previo..." -ForegroundColor Gray
    # Get-ChildItem $Target -Exclude '.config' | Remove-Item -Recurse -Force
}

# 3. Filtro de Exclusión Refinado
# Añadimos archivos que no deben ir al runtime del navegador
$Exclude = @(
    '.git', 
    '.gitignore', 
    'deploy.ps1', 
    '.vscode', 
    '.github', 
    '*.log',
    '*.tmp',
    '*.txt',
    '*.md'
)

# 4. Ejecución del Despliegue
try {
    Get-ChildItem $Source -Exclude $Exclude | Copy-Item -Destination $Target -Recurse -Force -ErrorAction Stop
    Write-Host "[OK] Artefactos sincronizados con éxito en: $Target" -ForegroundColor Green
} catch {
    Write-Host "[CRITICAL] El deploy falló. Es posible que los archivos estén bloqueados por el navegador." -ForegroundColor Red
    Write-Host "Intenta cerrar el navegador o desactivar la extensión momentáneamente." -ForegroundColor Yellow
    exit 1
}

# 5. Instrucción de Cierre (Vital para extensiones)
Write-Host " ACCIÓN REQUERIDA: Ve a chrome://extensions y presiona 'Recargar'" -ForegroundColor Yellow
Write-Host " en el nodo de Quaderni para aplicar los cambios." -ForegroundColor Yellow
