@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERRO] Python nao encontrado no PATH.
  echo   Instale o Python 3 e tente de novo.
  echo.
  pause
  exit /b 1
)

python -m ecos %*
if errorlevel 1 (
  echo.
  echo   [ERRO] O jogo encerrou com falha.
  pause
)
endlocal
