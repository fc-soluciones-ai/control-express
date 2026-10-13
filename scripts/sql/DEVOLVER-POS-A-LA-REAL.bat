@echo off
REM ===========================================================================
REM  DEVUELVE EL PROGRAMA DEL POS DE ESTA COMPUTADORA A LA BASE REAL
REM
REM  Haga doble clic EN EL SERVIDOR (PZLE-SVR-02), con el programa del POS CERRADO,
REM  cuando termine la prueba con la copia.
REM
REM  Cambia, en los dos archivos de configuracion del POS de esta computadora, la
REM  linea Catalog=pruebas_copia por Catalog=pruebas. Guarda antes un respaldo de
REM  cada archivo.
REM
REM  Si nunca se apunto a la copia, no cambia nada.
REM ===========================================================================
title Devolver el POS a la base real
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apuntar-pos.ps1" -Modo Real
echo.
pause
