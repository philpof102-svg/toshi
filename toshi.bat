@echo off
REM Toshi — launch the floating desktop companion (double-click me, or the desktop shortcut).
REM Installs deps once, then spawns Toshi detached (bin/toshi.cjs) so no console window lingers. GPL-3.0.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installing Toshi's dependencies once...
  call npm install
)
node bin\toshi.cjs
