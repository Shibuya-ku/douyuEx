param([switch]$RealTest)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$runtime = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime.local.json') -Raw | ConvertFrom-Json
$env:PLAYWRIGHT_MODULE = $runtime.playwrightModule
$env:CHROME_EXECUTABLE = $runtime.chromeExecutable
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$configFile = if ($RealTest) { 'config.test.json' } else { 'config.json' }
$taskExit = 1
try {
    & $runtime.nodeExecutable (Join-Path $PSScriptRoot 'daily-live-task.cjs') (Join-Path $PSScriptRoot $configFile) *> (Join-Path $logDir "$stamp-console.log")
    $taskExit = $LASTEXITCODE
} finally {
    if ($RealTest) {
        try {
            # Restore both action and trigger even when the browser test fails.
            & (Join-Path $PSScriptRoot 'register-task.ps1')
            @{ at = (Get-Date -Format o); exitCode = $taskExit; scheduleRestored = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir "$stamp-test-result.json") -Encoding UTF8
        } catch {
            @{ at = (Get-Date -Format o); exitCode = $taskExit; scheduleRestored = $false; error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir "$stamp-test-result.json") -Encoding UTF8
            $taskExit = 2
        }
    }
}
exit $taskExit
