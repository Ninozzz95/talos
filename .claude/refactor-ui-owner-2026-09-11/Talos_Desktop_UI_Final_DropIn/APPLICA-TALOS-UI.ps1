param([string]$Root = (Get-Location).Path, [switch]$DryRun)
$argsList = @($PSScriptRoot + '\applica.mjs', '--root', $Root)
if ($DryRun) { $argsList += '--dry-run' }
& node @argsList
exit $LASTEXITCODE
