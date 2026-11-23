import {createHash} from 'node:crypto';
import {readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';

async function walk(root,dir=root){const rows=[];for(const name of (await readdir(dir)).sort()){const p=join(dir,name);const s=await stat(p);if(s.isDirectory())rows.push(...await walk(root,p));else{const rel=relative(root,p).replaceAll('\\','/');if(rel!=='MANIFEST.json')rows.push({path:rel,file:p,size:s.size});}}return rows;}
export async function writeRuntimeManifest({root,version,talosCommit,node,platform}){const files=[];for(const row of await walk(root)){const bytes=await readFile(row.file);files.push({path:row.path,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.byteLength});}files.sort((a,b)=>a.path.localeCompare(b.path));const manifest={schema:'talos.cli.manifest.v1',version,talosCommit,node,platform,files};await writeFile(join(root,'MANIFEST.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');return manifest;}
