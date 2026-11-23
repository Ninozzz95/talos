/* Form B, No (a), Frontend's condition 1: in a folder the person said No to, every change and every command asks, whatever the mode
   or a rule says. What the person refused stays refused, reads inside the project stay free, and a yes given for the session holds. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
const inside=(name:string)=>`${ROOT}${process.platform==='win32'?'\\':'/'}${name}`;
const write={tool:'Write',resource:inside('a.txt')} as any,edit={tool:'Edit',resource:inside('a.txt')} as any;
const command={tool:'Bash',command:'make build',resource:ROOT} as any,listing={tool:'Bash',command:'ls',resource:ROOT} as any;
const read={tool:'Read',resource:inside('a.txt')} as any;
const engine=(rules:any={allow:[],ask:[],deny:[]},askEverything=true)=>createPermissionEngine({projectRoot:ROOT,rules,mode:'default',...(askEverything?{askEverything:true}:{})} as any);
const ctx=(mode:string)=>({interactive:true,mode}) as any;

/* Decision 173 (owner 04/11/2026, replaces 157's «after a No nothing more asks»): after the No, Full access works as Normal here */
for(const mode of ['default','acceptEdits','bypassPermissions']){
  test(`${mode}: a change and a command ask, a read inside the project does not`,async()=>{
    const e=engine();
    for(const action of [write,edit,command,listing])assert.equal((await e.decide(action,ctx(mode))).kind,'ask',`${mode} ${action.tool} ${action.command??''}`);
    assert.equal((await e.decide(read,ctx('default'))).kind,'allow');
  });
}

test('an allow rule of the person\'s profile says no yes here; a deny rule still refuses',async()=>{
  const allow=engine({allow:['Bash(make build)','Write(**)'],ask:[],deny:[]});
  assert.equal((await allow.decide(command,ctx('default'))).kind,'ask');
  const deny=engine({allow:[],ask:[],deny:['Bash(make build)']});
  assert.equal((await deny.decide(command,ctx('bypassPermissions'))).kind,'deny');
});

test('the card says why, and a yes for the session is not asked again for the same command (rule 17b)',async()=>{
  const e=engine();const asked:any=await e.decide(command,ctx('default'));
  assert.equal(asked.kind,'ask');assert.match(asked.reason,/isn't trusted/u);
  await (e as any).resolve(asked.requestId,'allow-session');
  assert.equal((await e.decide(command,ctx('default'))).kind,'allow');
});

test('on the contrary: without the option Full access does not ask',async()=>{
  assert.equal((await engine(undefined,false).decide(write,ctx('bypassPermissions'))).kind,'allow');
});
