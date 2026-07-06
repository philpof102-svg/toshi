@echo off
REM Toshi launcher for Windows (double-clickable). GPL-3.0.
REM   toshi.bat                float the companion watching this repo (or connect this repo to it)
REM   toshi.bat ask "what?"    answer about this repo in the terminal
REM   toshi.bat show|hide|toggle|collapse|expand|size <s>|setup|version
REM Installs deps once (first run), then passes all args through to bin\toshi.cjs.
cd /d "%~dp0"
if not exist node_modules\electron (
  echo Installing Toshi's dependencies once...
  call npm install
)
node "%~dp0bin\toshi.cjs" %*
