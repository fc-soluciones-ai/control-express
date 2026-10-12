@echo off
REM ===========================================================================
REM  LAS IMPRESORAS DE ESTA COMPUTADORA
REM
REM  Haga doble clic en este archivo en LA COMPUTADORA A LA QUE ESTAN
REM  CONECTADAS LAS IMPRESORAS DE LA COCINA Y DEL MOSTRADOR. Normalmente es la
REM  del POS. Si las impresoras estan repartidas en varias computadoras, hay
REM  que correrlo en cada una.
REM
REM  Sirve para saber como imprimir las comandas de los pedidos de la app.
REM
REM  No imprime nada, no cambia nada, no instala nada y no saca datos de
REM  clientes ni de ventas: solo los nombres de las impresoras y de sus puertos.
REM
REM  Escribe el informe al lado, en salida-impresoras.txt. Ese es el archivo
REM  que hay que mandar.
REM ===========================================================================
title Impresoras de esta computadora
echo.
echo  Leyendo la lista de impresoras. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0listar-impresoras.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
