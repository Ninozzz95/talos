import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('windows installed smoke uses bundled node and validates runtime from an external cwd plus uninstall retention',async()=>{
  const text=await readFile(new URL('../../e2e/windows-smoke.ps1',import.meta.url),'utf8');
  assert.match(text,/runtime\\node\.exe/iu);
  assert.match(text,/Remove-Item Env:TALOS_CLI_RUNTIME_ROOT/iu);
  assert.match(text,/\$stateTag\s*=\s*\[guid\]::NewGuid\(\)\.ToString\('N'\)/iu);
  assert.match(text,/\$smokeAppData\s*=\s*Join-Path\s+\$env:TEMP\s+"talos-cli-e2e-appdata-\$stateTag"/iu);
  assert.match(text,/\$smokeLocalAppData\s*=\s*Join-Path\s+\$env:TEMP\s+"talos-cli-e2e-localappdata-\$stateTag"/iu);
  assert.match(text,/Remove-Item -Recurse -Force -ErrorAction SilentlyContinue \$smokeAppData,\$smokeLocalAppData/iu);
  assert.match(text,/\$env:APPDATA\s*=\s*\$originalAppData/iu);
  assert.match(text,/\$env:LOCALAPPDATA\s*=\s*\$originalLocalAppData/iu);
  assert.match(text,/\$windowsLocalAppData\s*=\s*\[Environment\]::GetFolderPath\(\[Environment\+SpecialFolder\]::LocalApplicationData\)/iu);
  assert.match(text,/\$installed\s*=\s*Join-Path\s+\$windowsLocalAppData\s+'Programs\\TALOS CLI\\bin\\talos\.cmd'/iu);
  assert.match(text,/\$uninstaller\s*=\s*Join-Path\s+\$windowsLocalAppData\s+'Programs\\TALOS CLI\\Uninstall\.exe'/iu);
  assert.match(text,/\$sentinelRoot\s*=\s*Join-Path\s+\$windowsLocalAppData\s+'TALOS-CLI'/iu);
  assert.match(text,/keep-on-uninstall-\$stateTag\.txt/u);
  assert.match(text,/Start-Process\s+\$Installer.+-Wait\s+-PassThru/iu);
  assert.match(text,/\$installProcess\.ExitCode\s+-ne\s+0/iu);
  assert.match(text,/Start-Process\s+\$uninstaller.+-Wait\s+-PassThru/iu);
  assert.match(text,/\$uninstallProcess\.ExitCode\s+-ne\s+0/iu);
  assert.doesNotMatch(text,/\$installed\s*=\s*Join-Path\s+\$env:LOCALAPPDATA/iu);
  assert.match(text,/Push-Location \$outside/iu);
  assert.match(text,/fake-provider\.mjs/iu);
  assert.match(text,/TALOS_FAKE_PROVIDER_SOURCE/u);
  assert.match(text,/nextOllamaMessage/u);
  assert.match(text,/\/v1\/chat\/completions/u);
  assert.match(text,/text\/event-stream/iu);
  assert.match(text,/data:\s*\[DONE\]/u);
  assert.match(text,/JSON\.stringify\(call\?\.function\?\.arguments\?\?\{\}\)/u);
  assert.match(text,/server\.listen\(port,'127\.0\.0\.1'/u);
  assert.match(text,/Start-Process\s+\$bundledNode.+\$compatProvider/iu);
  assert.match(text,/Remove-Item.+\$compatProvider/iu);
  assert.match(text,/Remove-Item Env:TALOS_FAKE_PROVIDER_SOURCE/iu);
  assert.match(text,/doctor.+--project.+\$outside.+--json/isu);
  assert.match(text,/--project\s+\$Project\s+project\s+trust\s+--include-nested/iu);
  assert.match(text,/\$env:OLLAMA_BASE_URL\s*=\s*'http:\/\/127\.0\.0\.1:11434'/u);
  assert.doesNotMatch(text,/provider\s+configure\s+ollama/iu);
  assert.match(text,/\$codingFixtureRoot\s*=\s*Join-Path\s+\$Project\s+'\.talos-cli-e2e'/u);
  assert.match(text,/\$codingProject\s*=\s*Join-Path\s+\$codingFixtureRoot\s+'coding'/u);
  assert.doesNotMatch(text,/\$codingProject\s*=\s*Join-Path\s+\$env:TEMP/u);
  assert.equal((text.match(/Remove-Item -Recurse -Force -ErrorAction SilentlyContinue \$codingFixtureRoot/gu)??[]).length,2);
  assert.ok(text.indexOf('project trust --include-nested')<text.indexOf("model use 'ollama:qwen3-coder-test'"),'project trust must be established before project model configuration');
  assert.match(text,/--permission-mode.+dontAsk/isu);
  assert.match(text,/--output-format.+stream-json/isu);
  assert.match(text,/installed.+--project.+\$outside.+-p.+--json/isu);
  assert.match(text,/ConvertFrom-Json/iu);
  assert.match(text,/\\u001b|0x1b|Escape/iu);
  assert.match(text,/Uninstall\.exe/iu);
  assert.match(text,/sentinel/iu);
});

test('windows smoke expects the version being released, read from cli/package.json, at both version checks',async()=>{
  /* 24/11/2026, sixth public dry run (45383581947, judge v2679): both checks compared --version with a literal '1.0.0' and
     stopped the release of 0.7.0 */
  const text=await readFile(new URL('../../e2e/windows-smoke.ps1',import.meta.url),'utf8');
  assert.match(text,/\$expectedVersion\s*=\s*\(Get-Content -Raw \(Join-Path \$PSScriptRoot '\.\.\\package\.json'\) \| ConvertFrom-Json\)\.version/u);
  assert.match(text,/if \(-not \$expectedVersion\) \{ throw/u);
  assert.match(text,/\$version\.Trim\(\) -ne \$expectedVersion/u);
  assert.match(text,/\$installedVersion\.Trim\(\) -ne \$expectedVersion/u);
  assert.doesNotMatch(text,/-(?:ne|eq) '\d+\.\d+\.\d+'/u,'no version literal in a comparison');
  assert.ok(text.indexOf('$expectedVersion =')<text.indexOf('& $talos --version'),'the expected version is read before the first check');
});

test('windows smoke trusts the folder outside the checkout before any headless run there',async()=>{
  /* Since 11/11/2026 `talos -p` does not run in a folder nobody decided (src/security/project-trust-gate.ts, assertProjectTrusted).
     The steps after the version check never ran in CI; run by hand for judge v2679, every -p outside ended PROJECT_TRUST_REQUIRED. */
  const text=await readFile(new URL('../../e2e/windows-smoke.ps1',import.meta.url),'utf8');
  const trust=text.search(/& \$talos --project \$outside project trust \| Out-Null\r?\n\s*if \(\$LASTEXITCODE -ne 0\) \{ throw 'outside folder trust failed' \}/u);
  assert.ok(trust>=0,'the outside folder is trusted and a failure stops the smoke');
  for(const run of ["-p 'reply OK'","--resume last","--output-format stream-json","-p 'reply OK from installed CLI'"]){
    const at=text.indexOf(run);assert.ok(at>=0,run);
    assert.ok(trust<at,`the outside folder is trusted before ${run}`);
  }
});
