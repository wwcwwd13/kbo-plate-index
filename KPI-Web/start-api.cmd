@echo off
setlocal

set "BACKEND_DIR=%KPI_BACKEND_ROOT%"
if not defined BACKEND_DIR if exist "%~dp0..\..\KPI-Backend\start-api.cmd" set "BACKEND_DIR=%~dp0..\..\KPI-Backend"
if not defined BACKEND_DIR if exist "%~dp0..\KPI-Backend\start-api.cmd" set "BACKEND_DIR=%~dp0..\KPI-Backend"

if not defined BACKEND_DIR (
  echo KPI-Backend was not found.
  echo Set KPI_BACKEND_ROOT or place KPI-Backend next to the workspace folders.
  exit /b 1
)

call "%BACKEND_DIR%\start-api.cmd"
endlocal
