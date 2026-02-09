@echo off
pushd "%~dp0"
title Quaderni en la caverna

echo   QUADERNI: NODO DE PROCESAMIENTO LOCAL (EDGE)


:: 1. LIMPIEZA
echo [*] Asegurando entorno limpio...
taskkill /f /im ollama.exe >nul 2>&1

:: 2. CONFIGURACIÓN (CRÍTICO PARA LA EXTENSIÓN)
echo [*] Configurando variables de seguridad...
set OLLAMA_ORIGINS=chrome-extension://*
set OLLAMA_HOST=127.0.0.1:11434

:: 3. VERIFICACIÓN DE COMANDO
where ollama >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Ollama no detectado. Instálalo en: https://ollama.com
    pause
    exit /b 1
)

:: 4. INICIO DEL MOTOR
echo [+] Iniciando motor Ollama en segundo plano...
start /min "Ollama Engine" ollama serve

echo [*] Esperando respuesta del motor (7s)...
timeout /t 7 /nobreak >nul

:: 5. HEALTH CHECK + VERIFICACIÓN DE MODELO QUE UTILIZA QUADERNI
curl -s http://127.0.0.1:11434/api/tags >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] El motor esta tardando. Intentando comprobar modelos de todos modos...
)

echo [*] Comprobando integridad del modelo phi3:mini...
ollama list | findstr /C:"phi3:mini" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Modelo phi3:mini no detectado.
    echo [INFO] Descargando modelo... (esto tomara tiempo la primera vez)
    ollama pull phi3:mini
)

echo.
echo [SUCCESS] Quaderni esta vinculado al motor local.
echo [INFO] Ya puedes usar la extension en Chrome.
echo.
echo Presiona cualquier tecla para cerrar este asistente (Ollama seguira corriendo).
pause >nul