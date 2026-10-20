@echo off
REM Respaldo completo de la base de datos en la carpeta "respaldos" del proyecto.
REM Solo lee: no cambia nada en la base. Doble clic para correrlo.
cd /d "%~dp0"
call npm run db:respaldo
echo.
pause
