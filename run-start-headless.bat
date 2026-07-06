@echo off
set TOSHI_PORT=4820
cd /d "D:\Users\VolKov\veilleIA\toshi"
start /B "" node mcp/toshi-mcp.mjs > "D:\Users\VolKov\veilleIA\toshi\tools\brain.log" 2>&1
start /B "" node serve.js            > "D:\Users\VolKov\veilleIA\toshi\tools\panel.log" 2>&1
echo launched
