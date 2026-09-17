/** Check candidate bytes; optional Git-object export only AFTER CI gates.
 * No commit/ref/release API is implemented here. The connector performs the
 * final branch update after comparing the exported tree with this manifest.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const root=resolve('.');
const out=resolve(process.env.TALOS_QUALIFICATION_OUTPUT || 'evidence/foundation');
const manifest=JSON.parse(await readFile(new URL('./l02-files.json',import.meta.url),'utf8'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const digest=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const blobs=[];
for(const f of manifest.files){
  assert.ok(f.path.startsWith('harness-ui/frontend/')&&!f.path.split('/').includes('..'));
  let bytes=null;try{bytes=await readFile(join(root,f.path));}catch(e){if(e.code!=='ENOENT')throw e;}
  assert.equal(bytes===null?null:digest('sha256',bytes),f.afterSha256,'Candidate SHA256 mismatch: '+f.path);
  const sha=bytes===null?null:digest('sha1',Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes]));
  assert.equal(sha,f.afterGitBlob,'Candidate Git blob mismatch: '+f.path);
  blobs.push({path:f.path,sha,bytes});
}
await mkdir(out,{recursive:true});
const report={schema:'talos.ledger.qualification.v1',lot:'L02',parent:git('rev-parse','HEAD'),
  baseline:manifest.baseline,ledgerSha256:manifest.ledgerSha256,files:manifest.files,
  candidateBytesMatch:true,committed:false,branchUpdated:false};
await writeFile(join(out,'source-verification.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(out,'L02.patch'),execFileSync('git',['diff','--no-ext-diff','--binary',manifest.baseline,'--','harness-ui/frontend'],{cwd:root,maxBuffer:16*1024*1024}));
if(process.argv.includes('--publish-objects')){
  assert.equal(process.env.GITHUB_REPOSITORY,'Ninozzz95/talos');
  assert.equal(process.env.GITHUB_HEAD_REF,'refactor/desktop-ledger-v1');
  assert.ok(process.env.GH_TOKEN);
  async function post(family,body){
    assert.ok(['blobs','trees'].includes(family));
    const response=await fetch(`https://api.github.com/repos/Ninozzz95/talos/git/${family}`,{
      method:'POST',headers:{authorization:`Bearer ${process.env.GH_TOKEN}`,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','content-type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok)throw new Error(`Git ${family}: HTTP ${response.status}`);
    return response.json();
  }
  const entries=[];
  for(const f of blobs){
    if(f.bytes===null){entries.push({path:f.path,mode:'100644',type:'blob',sha:null});continue;}
    const result=await post('blobs',{encoding:'base64',content:f.bytes.toString('base64')});
    assert.equal(result.sha,f.sha,'Remote bytes differ');
    entries.push({path:f.path,mode:'100644',type:'blob',sha:result.sha});
  }
  const baseTree=git('rev-parse','HEAD^{tree}');
  const result=await post('trees',{base_tree:baseTree,tree:entries});
  await writeFile(join(out,'qualified-tree.json'),JSON.stringify({...report,baseTree,tree:result.sha,entries},null,2)+'\n');
  console.log('Qualified tree '+result.sha+'; no commit, ref update or release.');
}else console.log('L02: '+blobs.length+' candidate files match; no network writes.');
