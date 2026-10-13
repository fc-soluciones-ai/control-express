@echo off
REM ===========================================================================
REM  CAPTURA LO QUE EL POS MANDA A LA COCINA, SIN IMPRIMIR NADA
REM
REM  Haga doble clic EN EL SERVIDOR (PZLE-SVR-02), con el POS apuntado a la copia
REM  (APUNTAR-POS-A-LA-COPIA.bat).
REM
REM  Crea 4 impresoras falsas dentro de este equipo (no hay aparato: nada sale en
REM  papel), hace que la COPIA de la base las use, y se queda escuchando lo que el POS
REM  les manda cuando se presiona REIMPRIMIR PROD. Guarda el texto exacto de cada
REM  comanda para poder imprimirlas igual desde la app.
REM
REM  Nunca toca la base real. Pide permisos de administrador (hay que aceptar).
REM
REM  Pasos:  1) correr este archivo,  2) cerrar y volver a abrir el POS,
REM          3) buscar la cuenta de prueba y presionar REIMPRIMIR PROD. y ACEPTAR.
REM  Escribe el informe al lado, en salida-comandas-capturadas.txt.
REM ===========================================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Pidiendo permisos de administrador...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
title Captura de comandas del POS
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0capturar-comanda.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
