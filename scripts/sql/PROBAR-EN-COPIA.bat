@echo off
REM ===========================================================================
REM  PRUEBA DE ESCRIBIR UN PEDIDO EN LA COPIA DE LA BASE DEL POS
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS, despues de haber
REM  creado la copia (CREAR-COPIA-DE-PRUEBA.bat).
REM
REM  SOLO TRABAJA SOBRE pruebas_copia. Si se le apuntara a la base real, se niega.
REM  La base real no se toca nunca.
REM
REM  Hace tres cosas y en dos de ellas pide confirmacion (hay que escribir SI):
REM    1. Revisa que sabe calcular los totales de una cuenta igual que el POS.
REM       (solo lee)
REM    2. Desvia las impresoras de la COPIA a "Microsoft Print to PDF", para que
REM       ninguna comanda de prueba salga en la cocina real.
REM    3. Escribe en la copia una cuenta de domicilio de prueba, con un producto de
REM       cada area de la cocina.
REM
REM  Despues se abre el programa del POS apuntado a la copia y se mira si la cuenta
REM  aparece y si salen las comandas.
REM
REM  Para borrar las cuentas de prueba de la copia, abra PowerShell en esta
REM  carpeta y corra:  .\probar-en-copia.ps1 -BorrarPruebas
REM
REM  Escribe el informe al lado, en salida-prueba-copia.txt. Ese es el archivo que
REM  hay que mandar.
REM ===========================================================================
title Prueba en la copia del POS
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probar-en-copia.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
