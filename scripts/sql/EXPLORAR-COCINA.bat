@echo off
REM ===========================================================================
REM  A QUE IMPRESORA VA CADA COSA, Y A QUE BASE SE CONECTA EL POS
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  Tercera parte de los informes del POS. Mira:
REM    - que impresora saca cada area de la cocina, en cada estacion,
REM    - que area tiene cada producto,
REM    - que codigos ponen las cuentas de domicilio,
REM    - y donde guarda el programa del POS a que base de datos conectarse
REM      (para poder apuntarlo a la copia de prueba).
REM
REM  NO ESCRIBE NADA y NO SACA DATOS DE CLIENTES. Las contrasenas que aparezcan
REM  en archivos de configuracion salen tapadas con ***.
REM
REM  Escribe el informe al lado, en salida-cocina.txt. Ese es el archivo que hay
REM  que mandar.
REM
REM  Se puede correr con el negocio trabajando. Tarda un minuto, por la busqueda
REM  en las carpetas.
REM ===========================================================================
title Cocina y conexion del POS
echo.
echo  Revisando impresoras, areas y la conexion del POS. Tarda un minuto...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0explorar-cocina.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
