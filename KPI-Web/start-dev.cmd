@echo off
setlocal
cd /d "%~dp0"

set "NODE_DIR=%CD%\.tools\node"
if exist "%NODE_DIR%\node.exe" goto portable_node

where npm >nul 2>&1
if not errorlevel 1 goto system_node

echo Node.js/npm was not found.
echo Install Node.js LTS or prepare the .tools\node folder.
pause
exit /b 1

:portable_node
set "PATH=%NODE_DIR%;%PATH%"
set "NPM_COMMAND=%NODE_DIR%\npm.cmd"
goto dependencies

:system_node
set "NPM_COMMAND=npm.cmd"

:dependencies
if exist "node_modules\react" goto start_server
echo Installing project packages...
call "%NPM_COMMAND%" install
if errorlevel 1 goto install_error

:start_server
set "BACKEND_DIR=%KPI_BACKEND_ROOT%"
if not defined BACKEND_DIR if exist "%~dp0..\..\KPI-Backend\start-api.cmd" set "BACKEND_DIR=%~dp0..\..\KPI-Backend"
if not defined BACKEND_DIR if exist "%~dp0..\KPI-Backend\start-api.cmd" set "BACKEND_DIR=%~dp0..\KPI-Backend"
if defined BACKEND_DIR start "KBO Plate Index API" /D "%BACKEND_DIR%" "%ComSpec%" /d /k call "%BACKEND_DIR%\start-api.cmd"
if not defined KPI_WEB_PORT set "KPI_WEB_PORT=4173"
echo Starting the KBO Plate Index development server.
echo Open http://127.0.0.1:%KPI_WEB_PORT%/ in your browser.
echo Press Ctrl+C in this window to stop the server.
call "%NPM_COMMAND%" run dev -- --host 127.0.0.1 --port %KPI_WEB_PORT%
exit /b %ERRORLEVEL%

:install_error
echo Package installation failed.
pause
exit /b 1
