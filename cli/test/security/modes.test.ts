import assert from 'node:assert/strict';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const projectRoot = process.cwd();

test('dontAsk converts ask to immediate denial', async () => {
  const engine = createPermissionEngine({projectRoot, rules:{allow:[],ask:['Bash(*)'],deny:[]}});
  const decision = await engine.decide({tool:'Bash',command:'npm test'},{interactive:false,mode:'dontAsk'});
  assert.deepEqual(decision, {kind:'deny', code:'PERMISSION_REQUIRED', message:'Operation requires approval in non-interactive mode'});
});

test('acceptEdits auto-allows edits but not Bash', async () => {
  const engine = createPermissionEngine({projectRoot, rules:{allow:[],ask:['Bash(*)'],deny:[]}});
  assert.equal((await engine.decide({tool:'Edit',resource:'src/a.ts'},{interactive:true,mode:'acceptEdits'})).kind,'allow');
  assert.equal((await engine.decide({tool:'Bash',command:'npm test'},{interactive:true,mode:'acceptEdits'})).kind,'ask');
});

test('plan denies writes even if rule allows them', async () => {
  const engine = createPermissionEngine({projectRoot, rules:{allow:['Write(*)'],ask:[],deny:[]}});
  assert.equal((await engine.decide({tool:'Write',resource:'src/a.ts'},{interactive:true,mode:'plan'})).kind,'deny');
});

/* Decision 157 (owner 04/11/2026): Full access writes outside the project, as Claude Code's bypassPermissions; every other mode keeps the boundary */
test('only bypassPermissions lifts the hard path boundary for a write', async () => {
  const engine = createPermissionEngine({projectRoot, rules:{allow:['Write(*)'],ask:[],deny:[]}});
  assert.equal((await engine.decide({tool:'Write',resource:'../outside.ts'},{interactive:true,mode:'bypassPermissions'})).kind,'allow');
  for (const mode of ['default','acceptEdits'] as const) assert.equal((await engine.decide({tool:'Write',resource:'../outside.ts'},{interactive:true,mode})).kind,'deny',mode);
});

test('auto without classifier is unavailable', () => {
  assert.throws(() => createPermissionEngine({projectRoot, mode:'auto', rules:{allow:[],ask:[],deny:[]}}), /PERMISSION_AUTO_UNAVAILABLE/);
});
test('allow-always and deny-always persist through callback',async()=>{const persisted:any[]=[];const {createPermissionEngine}=await import('../../src/security/permission-engine.ts');const engine=createPermissionEngine({projectRoot:process.cwd(),rules:{allow:[],ask:[],deny:[]},persistRule:async(effect:any,action:any)=>{persisted.push([effect,action]);}} as any);const a={tool:'Bash',command:'npm test'} as const;const d=await engine.decide(a,{interactive:true,mode:'default'});assert.equal(d.kind,'ask');if(d.kind==='ask')await engine.resolve(d.requestId,'allow-always');const d2=await engine.decide({tool:'Bash',command:'rm x'} as const,{interactive:true,mode:'default'});if(d2.kind==='ask')await engine.resolve(d2.requestId,'deny-always');assert.deepEqual(persisted.map(x=>x[0]),['allow','deny']);});

test('plan permits read-only shell exploration and denies mutating or ambiguous shell commands',async()=>{
  const engine=createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}});
  assert.equal((await engine.decide({tool:'Bash',command:'git diff -- src/a.ts'},{interactive:true,mode:'plan'})).kind,'allow');
  const mutating=await engine.decide({tool:'Bash',command:'npm test'},{interactive:true,mode:'plan'});
  assert.equal(mutating.kind,'deny');
});

test('bypassPermissions does not bypass an explicit ask rule',async()=>{
  const engine=createPermissionEngine({projectRoot,rules:{allow:[],ask:['Bash(git status)'],deny:[]}});
  assert.equal((await engine.decide({tool:'Bash',command:'git status'},{interactive:true,mode:'bypassPermissions'})).kind,'ask');
  assert.equal((await engine.decide({tool:'Bash',command:'git status'},{interactive:false,mode:'bypassPermissions'})).kind,'deny');
});


test('acceptEdits respects explicit ask rules and only auto-allows safe project filesystem commands',async()=>{
  const strict=createPermissionEngine({projectRoot,rules:{allow:[],ask:['Edit(*)','Bash(mkdir:*)'],deny:[]}});
  assert.equal((await strict.decide({tool:'Edit',resource:'src/a.ts'},{interactive:true,mode:'acceptEdits'})).kind,'ask');
  assert.equal((await strict.decide({tool:'Bash',command:'mkdir build'},{interactive:true,mode:'acceptEdits'})).kind,'ask');
  const normal=createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}});
  assert.equal((await normal.decide({tool:'Bash',command:'mkdir -p build/cache'},{interactive:true,mode:'acceptEdits'})).kind,'allow');
  assert.equal((await normal.decide({tool:'Bash',command:'rm -rf build/cache'},{interactive:true,mode:'acceptEdits'})).kind,'allow');
  assert.equal((await normal.decide({tool:'Bash',command:'mv src/a.ts ../outside.ts'},{interactive:true,mode:'acceptEdits'})).kind,'ask');
});

test('auto mode does not override an explicit ask rule even when classifier would allow it',async()=>{
  const engine=createPermissionEngine({projectRoot,rules:{allow:[],ask:['Write(*)'],deny:[]},mode:'auto',classifier:async()=> 'allow'});
  assert.equal((await engine.decide({tool:'Write',resource:'src/a.ts'},{interactive:true,mode:'auto'})).kind,'ask');
});

test('protected project metadata is never auto-approved except in bypassPermissions',async()=>{
  const classifier=async()=> 'allow' as const;
  const accept=createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]}});
  assert.equal((await accept.decide({tool:'Write',resource:'.git/config'},{interactive:true,mode:'acceptEdits'})).kind,'ask');
  const automatic=createPermissionEngine({projectRoot,rules:{allow:[],ask:[],deny:[]},mode:'auto',classifier});
  assert.equal((await automatic.decide({tool:'Edit',resource:'.talos-cli/config.json'},{interactive:true,mode:'auto'})).kind,'ask');
  assert.equal((await accept.decide({tool:'Write',resource:'.git/config'},{interactive:true,mode:'bypassPermissions'})).kind,'allow');
});
