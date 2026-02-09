# Quaderni Deploy Template (Dev → Runtime)
# INSTRUCCIONES: 
# 1. Copia este archivo como 'deploy.ps1'
# 2. Ajusta la variable $Source a la carpeta donde clonaste el repo.
# 3. Ejecuta para sincronizar con la carpeta de carga del navegador.


# Rutas Dinámicas (Ajustar según necesidad)
$Source = "$env:USERPROFILE\Documents\GitHub\Quaderni"
$Target = "$env:LOCALAPPDATA\Quaderni"

Write-Host "`n[DEPLOY] Sincronizando artefactos de Quaderni..." -ForegroundColor Cyan

# Validar existencia del código fuente
if (-not (Test-Path $Source)) {
    Write-Host "[ERROR] No se encuentra la carpeta de origen: $Source" -ForegroundColor Red
    Write-Host "[!] Edita tu deploy.ps1 y corrige la ruta en `$Source." -ForegroundColor Yellow
    exit 1
}

# Crear el directorio de Runtime si no existe (Soberanía de datos local)
if (-not (Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
    Write-Host "[INFO] Directorio de Runtime creado en AppData." -ForegroundColor Gray
}

# Filtro de exclusión: Solo llevamos lo necesario para que la extensión funcione
$Exclude = @(
    '.git', 
    '.gitignore', 
    'deploy.ps1', 
    'deploy.example.ps1', 
    'README.md', 
    '.vscode', 
    '.github',
    '*.bak',
    '*.log'
)

# Ejecución de la transferencia con manejo de errores
try {
    # Limpiar archivos viejos (opcional, para asegurar una instalación limpia)
    # Remove-Item -Path "$Target\*" -Recurse -Force -ErrorAction SilentlyContinue
    
    Get-ChildItem $Source -Exclude $Exclude | Copy-Item -Destination $Target -Recurse -Force -ErrorAction Stop
    
    Write-Host "[OK] Deploy completado con éxito." -ForegroundColor Green
    Write-Host "[i] Destino: $Target" -ForegroundColor Gray
    Write-Host "`nRECUERDA: Recarga la extensión en chrome://extensions para aplicar los cambios.`n" -ForegroundColor Yellow
} catch {
    Write-Host "[CRITICAL] Error al copiar archivos. ¿Está el navegador bloqueando la carpeta?" -ForegroundColor Red
    Write-Host "Cierra el navegador o desactiva la extensión e intenta de nuevo." -ForegroundColor Yellow
    exit 1
}