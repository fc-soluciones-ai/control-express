@echo off
REM ===========================================================================
REM  EL MENU DEL POS Y EL HORARIO REAL DEL LOCAL
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  Mira como esta armado el menu (productos, grupos, precios, extras) para armar
REM  el menu de la app de los clientes, y a que horas entran pedidos cada dia.
REM
REM  NO ESCRIBE NADA y NO SACA DATOS DE CLIENTES. Se puede correr con el negocio
REM  trabajando.
REM
REM  Escribe el informe al lado, en salida-menu.txt. Ese es el archivo que hay que
REM  mandar.
REM ===========================================================================
title Menu del POS
echo.
echo  Revisando el menu y el horario del local. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-menu.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
