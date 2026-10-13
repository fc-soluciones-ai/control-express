@echo off
REM ===========================================================================
REM  CREA UNA COPIA DE PRUEBA DE LA BASE DEL POS
REM
REM  Haga doble clic en este archivo EN LA COMPUTADORA DEL POS.
REM
REM  Saca una copia exacta de la base real, con otro nombre (termina en
REM  _copia), en este mismo servidor. Ahi se ensaya escribir pedidos sin
REM  arriesgar la caja.
REM
REM  LA BASE REAL NO SE MODIFICA. Primero pide confirmacion: hay que escribir SI.
REM  Dura uno o dos minutos y se puede hacer con el local trabajando.
REM
REM  ANTES DE CORRERLO, hay que haber actualizado el agente del POS con la version
REM  nueva y reiniciado: la version vieja podria pasarse a leer la copia.
REM
REM  El archivo de respaldo temporal se borra solo al terminar, porque trae los
REM  datos de todos los clientes.
REM
REM  Si ya existe una copia y se quiere rehacer desde cero, hay que correr el
REM  .ps1 con -Reemplazar. Este archivo nunca borra nada.
REM ===========================================================================
title Crear copia de prueba de la base del POS
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0crear-copia-de-prueba.ps1"
echo.
echo  Puede cerrar esta ventana.
pause
