@echo off
setlocal DisableDelayedExpansion
rem TALOS source launcher: local tools only; no administrator rights or policy changes.
set "TALOS_SOURCE_ROOT=%~dp0"
set "NODE_OPTIONS="
set "NODE_PATH="
set "ELECTRON_RUN_AS_NODE="
if not exist "%~dp0tools\delivery\runtime-lock.json" (
  echo ERRORE: archivio incompleto. Manca tools\delivery\runtime-lock.json.
  goto :failed
)
powershell.exe -NoLogo -NoProfile -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') { throw 'Questa consegna richiede Windows x64.' }; $root=$env:TALOS_SOURCE_ROOT; $lock=Get-Content -LiteralPath (Join-Path $root 'tools/delivery/runtime-lock.json') -Raw | ConvertFrom-Json; if ($lock.version -ne '24.18.0' -or $lock.url -ne 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-win-x64.zip' -or $lock.archiveSha256 -notmatch '^[a-f0-9]{64}$' -or $lock.executableSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Manifesto runtime non valido.' }; $cache=Join-Path $root '.talos-runtime'; New-Item -ItemType Directory -Path $cache -Force | Out-Null; if ((Get-Item -LiteralPath $cache).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'La cache non puo essere un collegamento o junction.' }; $node=Join-Path $cache 'node-v24.18.0-win-x64/node.exe'; if (-not (Test-Path -LiteralPath $node)) { Write-Host 'Preparazione di Node portabile verificato. Nessuna installazione di sistema.'; $work=Join-Path $cache ('download-'+[guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $work | Out-Null; try { $zip=Join-Path $work 'node.zip'; Invoke-WebRequest -Uri $lock.url -OutFile $zip -UseBasicParsing; if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -cne $lock.archiveSha256) { throw 'Integrita del download Node non valida. Nessun eseguibile avviato.' }; Expand-Archive -LiteralPath $zip -DestinationPath $work; $candidate=Join-Path $work 'node-v24.18.0-win-x64/node.exe'; if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -cne $lock.executableSha256) { throw 'Integrita di node.exe non valida.' }; Move-Item -LiteralPath (Join-Path $work 'node-v24.18.0-win-x64') -Destination $cache } finally { Remove-Item -LiteralPath $work -Recurse -Force } }; if ((Get-Item -LiteralPath (Split-Path $node)).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Il runtime non puo essere un collegamento.' }; if ((Get-FileHash -LiteralPath $node -Algorithm SHA256).Hash.ToLowerInvariant() -cne $lock.executableSha256) { throw 'Il runtime locale e stato alterato. Ripristinare la cache da una copia verificata.' }"
if errorlevel 1 goto :failed
"%~dp0.talos-runtime\node-v24.18.0-win-x64\node.exe" "%~dp0tools\delivery\start.mjs" %*
if errorlevel 1 goto :failed
exit /b 0
:failed
echo.
echo Avvio interrotto. Leggere il messaggio precedente; non disattivare le protezioni di Windows.
echo Estrarre l'intero ZIP in una cartella scrivibile. Il primo avvio richiede Internet.
if not defined CI pause
exit /b 1
