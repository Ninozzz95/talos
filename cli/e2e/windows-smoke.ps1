param(
  [Parameter(Mandatory=$true)][string]$Stage,
  [string]$Project = $PWD.Path,
  [string]$Installer = ''
)
$ErrorActionPreference='Stop'
$Stage = (Resolve-Path $Stage).Path
if ($Installer) { $Installer = (Resolve-Path $Installer).Path }
$talos = Join-Path $Stage 'talos.cmd'
$bundledNode = Join-Path $Stage 'runtime\node.exe'
$fakeProvider = (Resolve-Path (Join-Path $PSScriptRoot 'fake-provider.mjs')).Path
$compatProvider = Join-Path $env:TEMP 'talos-cli-e2e-openai-provider.mjs'
if (-not (Test-Path $talos)) { throw 'talos.cmd missing from stage' }
if (-not (Test-Path $bundledNode)) { throw 'runtime\node.exe missing from stage' }
if (-not (Test-Path $fakeProvider)) { throw 'fake-provider.mjs missing' }

$env:TALOS_FAKE_PROVIDER_SOURCE=$fakeProvider
$compatProviderSource=@'
import http from 'node:http';
import {pathToFileURL} from 'node:url';

const source=process.env.TALOS_FAKE_PROVIDER_SOURCE;
if(!source)throw new Error('TALOS_FAKE_PROVIDER_SOURCE_REQUIRED');
const {nextOllamaMessage}=await import(pathToFileURL(source).href);
const port=Number(process.env.TALOS_FAKE_OLLAMA_PORT||11434);
const model=process.env.TALOS_FAKE_OLLAMA_MODEL||'qwen3-coder-test';

function sendJson(res,status,body){
  const text=JSON.stringify(body);
  res.writeHead(status,{'content-type':'application/json','content-length':Buffer.byteLength(text)});
  res.end(text);
}
function normalizeToolCalls(calls=[]){
  return calls.map((call,index)=>({
    index,
    id:call?.id??`call-${index}`,
    type:'function',
    function:{
      name:call?.function?.name??'',
      arguments:typeof call?.function?.arguments==='string'
        ?call.function.arguments
        :JSON.stringify(call?.function?.arguments??{}),
    },
  }));
}
function messageFrom(next){
  if(Array.isArray(next?.stream)){
    const content=next.stream.map(row=>typeof row?.content==='string'?row.content:'').join('');
    const reasoning=next.stream.map(row=>typeof row?.thinking==='string'?row.thinking:'').join('');
    return {role:'assistant',content:content||null,...(reasoning?{reasoning_content:reasoning}:{})};
  }
  const message=next?.message??{};
  const calls=normalizeToolCalls(message.tool_calls);
  return {
    role:'assistant',
    content:typeof message.content==='string'?message.content:null,
    ...(calls.length?{tool_calls:calls.map(({index,...call})=>call)}:{}),
  };
}
function streamChunks(next){
  if(Array.isArray(next?.stream)){
    return next.stream.map(row=>{
      const delta={};
      if(typeof row?.thinking==='string'&&row.thinking)delta.reasoning_content=row.thinking;
      if(typeof row?.content==='string'&&row.content)delta.content=row.content;
      return {choices:[{index:0,delta,finish_reason:null}]};
    });
  }
  const message=next?.message??{};
  const delta={};
  if(typeof message.content==='string'&&message.content)delta.content=message.content;
  const calls=normalizeToolCalls(message.tool_calls);
  if(calls.length)delta.tool_calls=calls;
  return [{choices:[{index:0,delta,finish_reason:null}]}];
}
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
  if(req.method==='GET'&&pathname==='/'){
    return sendJson(res,200,{status:'ok'});
  }
  if(req.method==='GET'&&pathname==='/api/tags'){
    return sendJson(res,200,{models:[{name:model,size:1,digest:'fixture',details:{format:'gguf',parameter_size:'1B'}}]});
  }
  if(req.method==='POST'&&pathname==='/v1/chat/completions'){
    let raw='';
    for await(const chunk of req)raw+=chunk;
    let body={};
    try{body=JSON.parse(raw||'{}');}catch{return sendJson(res,400,{error:'invalid json'});}
    const next=nextOllamaMessage(body);
    if(body.stream===true){
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'});
      for(const chunk of streamChunks(next))res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      res.end('data: [DONE]\n\n');
      return;
    }
    sendJson(res,200,{choices:[{index:0,message:messageFrom(next),finish_reason:'stop'}],usage:null});
    return;
  }
  sendJson(res,404,{error:'not found'});
});
server.listen(port,'127.0.0.1',()=>console.log(`fake-openai-ollama:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
'@
[IO.File]::WriteAllText($compatProvider,$compatProviderSource,[Text.UTF8Encoding]::new($false))

$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
$windowsLocalAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
if (-not $windowsLocalAppData) { throw 'Windows LocalApplicationData shell folder unavailable' }
$stateTag = [guid]::NewGuid().ToString('N')
$smokeAppData = Join-Path $env:TEMP "talos-cli-e2e-appdata-$stateTag"
$smokeLocalAppData = Join-Path $env:TEMP "talos-cli-e2e-localappdata-$stateTag"
$env:APPDATA = $smokeAppData
$env:LOCALAPPDATA = $smokeLocalAppData
New-Item -Force -ItemType Directory $smokeAppData,$smokeLocalAppData | Out-Null
$env:TALOS_CLI_UPDATE_CHANNEL='stable'
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434'
Remove-Item Env:TALOS_CLI_RUNTIME_ROOT -ErrorAction SilentlyContinue
$outside = Join-Path $env:TEMP 'talos-cli-outside-cwd'
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $outside
New-Item -ItemType Directory -Force $outside | Out-Null
$codingFixtureRoot = Join-Path $Project '.talos-cli-e2e'
$codingProject = Join-Path $codingFixtureRoot 'coding'
$sentinel = $null
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $codingFixtureRoot

$provider = Start-Process $bundledNode -ArgumentList ('"' + $compatProvider + '"') -PassThru -WindowStyle Hidden
try {
  Start-Sleep -Milliseconds 600
  $version = & $talos --version
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -ne '1.0.0') { throw "version smoke failed: $version" }

  & $talos --project $Project project trust --include-nested | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'project trust preparation failed' }

  & $talos --project $Project model use 'ollama:qwen3-coder-test' --scope user | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'model use failed' }

  Push-Location $outside
  try {
    $doctor = & $talos --project $outside doctor --json
    if ($LASTEXITCODE -notin 0,70) { throw "doctor failed outside checkout: $doctor" }
    $doctorObj = $doctor | ConvertFrom-Json
    if ($doctorObj.schema -ne 'talos.cli.doctor.v1') { throw 'doctor json schema mismatch' }
    if ($doctor -match [char]0x1b) { throw 'ANSI Escape found in doctor JSON' }

    $json = & $talos --project $outside -p 'reply OK' --json --permission-mode dontAsk
    if ($LASTEXITCODE -ne 0) { throw "headless json outside checkout failed: $json" }
    $obj = $json | ConvertFrom-Json
    if ($obj.schema -ne 'talos.cli.result.v1' -or -not $obj.ok) { throw 'headless json contract mismatch' }
    if ($json -match [char]0x1b) { throw 'ANSI Escape found in headless JSON' }

    $resumed = & $talos --project $outside --resume last -p 'reply OK after resume' --json --permission-mode dontAsk
    if ($LASTEXITCODE -ne 0) { throw "resume after process exit failed: $resumed" }
    $resumedObj = $resumed | ConvertFrom-Json
    if ($resumedObj.schema -ne 'talos.cli.result.v1' -or -not $resumedObj.ok) { throw 'resume result contract mismatch' }
    if ($resumedObj.sessionId -ne $obj.sessionId) { throw 'resume last did not reopen the persisted session' }
    if ($resumed -match [char]0x1b) { throw 'ANSI Escape found in resumed JSON' }

    $stream = & $talos --project $outside -p 'exercise stream' --output-format stream-json --permission-mode dontAsk
    if ($LASTEXITCODE -ne 0) { throw "stream-json failed: $stream" }
    foreach($line in $stream){ if($line.Trim()){ $row = $line | ConvertFrom-Json; if($row.schema -ne 'talos.cli.event.v1'){ throw 'stream event schema mismatch' } } }
    if (($stream -join "`n") -match [char]0x1b) { throw 'ANSI Escape found in stream JSON' }
  } finally {
    Pop-Location
  }

  New-Item -ItemType Directory -Force $codingProject | Out-Null
  Set-Content -NoNewline -Path (Join-Path $codingProject 'input.txt') -Value 'SOURCE'
  $coding = & $talos --project $codingProject -p 'CODING_E2E: read input.txt, create output.txt containing VERIFIED, run the verification command, then reply CODING_E2E_OK' --json --permission-mode bypassPermissions --timeout 60
  if ($LASTEXITCODE -ne 0) { throw "coding loop failed: $coding" }
  $codingObj = $coding | ConvertFrom-Json
  if ($codingObj.schema -ne 'talos.cli.result.v1' -or -not $codingObj.ok) { throw 'coding loop result contract mismatch' }
  if ($codingObj.result.text -notmatch 'CODING_E2E_OK') { throw "coding loop did not reach final answer: $coding" }
  $outputFile = Join-Path $codingProject 'output.txt'
  if (-not (Test-Path $outputFile)) { throw 'coding loop did not create output.txt' }
  if ((Get-Content -Raw $outputFile) -ne 'VERIFIED') { throw 'coding loop wrote unexpected output.txt content' }
  if ($coding -match [char]0x1b) { throw 'ANSI Escape found in coding JSON' }

  if ($Installer) {
    $sentinelRoot = Join-Path $windowsLocalAppData 'TALOS-CLI'
    New-Item -ItemType Directory -Force $sentinelRoot | Out-Null
    $sentinel = Join-Path $sentinelRoot "keep-on-uninstall-$stateTag.txt"
    Set-Content -Path $sentinel -Value 'keep'
    $installProcess = Start-Process $Installer -ArgumentList '/S' -Wait -PassThru
    if ($installProcess.ExitCode -ne 0) { throw "installer exited with code $($installProcess.ExitCode)" }
    $installed = Join-Path $windowsLocalAppData 'Programs\TALOS CLI\bin\talos.cmd'
    if (-not (Test-Path $installed)) { throw "installed talos.cmd missing under Windows LocalApplicationData: $installed" }
    $installedVersion = & $installed --version
    if ($LASTEXITCODE -ne 0 -or $installedVersion.Trim() -ne '1.0.0') { throw 'installed CLI smoke failed' }
    Push-Location $outside
    try {
      $installedJson = & $installed --project $outside -p 'reply OK from installed CLI' --json --permission-mode dontAsk
      if ($LASTEXITCODE -ne 0) { throw "installed CLI runtime smoke outside checkout failed: $installedJson" }
      $installedObj = $installedJson | ConvertFrom-Json
      if ($installedObj.schema -ne 'talos.cli.result.v1' -or -not $installedObj.ok) { throw 'installed CLI runtime result contract mismatch' }
    } finally {
      Pop-Location
    }
    $uninstaller = Join-Path $windowsLocalAppData 'Programs\TALOS CLI\Uninstall.exe'
    if (-not (Test-Path $uninstaller)) { throw 'Uninstall.exe missing' }
    $uninstallProcess = Start-Process $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ($uninstallProcess.ExitCode -ne 0) { throw "uninstaller exited with code $($uninstallProcess.ExitCode)" }
    if (-not (Test-Path $sentinel)) { throw 'normal uninstall removed sentinel user data' }
    Remove-Item -Force -ErrorAction SilentlyContinue $sentinel
  }

  'windows-smoke: ok'
} finally {
  Stop-Process -Id $provider.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $codingFixtureRoot
  Remove-Item -Force -ErrorAction SilentlyContinue $compatProvider
  Remove-Item Env:TALOS_FAKE_PROVIDER_SOURCE -ErrorAction SilentlyContinue
  if ($sentinel) { Remove-Item -Force -ErrorAction SilentlyContinue $sentinel }
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $smokeAppData,$smokeLocalAppData
  $env:APPDATA = $originalAppData
  $env:LOCALAPPDATA = $originalLocalAppData
}
