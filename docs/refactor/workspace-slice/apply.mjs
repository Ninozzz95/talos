/** Apply the approved, hash-bound frontend edits; never evaluate payload text. */
import { createHash } from 'node:crypto';
import { brotliDecompressSync } from 'node:zlib';
import { readFile, writeFile, lstat, mkdir, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
const root=resolve(process.cwd());
const folder=resolve(root,'docs/refactor/workspace-slice');
const expected='b44c8e03164a37a555350ce60d48a3fd98123c5e7261a333d9ba217ccbb652e3';
const hash=b=>createHash('sha256').update(b).digest('hex');
const compressed=Buffer.from((await Promise.all(Array.from({length:7},(_,i)=>readFile(resolve(folder,`part-${String(i+1).padStart(2,'0')}.b64`),'utf8')))).join(''),'base64');
if(hash(compressed)!==expected)throw Error('Change-set transport hash mismatch');
const payload=JSON.parse(brotliDecompressSync(compressed,{maxOutputLength:2000000}));
if(payload.schema!=='talos.ledger.changes.v1'||payload.baseline!=='13f65c15cdeaf8986b882993a0773cdeafb867d2'||!Array.isArray(payload.changes)||payload.changes.length!==28)throw Error('Unknown change-set');
const paths=new Set(), pending=[];
for(const change of payload.changes){
 const name=change.path;
 if(typeof name!=='string'||!name.startsWith('harness-ui/frontend/')||name.includes('\\')||name.includes('\0')||name.split('/').some(p=>p==='..'||p==='.'||!p)||paths.has(name))throw Error('Disallowed or duplicate path');
 paths.add(name);
 const file=resolve(root,name);
 for(let parent=file;parent!==root;parent=dirname(parent)){
  if(relative(root,parent).startsWith('..'+sep))throw Error('Path outside checkout');
  try{if((await lstat(parent)).isSymbolicLink())throw Error('Symlink in change path');}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 let original=null;
 try{original=await readFile(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 const originalHash=original===null?null:hash(original);
 if(originalHash===change.after){pending.push({file,name,done:true});continue;}
 if(originalHash!==change.before)throw Error(`Baseline drift: ${name}`);
 if(!Array.isArray(change.edits))throw Error('Missing edits');
 let result=original||Buffer.alloc(0), end=0;
 for(const edit of change.edits){
  if(!Number.isSafeInteger(edit.start)||!Number.isSafeInteger(edit.end)||edit.start<end||edit.end<edit.start||edit.end>result.length||typeof edit.text!=='string')throw Error(`Invalid interval: ${name}`);
  end=edit.end;
 }
 for(const edit of [...change.edits].reverse())result=Buffer.concat([result.subarray(0,edit.start),Buffer.from(edit.text,'utf8'),result.subarray(edit.end)]);
 if(change.after===null){if(change.edits.length)throw Error('Deletion must have no text edits');}
 else if(hash(result)!==change.after)throw Error(`Result mismatch: ${name}`);
 pending.push({file,name,result,deleted:change.after===null,done:false});
}
// Validate all paths and bytes before any mutation. Reapplication is a safe no-op.
for(const entry of pending.filter(v=>!v.done)){
 if(entry.deleted)await unlink(entry.file);
 else{await mkdir(dirname(entry.file),{recursive:true});await writeFile(entry.file,entry.result);}
 console.log(`${entry.deleted?'delete':'write'} ${entry.name}`);
}
console.log(JSON.stringify({schema:'talos.ledger.applied.v1',baseline:payload.baseline,transportSha256:expected,files:pending.length,changed:pending.filter(v=>!v.done).length}));
