@echo off
REM ===========================================================================
REM  COMO SALE UNA COMANDA, Y COMO SE CALCULA UNA CUENTA
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  Es la segunda parte del informe de estructura. Mira como quedan los
REM  renglones de una cuenta real, que tablas intervienen en la impresion de las
REM  comandas y el codigo que calcula los totales, para que un pedido de la app
REM  cuadre al centavo con uno hecho en la caja.
REM
REM  NO ESCRIBE NADA y NO SACA DATOS DE CLIENTES: de los renglones solo se
REM  imprimen codigos, cantidades, precios y banderas; de las tablas de
REM  configuracion, solo los nombres de las columnas.
REM
REM  Escribe el informe al lado, en salida-comandas.txt. Ese es el archivo que
REM  hay que mandar.
REM
REM  Se puede correr con el negocio trabajando.
REM ===========================================================================
title Comandas del POS
echo.
echo  Revisando como sale una comanda. Esto tarda unos segundos...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-comandas.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
