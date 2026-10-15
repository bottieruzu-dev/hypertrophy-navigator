# Run as the signed-in user. No administrator rights or execution-policy bypass.
$ErrorActionPreference = 'Stop'
if ((Get-TimeZone).Id -ne 'Tokyo Standard Time') {
  throw 'This schedule requires the Windows time zone Tokyo Standard Time (JST). No OS setting was changed.'
}
$stateDirectory = Join-Path $env:LOCALAPPDATA 'HypertrophyNavigatorObsidian'
if (-not (Test-Path -LiteralPath (Join-Path $stateDirectory 'connection.json') -PathType Leaf)) {
  throw 'Run node tools/obsidian/setup.mjs first.'
}
$receiver = Join-Path $PSScriptRoot 'receiver.mjs'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$wrapper = Join-Path $PSScriptRoot 'run-hidden.ps1'
$taskName = 'HypertrophyNavigatorObsidianArchive'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  throw 'The archive task already exists. Review/unregister that exact task before reinstalling; it was not overwritten.'
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "{0}" -NodePath "{1}" -Receiver "{2}"' -f $wrapper,$nodePath,$receiver) -WorkingDirectory $PSScriptRoot
$daily = New-ScheduledTaskTrigger -Daily -At '23:59'
$logon = New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($daily,$logon) -Principal $principal -Settings $settings -Description 'Personal workout archive: daily 23:59 JST and catch-up at logon. No Git operations.' | Out-Null
Write-Host 'Registered: HypertrophyNavigatorObsidianArchive (23:59 JST and logon; normal user).'
