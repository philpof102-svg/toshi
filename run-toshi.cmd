@echo off
rem Toshi launcher (no-console). Starts the companion in the background,
rem writes its PID to .toshi.pid and its output to .toshi-launch.log.
rem Safe to re-run: if a Toshi process already lives, we leave it alone.
setlocal
cd /d "%~dp0"
if exist .toshi.pid (
  for /f "usebackq tokens=*" %%P in (".toshi.pid") do (
    tasklist /FI "PID eq %%P" 2>nul | find /I "node.exe" >nul
    if not errorlevel 1 (
      echo Toshi already running, PID=%%P
      goto :eof
    )
  )
)
start "toshi" /B /MIN cmd /c "node bin\toshi.cjs > .toshi-launch.log 2>&1"
rem Give the brain a moment to bind the port
ping 127.0.0.1 -n 2 >nul
rem Grab the newest node PID pointing at bin\toshi.cjs
for /f "tokens=2" %%P in ('wmic process where "name='node.exe' and commandline like '%%bin\\toshi.cjs%%'" get processid^,name 2^>nul ^| findstr /R "[0-9]"') do (
  echo %%P > .toshi.pid
  echo Toshi launched, PID=%%P
  goto :eof
)
echo Toshi launched (PID not detected via wmic — see .toshi-launch.log)
