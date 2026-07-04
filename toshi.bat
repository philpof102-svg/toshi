@echo off
REM Toshi — launch the floating desktop companion (double-click me).
REM Starts the mascot window + its brain (MCP /ask on :4820). GPL-3.0.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installing Toshi's dependencies once...
  call npm install
)
echo Launching Toshi...
call npx electron .
