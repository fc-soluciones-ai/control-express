@echo off
REM ===========================================================================
REM  COMO MARCA EL POS QUE UN PEDIDO SE DESPACHO
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  Busca cual de las columnas del POS cambia en el momento en que el cajero
REM  manda el pedido: si es la hora de salida, si es la impresion, o si es
REM  alguna de las columnas de estado.
REM
REM  No instala nada, no cambia nada y NO SACA DATOS DE CLIENTES: solo numeros,
REM  banderas y horas.
REM
REM  Escribe el informe al lado, en salida-estados.txt. Ese es el archivo que
REM  hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Estados del POS
echo.
echo  Revisando como marca el POS el despacho. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-estados.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
