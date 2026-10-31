$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$recallNode = Get-Command node -ErrorAction SilentlyContinue
if (-not $recallNode) {
    $recallFallback = Join-Path $env:USERPROFILE '.trae\binaries\node\versions\24.11.1'
    if (Test-Path -LiteralPath (Join-Path $recallFallback 'node.exe')) {
        $env:Path = $recallFallback + ';' + $env:Path
    } else {
        throw 'Node.js was not found. Install Node.js 24 LTS or add your existing Node.js folder to PATH.'
    }
}
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& npm.cmd run dev
exit $LASTEXITCODE
