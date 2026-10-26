@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title PKC 赛事工作台

set "MODE_ARG=%~1"
set "DISPLAY_PORT=8971"
if defined PKC_PORT set "DISPLAY_PORT=%PKC_PORT%"
if not defined PKC_OPEN set "PKC_OPEN=1"

if /i "%MODE_ARG%"=="local" goto mode_local
if /i "%MODE_ARG%"=="remote" goto mode_remote
if /i "%MODE_ARG%"=="lan" goto mode_remote
if not "%MODE_ARG%"=="" (
  echo [ERROR] 未知启动参数：%MODE_ARG%
  echo 用法：启动.bat [local^|remote]
  echo.
  pause
  exit /b 1
)

echo ==============================================
echo   PKC 赛事工作台
echo ==============================================
echo.
echo   [1] 普通本机模式（默认）
echo       只允许这台电脑访问，适合日常录入和出图。
echo.
echo   [2] 手机远程模式
echo       开放局域网手机控制页，可远程切换画面和上传对局截图。
echo.
choice /c 12 /n /t 20 /d 1 /m "请选择 1=本机  2=远程（20 秒后默认本机） "
if errorlevel 2 goto mode_remote

:mode_local
set "PKC_REMOTE="
set "PKC_MODE_LABEL=普通本机"
goto check_existing

:mode_remote
set "PKC_REMOTE=1"
set "PKC_MODE_LABEL=手机远程"
goto check_existing

:check_existing
echo.
echo 当前启动模式：%PKC_MODE_LABEL%
set "PKC_ROOT=%~dp0"
set "STOP_RESULT=NONE"
for /f "usebackq delims=" %%S in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=[int]$env:DISPLAY_PORT; $root=[IO.Path]::GetFullPath($env:PKC_ROOT).TrimEnd('\'); $listeners=@(); try{$listeners=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)}catch{}; $pids=@($listeners | Select-Object -ExpandProperty OwningProcess -Unique); if($pids.Count -eq 0){$lines=@(netstat -ano | Select-String (':' + $port + '\s+.*LISTENING\s+\d+')); $pids=@($lines | ForEach-Object {if($_.Line -match 'LISTENING\s+(\d+)'){[int]$Matches[1]}} | Select-Object -Unique)}; if($pids.Count -eq 0){'NONE'; exit 0}; $servedRoot=''; try{$ping=Invoke-RestMethod ('http://127.0.0.1:' + $port + '/api/ping') -TimeoutSec 2; if($ping.root){$servedRoot=[IO.Path]::GetFullPath([string]$ping.root).TrimEnd('\')}}catch{}; if($servedRoot -and $servedRoot -ne $root){'CONFLICT'; exit 0}; $ours=@(); foreach($id in $pids){$p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction SilentlyContinue; if($p -and $p.Name -ieq 'node.exe' -and $p.CommandLine -match 'server\.mjs'){$ours += $id}elseif($servedRoot -eq $root){$ours += $id}else{'CONFLICT'; exit 0}}; foreach($id in $ours){Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}; Start-Sleep -Milliseconds 600; $left=@(); try{$left=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)}catch{$left=@(netstat -ano | Select-String (':' + $port + '\s+.*LISTENING\s+\d+'))}; if($left.Count -gt 0){'FAILED'}else{'STOPPED'}"`) do set "STOP_RESULT=%%S"
if /i "%STOP_RESULT%"=="CONFLICT" (
  echo.
  echo [ERROR] 端口 %DISPLAY_PORT% 被其他程序占用，已停止启动以避免误杀。
  echo 请关闭占用该端口的程序，或设置其他 PKC_PORT 后重试。
  echo.
  pause
  exit /b 1
)
if /i "%STOP_RESULT%"=="FAILED" (
  echo.
  echo [ERROR] 旧 PKC 服务未能完全关闭，端口 %DISPLAY_PORT% 仍被占用。
  echo 请在任务管理器中结束残留的 node.exe 后重试。
  echo.
  pause
  exit /b 1
)
if /i "%STOP_RESULT%"=="STOPPED" (
  echo 已关闭端口 %DISPLAY_PORT% 上的旧 PKC 服务，正在启动新实例…
)

if not exist "server.mjs" (
  echo [ERROR] 找不到 server.mjs。
  echo 请完整解压项目后，从项目文件夹内运行启动.bat。
  echo.
  pause
  exit /b 1
)

rem Node 可能刚安装还没刷新 Explorer 的 PATH，因此同时检查默认安装目录。
set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto have_node

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if exist "%NODE_EXE%" goto have_node

set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if exist "%NODE_EXE%" goto have_node

echo [ERROR] 找不到 Node.js。
echo.
echo 请从 https://nodejs.org/ 安装 LTS 版本。
echo 安装后关闭本窗口并重新运行启动.bat；必要时重启 Windows 刷新 PATH。
echo.
pause
exit /b 1

:have_node
echo Node.js：
"%NODE_EXE%" --version
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js 已安装但无法运行，请重新安装 LTS 版本。
  echo.
  pause
  exit /b 1
)

if /i "%PKC_MODE_LABEL%"=="手机远程" (
  echo.
  echo 手机与电脑需连接同一 Wi-Fi 或手机热点。
  echo Windows 防火墙首次询问时，请允许 Node.js 访问专用网络。
)
echo.
echo 服务地址：http://localhost:%DISPLAY_PORT%/
echo 保持本窗口打开；关闭窗口即停止服务。
echo.

"%NODE_EXE%" server.mjs

echo.
echo [服务已停止]
pause
