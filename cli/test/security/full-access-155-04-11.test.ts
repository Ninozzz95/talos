/*
 * Owner's decisions 155, 157 and 158 (04/11/2026): Full access is Claude Code's bypassPermissions. In it the CLI says yes, on the
 * screen and with nobody in front (`talos -p --permission-mode bypassPermissions`), to:
 *   - a write outside the project (157; before, PATH_NOT_ALLOWED in every mode);
 *   - a command that runs as root in WSL (157, it was decision 41);
 *   - a network path (157, it was owner 02/10);
 *   - the kernel's provider_exclude and provider_allow, going on after the model went round in circles, and signing out of ChatGPT
 *     (158).
 * What stays the person's in Full access too: a deep research (it spends money, 158), a call a local model wrote as text
 * (`semprePersona`, decision 121: a defence against fake text, not a permission), reading this computer's login credentials, and a
 * deny rule. Every other mode is unchanged.
 * Source: Claude Code docs, «Permission modes» (code.claude.com/docs/en/permission-modes, read 04/11 by the Desktop): in
 * bypassPermissions only rm on critical paths and explicit `ask` rules prompt; Hermes tools/approval.py:1051-1072 (`_floor_block`):
 * only the floor stands before yolo.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const ROOT=process.platform==='win32'?'C:\\project':'/project';
/* riga 202 (0.6.18): Windows not following a share's links back here (its default), from a fake reader: nothing is run
   (remote-to-local-links.test.ts covers the other answers) */
const engine=(mode:string,rules:any={allow:[],ask:[],deny:[]})=>createPermissionEngine({projectRoot:ROOT,rules,mode,remoteToLocalLinks:()=>'off'} as any);
const card=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione:{toolCallId:'c',...azione}} as any);

const FREE:Record<string,()=>any>={
  'a write outside the project':()=>({tool:'Write',resource:path.join(ROOT,'..','other','notes.txt')}),
  'a command as root in WSL':()=>card({tipo:'shell',comando:'wsl -u root apt-get install x',wslRoot:{distro:'Ubuntu',utente:'root',sceltoDalComando:true}}),
  'a network path':()=>card({tipo:'leggi',percorso:'\\\\files.example\\share\\notes.txt',percorsoDiRete:{ospite:'files.example',frase:'x',via:'stringa'}}),
  'provider_exclude':()=>card({tipo:'provider_exclude',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:[],dopo:['deepinfra']}]}),
  'provider_allow':()=>card({tipo:'provider_allow',fornitore:'deepinfra',cambi:[{campo:'persona',modello:null,prima:['deepinfra'],dopo:[]}]}),
  'going on after the model went round in circles':()=>card({tipo:'giri-in-tondo',strumento:'leggi',volte:5}),
  'signing out of ChatGPT':()=>card({tipo:'chatgpt_account',fornitore:'chatgpt',email:'nino@example.com'}),
};

for(const [name,action] of Object.entries(FREE)){
  test(`Full access says yes to ${name}, on the screen and with nobody in front; other modes are unchanged`,async()=>{
    for(const interactive of [true,false]){
      const d:any=await engine('bypassPermissions').decide(action(),{interactive,mode:'bypassPermissions'} as any);
      assert.equal(d.kind,'allow',`${interactive?'screen':'nobody'}: ${JSON.stringify(d)}`);
    }
    const before:any=await engine('default').decide(action(),{interactive:true,mode:'default'} as any);
    assert.notEqual(before.kind,'allow',`default mode: ${JSON.stringify(before)}`);
  });
}

test('in Full access a deny rule still refuses, and an ask rule the person wrote still asks',async()=>{
  const wsl=FREE['a command as root in WSL']!;
  assert.equal((await engine('bypassPermissions',{allow:[],ask:[],deny:['Bash(wsl:*)']}).decide(wsl(),{interactive:true,mode:'bypassPermissions'} as any)).kind,'deny');
  assert.equal((await engine('bypassPermissions',{allow:[],ask:['Bash(wsl:*)'],deny:[]}).decide(wsl(),{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask');
  /* and what it asks is the root card itself, with its reason and, with nobody in front, its own code */
  const asked:any=await engine('bypassPermissions',{allow:[],ask:['Bash(wsl:*)'],deny:[]}).decide(wsl(),{interactive:true,mode:'bypassPermissions'} as any);
  assert.match(String(asked.reason),/root/u,JSON.stringify(asked));
  const nobody:any=await engine('bypassPermissions',{allow:[],ask:['Bash(wsl:*)'],deny:[]}).decide(wsl(),{interactive:false,mode:'bypassPermissions'} as any);
  assert.equal(nobody.code,'WSL_ROOT_NEEDS_PERSON',JSON.stringify(nobody));
});

/* decision 173 (owner 04/11/2026) replaces 157's «then nothing»: after the No, Full access works as Normal there */
test('a folder the person did not trust: after the No, Full access asks as Normal does; other modes ask',async()=>{
  const write={tool:'Write',resource:path.join(ROOT,'src','a.ts')};
  const untrusted=(mode:string)=>createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:[]},mode,askEverything:true} as any);
  assert.equal((await untrusted('bypassPermissions').decide(write as any,{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask');
  assert.equal((await untrusted('acceptEdits').decide(write as any,{interactive:true,mode:'acceptEdits'} as any)).kind,'ask');
});

test('in Full access a deny rule the person wrote for a path outside the project still refuses the write there',async()=>{
  const outside=FREE['a write outside the project']!();
  /* file rules match the path relative to the project, and a `./`/`../` pattern never reaches outside it (evaluate.ts `matches`):
     the rule that names a write outside is the person's catch-all */
  const deny='Write(*)';
  const d:any=await engine('bypassPermissions',{allow:[],ask:[],deny:[deny]}).decide(outside,{interactive:true,mode:'bypassPermissions'} as any);
  assert.equal(d.kind,'deny',JSON.stringify(d));
});

test('in Full access a deep research, a call written as text and reading a login credential stay the person\'s',async()=>{
  const research=card({tipo:'research_start',question:'q',frase:'about 1 $'});
  const fromText=card({tipo:'scrivi',percorso:'a.txt',semprePersona:true,nome:'scrivi'});
  const credential={tool:'Read',resource:path.join(process.platform==='win32'?'C:\\Users\\someone':'/home/someone','.ssh','id_ed25519'),homeCredential:true};
  for(const [name,action] of [['research',research],['text call',fromText],['credential',credential]] as const){
    assert.equal((await engine('bypassPermissions').decide(action as any,{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask',name);
    assert.equal((await engine('bypassPermissions').decide(action as any,{interactive:false,mode:'bypassPermissions'} as any)).kind,'deny',name);
  }
});
