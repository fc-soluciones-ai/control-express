@echo off
REM ===========================================================================
REM  POR QUE LLEGAN TARDE LOS PEDIDOS
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  No instala nada, no cambia nada y no saca datos de clientes. Escribe un
REM  informe al lado, en salida-entregas.txt. Ese es el que hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Por que llegan tarde los pedidos
echo.
echo  Midiendo las entregas de los ultimos 90 dias. Tarda un minuto...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0medir-entregas.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
