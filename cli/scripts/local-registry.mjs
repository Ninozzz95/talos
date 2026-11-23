/*
 * Installation, platform packages (owner 02/10, registro 12): the proof that npm itself picks the right package. A file
 * tarball cannot stand in for `npm:talos-code@<ver>-win32-x64` (an alias is resolved on the registry), so the installed
 * package proof (scripts/prove-standalone.ts) runs npm against this small registry on 127.0.0.1: it serves `talos-code`
 * from the staged tarballs (scripts/stage-release.mjs) — the main version as `latest` and the platform versions — and
 * passes every other request to the real registry, as a mirror would. npm then reads `os`/`cpu` and installs only the
 * platform package of this machine, exactly as it will from npmjs.com.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {basename} from 'node:path';

/* entries: [{manifest, tarball}] — the package.json that went into each tarball, and the tarball's path */
export async function startLocalRegistry({entries,latest,upstream='https://registry.npmjs.org'}){
  const files=new Map();
  let base='';
  const versions=()=>Object.fromEntries(entries.map(({manifest,tarball})=>{
    const bytes=files.get(basename(tarball));
    return[manifest.version,{...manifest,_id:`${manifest.name}@${manifest.version}`,dist:{
      tarball:`${base}/${manifest.name}/-/${basename(tarball)}`,
      shasum:createHash('sha1').update(bytes).digest('hex'),
      integrity:`sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    }}];
  }));
  for(const {tarball} of entries)files.set(basename(tarball),readFileSync(tarball));
  const name=entries[0].manifest.name;
  const requests=[];
  const server=createServer(async(request,response)=>{
    const path=decodeURIComponent((request.url??'/').split('?')[0]);
    requests.push(path);
    try{
      if(path===`/${name}`){
        response.writeHead(200,{'content-type':'application/json'});
        response.end(JSON.stringify({name,'dist-tags':{latest},versions:versions()}));return;
      }
      if(path.startsWith(`/${name}/-/`)&&files.has(basename(path))){
        response.writeHead(200,{'content-type':'application/octet-stream'});response.end(files.get(basename(path)));return;
      }
      const forwarded=await fetch(`${upstream}${request.url}`,{headers:{accept:request.headers.accept??'application/json'}});
      response.writeHead(forwarded.status,{'content-type':forwarded.headers.get('content-type')??'application/json'});
      response.end(Buffer.from(await forwarded.arrayBuffer()));
    }catch(error){response.writeHead(502);response.end(String(error));}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  base=`http://127.0.0.1:${server.address().port}`;
  return{url:`${base}/`,requests,close:()=>new Promise(done=>server.close(()=>done()))};
}
