$f = 'D:\Users\VolKov\veilleIA\toshi\lib\llm.mjs'
$c = Get-Content $f -Raw
$o = $c
# raise the hard upper bound so 120-700 char answers never get discarded
$c = $c -replace 'out\.length >= 2 && out\.length <= 1200', 'out.length >= 2 && out.length <= 1800'
if ($c -ne $o) { Set-Content -Path $f -Value $c -NoNewline; 'PATCHED' } else { 'NO-CHANGE' }
