@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Users\VolKov\veilleIA\toshi\tools\patch-llm-reasoning.ps1" > "D:\Users\VolKov\veilleIA\toshi\tools\patch-result.txt" 2>&1
type "D:\Users\VolKov\veilleIA\toshi\tools\patch-result.txt"
