param([Nullable[datetime]]$TestAt)
$ErrorActionPreference = 'Stop'
$taskName = 'DouyuEx-DailyWatch'
$taskRoot = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot 'run-task.ps1'
$shellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$taskArgs = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $runner + '"'
if ($null -ne $TestAt) {
    if ($TestAt -le (Get-Date)) { throw 'TestAt must be in the future.' }
    $trigger = New-ScheduledTaskTrigger -Once -At $TestAt
    $taskArgs += ' -RealTest'
} else {
    $trigger = New-ScheduledTaskTrigger -Daily -At '00:30'
}
$action = New-ScheduledTaskAction -Execute $shellExe -Argument $taskArgs -WorkingDirectory $taskRoot
$taskUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $taskUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 90) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'DouyuEx master: sign in, renew badges, send one barrage, distribute remaining sticks, watch for 40 minutes. Asia/Shanghai 00:30.'
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Get-ScheduledTaskInfo -TaskName $taskName | Select-Object TaskName,LastRunTime,LastTaskResult,NextRunTime
