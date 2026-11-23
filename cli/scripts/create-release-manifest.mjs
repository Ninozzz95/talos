import {createHash} from 'node:crypto';
import {basename,resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const VERSION_RE=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const CHANNELS=new Set(['stable','preview']);
const KINDS=new Set(['installer','zip']);

function normalizeBaseUrl(value){
  let url;
  try{url=new URL(String(value));}catch{throw new Error('RELEASE_BASE_URL_INVALID');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('RELEASE_BASE_URL_INVALID');
  return url.toString().replace(/\/$/u,'');
}

export async function createReleaseManifest({version,channel,baseUrl,assets}){
  if(typeof version!=='string'||!VERSION_RE.test(version))throw new Error('RELEASE_VERSION_INVALID');
  if(!CHANNELS.has(channel))throw new Error('RELEASE_CHANNEL_INVALID');
  if(!Array.isArray(assets)||assets.length===0)throw new Error('RELEASE_ASSET_INVALID');
  const root=normalizeBaseUrl(baseUrl);
  const rows=[];
  for(const asset of assets){
    if(!asset||typeof asset.platform!=='string'||!asset.platform.trim()||!KINDS.has(asset.kind)||typeof asset.path!=='string'||!asset.path){
      throw new Error('RELEASE_ASSET_INVALID');
    }
    const bytes=await readFile(asset.path);
    const name=basename(asset.path);
    if(!name||name==='.'||name==='..')throw new Error('RELEASE_ASSET_INVALID');
    rows.push({
      platform:asset.platform.trim(),
      kind:asset.kind,
      url:`${root}/${encodeURIComponent(name)}`,
      sha256:createHash('sha256').update(bytes).digest('hex'),
      size:bytes.byteLength,
    });
  }
  rows.sort((a,b)=>a.platform.localeCompare(b.platform)||a.kind.localeCompare(b.kind)||a.url.localeCompare(b.url));
  return {schema:'talos.cli.release.v1',version,channel,assets:rows};
}

function parseArgs(argv){
  const result={assets:[]};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    const value=()=>{const v=argv[++i];if(!v)throw new Error(`missing value for ${arg}`);return v;};
    if(arg==='--version')result.version=value();
    else if(arg==='--channel')result.channel=value();
    else if(arg==='--base-url')result.baseUrl=value();
    else if(arg==='--out')result.out=value();
    else if(arg==='--asset'){
      const spec=value();
      const first=spec.indexOf(':');
      const second=spec.indexOf(':',first+1);
      if(first<=0||second<=first+1||second===spec.length-1)throw new Error('invalid --asset; expected platform:kind:path');
      result.assets.push({platform:spec.slice(0,first),kind:spec.slice(first+1,second),path:resolve(spec.slice(second+1))});
    }else throw new Error(`unknown argument: ${arg}`);
  }
  if(!result.version||!result.channel||!result.baseUrl||!result.out||result.assets.length===0)throw new Error('required: --version --channel --base-url --out --asset platform:kind:path');
  return result;
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const manifest=await createReleaseManifest(args);
  await writeFile(resolve(args.out),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  main().catch(error=>{console.error(error?.message||String(error));process.exitCode=1;});
}
