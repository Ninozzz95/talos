/*
 * 20/10/2026 (owner 17/10/2026 «Curare come gli hook, insieme alla CLI», «Stessa regola, una nuova fiducia»): the CLI's rule «which
 * project files a hook or MCP command line runs» moved from its own copy to the shared kernel module harness-ui/src/script-del-progetto.mjs.
 * Trusts the owner already saved must stay valid, so the new wiring is held against the OLD copy (shared-script-rule.before.ts, the
 * HEAD 15842067f code) byte for byte: the {path, sha256} rows and the content pinned for a hook and an MCP row. The only differences
 * allowed are the owner's choice 1 of 17/10 (module header) and the CLI's own finding of 20/10 on it (probe-junction-main2): a file
 * reached through a junction that points OUTSIDE the project is pinned under its written name, and such a folder whose `main` climbs
 * back into the project pins that project file; a `main` that points outside is skipped, as before. Each is asserted explicitly.
 * 0.6.12 (r4 c44221b51, 368df4e6e, ca3d88ba5, 89e5ed948): a file so pinned has its imports followed (owner 21/10 «Seguirli»; JS
 * from its real path as Node resolves them, Python from the written name), and a script IMPORTED through such a link is pinned
 * the same way (`pkg/__init__.py` for a Python package). Projects without links keep the rows of 0.6.10 byte for byte, except
 * the Python forms now read as Python runs them (`import a, b`, dotted names on a package with `__init__.py`, relative imports;
 * CHANGELOG 0.6.12), which these JavaScript fixtures do not use.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdir,mkdtemp,readlink,rm,symlink,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test,{mock} from 'node:test';
import {MAX_SCRIPT_FOLDER_FILES,hookCommandTokens,hookSemanticContent,mcpSemanticContent,referencedScripts} from '../../src/security/project-resource-inventory.ts';
import * as before from './shared-script-rule.before.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import {findTalosRepoRoot,importTalosModule} from '../../src/runtime/repo.ts';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const made:string[]=[];
test.after(async()=>{for(const root of made)await rm(root,{recursive:true,force:true});});
async function project(files:Record<string,string>={}){
  const root=await mkdtemp(join(tmpdir(),'talos-shared-rule-'));made.push(root);
  for(const [name,content] of Object.entries(files)){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),content);}
  return root;
}
const workspaceOf=(root:string)=>resolveWorkspaceIdentity({projectRoot:root});
async function both(root:string,tokens:string[],options:{maxFolderFiles?:number}={}){
  const workspace=await workspaceOf(root);
  return{old:JSON.stringify(await before.referencedScripts(workspace,tokens,options)),now:JSON.stringify(await referencedScripts(workspace,tokens,options))};
}
async function same(root:string,tokens:string[],options:{maxFolderFiles?:number}={}){
  const {old,now}=await both(root,tokens,options);assert.equal(now,old,`${tokens.join(' ')} pins what it pinned before`);return JSON.parse(now) as {path:string;sha256:string}[];
}
async function sameHook(root:string,comando:string){
  const workspace=await workspaceOf(root);const row={eventi:['PreToolUse'],comando};
  assert.equal(JSON.stringify(await hookSemanticContent(workspace,row)),JSON.stringify(await before.hookSemanticContent(workspace,row)),comando);
}
async function sameMcp(root:string,comando:string,argomenti:string[],allowlist=['echo']){
  const workspace=await workspaceOf(root);const row={comando,argomenti,allowlist};
  assert.equal(JSON.stringify(await mcpSemanticContent(workspace,row)),JSON.stringify(await before.mcpSemanticContent(workspace,row)),`${comando} ${argomenti.join(' ')}`);
}

test('the cases of the two trust-pins tests pin exactly what they pinned before',async()=>{
  const r=await project({'srv.cjs':'console.log("V1")\n','tools/hk.cjs':'console.log("hook V1")\n'});
  assert.deepEqual((await same(r,['node','srv.cjs','--port=9','https://example.invalid/sse','../outside.js'])).map(row=>row.path),['srv.cjs']);
  await sameMcp(r,'node',['srv.cjs','--port=9']);await sameMcp(r,'npx',['-y','some-mcp-server','https://example.invalid/sse']);
  await sameHook(r,'node "tools/hk.cjs" --flag');
  await same(await project({'my srv.cjs':'a','srv.cjs':'b'}),['node','my srv.cjs']);
  await sameHook(await project({'hk.cjs':'a'}),'node h"k.cj"s');
  await same(await project({'srv.js':'a'}),['node','srv']);
  await same(await project({'srv.cjs':'require("./lib.cjs")','lib.cjs':'a'}),['node','srv.cjs']);
  await same(await project({'tools/mcp/server.js':'require("./deep/util.js")','tools/mcp/deep/util.js':'a','tools/mcp/deep/more.js':'b'}),['node','tools/mcp/server.js']);
  await same(await project({'tools/mcp/server.js':'a','tools/mcp/node_modules/x/index.js':'b'}),['node','tools/mcp/server.js']);
  await same(await project({'package.json':JSON.stringify({main:'main.js'}),'main.js':'a'}),['node','.']);
  await same(await project({'pkg/__main__.py':'a','pkg/util.py':'b'}),['python','-m','pkg']);
  await same(await project({'package.json':JSON.stringify({scripts:{start:'node scripts/serve.js'}}),'scripts/serve.js':'a'}),['npm','run','start']);
  await same(await project({'x.mjs':'a','srv.cjs':'b'}),['node','-r./x.mjs','srv.cjs']);
  assert.ok((await same(await project({'tools/a.js':'a','tools/b.js':'b','tools/c.js':'c'}),['node','tools/a.js'],{maxFolderFiles:2})).some(row=>row.sha256==='not-checked:more-than-2-files'));
  const v=await project({'mcp-server/server.py':'import util','mcp-server/util.py':'a','mcp-server/.venv/pyvenv.cfg':'home=x','mcp-server/.venv/Lib/site.py':'b','mcp-server/env2/pyvenv.cfg':'x','mcp-server/env2/big.py':'c','docs/a.md':'a','docs/b.md':'b','tools/srv.js':'a'});
  assert.deepEqual((await same(v,['python','mcp-server/server.py'])).map(row=>row.path),['mcp-server/server.py','mcp-server/util.py']);
  assert.deepEqual(await same(v,['npx','-y','@modelcontextprotocol/server-filesystem','docs']),[]);
  await mkdir(join(v,'elsewhere'));await symlink(join(v,'elsewhere'),join(v,'tools','linked'),'junction');
  assert.ok((await same(v,['node','tools/srv.js'])).some(row=>row.path==='tools/linked'&&row.sha256.startsWith('link:')));
  await same(await project({'srv.js':'require("./lib")','lib/index.js':'a'}),['node','srv.js']);
  await same(await project({'package.json':JSON.stringify({main:'dist/index.js'}),'dist/index.js':'a','dist/other.js':'b'}),['node','.']);
  await same(await project({'server.py':'from pkg import mod','pkg/__init__.py':'','pkg/mod.py':'a'}),['python','server.py']);
  await same(await project({'package.json':JSON.stringify({scripts:{presrv:'node pre.js',srv:'node srv.js'}}),'pre.js':'a','srv.js':'b'}),['npm','run','srv']);
  await same(await project({'package.json':JSON.stringify({name:'x'}),'server.js':'a'}),['npm','start']);
  await same(await project({'a.js':'require("./b.js")','b.js':'require("./c.js")','c.js':'x'}),['node','a.js']);
  await same(await project({'tools/srv.js':'require("../shared/x.js")','shared/x.js':'a'}),['node','tools/srv.js']);
});

test('the other forms of the rule pin exactly what they pinned before',async()=>{
  assert.equal((await same(await project({'x.js':'a'}),['node','x.js'])).length,1);
  assert.deepEqual((await same(await project({'srv/package.json':JSON.stringify({main:'lib/run.js'}),'srv/lib/run.js':'a','srv/other.txt':'b'}),['node','srv'])).map(row=>row.path),['srv/lib/run.js']);
  assert.ok((await same(await project({'pkg/__init__.py':'','pkg/mod.py':'from . import helper','pkg/helper.py':'x'}),['python','-m','pkg.mod'])).length>=2);
  assert.deepEqual((await same(await project({'package.json':JSON.stringify({scripts:{prex:'node a.js',x:'node b.js && node c.js',postx:'node d.js'}}),'a.js':'a','b.js':'b','c.js':'c','d.js':'d'}),['npm','run','x'])).map(row=>row.path),['a.js','b.js','c.js','d.js','package.json']);
  assert.equal((await same(await project({'x.cjs':'a','srv.cjs':'b'}),['node','--require=./x.cjs','srv.cjs'])).length,2);
  assert.equal((await same(await project({'s/main.mjs':'import "./a.mjs"; import("../b.mjs")','s/a.mjs':'export * from "./c.mjs"','s/c.mjs':'c','b.mjs':'import x from "./d.mjs"','d.mjs':'d'}),['node','s/main.mjs'])).length,5);
  assert.ok((await same(await project({'t/a.js':'a','t/b.js':'b','t/c.js':'c','t/d.js':'d','t/e.js':'e'}),['node','t/a.js'],{maxFolderFiles:3})).some(row=>row.sha256==='not-checked:more-than-3-files'));
  /* a junction that stays inside the project: one name only, the real path's (choice 2 of 17/10, the CLI's name since 0.6.8) */
  const j=await project({'real/y.mjs':'import "./z.mjs"','real/z.mjs':'z','real/w.mjs':'w'});await symlink(join(j,'real'),join(j,'j'),'junction');
  assert.deepEqual((await same(j,['node','j/y.mjs'])).map(row=>row.path),['real/w.mjs','real/y.mjs','real/z.mjs']);
  await same(j,['node','j/y']);
  /* a shell operator names nothing; an MCP row's arguments, flags included */
  await sameHook(await project({'a.js':'a','evil.js':'e'}),'node a.js && node evil.js');
  await sameMcp(await project({'srv/index.js':'require("./h.js")','srv/h.js':'h','cfg.json':'{}'}),'node',['srv','--config=cfg.json','-y'],['a','b']);
});

test('a file through a junction that points OUTSIDE is now pinned under its written name (owner choice 1 of 17/10)',async()=>{
  const out=await project({'pkg/y.mjs':'import "./z.mjs"','pkg/z.mjs':'z'});const r=await project({'own.js':'o'});
  await symlink(join(out,'pkg'),join(r,'j'),'junction');
  const {old,now}=await both(r,['node','j/y.mjs']);
  assert.equal(old,'[]','the old rule dropped it: its real path is outside');
  /* 0.6.12 (owner 21/10/2026 «Seguirli», r4 ca3d88ba5): its imports are followed in the written names (z.mjs beside it), still no
     folder walk (own.js is not pinned) */
  assert.equal(now,JSON.stringify([{path:'j/y.mjs',sha256:sha('import "./z.mjs"')},{path:'j/z.mjs',sha256:sha('z')}]),'its import followed, no folder walk');
});

test('a folder through an outward junction whose main climbs back into the project pins that project file; a main outside is skipped',async()=>{
  const out=await project({'pkg/package.json':JSON.stringify({main:'../evil.js'})});const r=await project({'a/evil.js':'project file'});
  await symlink(join(out,'pkg'),join(r,'a','j'),'junction');
  const {old,now}=await both(r,['node','a/j']);
  assert.equal(old,'[]');
  /* node resolves `main` from the written folder (a/j/../evil.js = a/evil.js): a project file it really runs, pinned with its folder as any entry */
  assert.equal(now,JSON.stringify([{path:'a/evil.js',sha256:sha('project file')},{path:'a/j',sha256:'link:'+await readlink(join(r,'a','j'))}]));
  const far=await project({'far.js':'far'});
  const abs=await project({'pkg/package.json':JSON.stringify({main:join(far,'far.js')})});const r2=await project({'own.js':'o'});
  await symlink(join(abs,'pkg'),join(r2,'k'),'junction');
  assert.deepEqual(await same(r2,['node','k']),[],'a main that points outside the project is not a project script');
});

test('inside a sandbox that refuses the native realpath the rule still resolves, through the CLI realpath it is handed',async t=>{
  const r=await project({'tools/srv.js':'require("./lib.js")','tools/lib.js':'x'});
  const workspace=await workspaceOf(r);
  const eperm=()=>Object.assign(new Error('EPERM: operation not permitted, realpath (test)'),{code:'EPERM'});
  const a=mock.method(fs.promises,'realpath',async()=>{throw eperm();});const b=mock.method(fs.realpathSync,'native',()=>{throw eperm();});
  syncBuiltinESMExports();t.after(()=>{a.mock.restore();b.mock.restore();syncBuiltinESMExports();});
  const old=JSON.stringify(await before.referencedScripts(workspace,['node','tools/srv.js']));
  assert.equal(JSON.stringify(await referencedScripts(workspace,['node','tools/srv.js'])),old);
  assert.equal(JSON.parse(old).length,2);
  /* the hook and MCP contents hand it the same realpath */
  const hook={eventi:['PreToolUse'],comando:'node tools/srv.js'};const server={comando:'node',argomenti:['tools/srv.js'],allowlist:['echo']};
  assert.equal(JSON.stringify(await hookSemanticContent(workspace,hook)),JSON.stringify(await before.hookSemanticContent(workspace,hook)));
  assert.equal(JSON.stringify(await mcpSemanticContent(workspace,server)),JSON.stringify(await before.mcpSemanticContent(workspace,server)));
  assert.match(JSON.stringify(await mcpSemanticContent(workspace,server)),/tools\/lib\.js/u);
});

test('the process hash memory never hides an edit, and the synchronous exports are the shared module\'s',async()=>{
  const r=await project({'srv.js':'AAAA'});const workspace=await workspaceOf(r);
  const first=await referencedScripts(workspace,['node','srv.js']);
  await writeFile(join(r,'srv.js'),'BBBB');
  const second=await referencedScripts(workspace,['node','srv.js']);
  assert.equal(second[0]!.sha256,sha('BBBB'));assert.notEqual(second[0]!.sha256,first[0]!.sha256);
  assert.equal(JSON.stringify(second),JSON.stringify(await before.referencedScripts(workspace,['node','srv.js'])));
  const shared:any=await importTalosModule(findTalosRepoRoot(),'script-del-progetto.mjs');
  assert.equal(MAX_SCRIPT_FOLDER_FILES,shared.MAX_SCRIPT_FOLDER_FILES);
  for(const command of ['node a.js && evil.js','node "tools/my hook.js" --flag','node h"k.cj"s','  python  -m  pkg  ','node "a\\"b.js"','node "open','node a.js | x','node a.js;b','node (a)','node a.js > out','cmd /c "x y"','node \\path\\a.js','',' ','node "C:\\\\x\\\\y.js"','node a\0b'])
    assert.deepEqual(hookCommandTokens(command),shared.hookCommandTokens(command),JSON.stringify(command));
});

test('the real tree: node harness-ui/server.mjs on this checkout pins the same rows, timed',async t=>{
  const checkout=resolve(dirname(fileURLToPath(import.meta.url)),'..','..','..');
  if(!fs.existsSync(join(checkout,'harness-ui','server.mjs'))){t.skip('not a monorepo checkout');return;}
  const workspace=await workspaceOf(checkout);const tokens=['node','harness-ui/server.mjs'];
  let start=performance.now();const old=JSON.stringify(await before.referencedScripts(workspace,tokens));const oldMs=performance.now()-start;
  start=performance.now();const now=JSON.stringify(await referencedScripts(workspace,tokens));const nowMs=performance.now()-start;
  start=performance.now();const again=JSON.stringify(await referencedScripts(workspace,tokens));const warmMs=performance.now()-start;
  assert.equal(now,old);assert.equal(again,old);
  t.diagnostic(`real tree: ${JSON.parse(old).length} rows; old ${oldMs.toFixed(0)} ms, shared ${nowMs.toFixed(0)} ms, shared again ${warmMs.toFixed(0)} ms`);
});
