Set-Location $PSScriptRoot
Start-Job { Start-Sleep 2; Start-Process "http://localhost:5173/aakash-profile/" } | Out-Null
npm run dev
