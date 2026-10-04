@echo off
REM ===========================================================================
REM  ARRANCAR EL AGENTE
REM
REM  Haga doble clic EN EL SERVIDOR DEL LOCAL (PZLE-SVR-02).
REM
REM  Se queda corriendo y manda los pedidos a Control Express cada 30 segundos.
REM  Mientras esta abierto, funciona. Si se cierra la ventana, se detiene.
REM
REM  NO CIERRE ESTA VENTANA mientras el negocio este abierto.
REM
REM  Solo lee del POS: no escribe, no borra y no modifica nada.
REM  Si se cae el internet, reintenta solo y no se pierde ningun pedido.
REM
REM  Lo que va haciendo queda en agente-pos.registro.txt, al lado.
REM ===========================================================================
title Agente del POS - NO CERRAR
echo.
echo  Agente del POS trabajando. NO CIERRE ESTA VENTANA.
echo  Para detenerlo: Ctrl+C
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente-pos.ps1"
echo.
echo  El agente se detuvo.
pause
