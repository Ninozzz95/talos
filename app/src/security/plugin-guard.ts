import {createHash} from 'node:crypto';
import {lstat,open,readFile,readdir,realpath} from 'node:fs/promises';
import path from 'node:path';

export type PluginGuardVerdict='safe'|'caution'|'dangerous';
export type PluginGuardFinding={severity:'caution'|'dangerous';code:string;origin:string;message:string};
export type PluginGuardReport={verdict:PluginGuardVerdict;findings:PluginGuardFinding[];capabilities:string[]};
type PluginCommand={nome?:string;id?:string;comando?:string};
type PluginManifest={id:string;tools?:PluginCommand[];hooks?:PluginCommand[]};
type LegacyTrustInput={cartellaTrust:string;pluginId:string;hash:string};
type PluginGuardLimits={maxFiles?:number;maxSourceFileBytes?:number;maxSourceBytes?:number};
export type PluginGuardExpectedReview={workspaceIdentityHash:string;resources:readonly {relativePath:string;fingerprint:string}[]};
type AuthoritySnapshotLike={workspace:{identityHash:string};resources:readonly {kind:string;relativePath:string;current?:{relativePath:string;fingerprint:string}}[]};

export const PLUGIN_GUARD_MAX_FILES=10_000;
export const PLUGIN_GUARD_MAX_SOURCE_FILE_BYTES=1024*1024;
export const PLUGIN_GUARD_MAX_SOURCE_BYTES=16*1024*1024;
const SOURCE_FILE=/\.(?:[cm]?[jt]sx?|mjs|cjs|mts|cts|ps1|sh|bash|zsh)$/iu;

function inside(root:string,candidate:string){const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
function verdict(findings:readonly PluginGuardFinding[]):PluginGuardVerdict{return findings.some(finding=>finding.severity==='dangerous')?'dangerous':findings.length?'caution':'safe';}
function report(findings:PluginGuardFinding[],capabilities:Set<string>):PluginGuardReport{return{verdict:verdict(findings),findings,capabilities:[...capabilities].sort()};}
function finding(severity:PluginGuardFinding['severity'],code:string,origin:string,message:string):PluginGuardFinding{return{severity,code,origin,message};}
function safePluginId(id:string){return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/u.test(id)&&!id.includes('..');}
function boundedLimit(value:number|undefined,ceiling:number){if(value===undefined)return ceiling;if(!Number.isFinite(value))return ceiling;return Math.max(1,Math.min(Math.floor(value),ceiling));}
function packageRelative(pluginId:string,relative:string){return path.posix.join('.harness-ui-plugins',pluginId,relative);}
function pluginResourceFingerprint(relativePath:string,content:string|Buffer){return createHash('sha256').update('talos-executable-resource-v1').update('\0').update('plugin').update('\0').update(relativePath).update('\0').update(relativePath).update('\0').update(content).digest('hex');}
function reviewedBytesMatch(review:PluginGuardExpectedReview|undefined,relativePath:string,content:string|Buffer,origin:string,findings:PluginGuardFinding[]){
  if(!review)return true;
  const expected=review.resources.find(row=>row.relativePath===relativePath);
  if(expected&&expected.fingerprint===pluginResourceFingerprint(relativePath,content))return true;
  findings.push(finding('dangerous','PACKAGE_REVIEW_CHANGED',origin,'package bytes differ from the reviewed trust snapshot; remediation: review the current package again before trusting it'));
  return false;
}
export function pluginReviewFromSnapshot(snapshot:AuthoritySnapshotLike,pluginId:string):PluginGuardExpectedReview{
  const prefix=`.harness-ui-plugins/${pluginId}/`;
  return{workspaceIdentityHash:snapshot.workspace.identityHash,resources:snapshot.resources.flatMap(row=>row.kind==='plugin'&&row.relativePath.startsWith(prefix)&&row.current?[{relativePath:row.current.relativePath,fingerprint:row.current.fingerprint}]:[])};
}
async function readSourceBounded(sourcePath:string,maxBytes:number){
  const handle=await open(sourcePath,'r');
  try{
    const buffer=Buffer.allocUnsafe(maxBytes+1);
    let bytes=0;
    while(bytes<buffer.length){
      const {bytesRead}=await handle.read(buffer,bytes,buffer.length-bytes,bytes);
      if(bytesRead===0)break;
      bytes+=bytesRead;
    }
    const content=buffer.subarray(0,bytes);return{bytes,overflow:bytes>maxBytes,content,text:bytes>maxBytes?'':content.toString('utf8')};
  }finally{await handle.close();}
}

function scanDangerousText(text:string,origin:string,findings:PluginGuardFinding[],capabilities:Set<string>){
  const network=/\b(?:curl|wget|Invoke-WebRequest|iwr|nc|ncat)\b|\bfetch\s*\(|\bWebSocket\s*\(|\baxios(?:\.[A-Za-z]+)?\s*\(|\bhttps?\s*\.\s*(?:request|get)\s*\(/iu.test(text);
  const credentials=/\b(?:process|Bun)\.env(?:\[['"][^'"]*(?:KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)[^'"]*['"]\]|\.[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION))|\$env:[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)|\$[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION)/iu.test(text);
  if(network)capabilities.add('network');
  if(credentials)capabilities.add('credentials');
  if(/\b(?:curl|wget)\b[^|\r\n]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b|\b(?:iwr|Invoke-WebRequest)\b[^|\r\n]*\|\s*(?:iex|Invoke-Expression)\b/iu.test(text))findings.push(finding('dangerous','REMOTE_PIPE_EXECUTION',origin,'downloads and executes remote content in one step'));
  if(credentials&&network)findings.push(finding('dangerous','CREDENTIAL_EXFILTRATION',origin,'combines credential access with an outbound network primitive'));
  if(/\bnc\s+-[A-Za-z]*e\b|\/dev\/tcp\/|\b(?:Invoke-Expression|iex)\b[^\r\n]*(?:FromBase64String|-enc(?:odedcommand)?\b)/iu.test(text))findings.push(finding('dangerous','DYNAMIC_REMOTE_SHELL',origin,'contains a reverse-shell or encoded dynamic execution pattern'));
}

export function scanPluginManifest(plugin:PluginManifest):PluginGuardReport{
  const findings:PluginGuardFinding[]=[];
  const capabilities=new Set<string>();
  for(const [kind,rows] of [['tool',plugin.tools??[]],['hook',plugin.hooks??[]]] as const){
    for(const [index,row] of rows.entries()){
      const command=String(row.comando??'');
      const origin=`${kind}:${String(row.nome??row.id??index)}`;
      capabilities.add('process');
      findings.push(finding('caution','LOCAL_COMMAND_EXECUTION',origin,'executes a local command'));
      if(/\b(?:curl|wget|Invoke-WebRequest|iwr|fetch)\b/iu.test(command)){capabilities.add('network');findings.push(finding('caution','NETWORK_ACCESS',origin,'command can access the network'));}
      if(/\b(?:API_KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION)\b|\$(?:env:)?(?:[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD))/iu.test(command))capabilities.add('credentials');
      if(/\b(?:rm\s+-[A-Za-z]*r[A-Za-z]*f|del\s+\/[sq]|Remove-Item\b[^\r\n]*-Recurse|format\s+[A-Za-z]:)/iu.test(command))capabilities.add('filesystem-write');
      if(/\b(?:curl|wget)\b[^|\r\n]*\|\s*(?:sh|bash|zsh|pwsh|powershell)\b|\b(?:iwr|Invoke-WebRequest)\b[^|\r\n]*\|\s*(?:iex|Invoke-Expression)\b/iu.test(command))findings.push(finding('dangerous','REMOTE_PIPE_EXECUTION',origin,'downloads and executes remote content in one command'));
      if(/(?:API_KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION)/iu.test(command)&&/\b(?:curl|wget|nc|ncat|Invoke-WebRequest|iwr)\b/iu.test(command))findings.push(finding('dangerous','CREDENTIAL_EXFILTRATION',origin,'combines credential access with a network command'));
      if(/\bnc\s+-[A-Za-z]*e\b|\/dev\/tcp\/|\b(?:Invoke-Expression|iex)\b[^\r\n]*(?:FromBase64String|-enc(?:odedcommand)?\b)/iu.test(command))findings.push(finding('dangerous','DYNAMIC_REMOTE_SHELL',origin,'contains a reverse-shell or encoded dynamic execution pattern'));
      if(/\brm\s+-[A-Za-z]*r[A-Za-z]*f\s+(?:\/|[A-Za-z]:\\)(?:\s|$)|\bdel\s+\/[sq]\s+[A-Za-z]:\\/iu.test(command))findings.push(finding('dangerous','FILESYSTEM_ROOT_DELETION',origin,'recursively deletes a filesystem root'));
    }
  }
  return report(findings,capabilities);
}

export async function scanPluginPackage({projectRoot,plugin,limits,expectedReview}:{projectRoot:string;plugin:PluginManifest;limits?:PluginGuardLimits;expectedReview?:PluginGuardExpectedReview}):Promise<PluginGuardReport>{
  const base=path.join(projectRoot,'.harness-ui-plugins');
  const findings:PluginGuardFinding[]=[];
  const capabilities=new Set<string>();
  const maxFiles=boundedLimit(limits?.maxFiles,PLUGIN_GUARD_MAX_FILES);
  const maxSourceFileBytes=boundedLimit(limits?.maxSourceFileBytes,PLUGIN_GUARD_MAX_SOURCE_FILE_BYTES);
  const maxSourceBytes=boundedLimit(limits?.maxSourceBytes,PLUGIN_GUARD_MAX_SOURCE_BYTES);
  if(!safePluginId(plugin.id)){findings.push(finding('dangerous','PLUGIN_ID_INVALID','package','plugin id is not a single safe path component'));return report(findings,capabilities);}
  const pluginPath=path.join(base,plugin.id);
  try{
    const [canonicalBase,canonicalRoot]=await Promise.all([realpath(base),realpath(pluginPath)]);
    if(!inside(canonicalBase,canonicalRoot)){findings.push(finding('dangerous','PLUGIN_ROOT_ESCAPE','package','plugin root resolves outside the plugin directory'));return report(findings,capabilities);}
    const manifestBytes=await readFile(path.join(canonicalRoot,'plugin.json'));
    reviewedBytesMatch(expectedReview,packageRelative(plugin.id,'plugin.json'),manifestBytes,'plugin.json',findings);
    const diskManifest=JSON.parse(manifestBytes.toString('utf8')) as {tools?:PluginCommand[];hooks?:PluginCommand[]};
    const initial=scanPluginManifest({id:plugin.id,tools:diskManifest.tools??[],hooks:diskManifest.hooks??[]});
    findings.push(...initial.findings);for(const capability of initial.capabilities)capabilities.add(capability);
    const sources:{path:string;relative:string;size:number}[]=[];
    let regularFiles=0;
    let fileLimitHit=false;
    async function walk(directory:string):Promise<void>{
      if(fileLimitHit)return;
      for(const entry of await readdir(directory,{withFileTypes:true})){
        if(fileLimitHit)return;
        const entryPath=path.join(directory,entry.name);
        const relative=path.relative(canonicalRoot,entryPath).split(path.sep).join('/');
        const metadata=await lstat(entryPath);
        if(metadata.isSymbolicLink()){
          const target=await realpath(entryPath);
          if(!inside(canonicalRoot,target))findings.push(finding('dangerous','SYMLINK_ESCAPE',relative,'symbolic link resolves outside the plugin root'));
          else findings.push(finding('caution','SYMLINK_PRESENT',relative,'package contains a symbolic link'));
          continue;
        }
        if(metadata.isDirectory()){await walk(entryPath);continue;}
        if(!metadata.isFile())continue;
        regularFiles+=1;
        if(regularFiles>maxFiles){
          findings.push(finding('dangerous','PACKAGE_FILE_LIMIT','package',`package exceeds the Plugin Guard file limit (${maxFiles}); remediation: remove generated/vendor files or split the plugin before trust review`));
          fileLimitHit=true;return;
        }
        if(/\.(?:exe|dll|node|com|msi)$/iu.test(entry.name)){capabilities.add('native-code');findings.push(finding('caution','NATIVE_BINARY',relative,'package contains native executable code'));}
        if(SOURCE_FILE.test(entry.name))sources.push({path:entryPath,relative,size:metadata.size});
      }
    }
    await walk(canonicalRoot);
    if(fileLimitHit)return report(findings,capabilities);
    if(expectedReview){
      const prefix=`.harness-ui-plugins/${plugin.id}/`;
      const seen=new Set(sources.map(source=>source.relative));
      for(const row of expectedReview.resources){
        if(!row.relativePath.startsWith(prefix))continue;
        const relative=row.relativePath.slice(prefix.length);
        if(SOURCE_FILE.test(relative)&&!seen.has(relative))findings.push(finding('dangerous','PACKAGE_REVIEW_CHANGED',relative,'a reviewed source file was missing during inspection; remediation: review the current package again before trusting it'));
      }
    }

    let metadataSourceBytes=0;
    let sourceLimitHit=false;
    for(const source of sources){
      if(source.size>maxSourceFileBytes){
        findings.push(finding('dangerous','SOURCE_FILE_BYTE_LIMIT',source.relative,`source file exceeds the Plugin Guard per-file byte limit (${maxSourceFileBytes}); remediation: split or reduce this source file before trust review`));
        sourceLimitHit=true;
      }
      metadataSourceBytes+=source.size;
    }
    if(metadataSourceBytes>maxSourceBytes){
      findings.push(finding('dangerous','PACKAGE_SOURCE_BYTE_LIMIT','package',`scannable source exceeds the Plugin Guard total-byte limit (${maxSourceBytes}); remediation: remove generated/vendor source or split the plugin before trust review`));
      sourceLimitHit=true;
    }
    if(sourceLimitHit)return report(findings,capabilities);

    let remainingSourceBytes=maxSourceBytes;
    for(const source of sources){
      if(remainingSourceBytes<=0){
        findings.push(finding('dangerous','PACKAGE_SOURCE_BYTE_LIMIT','package',`scannable source exceeds the Plugin Guard total-byte limit (${maxSourceBytes}); remediation: stop concurrent generation, remove generated/vendor source or split the plugin before trust review`));
        break;
      }
      const readLimit=Math.min(maxSourceFileBytes,remainingSourceBytes);
      const bounded=await readSourceBounded(source.path,readLimit);
      if(bounded.overflow){
        if(readLimit===maxSourceFileBytes)findings.push(finding('dangerous','SOURCE_FILE_BYTE_LIMIT',source.relative,`source file exceeded the Plugin Guard per-file byte limit while being read (${maxSourceFileBytes}); remediation: stop concurrent generation or split/reduce this source file before trust review`));
        if(readLimit===remainingSourceBytes)findings.push(finding('dangerous','PACKAGE_SOURCE_BYTE_LIMIT','package',`scannable source exceeded the Plugin Guard total-byte limit while being read (${maxSourceBytes}); remediation: stop concurrent generation, remove generated/vendor source or split the plugin before trust review`));
        if(readLimit===remainingSourceBytes)break;
        continue;
      }
      remainingSourceBytes-=bounded.bytes;
      if(!reviewedBytesMatch(expectedReview,packageRelative(plugin.id,source.relative),bounded.content,source.relative,findings))continue;
      scanDangerousText(bounded.text,source.relative,findings,capabilities);
    }
  }catch(error){findings.push(finding('dangerous','PACKAGE_SCAN_FAILED','package',error instanceof Error?error.message:'package scan failed'));}
  return report(findings,capabilities);
}

export function createGuardedPluginTrustVerifier({projectRoot,inspectReview,verifyTrusted}:{projectRoot:string;inspectReview?:()=>Promise<AuthoritySnapshotLike>;verifyTrusted:(input:LegacyTrustInput)=>Promise<boolean>}):((input:LegacyTrustInput)=>Promise<boolean>){
  return async input=>{
    if(!safePluginId(input.pluginId))return false;
    try{
      const snapshot=inspectReview?await inspectReview():undefined;
      const expectedReview=snapshot?pluginReviewFromSnapshot(snapshot,input.pluginId):undefined;
      const guard=await scanPluginPackage({projectRoot,plugin:{id:input.pluginId},...(expectedReview?{expectedReview}:{})});
      if(guard.verdict==='dangerous')return false;
      return await verifyTrusted(input);
    }catch{return false;}
  };
}
