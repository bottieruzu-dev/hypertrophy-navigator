param([Parameter(Mandatory=$true)][string]$NodePath,[Parameter(Mandatory=$true)][string]$Receiver)
$ErrorActionPreference = 'Stop'
$expectedReceiver = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'receiver.mjs'))
if ([System.IO.Path]::GetFullPath($Receiver) -ne $expectedReceiver) { throw 'Unexpected receiver path' }
& $NodePath $expectedReceiver --once
exit $LASTEXITCODE
