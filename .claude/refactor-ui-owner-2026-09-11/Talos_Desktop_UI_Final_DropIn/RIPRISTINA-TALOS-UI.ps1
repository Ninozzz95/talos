param([string]$Root = (Get-Location).Path, [string]$Backup = '')
$argsList = @($PSScriptRoot + '\ripristina.mjs', '--root', $Root)
if ($Backup) { $argsList += @('--backup', $Backup) }
& node @argsList
exit $LASTEXITCODE
