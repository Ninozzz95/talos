/*
 * Owner's decision 173 (04/11/2026, through the Desktop): in Full access a folder that is not trusted is asked once, «Do you trust
 * this folder?»; after a No the session stays open and in that folder works as Normal («Ask before edits»), and one line says so.
 * It replaces decision 157's «after a No nothing more asks there».
 * Sources: Codex core/src/config/mod.rs:3708-3716 (an untrusted project defaults to asking, `UnlessTrusted`, and a read-only
 * profile); Hermes agent/skill_utils.py:599 and agent/lsp/servers.py:160 (an untrusted workspace loads no project code, the
 * approval mode is not lifted by it).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine,modeInUntrustedFolder} from '../../src/security/permission-engine.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {t} from '../../src/i18n/index.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const inside=(name:string)=>`${ROOT}${process.platform==='win32'?'\\':'/'}${name}`;
const outside=process.platform==='win32'?'C:\\elsewhere\\a.txt':'/elsewhere/a.txt';
const ctx={interactive:true,mode:'bypassPermissions'} as any;

test('Full access in a folder said No to is Normal; every other mode, and a trusted folder, keep theirs',()=>{
  assert.equal(modeInUntrustedFolder('bypassPermissions',true),'default');
  for(const mode of ['default','acceptEdits','plan','auto','dontAsk'] as const)assert.equal(modeInUntrustedFolder(mode,true),mode);
  assert.equal(modeInUntrustedFolder('bypassPermissions',false),'bypassPermissions');
});

test('the engine: after the No, Full access asks a change and a command, and refuses a write outside the project, as Normal does',async()=>{
  const e=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode:'bypassPermissions',askEverything:true} as any);
  for(const action of [{tool:'Write',resource:inside('a.txt')},{tool:'Edit',resource:inside('a.txt')},{tool:'Bash',command:'make build',resource:ROOT}]){
    const d:any=await e.decide(action as any,ctx);assert.equal(d.kind,'ask',`${action.tool}`);assert.match(d.reason,/isn't trusted/u);
  }
  assert.equal((await e.decide({tool:'Write',resource:outside} as any,ctx)).kind,'deny');
  assert.equal((await e.decide({tool:'Read',resource:inside('a.txt')} as any,ctx)).kind,'allow');
});

test('the session: started in Full access, or switched to it, it holds Normal in this folder',async()=>{
  const c:any=createTuiSessionController({askEverything:true,runtime:{} as any,projectRoot:ROOT,model:'m',mode:'bypassPermissions',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  assert.equal(c.mode(),'default');
  await c.setMode('acceptEdits');assert.equal(c.mode(),'acceptEdits');
  await c.setMode('bypassPermissions');assert.equal(c.mode(),'default');
  const trusted:any=createTuiSessionController({runtime:{} as any,projectRoot:ROOT,model:'m',mode:'bypassPermissions',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  assert.equal(trusted.mode(),'bypassPermissions');
});

test('one line says it, within 80 columns',()=>{
  const line=t('screen.trust.fixedLine.fullAccess' as any);
  assert.match(line,/Full access/u);assert.match(line,/asks before edits/u);assert.match(line,/\/trust/u);
  assert.ok(line.length<=80,`${line.length}`);
});
