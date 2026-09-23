@echo off
REM ============================================================
REM  PreflopStudy - Abre el navegador para iniciar sesion en
REM  EducaPoker y poder exportar las tablas automaticamente.
REM ============================================================
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
set "DIR=%~dp0"
if not exist "%DIR%\.browser-profile" mkdir "%DIR%\.browser-profile"

start "" "%EDGE%" ^
  --user-data-dir="%DIR%\.browser-profile" ^
  --remote-debugging-port=9222 ^
  --no-first-run ^
  --no-default-browser-check ^
  "https://rangos.educapoker.com/#/"

echo.
echo  Ventana abierta: inicia sesion con tu cuenta de EducaPoker.
echo  Cuando estes dentro del visualizador, avisame para exportar.
echo.
pause