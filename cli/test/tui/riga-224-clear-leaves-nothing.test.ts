/*
 * Riga 224 (owner 22/11/2026 16:56: «Se inizio una nuova sessione non rimane altro di un'altra sessione … deve essere legata a
 * QUELLA sessione»). What /clear («Start a new conversation») leaves behind of the conversation before it:
 *   T2  Full access: the new conversation starts in Ask before edits, as /resume and /fork already do, and Full access asks its
 *       confirmation again (a new session).
 *   T3  the footer's tokens and context of the conversation before.
 *   T4  the delegated agents and the last turn's line of the conversation before.
 * Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createProjectTrustService} from '../../src/security/project-trust.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';
import type {TuiState} from '../../src/tui/state.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B';
let n=0;const project=()=>{const root=join(env.root,`riga224-${++n}`);mkdirSync(root,{recursive:true});return root;};
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

async function newConversation(app:Awaited<ReturnType<typeof mountR5a>>){
  await app.type('/clear');app.press(ENTER);await app.waitFor('the sheet',x=>/── Clear ─/u.test(x.text));
  app.press(DOWN);app.press(ENTER);
  await app.waitFor('the new conversation',x=>/New conversation · the previous one is in \/resume/u.test(flat(x.lines)));
}

test('riga 224, T2: after /clear the new conversation does not start in Full access',async()=>{
  const modes:unknown[]=[];
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths,
    props:{invocation:{model:'ollama:qwen3-coder-test',permissionMode:'bypassPermissions',resume:'s1'}},
    runtimeExtra:{start:async(x:any)=>{modes.push(x?.permissionMode);return 's9';}}});
  try{
    await newConversation(app);
    await app.type('hello again');app.press(ENTER);
    for(let i=0;i<80&&!modes.length;i++)await sleep(25);
    assert.equal(modes.length,1,'a new session started');
    assert.notEqual(modes[0],'bypassPermissions','the first message of the new conversation ran in Full access, never confirmed for it');
    /* and Full access asks its confirmation again there: Default → Accept edits → Plan → Full access */
    for(let i=0;i<3;i++){app.press('\x1b[Z');await sleep(150);}
    await app.waitFor('the confirmation of Full access',x=>/Enable Full access\?/u.test(x.text));
  }finally{app.unmount();}
});

/* Judge v2579 (security review of 22/11, P3): the trust «for this session only» of the folder, given at the start, stays for the
   process, as in e0b34b088. /clear must not take it away: /trust cannot give it back without a restart (app.ts, `projectUntrusted`). */
test('riga 224: after /clear the trust «for this session only» given at the start is still there, and /trust has nothing to give back',async()=>{
  const root=project();
  const service=createProjectTrustService({trustRoot:env.paths.trust.projects});const workspace=await resolveWorkspaceIdentity({projectRoot:root});
  await service.trust(workspace,[],[],{session:true});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await newConversation(app);
    assert.equal(service.hasSession(workspace),true,'after /clear the new conversation lost the trust, and only a restart gives it back');
    await app.type('/trust');app.press(ENTER);
    await app.waitFor('the answer of /trust',x=>/nothing to change/u.test(flat(x.lines)));
    assert.equal(service.hasSession(workspace),true);
  }finally{app.unmount();service.forgetSession(workspace);}
});

test('riga 224, T3 and T4: after /clear the footer has no tokens and no agents of the conversation before',async()=>{
  const app=await mountR5a({cols:120,rows:40,root:project(),paths:env.paths});
  try{
    const at=new Date().toISOString();
    app.emit('run.started',{runId:'r1'});
    app.emit('agent.changed',{childId:'k1',parentId:'s1',reason:'created',kind:'lifecycle',status:'running',task:'Audit the dependencies',startedAt:at});
    app.emit('usage.updated',{value:{promptTokens:91_234,completionTokens:4_321}});
    app.emit('run.completed',{runId:'r1'});
    const before=await app.waitFor('tokens and the agent',x=>/↑91\.2k/u.test(x.text)&&/1 agent working/u.test(x.text)&&/Done in/u.test(x.text));
    await newConversation(app);
    const after=await app.settle();
    assert.doesNotMatch(after.text,/↑91\.2k/u,`the tokens of the conversation before stayed\nBEFORE\n${before.text}\nAFTER\n${after.text}`);
    assert.doesNotMatch(after.text,/\d agents? working|← \d agent|Audit the dep/u,`the agents of the conversation before stayed\n${after.text}`);
    assert.doesNotMatch(after.text,/Done in/u,`the last turn of the conversation before stayed\n${after.text}`);
  }finally{app.unmount();}
});

/* The one place a conversation's view starts (T3, T4): every field of the state is empty there, except the few the screen keeps
   on purpose. A field added to TuiState later starts empty too, unless it is named here. */
test('riga 224: freshConversationView keeps only the screen\'s own settings and the run\'s control',async()=>{
  const {freshConversationView,initialTuiState}=await import('../../src/tui/state.ts') as any;
  const KEPT=['sessionId','running','sentAt','waitingForPerson','turnStartedAt','approval'];
  const base=initialTuiState({model:'m',permissionMode:'acceptEdits'});
  const dirty=Object.fromEntries(Object.keys(base).map(key=>[key,{dirty:key}])) as unknown as TuiState;
  (dirty as any).status={model:'m2',permissionMode:'plan',branch:'main',contextLabel:'40% context'};(dirty as any).reasoningTitle='Thinking';
  const fresh=freshConversationView(dirty) as any;
  for(const key of Object.keys(base)){
    if(key==='status')continue;
    if(KEPT.includes(key))assert.deepEqual(fresh[key],(dirty as any)[key],`${key} is kept`);
    else assert.deepEqual(fresh[key],key==='transcript'?fresh[key]:(base as any)[key],`${key} starts empty`);
  }
  assert.notDeepEqual(fresh.transcript,(dirty as any).transcript);
  assert.equal(fresh.reasoningTitle,undefined);
  assert.deepEqual(fresh.status,{model:'m2',permissionMode:'plan',branch:'main',contextLabel:null});
});
