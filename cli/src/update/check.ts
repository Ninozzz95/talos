import {createHash} from 'node:crypto';
export type ReleaseAsset={platform:string;kind:'installer'|'zip';url:string;sha256:string;size:number};export type ReleaseManifest={schema:'talos.cli.release.v1';version:string;channel:'stable'|'preview';assets:ReleaseAsset[]};
const V=/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/u;function cmp(a:string,b:string){const x=V.exec(a),y=V.exec(b);if(!x||!y)throw new Error('UPDATE_VERSION_INVALID');for(let i=1;i<=3;i++){const d=Number(x[i])-Number(y[i]);if(d)return Math.sign(d);}if(!x[4]||!y[4])return (x[4]?0:1)-(y[4]?0:1);return cmpPrerelease(x[4],y[4]);}
/* SemVer 2.0.0 §11.4 (before the first beta, registro 12): dot-separated identifiers from the left, numeric ones as numbers,
   the others in ASCII order, a numeric one below the others, and the longer set after an equal prefix — so beta.10 follows
   beta.2, and a person on beta.1 is offered beta.2. */
function cmpPrerelease(a:string,b:string){
  const x=a.split('.'),y=b.split('.'),numeric=/^\d+$/u;
  for(let i=0;i<Math.min(x.length,y.length);i++){
    const p=x[i]!,q=y[i]!;if(p===q)continue;
    const pn=numeric.test(p),qn=numeric.test(q);
    /* review 1 (Codex, verified): as BigInt, so identifiers beyond 2^53 still compare (SemVer sets no size limit) */
    if(pn&&qn){const bp=BigInt(p),bq=BigInt(q);return bp>bq?1:bp<bq?-1:0;}
    if(pn!==qn)return pn?-1:1;
    return p<q?-1:1;
  }
  return Math.sign(x.length-y.length);
}
/** The release order the installer check uses, shared with the npm check (update/npm.ts). */
export function compareReleaseVersions(a:string,b:string){return cmp(a,b);}
export async function checkRelease({currentVersion,channel,platform,fetchManifest}:{currentVersion:string;channel:'stable'|'preview';platform:string;fetchManifest:()=>Promise<ReleaseManifest>}){const m=await fetchManifest();if(m.schema!=='talos.cli.release.v1'||m.channel!==channel||!V.test(m.version))throw new Error('UPDATE_MANIFEST_INVALID');const asset=m.assets.find(a=>a.platform===platform);return{available:cmp(m.version,currentVersion)>0,version:m.version,asset:asset??null,manifest:m};}
export async function verifyDownloadedAsset(bytes:Buffer,asset:{sha256:string;size:number}){if(bytes.byteLength!==asset.size)throw new Error('UPDATE_SIZE_MISMATCH');const h=createHash('sha256').update(bytes).digest('hex');if(h.toLowerCase()!==asset.sha256.toLowerCase())throw new Error('UPDATE_CHECKSUM_MISMATCH');return h;}
