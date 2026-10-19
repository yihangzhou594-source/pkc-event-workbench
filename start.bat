@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title PKC Data Chart - Local Server

echo ==============================================
echo   PKC Data Chart - Local Server
echo ==============================================
echo.

if not exist "server.mjs" (
  echo [ERROR] server.mjs was not found.
  echo Please extract the whole ZIP first, then run this file
  echo from inside the PKC folder.
  echo.
  pause
  exit /b 1
)

rem Node may be installed but not yet visible in Explorer's PATH.
rem Check the normal command first, then the two default install folders.
set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto have_node

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE_EXE%" goto have_node

set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if exist "%NODE_EXE%" goto have_node

echo [ERROR] Node.js was not found.
echo.
echo Install the LTS version from:
echo   https://nodejs.org/
echo.
echo After installing, close this window and run this file again.
echo If Node.js is already installed, restart Windows once so the
echo PATH environment variable is refreshed.
echo.
pause
exit /b 1

:have_node
echo Node.js:
"%NODE_EXE%" --version
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js is installed but cannot run.
  echo Please reinstall the LTS version from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo.
set "DISPLAY_PORT=8971"
if defined PKC_PORT set "DISPLAY_PORT=%PKC_PORT%"

rem Reuse an already-running local service instead of failing on EADDRINUSE.
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing ('http://127.0.0.1:%DISPLAY_PORT%/api/ping') -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
  echo Local server is already running.
  if not defined PKC_OPEN set "PKC_OPEN=1"
  if "%PKC_OPEN%"=="1" start "" "http://localhost:%DISPLAY_PORT%/"
  echo.
  echo The generator page has been opened in your browser.
  echo This window will stay open so it does not look like a crash.
  echo Press any key to close it.
  pause >nul
  exit /b 0
)

echo Starting: http://localhost:%DISPLAY_PORT%
echo Keep this window open. Close it to stop the server.
echo.

if not defined PKC_OPEN set "PKC_OPEN=1"
"%NODE_EXE%" server.mjs

echo.
echo [Server stopped]
pause
