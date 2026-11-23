/*
 * R2-F1 of the Desktop's permissions review 2 (cure 208 bis, item 4 of the 06/11/2026 realignment): the folder's trust is read again
 * at every person's send, not once at the start. Trusted at the start in Full access, then the trust is taken away while the
 * conversation is open: the next turn is «On request» for the kernel (its registry asks `fiduciaDellaCartellaFn`) and a command
 * card asks in the CLI's own engine. Codex reads the project's trust level when a turn's settings are built and
 * `set_project_trust_level` changes it for the next turn (codex-rs thread_processor.rs:1479-1505).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFolderTrustCache} from '../../src/runtime/folder-trust.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const ctx={interactive:true,mode:'bypassPermissions'} as any;
const command={tool:'Bash',command:'make build',resource:ROOT} as any;

test('the cache: not asked, trusted, taken away; another folder is not ours to say; the No holds',async()=>{
  let source:boolean|Error=false;
  const cache=createFolderTrustCache({projectRoot:ROOT,read:async()=>{if(source instanceof Error)throw source;return source;}});
  assert.equal(cache.forFolder(ROOT),null,'not asked before the first send');
  assert.equal(await cache.refresh(),null,'a folder never trusted stays «not asked», as before the cure');
  source=true;assert.equal(await cache.refresh(),true);
  assert.equal(cache.forFolder(ROOT),true);
  if(process.platform==='win32')assert.equal(cache.forFolder(ROOT.toLowerCase()),true,'the same folder in another case');
  assert.equal(cache.forFolder(join(ROOT,'..','elsewhere')),null);
  source=false;assert.equal(await cache.refresh(),false,'trust taken away');
  assert.equal(cache.current(),false);
  source=true;await cache.refresh();source=new Error('disk');
  assert.equal(await cache.refresh(),false,'a source that fails counts as not trusted, the kernel\'s rule');
  const no=createFolderTrustCache({projectRoot:ROOT,saidNo:true,read:async()=>true});
  assert.equal(no.forFolder(ROOT),false);assert.equal(await no.refresh(),false,'after the No only /trust starts again');
});

test('red test: trusted at the start in Full access, trust taken away; the next send asks the kernel «On request» and a command asks',async()=>{
  let trusted=true,reads=0;const order:string[]=[];const starts:any[]=[];
  const cache=createFolderTrustCache({projectRoot:ROOT,read:async()=>{reads++;order.push('read');return trusted;}});
  const registry:any={avviaLibero(input:any){order.push('start');starts.push(input);return{sessionId:'s-1'};},iscriviti(){return()=>{};},elenca:()=>[]};
  const runtime=createSessionFacade(registry,{model:'m',beforePersonSend:()=>cache.refresh(),folderTrust:()=>cache.current()});
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode:'bypassPermissions',askEverything:()=>runtime.folderTrust?.()===false});
  await runtime.start({projectRoot:ROOT,prompt:'x',permissionMode:'bypassPermissions'} as any);
  assert.deepEqual(order,['read','start'],'the trust is read before the turn starts');
  assert.equal(cache.forFolder(ROOT),true);
  assert.equal((await engine.decide(command,ctx)).kind,'allow','trusted: Full access runs the command');
  trusted=false;
  await runtime.start({projectRoot:ROOT,prompt:'y',permissionMode:'bypassPermissions'} as any);
  assert.equal(reads,2,'read again at the next send');
  assert.equal(cache.forFolder(ROOT),false,'the kernel\'s registry hears «not trusted» and lowers Full access to «On request»');
  assert.equal(starts[1].permessi,'On request');
  const decision:any=await engine.decide(command,ctx);
  assert.equal(decision.kind,'ask','a command card asks');assert.match(decision.reason,/isn't trusted/u);
});

test('the screen\'s engine reads the runtime\'s trust at every decision',async()=>{
  let trust:boolean|null=true;
  const c:any=createTuiSessionController({runtime:{folderTrust:()=>trust} as any,projectRoot:ROOT,model:'m',mode:'bypassPermissions',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  assert.equal(c.mode(),'bypassPermissions');
  trust=false;
  await c.setMode('bypassPermissions');
  assert.equal(c.mode(),'default','Full access chosen again in a folder no longer trusted holds Normal');
});

test('the trust authority answers what the person trusted and stops when the trust is taken away',async()=>{
  const parent=await mkdtemp(join(tmpdir(),'talos-folder-trust-'));
  const projectRoot=join(parent,'project');const trustRoot=join(parent,'trust');
  await mkdir(join(projectRoot,'.git'),{recursive:true});
  const authority=createTrustAuthority({projectRoot,trustRoot});
  assert.equal(await authority.folderTrusted(),false);
  await authority.trustProject({expected:await authority.inspect()});
  assert.equal(await authority.folderTrusted(),true);
  await authority.revokeProject();
  assert.equal(await authority.folderTrusted(),false);
});
