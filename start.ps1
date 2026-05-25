# 옥문강 실행 스크립트
$env:ELECTRON_RUN_AS_NODE = $null
$electron = ".\node_modules\electron\dist\electron.exe"
Start-Process -FilePath $electron -ArgumentList "." -WorkingDirectory $PSScriptRoot
