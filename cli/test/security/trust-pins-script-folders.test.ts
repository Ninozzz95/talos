/*
 * 0.6.8, second review of 0.6.8 (finding 2, S2) and owner 16/10/2026 «La cartella dello script (Consigliata)»: the first script
 * pinning was easy to get around. Each form the reviewer measured on the built 0.6.8 — and the ones it listed from reading — must
 * now change the fingerprint when the file that really runs is edited: a quoted name with a space, a hook quoted mid-word, an
 * extensionless name, a module the script requires (in its own folder: the whole folder; at the root: its direct imports),
 * `node .`, `python -m pkg`, `npm run start`, `node -r./x.mjs`. A folder over the bound fails closed.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {inventoryProjectResources,referencedScripts,hookCommandTokens} from '../../src/security/project-resource-inventory.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import {PROJECT_CONFIG_FILES} from '../../src/security/project-config-positions.ts';

async function project(files:Record<string,string>,mcp:any[]=[],hooks:any[]=[]){
  const root=await mkdtemp(join(tmpdir(),'talos-pin-forms-'));
  await mkdir(join(root,'.talos'),{recursive:true});
  for(const [name,content] of Object.entries(files)){await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),content);}
  if(mcp.length)await writeFile(join(root,PROJECT_CONFIG_FILES.mcp[0]!),JSON.stringify({server:mcp.map((row,i)=>({id:`s${i}`,allowlist:['x'],argomenti:[],...row}))}));
  if(hooks.length)await writeFile(join(root,PROJECT_CONFIG_FILES.hooks[0]!),JSON.stringify({hooks:hooks.map((comando,i)=>({id:`h${i}`,eventi:['PreToolUse'],comando}))}));
  return root;
}
const fingerprints=async(root:string)=>Object.fromEntries((await inventoryProjectResources(await resolveWorkspaceIdentity({projectRoot:root})))
  .filter(row=>row.kind==='mcp'||row.kind==='hook').map(row=>[`${row.kind}:${row.id}`,row.fingerprint]));
async function noticed(files:Record<string,string>,edit:string,{mcp=[],hooks=[]}:{mcp?:any[];hooks?:any[]}){
  const root=await project(files,mcp,hooks);const before=await fingerprints(root);
  await writeFile(join(root,edit),'console.log("EDITED")\n');
  const after=await fingerprints(root);
  return Object.keys(before).some(key=>before[key]!==after[key]);
}

test('the forms the reviewer measured are pinned',async()=>{
  assert.equal(await noticed({'my srv.cjs':'a','srv.cjs':'b'},'my srv.cjs',{mcp:[{comando:'node',argomenti:['my srv.cjs']}]}),true,'an MCP argument with a space is one name');
  assert.equal(await noticed({'hk.cjs':'a'},'hk.cjs',{hooks:['node h"k.cj"s']}),true,'a hook quoted mid-word is read as the kernel reads it');
  assert.equal(await noticed({'srv.js':'a'},'srv.js',{mcp:[{comando:'node',argomenti:['srv']}]}),true,'an extensionless name resolves like Node');
  assert.equal(await noticed({'srv.cjs':'require("./lib.cjs")','lib.cjs':'a'},'lib.cjs',{mcp:[{comando:'node',argomenti:['srv.cjs']}]}),true,'a root script\'s direct import');
});

test('a script in a folder of its own pins the whole folder, its modules included',async()=>{
  assert.equal(await noticed({'tools/mcp/server.js':'require("./deep/util.js")','tools/mcp/deep/util.js':'a','tools/mcp/deep/more.js':'b'},'tools/mcp/deep/more.js',{mcp:[{comando:'node',argomenti:['tools/mcp/server.js']}]}),true);
  assert.equal(await noticed({'tools/mcp/server.js':'a','tools/mcp/node_modules/x/index.js':'b'},'tools/mcp/node_modules/x/index.js',{mcp:[{comando:'node',argomenti:['tools/mcp/server.js']}]}),false,'node_modules is not walked');
});

test('the forms read from the code are pinned too',async()=>{
  assert.equal(await noticed({'package.json':JSON.stringify({main:'main.js'}),'main.js':'a'},'main.js',{mcp:[{comando:'node',argomenti:['.']}]}),true,'node .');
  assert.equal(await noticed({'pkg/__main__.py':'a','pkg/util.py':'b'},'pkg/util.py',{mcp:[{comando:'python',argomenti:['-m','pkg']}]}),true,'python -m pkg');
  assert.equal(await noticed({'package.json':JSON.stringify({scripts:{start:'node scripts/serve.js'}}),'scripts/serve.js':'a'},'scripts/serve.js',{mcp:[{comando:'npm',argomenti:['run','start']}]}),true,'npm run start');
  assert.equal(await noticed({'x.mjs':'a','srv.cjs':'b'},'x.mjs',{mcp:[{comando:'node',argomenti:['-r./x.mjs','srv.cjs']}]}),true,'node -r./x.mjs');
});

test('a program on PATH, a URL and a file outside the project are not project scripts',async()=>{
  const root=await project({'srv.cjs':'a'});const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  assert.deepEqual((await referencedScripts(workspace,['node','srv.cjs','--port=9','https://example.invalid/sse','../outside.js'])).map(row=>row.path),['srv.cjs']);
});

/* Third review of 0.6.8 (F2) and owner 16/10/2026 «Salta e segnala»: a project always opens. */
test('a script folder over the bound pins what it can and says the rest was not checked; it never fails',async()=>{
  const root=await project({'tools/a.js':'a','tools/b.js':'b','tools/c.js':'c'});const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const rows=await referencedScripts(workspace,['node','tools/a.js'],{maxFolderFiles:2});
  assert.equal(rows.filter(row=>/^[0-9a-f]{64}$/u.test(row.sha256)).length,2);
  assert.ok(rows.some(row=>row.sha256==='not-checked:more-than-2-files'),JSON.stringify(rows));
});

test('installed libraries are skipped, a link is pinned by its target, a data folder argument is not walked',async()=>{
  const root=await project({'mcp-server/server.py':'import util','mcp-server/util.py':'a','mcp-server/.venv/pyvenv.cfg':'home=x','mcp-server/.venv/Lib/site.py':'b','mcp-server/env2/pyvenv.cfg':'x','mcp-server/env2/big.py':'c','docs/a.md':'a','docs/b.md':'b'});
  const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  const rows=(await referencedScripts(workspace,['python','mcp-server/server.py'])).map(row=>row.path);
  assert.deepEqual(rows,['mcp-server/server.py','mcp-server/util.py'],'a virtual environment, by name or by pyvenv.cfg, is skipped');
  assert.deepEqual(await referencedScripts(workspace,['npx','-y','@modelcontextprotocol/server-filesystem','docs']),[],'a data folder is not a program');
  const {symlink}=await import('node:fs/promises');
  await mkdir(join(root,'tools'),{recursive:true});await writeFile(join(root,'tools','srv.js'),'a');await mkdir(join(root,'elsewhere'));
  await symlink(join(root,'elsewhere'),join(root,'tools','linked'),'junction');
  const linked=await referencedScripts(workspace,['node','tools/srv.js']);
  assert.ok(linked.some(row=>row.path==='tools/linked'&&row.sha256.startsWith('link:')),JSON.stringify(linked));
});

/* Third review of 0.6.8 (F3): the forms still left open after the second review */
test('folder and package imports, a chain of imports, ../ imports, node . with dist, npm pre scripts and npm start are pinned',async()=>{
  assert.equal(await noticed({'srv.js':'require("./lib")','lib/index.js':'a'},'lib/index.js',{mcp:[{comando:'node',argomenti:['srv.js']}]}),true,'require of a folder');
  assert.equal(await noticed({'package.json':JSON.stringify({main:'dist/index.js'}),'dist/index.js':'a','dist/other.js':'b'},'dist/other.js',{mcp:[{comando:'node',argomenti:['.']}]}),true,'node . pins main\'s folder');
  assert.equal(await noticed({'server.py':'from pkg import mod','pkg/__init__.py':'','pkg/mod.py':'a'},'pkg/mod.py',{mcp:[{comando:'python',argomenti:['server.py']}]}),true,'from pkg import mod');
  assert.equal(await noticed({'package.json':JSON.stringify({scripts:{presrv:'node pre.js',srv:'node srv.js'}}),'pre.js':'a','srv.js':'b'},'pre.js',{mcp:[{comando:'npm',argomenti:['run','srv']}]}),true,'npm runs presrv first');
  assert.equal(await noticed({'package.json':JSON.stringify({name:'x'}),'server.js':'a'},'server.js',{mcp:[{comando:'npm',argomenti:['start']}]}),true,'npm start runs server.js');
  assert.equal(await noticed({'a.js':'require("./b.js")','b.js':'require("./c.js")','c.js':'x'},'c.js',{mcp:[{comando:'node',argomenti:['a.js']}]}),true,'a chain of imports');
  assert.equal(await noticed({'tools/srv.js':'require("../shared/x.js")','shared/x.js':'a'},'shared/x.js',{mcp:[{comando:'node',argomenti:['tools/srv.js']}]}),true,'an import outside the script folder');
});

test('a hook command with a shell operator names nothing (the kernel refuses to run it)',()=>{
  assert.deepEqual(hookCommandTokens('node a.js && evil.js'),[]);
  assert.deepEqual(hookCommandTokens('node "tools/my hook.js" --flag'),['node','tools/my hook.js','--flag']);
});
