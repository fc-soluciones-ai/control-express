@echo off
REM ===========================================================================
REM  PROBAR EL AGENTE  (no manda nada)
REM
REM  Haga doble clic EN EL SERVIDOR DEL LOCAL (PZLE-SVR-02).
REM
REM  Lee los pedidos de Soft Restaurant y muestra lo que mandaria, pero NO
REM  manda nada a ningun lado. Sirve para comprobar que encuentra la base y
REM  que lee bien antes de dejarlo trabajando.
REM
REM  No instala nada. No escribe nada en el POS. Se puede correr con el
REM  negocio trabajando.
REM ===========================================================================
title Probar el agente del POS
echo.
echo  Leyendo pedidos de Soft Restaurant. No se manda nada.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente-pos.ps1" -Probar
echo.
echo  Puede cerrar esta ventana.
pause
