@echo off
title Brinka Desktop Build
echo ==========================================
echo   BRINKA DESKTOP - INSTALAR E GERAR EXE
echo ==========================================
echo.
echo 1) A instalar dependencias...
call npm install
echo.
echo 2) A gerar instalador .EXE...
call npm run build
echo.
echo Feito. Ve a pasta dist.
pause
