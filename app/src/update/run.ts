import {mkdir,rename,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {checkRelease,verifyDownloadedAsset,type ReleaseAsset,type ReleaseManifest} from './check.ts';

const DEFAULT_TIMEOUT_MS=15_000;
const DEFAULT_ATTEMPTS=2;
const DEFAULT_RETRY_DELAY_MS=250;

type FetchPolicy={timeoutMs?:number;attempts?:number;retryDelayMs?:number};

type UpdateHttpError=Error&{code:'UPDATE_HTTP_ERROR';status:number};
type UpdateTimeoutError=Error&{code:'UPDATE_TIMEOUT'};

function httpError(status:number):UpdateHttpError{
  return Object.assign(new Error(`UPDATE_HTTP_${status}`),{code:'UPDATE_HTTP_ERROR' as const,status});
}

function timeoutError():UpdateTimeoutError{
  return Object.assign(new Error('UPDATE_TIMEOUT'),{code:'UPDATE_TIMEOUT' as const});
}

function sleep(ms:number){return ms>0?new Promise<void>(resolve=>setTimeout(resolve,ms)):Promise.resolve();}

function transient(error:unknown){
  if((error as any)?.code==='UPDATE_TIMEOUT')return true;
  if((error as any)?.code==='UPDATE_HTTP_ERROR')return Number((error as any).status)>=500;
  return error instanceof TypeError || (typeof (error as any)?.code==='string' && /^(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ETIMEDOUT)$/u.test((error as any).code));
}

async function fetchOnce(fetchFn:typeof fetch,url:string,timeoutMs:number){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(timeoutError()),timeoutMs);
  try{
    let response:Response;
    try{
      response=await fetchFn(url,{headers:{Accept:'application/json, application/octet-stream'},signal:controller.signal});
    }catch(error){
      if(controller.signal.aborted)throw timeoutError();
      throw error;
    }
    if(!response.ok)throw httpError(response.status);
    return response;
  }finally{
    clearTimeout(timer);
  }
}

async function checkedResponse(fetchFn:typeof fetch,url:string,{timeoutMs=DEFAULT_TIMEOUT_MS,attempts=DEFAULT_ATTEMPTS,retryDelayMs=DEFAULT_RETRY_DELAY_MS}:FetchPolicy={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<=0)throw new Error('UPDATE_TIMEOUT_INVALID');
  if(!Number.isInteger(attempts)||attempts<=0||attempts>2)throw new Error('UPDATE_ATTEMPTS_INVALID');
  if(!Number.isInteger(retryDelayMs)||retryDelayMs<0)throw new Error('UPDATE_RETRY_DELAY_INVALID');
  let last:unknown;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{return await fetchOnce(fetchFn,url,timeoutMs);}
    catch(error){
      last=error;
      if(attempt>=attempts||!transient(error))throw error;
      await sleep(retryDelayMs);
    }
  }
  throw last;
}


type GitHubRelease={tag_name?:string;draft?:boolean;prerelease?:boolean;assets?:Array<{name?:string;browser_download_url?:string}>};
export async function discoverGitHubReleaseManifest({channel,fetchFn=fetch,releasesUrl='https://api.github.com/repos/Ninozzz95/talos/releases?per_page=30',timeoutMs,retryDelayMs}:{channel:'stable'|'preview';fetchFn?:typeof fetch;releasesUrl?:string;timeoutMs?:number;retryDelayMs?:number}){
  const policy:FetchPolicy={};if(timeoutMs!==undefined)policy.timeoutMs=timeoutMs;if(retryDelayMs!==undefined)policy.retryDelayMs=retryDelayMs;
  const response=await checkedResponse(fetchFn,releasesUrl,policy);
  let releases:GitHubRelease[];try{releases=await response.json() as GitHubRelease[];}catch{throw new Error('UPDATE_RELEASE_METADATA_INVALID');}
  if(!Array.isArray(releases))throw new Error('UPDATE_RELEASE_METADATA_INVALID');
  const release=releases.find(r=>r&&r.draft!==true&&typeof r.tag_name==='string'&&r.tag_name.startsWith('talos-cli-v')&&(channel==='preview'?r.prerelease===true:r.prerelease!==true));
  if(!release)throw Object.assign(new Error('UPDATE_RELEASE_NOT_FOUND'),{code:'UPDATE_RELEASE_NOT_FOUND'});
  const asset=release.assets?.find(a=>a?.name==='talos-cli-release.json'&&typeof a.browser_download_url==='string');
  if(!asset?.browser_download_url)throw Object.assign(new Error('UPDATE_MANIFEST_ASSET_NOT_FOUND'),{code:'UPDATE_MANIFEST_ASSET_NOT_FOUND'});
  let url:URL;try{url=new URL(asset.browser_download_url);}catch{throw new Error('UPDATE_RELEASE_METADATA_INVALID');}
  if(url.protocol!=='https:')throw new Error('UPDATE_RELEASE_METADATA_INVALID');
  return url.toString();
}
export async function performUpdateCheck({currentVersion,channel,platform,manifestUrl,fetchFn=fetch,timeoutMs,retryDelayMs}:{currentVersion:string;channel:'stable'|'preview';platform:string;manifestUrl:string;fetchFn?:typeof fetch;timeoutMs?:number;retryDelayMs?:number}){
  const policy:FetchPolicy={};
  if(timeoutMs!==undefined)policy.timeoutMs=timeoutMs;
  if(retryDelayMs!==undefined)policy.retryDelayMs=retryDelayMs;
  const response=await checkedResponse(fetchFn,manifestUrl,policy);
  let manifest:ReleaseManifest;
  try{manifest=await response.json() as ReleaseManifest;}catch{throw new Error('UPDATE_MANIFEST_INVALID');}
  return checkRelease({currentVersion,channel,platform,fetchManifest:async()=>manifest});
}

export async function downloadVerifiedUpdate({asset,cacheDir,fetchFn=fetch,timeoutMs,retryDelayMs}:{asset:ReleaseAsset;cacheDir:string;fetchFn?:typeof fetch;timeoutMs?:number;retryDelayMs?:number}){
  await mkdir(cacheDir,{recursive:true,mode:0o700});
  const policy:FetchPolicy={};
  if(timeoutMs!==undefined)policy.timeoutMs=timeoutMs;
  if(retryDelayMs!==undefined)policy.retryDelayMs=retryDelayMs;
  const response=await checkedResponse(fetchFn,asset.url,policy);
  const bytes=Buffer.from(await response.arrayBuffer());
  await verifyDownloadedAsset(bytes,asset);
  const raw=basename(new URL(asset.url).pathname)||'talos-update.bin';
  const name=raw.replace(/[^A-Za-z0-9._-]/gu,'_');
  const target=join(cacheDir,name);
  const tmp=`${target}.tmp-${process.pid}`;
  await writeFile(tmp,bytes,{mode:0o600});
  await rename(tmp,target);
  return target;
}
