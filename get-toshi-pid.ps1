$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*bin\toshi.cjs*' } |
    Select-Object -First 1
if ($p) {
    $p.ProcessId | Out-File -Encoding ascii .toshi.pid
    Write-Output ('toshi PID=' + $p.ProcessId)
} else {
    Write-Output 'no toshi node process found'
}
