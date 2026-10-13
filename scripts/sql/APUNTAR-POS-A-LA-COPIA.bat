@echo off
REM ===========================================================================
REM  APUNTA EL PROGRAMA DEL POS DE ESTA COMPUTADORA A LA COPIA DE PRUEBA
REM
REM  Haga doble clic EN EL SERVIDOR (PZLE-SVR-02), con el programa del POS CERRADO
REM  y con el local cerrado o sin movimiento.
REM
REM  Cambia, en los dos archivos de configuracion del POS de esta computadora, la
REM  linea Catalog=pruebas por Catalog=pruebas_copia. Guarda antes un respaldo de
REM  cada archivo. No toca ninguna base de datos ni las otras cajas.
REM
REM  AL TERMINAR LA PRUEBA, corra DEVOLVER-POS-A-LA-REAL.bat.
REM ===========================================================================
title Apuntar el POS a la copia
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apuntar-pos.ps1" -Modo Copia
echo.
pause
