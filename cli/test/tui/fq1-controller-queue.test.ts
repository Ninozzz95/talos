/*
 * F-Q1 (owner 03/10, «Come Claude Code, completo»; kernel K5). While a turn runs, a message goes into the KERNEL's queue
 * and enters after the current step; ↑ takes the queued messages back; after a stop they come back to the composer
 * (owner 03/10, «Tornano nel composer»); only the /busy «interrupt and send» mode still sends them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {queuedTranscriptItems} from '../../src/tui/queued-items.ts';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function kernelRuntime({refuse=false}:{refuse?:boolean}={}){
  const sinks=new Map<string,(e:any)=>void>();const queue:Array<{id:string;testo:string}>=[];const resumes:string[]=[];const unqueued:string[]=[];let n=0;
  const announce=(id:string)=>sinks.get(id)?.({type:'CUSTOM',name:'talos.coda',value:{voci:queue.map(item=>({...item,immagini:0})),inPausa:false}});
  const r:any={restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>({eventi:[]}),start:async()=>'s1',
    resume:async(id:string,prompt?:string)=>{resumes.push(String(prompt));return id;},
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
    async queueMessage(id:string,prompt:string){if(refuse)throw Object.assign(new Error('closing'),{code:'SESSION_NOT_READY'});queue.push({id:`q${++n}`,testo:prompt});announce(id);return{items:queue.map(item=>({id:item.id,text:item.testo,images:0,origin:'person'})),paused:false};},
    async unqueueMessage(id:string,queuedId:string){const index=queue.findIndex(item=>item.id===queuedId);if(index<0)return false;queue.splice(index,1);unqueued.push(queuedId);announce(id);return true;}};
  return{r,sinks,queue,resumes,unqueued,deliver(id:string){const item=queue.shift();if(item){sinks.get(id)?.({type:'QueuedMessageDelivered',testo:item.testo,codaId:item.id});announce(id);}}};
}
const make=(f:ReturnType<typeof kernelRuntime>,extra:Record<string,unknown>={})=>createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},...extra} as any);

test('F-Q1: a message typed during a turn goes into the kernel queue, not the CLI queue, and the screen sees it',async()=>{
  const f=kernelRuntime();const seen:any[]=[];const c=make(f,{onKernelQueue:(q:any)=>seen.push(q)});c.attach('s1');
  const outcome=await c.send('also check the README',{model:'m',running:true});
  assert.deepEqual([outcome.queued,outcome.inKernel,outcome.position],[true,true,1]);
  assert.deepEqual(f.queue.map(item=>item.testo),['also check the README']);
  assert.deepEqual(c.queue(),[],'nothing waits in the CLI queue');
  assert.deepEqual(c.kernelQueue().items.map((item:any)=>[item.origin,item.text]),[['person','also check the README']]);
  assert.ok(seen.length>0);
  f.deliver('s1');
  assert.deepEqual(c.kernelQueue().items,[],'delivered: it leaves the waiting list');
  assert.deepEqual(f.resumes,[],'no turn of its own: it went into the running one');
});

test('F-Q1: when the kernel cannot take it (turn closing), it waits in the CLI queue and goes out at the turn end, never lost',async()=>{
  const f=kernelRuntime({refuse:true});const c=make(f);c.attach('s1');
  const outcome=await c.send('late message',{model:'m',running:true});
  assert.equal(outcome.inKernel,undefined);
  assert.deepEqual(c.queue(),[{kind:'prompt',text:'late message'}]);
});

test('F-Q1: ↑ takes back every queued message as one draft, oldest first; one already delivered is not taken back',async()=>{
  const f=kernelRuntime();const c=make(f);c.attach('s1');
  await c.send('first',{model:'m',running:true});await c.send('second',{model:'m',running:true});await c.send('third',{model:'m',running:true});
  f.deliver('s1');
  assert.equal(await c.takeBackQueued(),'second\n\nthird');
  assert.deepEqual(f.queue,[]);assert.deepEqual(f.unqueued,['q2','q3']);
  assert.equal(await c.takeBackQueued(),null,'nothing left');
});

test('F-Q1: a message delivered while ↑ is pressed (the screen still shows it queued) is not taken back twice',async()=>{
  const f=kernelRuntime();const c=make(f);c.attach('s1');
  await c.send('raced',{model:'m',running:true});await c.send('kept',{model:'m',running:true});
  f.queue.shift();/* the kernel delivered «raced»; its announcement has not reached the screen yet */
  assert.equal(c.kernelQueue().items.length,2,'the screen still lists both');
  assert.equal(await c.takeBackQueued(),'kept','only what was still waiting comes back');
});

test('F-Q1: Esc stops the turn and the queued messages come back to the composer; nothing goes out by itself',async()=>{
  const f=kernelRuntime();let restored:string|null=null;const c=make(f,{onComposerRestore:(text:string)=>{restored=text;}});c.attach('s1');
  await c.send('one',{model:'m',running:true});await c.send('two',{model:'m',running:true});
  const stopping=c.interrupt();await tick();
  f.sinks.get('s1')?.({type:'RunError',code:'fermato',message:'stopped'});await stopping;
  assert.equal(restored,'one\n\ntwo');
  assert.deepEqual(f.resumes,[],'nothing sent after the stop');
  assert.deepEqual(f.queue,[]);
});

test('F-Q1: /busy «interrupt and send» still sends what was queued, together, after the stop',async()=>{
  const f=kernelRuntime();let restored:string|null=null;const c=make(f,{onComposerRestore:(text:string)=>{restored=text;}});c.attach('s1');
  await c.send('now this',{model:'m',running:true});
  const stopping=c.interrupt({send:true});await tick();
  f.sinks.get('s1')?.({type:'RunError',code:'fermato',message:'stopped'});await stopping;
  assert.equal(restored,null);
  assert.deepEqual(f.resumes,['now this']);
});

test('F-Q1: Ctrl+C cancels and the queued messages come back to the composer too; a queued command is the only thing dropped',async()=>{
  const f=kernelRuntime();let restored:string|null=null;const c=make(f,{onComposerRestore:(text:string)=>{restored=text;}});c.attach('s1');
  await c.send('message',{model:'m',running:true});await c.send('!npm test',{model:'m',running:true});
  const dropped=await c.cancel();
  assert.equal(restored,'message');
  assert.deepEqual(dropped,[{kind:'command',text:'npm test'}]);
});

test('F-Q1: /queue on a kernel message — edit puts the new text at the end, delete takes it out, a delivered one says so',async()=>{
  const f=kernelRuntime();const c=make(f);c.attach('s1');
  await c.send('alpha',{model:'m',running:true});await c.send('beta',{model:'m',running:true});
  await c.editKernelQueued('q1','alpha fixed');
  assert.deepEqual(f.queue.map(item=>item.testo),['beta','alpha fixed']);
  assert.equal(await c.deleteKernelQueued('q2'),true);
  f.deliver('s1');
  await assert.rejects(()=>c.editKernelQueued('q3','too late'),(error:any)=>error.code==='QUEUE_ENTRY_DELIVERED');
});

test('F-Q1, FE-048: the gray items are what TALOS waits to bring in; what the person queued is in the band; a child result by its task only',()=>{
  const items=queuedTranscriptItems({items:[{id:'q1',origin:'person',text:'also this'},{id:'q2',origin:'delegation',childId:'c1',result:{status:'completed',task:'Read the files'}}],paused:false},
    [{id:'l1',kind:'prompt',text:'later',status:'pending'},{id:'l2',kind:'command',text:'npm test',status:'pending'}]);
  assert.deepEqual(items.map(item=>[item.id,item.text,item.queued]),[
    ['queued:kernel:q2','','Sub-agent result waiting · Read the files']]);
});

/* review 9 F7 of 0.6.13 (23/10/2026): «Send as attachment» keeps the kernel's run option when the message is queued: the kernel
   queue takes it per message, and in the CLI's own queue it goes out alone, with the option, never merged into a group without it */
test('F7: a message sent as an attachment keeps the option in the kernel queue and in the CLI queue',async()=>{
  const f=kernelRuntime();const calls:any[]=[];const base=f.r.queueMessage.bind(f.r);
  f.r.queueMessage=async(id:string,prompt:string,attachments?:unknown,options?:unknown)=>{calls.push(options);return base(id,prompt);};
  const c=make(f);c.attach('s1');
  await c.send('the huge log',{model:'m',running:true,attachIfTooLarge:true});
  await c.send('a normal one',{model:'m',running:true});
  assert.deepEqual(calls,[{attachIfTooLarge:true},undefined],'only the attachment carries the option');
  const g=kernelRuntime({refuse:true});const resumed:any[]=[];
  g.r.resume=async(id:string,prompt?:string,attachments?:unknown,options?:unknown)=>{resumed.push({prompt,options});return id;};
  const d=make(g);d.attach('s1');
  await d.send('before',{model:'m',running:true});
  await d.send('the huge log',{model:'m',running:true,attachIfTooLarge:true});
  await d.send('after',{model:'m',running:true});
  assert.deepEqual(d.queue(),[{kind:'prompt',text:'before'},{kind:'prompt',text:'the huge log',attachIfTooLarge:true},{kind:'prompt',text:'after'}]);
  for(const entry of d.queueEntries())await d.sendQueuedNow(entry.id);
  assert.deepEqual(resumed,[{prompt:'before',options:undefined},{prompt:'the huge log',options:{attachIfTooLarge:true}},{prompt:'after',options:undefined}]);
});

test('F7: at the turn end the queued prompts go out together, but a prompt sent as an attachment goes alone, with its option',async()=>{
  const g=kernelRuntime({refuse:true});const resumed:any[]=[];
  g.r.resume=async(id:string,prompt?:string,attachments?:unknown,options?:unknown)=>{resumed.push({prompt,options});return id;};
  const d=make(g);d.attach('s1');
  await d.send('one',{model:'m',running:true});await d.send('two',{model:'m',running:true});
  await d.send('the huge log',{model:'m',running:true,attachIfTooLarge:true});await d.send('three',{model:'m',running:true});
  await d.dispatchQueue();
  assert.deepEqual(resumed,[{prompt:'one\n\ntwo',options:undefined}],'the group stops before the attachment');
  await d.dispatchQueue();
  assert.deepEqual(resumed[1],{prompt:'the huge log',options:{attachIfTooLarge:true}},'the attachment alone, with its option');
  await d.dispatchQueue();
  assert.deepEqual(resumed[2],{prompt:'three',options:undefined});
});
