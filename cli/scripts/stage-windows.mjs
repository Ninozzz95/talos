import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeRuntimeManifest} from './write-manifest.mjs';

const here=dirname(fileURLToPath(import.meta.url));
function fail(code){throw Object.assign(new Error(code),{code});}
function checkedRelative(value){if(typeof value!=='string'||!value||value.startsWith('/')||/^[A-Za-z]:[\\/]/u.test(value)||value.replaceAll('\\','/').split('/').includes('..'))fail('STAGE_PATH_INVALID');return value;}
async function exists(p){try{await stat(p);return true;}catch{return false;}}
async function copyEntry(repoRoot,out,entry){const source=resolve(repoRoot,checkedRelative(entry.source));const target=resolve(out,checkedRelative(entry.target));if(!target.startsWith(resolve(out)+requireSep())&&target!==resolve(out))fail('STAGE_TARGET_ESCAPE');if(!await exists(source))fail(`STAGE_SOURCE_MISSING:${entry.source}`);await mkdir(dirname(target),{recursive:true});if(entry.kind==='tree')await cp(source,target,{recursive:true,errorOnExist:false,force:true});else if(entry.kind==='file')await cp(source,target,{force:true});else fail('STAGE_ENTRY_KIND_INVALID');}
function requireSep(){return process.platform==='win32'?'\\':'/';}
function locateEocd(buf){for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50)return i;return-1;}
export function readZipEntries(buf){const eocd=locateEocd(buf);if(eocd<0)fail('ZIP_EOCD_NOT_FOUND');const count=buf.readUInt16LE(eocd+10);let off=buf.readUInt32LE(eocd+16);const result=new Map();for(let i=0;i<count;i++){if(buf.readUInt32LE(off)!==0x02014b50)fail('ZIP_CENTRAL_INVALID');const method=buf.readUInt16LE(off+10),compressed=buf.readUInt32LE(off+20),uncompressed=buf.readUInt32LE(off+24),nameLen=buf.readUInt16LE(off+28),extraLen=buf.readUInt16LE(off+30),commentLen=buf.readUInt16LE(off+32),local=buf.readUInt32LE(off+42);const name=buf.subarray(off+46,off+46+nameLen).toString('utf8').replaceAll('\\','/');if(buf.readUInt32LE(local)!==0x04034b50)fail('ZIP_LOCAL_INVALID');const localName=buf.readUInt16LE(local+26),localExtra=buf.readUInt16LE(local+28),dataStart=local+30+localName+localExtra;const raw=buf.subarray(dataStart,dataStart+compressed);let data;if(method===0)data=Buffer.from(raw);else if(method===8)data=inflateRawSync(raw);else fail(`ZIP_METHOD_UNSUPPORTED:${method}`);if(data.length!==uncompressed)fail('ZIP_SIZE_MISMATCH');result.set(name,data);off+=46+nameLen+extraLen+commentLen;}return result;}
function findBySuffix(entries,suffix){const key=[...entries.keys()].find(x=>x===suffix||x.endsWith(`/${suffix}`));if(!key)fail(`NODE_ARCHIVE_ENTRY_MISSING:${suffix}`);return entries.get(key);}
async function copyTreeWithoutNodeModules(source,target){await mkdir(target,{recursive:true});for(const name of await readdir(source)){if(name==='node_modules')continue;const src=join(source,name),dst=join(target,name);const s=await stat(src);if(s.isDirectory())await copyTreeWithoutNodeModules(src,dst);else{await mkdir(dirname(dst),{recursive:true});await cp(src,dst,{force:true});}}}
async function copyDependencyTrees({repoRoot,out,spec}){
  if(!Array.isArray(spec.dependencyTrees))fail('STAGE_SPEC_INVALID');
  for(const tree of spec.dependencyTrees){
    const manifestPath=resolve(repoRoot,checkedRelative(tree.manifest));
    const pkg=JSON.parse(await readFile(manifestPath,'utf8'));
    const runtimeDependencies=Object.keys({...pkg.dependencies,...pkg.optionalDependencies});
    if(runtimeDependencies.length===0)continue;
    const source=resolve(repoRoot,checkedRelative(tree.source));
    const target=resolve(out,checkedRelative(tree.target));
    if(!await exists(source))fail(`STAGE_DEPENDENCY_TREE_MISSING:${tree.source}`);
    await mkdir(dirname(target),{recursive:true});
    await cp(source,target,{recursive:true,errorOnExist:false,force:true});
    for(const dependency of runtimeDependencies){
      if(!await exists(join(target,...dependency.split('/'),'package.json')))fail(`STAGE_DEPENDENCY_MISSING:${dependency}`);
    }
  }
}
function rootWrapper(){return '@echo off\r\ncall "%~dp0bin\\talos.cmd" %*\r\nexit /b %ERRORLEVEL%\r\n';}
export async function stageWindows({repoRoot,out,nodeArchive,nodeSha256,runtimeSpecPath=new URL('../packaging/runtime-files.json',import.meta.url)}){repoRoot=resolve(repoRoot);out=resolve(out);if(!/^[a-f0-9]{64}$/iu.test(nodeSha256))fail('NODE_ARCHIVE_SHA256_INVALID');const archive=await readFile(nodeArchive);const actual=createHash('sha256').update(archive).digest('hex');if(actual.toLowerCase()!==nodeSha256.toLowerCase())fail('NODE_ARCHIVE_CHECKSUM_MISMATCH');const spec=JSON.parse(await readFile(runtimeSpecPath,'utf8'));if(spec.schema!=='talos.cli.runtime-files.v1'||!Array.isArray(spec.entries))fail('STAGE_SPEC_INVALID');await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});for(const entry of spec.entries)await copyEntry(repoRoot,out,entry);const entries=readZipEntries(archive);await mkdir(join(out,'runtime'),{recursive:true});await writeFile(join(out,'runtime','node.exe'),findBySuffix(entries,'node.exe'));await writeFile(join(out,'runtime','LICENSE-node.txt'),findBySuffix(entries,'LICENSE'));await copyDependencyTrees({repoRoot,out,spec});await mkdir(join(out,'bin'),{recursive:true});const cmd=await readFile(new URL('../packaging/talos.cmd',import.meta.url),'utf8');await writeFile(join(out,'bin','talos.cmd'),cmd,'utf8');await cp(new URL('../packaging/windows/path.ps1',import.meta.url),join(out,'bin','path.ps1'),{force:true});await writeFile(join(out,'talos.cmd'),rootWrapper(),'utf8');await cp(new URL('../packaging/start-talos-cli.cmd',import.meta.url),join(out,'Start TALOS CLI.cmd'),{force:true});const pkg=JSON.parse(await readFile(join(repoRoot,'cli','package.json'),'utf8'));return writeRuntimeManifest({root:out,version:pkg.version,talosCommit:spec.talosCommit,node:spec.nodeVersion,platform:spec.platform});}
function parse(argv){const o={};for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1];if(!k?.startsWith('--')||v===undefined)fail('STAGE_ARGS_INVALID');o[k.slice(2)]=v;}return o;}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const a=parse(process.argv.slice(2));stageWindows({repoRoot:a['repo-root'],out:a.out,nodeArchive:a['node-archive'],nodeSha256:a['node-sha256']}).catch(e=>{console.error(e?.message??e);process.exitCode=1;});}
