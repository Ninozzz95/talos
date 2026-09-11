param([string]$Root = (Get-Location).Path, [switch]$Installed)
$argsList = @($PSScriptRoot + '\verifica.mjs', '--root', $Root)
if ($Installed) { $argsList += '--installed' }
& node @argsList
exit $LASTEXITCODE
