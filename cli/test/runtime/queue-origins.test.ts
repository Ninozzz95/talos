/*
 * The kernel now queues two more kinds of item besides the person's words, a sub-agent's result and a dialogue message
 * (session-registry.mjs): a background command's exit (`origine: 'sfondo'`) and a workflow run's result (`origine: 'workflow'`).
 * Until 14/10/2026 the CLI read every origin it did not know as `dialogue`, so v2 called them «dialogue» and the screen drew
 * «Message from a sub-agent waiting» for a command that had finished. They now have their own English origins in the queue
 * (queue.changed), at delivery (queue.delivered) and on the screen; an origin the CLI does not know still reads as dialogue.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {kernelQueueOf} from '../../src/runtime/kernel-queue.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {queuedTranscriptItems} from '../../src/tui/queued-items.ts';

const NOW=()=>'2026-10-14T10:00:00.000Z';
const ROWS=[
  {id:'q1',testo:'[TALOS] The background command finished (exit 0).',immagini:0,origine:'sfondo',toolCallId:'call_1',sfondo:{exitCode:0}},
  {id:'q2',testo:'[TALOS] Workflow run r1 finished.',immagini:0,origine:'workflow',runId:'r1'},
  {id:'q3',testo:'a message from a sub-agent',immagini:0,origine:'agent-dialogue',childId:'c1'},
  {id:'q4',testo:'something new',immagini:0,origine:'qualcosa-di-nuovo'},
];

test('the kernel queue reads a background exit and a workflow result with their own origins; unknown ones stay dialogue',()=>{
  const queue=kernelQueueOf({voci:ROWS,inPausa:false});
  assert.deepEqual(queue.items.map(item=>[item.id,item.origin]),[['q1','background'],['q2','workflow'],['q3','dialogue'],['q4','dialogue']]);
  assert.deepEqual(kernelQueueOf({items:[{id:'e1',text:'x',origin:'background'},{id:'e2',text:'y',origin:'workflow'}]}).items.map(item=>item.origin),['background','workflow'],'the English values read back');
});

test('v2: queue.changed and queue.delivered name background and workflow, never the model-facing note',()=>{
  const bridge=createV2EventBridge('main',NOW);
  const changed=bridge.translate({type:'CUSTOM',name:'talos.coda',_sequenza:3,value:{voci:ROWS,inPausa:false}});
  assert.deepEqual((changed?.data as any).items,[{id:'q1',origin:'background'},{id:'q2',origin:'workflow'},{id:'q3',origin:'dialogue',childId:'c1'},{id:'q4',origin:'dialogue'}]);
  for(const [origine,origin] of [['sfondo','background'],['workflow','workflow'],['agent-dialogue','dialogue'],['qualcosa-di-nuovo','dialogue'],[undefined,'person']] as const){
    const delivered=bridge.translate({type:'QueuedMessageDelivered',_sequenza:4,testo:'the note',codaId:'q9',...(origine?{origine}:{})});
    assert.equal(delivered?.type,'queue.delivered');
    assert.equal((delivered?.data as any).origin,origin,`origine ${origine}`);
  }
  assert.doesNotMatch(JSON.stringify(changed),/sfondo|\[TALOS\]/u);
});

test('the screen says what waits: a finished background command, a workflow result',()=>{
  const bridge=createV2EventBridge('main',NOW);const adapter=createTuiEventAdapter();adapter.bindSession('main');
  const changed=adapter.translateAll(bridge.translate({type:'CUSTOM',name:'talos.coda',_sequenza:3,value:{voci:ROWS.slice(0,3),inPausa:false}}));
  const items=(changed.find((event:any)=>event.type==='queue.changed') as any)?.items??kernelQueueOf({voci:ROWS.slice(0,3)}).items;
  const lines=queuedTranscriptItems({items,paused:false},[]).map(item=>item.queued);
  assert.deepEqual(lines,['Background command finished · result waiting','Workflow result waiting','Message from a sub-agent waiting']);
});

test('a turn the kernel starts to hand over a background exit or a workflow result is not the person\'s prompt',()=>{
  const bridge=createV2EventBridge('main',NOW);const adapter=createTuiEventAdapter();adapter.bindSession('main');
  const cases=[
    [{consegna:'[TALOS] The background command finished (exit 0).',progetto:'C:/p',seguito:true,origine:'sfondo',codaIds:['q1'],toolCallIds:['call_1'],risultatiSfondo:[{testo:'[TALOS] note'}]},{project:'C:/p',followUp:true,origin:'background',queueIds:['q1'],toolCallIds:['call_1']}],
    [{consegna:'[TALOS] Workflow run r1 finished.',seguito:true,origine:'workflow',codaIds:['q2'],runIds:['r1'],risultatiWorkflow:[{testo:'[TALOS] note'}]},{followUp:true,origin:'workflow',queueIds:['q2'],runIds:['r1']}],
  ] as const;
  for(const [input,expected] of cases){
    const event=bridge.translate({type:'RunStarted',runId:'r9',_sequenza:7,input});
    assert.deepEqual((event?.data as any).input,expected);
    assert.doesNotMatch(JSON.stringify(event),/\[TALOS\]|sfondo|risultati|codaIds|testo/u,'neither the model-facing note nor the kernel\'s words');
    const screen=adapter.translateAll(event).find((row:any)=>row.type==='run.started') as any;
    assert.equal(screen?.prompt,undefined,'the screen draws no «You» message for it');
  }
});
