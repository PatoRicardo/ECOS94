@echo off
setlocal
cd /d "%~dp0"

rem Servidor local: modulos ES nao carregam via file://.
set PORT=8765
set PY=python
where python >nul 2>nul
if errorlevel 1 set PY=py

%PY% -c "import sys" >nul 2>nul
if errorlevel 1 (
  echo.
  echo Python 3 nao encontrado. Instale em https://python.org
  echo ou sirva esta pasta com qualquer servidor HTTP estatico.
  echo.
  pause
  exit /b 1
)

echo.
echo ECOS '94 WEB
echo Servindo em http://localhost:%PORT%/
echo O navegador abre em instantes. Feche esta janela para parar.
echo.

start "" cmd /c "timeout /t 2 >nul & start "" http://localhost:%PORT%/"
%PY% -m http.server %PORT%

if errorlevel 1 (
  echo.
  echo Falha ao iniciar o servidor. A porta %PORT% pode estar ocupada.
  pause
)
endlocal
