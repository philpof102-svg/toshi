$f = 'D:\Users\VolKov\veilleIA\toshi\lib\llm.mjs'
$c = Get-Content $f -Raw
$o = $c

# 1) lift the hard output cap so the model can actually speak
$c = $c -replace 'max_tokens: 180', 'max_tokens: 500'
$c = $c -replace 'if \(out.length > 600\)', 'if (out.length > 1400)'
$c = $c -replace 'const cut = out\.slice\(0, 600\)', 'const cut = out.slice(0, 1400)'
$c = $c -replace 'end > 60 \?', 'end > 80 ?'

# 2) relax the "60-280 chars / 2-4 lines" straitjacket — it's what made Toshi read like a CLI
$c = $c -replace 'about 60-280 characters total', 'about 120-700 characters total'
$c = $c -replace 'Answer the QUESTION in 2-4 short lines', 'Answer the QUESTION in 2-5 short lines, warmly and conversationally'

# 3) switch the default model to a FREE reasoning model on OpenRouter.
#    DeepSeek R1 (free) is a reasoning model — perfect for grounded repo Q&A.
$c = $c -replace 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1:free'

if ($c -ne $o) {
  Set-Content -Path $f -Value $c -NoNewline
  Write-Output 'PATCHED'
} else {
  Write-Output 'NO-CHANGE'
}
