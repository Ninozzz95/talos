import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createTuiSessionController} from '../../src/tui/session-controller.ts';
function runtime(){const sinks=new Map<string,(e:any)=>void>();const answers:any[]=[];let resumed:any=null;const compacted:string[]=[];const r:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'old'}],export:()=>({eventi:[]}),start:async()=> 'new',resume:async(id:string,prompt?:string)=>{resumed={id,prompt};return id;},fork:async()=> 'forked',compact:async(id:string)=>{compacted.push(id);return{ok:true,compattato:true};},subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async(...x:any[])=>answers.push(x),cancel:async()=>{},close:async()=>{}};return{r,sinks,answers,compacted,get resumed(){return resumed;}};}
test('controller resumes last and translates replayed events',async()=>{const f=runtime();const events:any[]=[];const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:e=>events.push(e)} as any);const id=await c.initialize({resume:'last',initialPrompt:'continue'});assert.equal(id,'old');assert.deepEqual(f.resumed,{id:'old',prompt:'continue'});f.sinks.get('old')?.({type:'TextMessageContent',messageId:'m',delta:'x'});assert.equal(events[0].type,'message.delta');});
test('controller exposes pending approval and resolves exact five-choice decision',async()=>{const f=runtime();let pending:any=null;const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:p=>{pending=p;}} as any);const id=await c.initialize({initialPrompt:'x'});f.sinks.get(id)?.({type:'ApprovalRequested',requestId:'r1',azione:{tipo:'comando',comando:'npm test'}});await new Promise(r=>setTimeout(r,0));assert.equal(pending?.requestId,'r1');await c.resolveApproval('r1','allow-session');assert.deepEqual(f.answers.at(-1),['new','r1',true]);});
test('controller compacts the currently attached session through the real runtime contract',async()=>{const f=runtime();const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);await c.initialize({initialPrompt:'x'});assert.deepEqual(await c.compact(),{ok:true,compattato:true});assert.deepEqual(f.compacted,['new']);});

test('controller resume last chooses newest registry entry',async()=>{const f=runtime();f.r.listSessions=async()=>[{sessionId:'old',avviataAlle:'2026-01-01'},{sessionId:'newest',avviataAlle:'2026-02-01'}];const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);const id=await c.initialize({resume:'last'});assert.equal(id,'newest');});

test('controller plan mode toggle affects the next agent run without rebuilding the TUI',async()=>{
  const f=runtime();const starts:any[]=[];f.r.start=async(input:any)=>{starts.push(input);return'plan-run';};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.setMode('plan');
  assert.equal(c.mode(),'plan');
  await c.send('inspect',{model:'m',running:false});
  assert.equal(starts[0].permissionMode,'plan');
});

test('FA-ATOMIC-01: mode changes persist before becoming active and before a new turn',async()=>{
  const f=runtime();const calls:string[]=[];let release!:()=>void;
  f.r.setPermissionMode=async(id:string,mode:string)=>{calls.push(`${id}:${mode}`);await new Promise<void>(resolve=>{release=resolve;});};
  f.r.resume=async(id:string)=>{calls.push('resume');return id;};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}});
  try{
    await c.initialize({initialPrompt:'first'});
    const changing=c.setMode('bypassPermissions');
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(c.mode(),'plan');
    const sending=c.send('next',{model:'m',running:false});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(calls,['new:bypassPermissions']);
    release();await changing;await sending;
    assert.equal(c.mode(),'bypassPermissions');assert.deepEqual(calls,['new:bypassPermissions','resume']);
    f.r.setPermissionMode=async()=>{throw new Error('settings refused');};
    await assert.rejects(()=>c.setMode('default'),/settings refused/u);
    assert.equal(c.mode(),'bypassPermissions','a refused transition keeps the previous mode');
  }finally{c.close();}
});
test('controller model switch affects the next agent run',async()=>{const starts:any[]=[];const f=runtime();const rt:any={...f.r,start:async(i:any)=>{starts.push(i);return 's-new';}};const c=createTuiSessionController({runtime:rt,projectRoot:'/p',model:'openai:a',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}});c.setModel('anthropic:b');assert.equal(c.model(),'anthropic:b');await c.send('hello',{model:'ignored',running:false});assert.equal(starts[0].model,'anthropic:b');c.close();});

test('controller approval metadata contains redacted payload, permission reason, and only sourced runtime hint',async()=>{
  const f=runtime();let pending:any=null;const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:['Bash(npm test)'],deny:[]},onEvent:()=>{},onApproval:p=>{pending=p;}} as any);
  const id=await c.initialize({initialPrompt:'x'});f.sinks.get(id)?.({type:'ApprovalRequested',requestId:'r2',azione:{tipo:'comando',comando:'npm test',trifecta:true,authorization:'secret'}});await new Promise(r=>setTimeout(r,0));
  assert.equal(pending.reason,'matched ask rule');assert.equal(pending.rule,'Bash(npm test)');assert.equal(pending.runtimeHint,'trifecta');assert.equal(pending.rawPayload.authorization,'[REDACTED:6]');assert.equal(pending.action.command,'npm test');
});

test('controller exposes normalized session list and explicit resume/fork methods',async()=>{
  const f=runtime();f.r.listSessions=async()=>[{sessionId:'s1',titolo:'One',avviataAlle:'2026-01-01'}];
  const forks:any[]=[];f.r.fork=async(id:string,prompt?:string)=>{forks.push([id,prompt]);return'child';};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  assert.equal((await c.listSessions())[0]?.id,'s1');assert.equal(await c.resumeSession('s1'),'s1');assert.equal(await c.forkSession('s1','branch'),'child');assert.deepEqual(forks,[['s1','branch']]);
});

test('a leading bang routes to the command path and not to the model',async()=>{
  const f=runtime();const starts:any[]=[];const resumes:any[]=[];const shells:any[]=[];
  f.r.start=async(i:any)=>{starts.push(i);return'new';};
  f.r.resume=async(id:string,p:string)=>{resumes.push([id,p]);return id;};
  f.r.shell=async(id:string,command:string)=>{shells.push([id,command]);};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  await c.initialize({initialPrompt:'hello'});
  starts.length=0;resumes.length=0;
  await c.send('!git status',{model:'m',running:false});
  assert.deepEqual(shells,[['new','git status']]);
  assert.equal(starts.length,0);
  assert.equal(resumes.length,0);
});

test('a command typed during a run is queued and dispatched when the run ends',async()=>{
  const f=runtime();const shells:any[]=[];
  f.r.shell=async(id:string,command:string)=>{shells.push([id,command]);};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  const id=await c.initialize({initialPrompt:'hello'});
  await c.send('!npm install',{model:'m',running:true});
  assert.deepEqual(shells,[]);
  assert.equal(c.pendingCommands(),1);
  f.sinks.get(id)?.({type:'RunFinished'});
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(shells,[[id,'npm install']]);
  assert.equal(c.pendingCommands(),0);
});

test('a command without a session is refused and not silently dropped',async()=>{
  const f=runtime();const shells:any[]=[];
  f.r.shell=async(id:string,command:string)=>{shells.push([id,command]);};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  await assert.rejects(()=>c.send('!git status',{model:'m',running:false}),/session/iu);
  assert.deepEqual(shells,[]);
  assert.equal(c.pendingCommands(),0);
});


test('plain input submitted during a run is queued and resumed only at the run boundary',async()=>{
  const f=runtime();const resumes:any[]=[];f.r.resume=async(id:string,prompt:string)=>{resumes.push([id,prompt]);return id;};
  const changes:any[]=[];const dispatched:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onQueueChange:q=>changes.push(q),onQueuedDispatch:a=>dispatched.push(a)} as any);
  const id=await c.initialize({initialPrompt:'hello'});resumes.length=0;
  const outcome=await c.send('next thing',{model:'m',running:true});
  assert.equal(outcome.queued,true);assert.equal(c.pendingPrompts(),1);assert.deepEqual(resumes,[]);
  f.sinks.get(id)?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(resumes,[[id,'next thing']]);assert.equal(c.pendingPrompts(),0);assert.deepEqual(dispatched,[{kind:'prompt',text:'next thing'}]);assert.ok(changes.length>=2);
});

/* F-Q5 (owner 03/10: «se ci sono due messaggi in coda vengono inviati uno alla volta al turno successivo… invece che tutti in un
   colpo alla fine del turno come fanno gli altri»). Claude Code, interactive-mode «Queue messages while Claude works»: «When the
   turn ends with messages still queued, they go out without another key press, in the order you typed them». The messages at
   the head of the queue go out together in one turn; a queued command still waits its own place. */
test('F-Q5: the messages queued during a run go out together when it ends, in order, in one turn',async()=>{
  const f=runtime();const resumes:any[]=[];f.r.resume=async(id:string,prompt:string)=>{resumes.push([id,prompt]);return id;};
  const dispatched:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onQueuedDispatch:a=>dispatched.push(a)} as any);
  const id=await c.initialize({initialPrompt:'hello'});resumes.length=0;
  await c.send('first',{model:'m',running:true});await c.send('second',{model:'m',running:true});
  assert.equal(c.pendingPrompts(),2);
  f.sinks.get(id)?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(resumes,[[id,'first\n\nsecond']],'one turn carries both messages');
  assert.equal(c.pendingPrompts(),0);
  assert.deepEqual(dispatched,[{kind:'prompt',text:'first'},{kind:'prompt',text:'second'}],'each message still shows as its own line');
});

test('busy queue preserves prompt and shell command order across run boundaries',async()=>{
  const f=runtime();const order:string[]=[];
  f.r.resume=async(_id:string,prompt:string)=>{order.push(`prompt:${prompt}`);return'new';};
  f.r.shell=async(_id:string,command:string)=>{order.push(`command:${command}`);};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  const id=await c.initialize({initialPrompt:'hello'});order.length=0;
  await c.send('A',{model:'m',running:true});await c.send('!B',{model:'m',running:true});await c.send('C',{model:'m',running:true});
  assert.deepEqual(c.queue(),[{kind:'prompt',text:'A'},{kind:'command',text:'B'},{kind:'prompt',text:'C'}]);
  f.sinks.get(id)?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(order,['prompt:A']);assert.deepEqual(c.queue(),[{kind:'command',text:'B'},{kind:'prompt',text:'C'}]);
  f.sinks.get(id)?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(order,['prompt:A','command:B','prompt:C']);assert.deepEqual(c.queue(),[]);
});

test('a queued prompt is checked again at dispatch and remains queued when readiness closes',async()=>{
  const f=runtime();let ready=true;const errors:any[]=[];const resumes:any[]=[];f.r.resume=async(id:string,prompt:string)=>{resumes.push([id,prompt]);return id;};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},readiness:async()=>ready?{ready:true}:{ready:false,code:'PROVIDER_NOT_READY',provider:'p',message:'not ready'},onEvent:()=>{},onError:e=>errors.push(e)} as any);
  c.attach('s1');await c.send('later',{model:'m',running:true});ready=false;
  f.sinks.get('s1')?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(resumes,[]);assert.equal(c.pendingPrompts(),1);assert.equal((errors[0] as any)?.code,'PROVIDER_NOT_READY');
});

test('a failed queued resume is restored at the head instead of losing the follow-up',async()=>{
  const f=runtime();f.r.resume=async()=>{throw new Error('resume failed');};const errors:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onError:e=>errors.push(e)} as any);
  c.attach('s1');await c.send('keep me',{model:'m',running:true});f.sinks.get('s1')?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(c.queue(),[{kind:'prompt',text:'keep me'}]);assert.match(String((errors[0] as Error)?.message),/resume failed/u);
});

test('cancel clears queued work: the queued message comes back to the composer, the queued command is what was not sent',async()=>{
  /* F-Q1 (owner 03/10, «Tornano nel composer»): before, Ctrl+C dropped the queued messages into the input history */
  const f=runtime();let restored:string|null=null;const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onComposerRestore:(text:string)=>{restored=text;}} as any);
  c.attach('s1');await c.send('later',{model:'m',running:true});await c.send('!git status',{model:'m',running:true});
  const dropped=await c.cancel();
  assert.equal(restored,'later');
  assert.deepEqual(dropped,[{kind:'command',text:'git status'}]);assert.deepEqual(c.queue(),[]);assert.equal(c.pendingCommands(),0);assert.equal(c.pendingPrompts(),0);
});


test('overlapping manual queue drains cannot start the action behind an in-flight queued prompt',async()=>{
  const f=runtime();const order:string[]=[];let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  f.r.resume=async(_id:string,prompt:string)=>{order.push(prompt);await gate;return's1';};
  f.r.shell=async(_id:string,command:string)=>{order.push(`command:${command}`);};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  c.attach('s1');await c.send('A',{model:'m',running:true});await c.send('B',{model:'m',running:true});await c.send('!C',{model:'m',running:true});
  const first=c.dispatchQueue();await new Promise(r=>setTimeout(r,0));const second=c.dispatchQueue();await new Promise(r=>setTimeout(r,0));
  /* R0 realignment (2026-09-23): since `c54272690` (M3-D persistent queue) the in-flight entry stays listed until it
     completes (with a durable store it is persisted as `dispatching`, see `queue-persistence.test.ts`), so a restart
     can never lose or silently re-run it. F-Q5 (owner 03/10): A and B go out together in one turn; the property is
     unchanged — the command C behind them is not started while they are in flight. */
  assert.deepEqual(order,['A\n\nB']);assert.deepEqual(c.queue().map((x:any)=>x.text),['A','B','C']);
  release();await Promise.all([first,second]);assert.deepEqual(order,['A\n\nB']);
  f.sinks.get('s1')?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,0));assert.deepEqual(order,['A\n\nB','command:C']);
});


test('M6-C controller exposes the native agent tree for the currently attached session',async()=>{
  const f=runtime();
  f.r.listSessions=async()=>[
    {id:'main',sessionId:'main',name:'main',project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'running',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null},
    {id:'child',sessionId:'child',name:'child',project:null,path:null,model:'m',parentId:'main',depth:1,delegatedTask:'real child',forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'running',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null},
  ];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  assert.equal(await c.agentTree(),null,'no active session means no fabricated agent tree');
  c.attach('child');
  const tree=await c.agentTree();
  assert.equal(tree?.root.id,'main');assert.equal(tree?.focusId,'child');assert.equal(tree?.root.children[0]?.id,'child');
});


test('M7-D RED — controller binds native events to attach session identity and resets on switch',()=>{
  const f=runtime();const events:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:e=>events.push(e)} as any);

  c.attach('persistent-a');
  f.sinks.get('persistent-a')?.({type:'RunStarted',_sequenza:7,threadId:'ephemeral-thread-a',runId:'run-a'});
  assert.deepEqual(events.at(-1),{
    type:'run.started',sessionId:'persistent-a',runId:'run-a',eventId:'talos:persistent-a:native:7'
  });

  c.attach('persistent-b');
  f.sinks.get('persistent-b')?.({type:'RuntimeFallback',message:'fallback after switch'});
  assert.deepEqual(events.at(-1),{
    type:'warning',message:'fallback after switch',eventId:'talos:persistent-b:transient:1'
  });
});


test('late checkpoint finalization after controller close never calls UI callbacks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-controller-close-')),projectRoot=join(root,'project'),checkpointsRoot=join(root,'checkpoints'),queueRoot=join(root,'queue');
  await mkdir(projectRoot,{recursive:true});await writeFile(join(projectRoot,'state.txt'),'before','utf8');
  const f=runtime();const errors:any[]=[];const events:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot,model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},paths:{checkpointsRoot,queueRoot,dataRoot:join(root,'data')} as any,onEvent:e=>events.push(e),onError:e=>errors.push(e)} as any);
  const id=await c.initialize({initialPrompt:'hello'});c.close();await rm(projectRoot,{recursive:true,force:true});
  f.sinks.get(id)?.({type:'RunFinished'});await new Promise(r=>setTimeout(r,25));
  assert.deepEqual(errors,[]);assert.deepEqual(events,[]);
});


test('direct-dispatch RED — model start is never gated by checkpoint initialization',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-direct-dispatch-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const starts:any[]=[];const f=runtime();f.r.start=async(input:any)=>{starts.push(input);return'direct-session';};
  const c=createTuiSessionController({
    runtime:f.r,projectRoot,model:'openrouter:test',mode:'default',rules:{allow:[],ask:[],deny:[]},
    paths:{checkpointsRoot:join(projectRoot,'.invalid-checkpoint-root'),queueRoot:join(root,'queue'),dataRoot:join(root,'data')} as any,
    readiness:async()=>({ready:true}),onEvent:()=>{},
  } as any);
  const id=await c.initialize({initialPrompt:'dispatch now'});
  assert.equal(id,'direct-session');
  assert.equal(starts.length,1,'runtime.start must run even when checkpoint storage would be invalid');
});


test('Esc interrupt — the queued messages wait for the real terminal event, then come back to the composer; nothing is sent',async()=>{
  /* F-Q1 (owner 03/10, «Tornano nel composer», like Claude Code and Pi): before, Esc sent the queue as soon as the run stopped */
  const f=runtime();const resumes:string[]=[];let releaseCancel:()=>void=()=>{};let restored:string|null=null;
  const cancelGate=new Promise<void>(resolve=>{releaseCancel=resolve;});
  f.r.cancel=async()=>{await cancelGate;};
  f.r.resume=async(_id:string,prompt:string)=>{resumes.push(prompt);return's1';};
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onComposerRestore:(text:string)=>{restored=text;}} as any);
  c.attach('s1');
  await c.send('first queued',{model:'m',running:true});
  await c.send('second queued',{model:'m',running:true});
  const interrupted=c.interrupt();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(c.queue(),[{kind:'prompt',text:'first queued'},{kind:'prompt',text:'second queued'}],'Esc must not clear queued intent');
  assert.deepEqual(resumes,[]);
  releaseCancel();
  await new Promise(r=>setTimeout(r,0));
  assert.deepEqual(resumes,[],'runtime.cancel only requests abort; queue waits for the real terminal event');
  f.sinks.get('s1')?.({type:'RunError',code:'fermato',message:'stopped'});
  await interrupted;
  assert.deepEqual(resumes,[],'nothing goes out by itself after a stop');
  assert.equal(restored,'first queued\n\nsecond queued','both come back to the composer, in order, as one draft');
  assert.deepEqual(c.queue(),[]);
});

test('Ctrl+C aggressive cancel: the queued message comes back to the composer and nothing is left queued',async()=>{
  const f=runtime();let restored:string|null=null;const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onComposerRestore:(text:string)=>{restored=text;}} as any);
  c.attach('s1');await c.send('queued',{model:'m',running:true});
  const dropped=await c.cancel();
  assert.equal(restored,'queued');
  assert.deepEqual(dropped,[]);
  assert.deepEqual(c.queue(),[]);
});
/* C2 (08/10): a history replay (resume, fork) is drawn on the screen, which keeps 8 KiB of each tool result: it asks for the screen's view of giant results. A session this controller starts is not history. */
test('C2 the controller asks for the screen view of a replayed history, and only then',async()=>{
  const calls:Array<{id:string;from:number|undefined;options:unknown}>=[];
  const make=()=>{const f=runtime();const original=f.r.subscribe;f.r.subscribe=(id:string,sink:(e:any)=>void,from?:number,options?:unknown)=>{calls.push({id,from,options});return original(id,sink);};return f;};
  const base=(f:any)=>createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  const resumed=make();await base(resumed).initialize({resume:'last'});
  const started=make();await base(started).initialize({initialPrompt:'x'});
  const forked=make();await base(forked).initialize({fork:'last'});
  assert.deepEqual(calls.map(call=>[call.id,call.from,call.options]),[['old',0,{resultsForScreen:true}],['new',0,undefined],['forked',0,{resultsForScreen:true}]]);
});
/* Long chats, tappa D (08/10): once a history replay is over the controller tells the screen to start with the last turns; a session it started, and a replay that brought nothing, get no such event. */
test('D the controller raises history.window once, after a replayed history, and only then',async()=>{
  const make=(replayed:any[])=>{const f=runtime();const original=f.r.subscribe;f.r.subscribe=(id:string,sink:(e:any)=>void)=>{for(const raw of replayed)sink(raw);return original(id,sink);};return f;};
  const run=async(f:any,args:any)=>{const events:any[]=[];const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:(e:any)=>events.push(e)} as any);await c.initialize(args);return events;};
  const history=[{type:'TextMessageContent',messageId:'m1',delta:'old text',_sequenza:1},{type:'TextMessageContent',messageId:'m1',delta:' more',_sequenza:2}];
  const resumed=await run(make(history),{resume:'last'});
  assert.deepEqual(resumed.filter(e=>e.type==='history.window'),[{type:'history.window',turns:5}]);
  assert.equal(resumed.at(-1).type,'history.window','after every replayed event');
  assert.ok(resumed.findIndex(e=>e.type==='message.delta')<resumed.findIndex(e=>e.type==='history.window'));
  const empty=await run(make([]),{resume:'last'});
  assert.equal(empty.some(e=>e.type==='history.window'),false,'nothing replayed, nothing to window');
  const started=await run(make(history),{initialPrompt:'x'});
  assert.equal(started.some(e=>e.type==='history.window'),false,'a session this controller started is not history');
  const forked=await run(make(history),{fork:'last'});
  assert.equal(forked.filter(e=>e.type==='history.window').length,1);
});

/* Owner 08/10/2026 («cambino istantaneamente … anche se vengono applicati dal turno dopo, come fa Claude Code»): while a turn
   runs the kernel takes the permission and defers its operating mode; the mode is active at once, nobody sees an error, and
   the controller sends it again when the turn ends. */
test('a mode the kernel defers while a turn runs is active at once and is sent again at the turn end',async()=>{
  const f=runtime();const calls:string[]=[];let deferNext=true;
  f.r.setPermissionMode=async(id:string,mode:string)=>{calls.push(`${id}:${mode}`);const deferred=deferNext;deferNext=false;return{operatingModeDeferred:deferred};};
  const errors:unknown[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onError:(e:unknown)=>errors.push(e)} as any);
  try{
    const id=await c.initialize({initialPrompt:'first'});
    f.sinks.get(id)?.({type:'RunStarted',runId:'r1'});
    await c.setMode('plan');
    assert.equal(c.mode(),'plan','active at once');
    assert.deepEqual(calls,[`${id}:plan`]);
    f.sinks.get(id)?.({type:'RunFinished',runId:'r1'});
    for(let i=0;i<20&&calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.deepEqual(calls,[`${id}:plan`,`${id}:plan`],'sent again when the turn ended');
    assert.deepEqual(errors,[]);
    f.sinks.get(id)?.({type:'RunStarted',runId:'r2'});f.sinks.get(id)?.({type:'RunFinished',runId:'r2'});
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(calls.length,2,'once it went through, a later turn end sends nothing');
  }finally{c.close();}
});
