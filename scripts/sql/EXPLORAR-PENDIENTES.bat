@echo off
REM ===========================================================================
REM  LAS CUENTAS ABIERTAS DE SOFT RESTAURANT
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  El agente lee la tabla de pedidos CERRADOS, y por eso el tablero nunca ve
REM  un pedido en curso. Esto revisa la tabla de los que estan ABIERTOS, que es
REM  donde viven mientras el repartidor anda en la calle.
REM
REM  No instala nada, no cambia nada y NO SACA DATOS DE CLIENTES: de las
REM  columnas de texto solo se imprime el nombre de la columna, nunca lo que
REM  tienen adentro.
REM
REM  Escribe el informe al lado, en salida-pendientes.txt. Ese es el archivo
REM  que hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Cuentas abiertas de Soft Restaurant
echo.
echo  Revisando las cuentas abiertas. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-pendientes.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
