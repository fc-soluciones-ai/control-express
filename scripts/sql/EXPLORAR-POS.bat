@echo off
REM ===========================================================================
REM  EXPLORAR LA BASE DE SOFT RESTAURANT
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  No instala nada, no cambia nada y no saca datos de clientes. Solo lee los
REM  nombres de las tablas y escribe un informe al lado, en el archivo
REM  salida-softrestaurant.txt. Ese es el archivo que hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Explorar la base de Soft Restaurant
echo.
echo  Revisando la base del POS. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-softrestaurant.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
