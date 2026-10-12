@echo off
REM ===========================================================================
REM  COMO CREA EL POS UN PEDIDO, POR DENTRO
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  La app de delivery tiene que dejar el pedido directo en el POS, sin que
REM  nadie lo digite. Para hacerlo sin danar la base de la caja hay que conocer
REM  como la arma el propio POS: que tablas toca, como numera los pedidos y que
REM  reglas tiene escondidas.
REM
REM  NO ESCRIBE NADA y NO SACA DATOS DE CLIENTES NI DE VENTAS. Solo nombres de
REM  tablas y columnas, restricciones, codigo de los disparadores y cantidades.
REM
REM  Escribe el informe al lado, en salida-estructura-pedido.txt. Ese es el
REM  archivo que hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Estructura de un pedido en el POS
echo.
echo  Revisando como arma el POS un pedido. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-estructura-pedido.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
