@echo off
REM ===========================================================================
REM  SACA LAS FOTOS DE LOS PRODUCTOS DEL POS A UNA CARPETA
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  El POS guarda fotos de unos 145 productos dentro de su base. Este archivo las
REM  exporta a la carpeta fotos-pos (al lado) para ver si sirven para el menu de la
REM  app, y escribe un resumen en salida-fotos.txt.
REM
REM  NO ESCRIBE NADA en la base y NO SACA DATOS DE CLIENTES. Se puede correr con el
REM  negocio trabajando. Tarda un minuto o dos.
REM ===========================================================================
title Fotos de los productos del POS
echo.
echo  Sacando las fotos del POS. Esto tarda un minuto o dos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sacar-fotos-del-pos.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
