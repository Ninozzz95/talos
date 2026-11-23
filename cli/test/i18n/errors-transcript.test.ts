import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';

/* R2 lane E (gate E4, E15, Q-R2-2): kernel text that reaches the transcript is mapped by code; the kernel's words survive
   only as the item's raw detail. The stop point of an interrupt comes from the transcript's own state. */
const ITALIAN=/interrott|richiesta|fornitore|traffico|\bgiro\b|owner|approvato|\bnon\b/iu;
let n=0;
function v2(type:string,data:Record<string,unknown>){return{schema:'talos.cli.event.v2',version:2,sessionId:'s1',eventId:`e${++n}`,cursor:null,ts:'2026-09-24T00:00:00.000Z',durability:'durable',type,data};}
function failed(message:string,code:string){return v2('run.failed',{error:{message,envelope:{code,component:'runtime',retryable:false,traceId:'t'}},runId:'r1'});}
function feed(events:unknown[]){
  const adapter=createTuiEventAdapter();let model:TranscriptModel=createTranscriptModel();const seen:TuiEvent[]=[];
  for(const raw of events){const event=adapter.translate(raw);if(event){seen.push(event);model=reduceTranscriptEvent(model,event);}}
  return{model,seen};
}
/* R3 Q-R3-8/9 (owner 2026-09-24): the `Run · …` row is gone; a run that did not end normally leaves ONE outcome line (a
   dim notice with `outcome`), which carries the same English three-part view and the kernel's raw detail. */
const runItem=(model:TranscriptModel)=>model.items.find(item=>item.kind==='warning'&&item.outcome!==undefined)!;

test('a kernel 429 reaches the TUI event and the run row as English with what to do; the kernel text is only the detail',()=>{
  const {model,seen}=feed([v2('run.started',{runId:'r1'}),failed('Troppo traffico presso il fornitore.','PROVIDER_REQUEST_ERROR')]);
  const event=seen.find(e=>e.type==='run.failed') as Extract<TuiEvent,{type:'run.failed'}>;
  assert.doesNotMatch(event.message,ITALIAN);assert.match(event.message,/wait|try again/iu);
  const run=runItem(model);
  assert.doesNotMatch(transcriptItemText(run),ITALIAN);
  assert.match(transcriptItemText(run),/\(PROVIDER_REQUEST_ERROR\)/u);
  assert.equal((run as any).detail,'Troppo traffico presso il fornitore.');
});

test('an interrupt names where it stopped from the transcript state: answering, waiting for approval, running a tool',()=>{
  const answering=feed([v2('run.started',{runId:'r1'}),v2('message.started',{messageId:'m1',role:'assistant'}),v2('message.delta',{messageId:'m1',delta:'Hel'}),
    failed('⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.','fermato')]).model;
  assert.match(transcriptItemText(runItem(answering)),/Interrupted · while the model was answering/u);// R3 Q-R3-8: `Interrupted · <stop point>`
  assert.doesNotMatch(transcriptItemText(runItem(answering)),ITALIAN);
  const approval=feed([v2('run.started',{runId:'r1'}),v2('tool.started',{toolCallId:'c1',toolName:'shell'}),v2('approval.required',{requestId:'q1',azione:{tipo:'shell',comando:'dir',toolCallId:'c1'}}),
    failed('⛔ interrotto su richiesta: mentre aspettavo la tua approvazione per "shell".','fermato')]).model;
  assert.match(transcriptItemText(runItem(approval)),/while TALOS was waiting for your approval for Shell/u);
  const tool=feed([v2('run.started',{runId:'r1'}),v2('tool.started',{toolCallId:'c1',toolName:'shell'}),v2('tool.output',{toolCallId:'c1',delta:'x'}),
    failed('⛔ interrotto su richiesta: mentre "shell" era in corso.','fermato')]).model;
  assert.match(transcriptItemText(runItem(tool)),/while Shell was running/u);
});

test('a refused tool shows the English reason from the receipt `via`; the kernel content stays in the outcome',()=>{
  const content='REFUSED. l\'owner non ha approvato questa azione. The command was not run.';
  const {model}=feed([v2('run.started',{runId:'r1'}),v2('tool.started',{toolCallId:'c1',toolName:'shell'}),
    v2('tool.completed',{toolCallId:'c1',status:'failed',content,receipt:{status:'denied',allowed:false,via:'permesso-per-attrezzo-chiedi',reason:'l\'owner non ha approvato questa azione.',risk:null},enforcement:null})]);
  const tool=model.items.find(item=>item.kind==='tool')!;
  assert.equal(tool.kind==='tool'&&tool.finalOutput,'Not run: you did not approve it.');
  assert.equal(tool.kind==='tool'&&tool.outcome?.content,content,'the model-facing content is kept for the expanded view (gate E2)');
});

test('a kernel notice in Italian becomes an English sentence; an English notice is kept',()=>{
  const {model}=feed([v2('warning',{message:'Una chiave di OpenAI è stata rifiutata: controlla Fornitori e accessi.'}),v2('warning',{message:'Context is 90% full.'})]);
  const texts=model.items.filter(item=>item.kind==='warning').map(transcriptItemText);
  assert.doesNotMatch(texts[0]!,ITALIAN);assert.match(texts[0]!,/no English text yet/u);
  assert.match(texts[1]!,/Context is 90% full\./u);
});

test('R2 (lane T contract, gate E3): the transcript text of a tool shows its display label and primary argument, never raw JSON args',async()=>{
  const {toolDisplay}=await import('../../src/tui/tool-display.ts');
  const {model}=feed([v2('run.started',{runId:'r1'}),v2('tool.started',{toolCallId:'c1',toolName:'leggi'}),v2('tool.args',{toolCallId:'c1',delta:'{"percorso":"README.md"}'})]);
  const text=transcriptItemText(model.items.find(item=>item.kind==='tool')!);
  const display=toolDisplay('leggi',{percorso:'README.md'});
  assert.ok(text.startsWith(display.label),text);
  if(display.primaryArg)assert.ok(text.includes(display.primaryArg),text);
  assert.doesNotMatch(text,/"percorso"|\{"|^Tool leggi/mu,text);
});

test('E4: the kernel notices it sends as a whole chat message (key refused, provider switch) are shown in English',()=>{
  const notices=['Una chiave di Ollama Local è stata rifiutata: controlla Fornitori e accessi.',
    'Il fornitore OpenRouter limita il traffico: continuo con Groq · modello llama-4',
    'Il fornitore OpenRouter non risponde: continuo con Groq · modello llama-4'];
  for(const text of notices){
    const {model}=feed([v2('message.started',{messageId:'n1',role:'assistant'}),v2('message.delta',{messageId:'n1',delta:text}),v2('message.completed',{messageId:'n1',text})]);
    const shown=transcriptItemText(model.items.find(item=>item.kind==='message')!);
    assert.doesNotMatch(shown,/chiave|rifiutata|fornitore|traffico|continuo|modello|risponde/iu,shown);
    assert.match(shown,/Ollama Local|OpenRouter/u,'the provider label is kept');
  }
  const model=feed([v2('message.started',{messageId:'a1',role:'assistant'}),v2('message.delta',{messageId:'a1',delta:'Il fornitore è ottimo, ne parlo volentieri.'})]).model;
  assert.match(transcriptItemText(model.items.find(item=>item.kind==='message')!),/Il fornitore è ottimo/u,'a model answer in Italian is the model\'s, never rewritten');
});

/* Coordinator (R2, owner 2026-09-24): a v2 error carries the English headline in `message` and the kernel's text in `raw`.
   The transcript re-describes the event's error; before this test it read the English headline, lost the provider class
   and turned a 429 into "did not accept the request" (s05 D-06, s15). */
test('R2: a v2 run failure keeps its provider class on the transcript row (raw wins over the English headline)',async()=>{
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const {createTuiEventAdapter}=await import('../../src/tui/event-adapter.ts');
  const {reduceTranscriptEvent,createTranscriptModel,transcriptItemText}=await import('../../src/tui/transcript-model.ts');
  const {KERNEL_PROVIDER_MESSAGES}=await import('../../src/i18n/kernel-map.ts');
  const sentence=Object.entries(KERNEL_PROVIDER_MESSAGES).find(([,c])=>c==='rate-limited')![0];
  const raw={type:'RunError',_sequenza:3,runId:'r1',code:'PROVIDER_REQUEST_ERROR',message:sentence};
  assert.equal((createV2EventBridge('s1',()=>'t').translate(raw)?.data.error as any)?.raw,sentence,'the v2 error keeps the kernel text in raw');
  const adapter:any=createTuiEventAdapter();adapter.bindSession?.('s1');
  let model=createTranscriptModel();
  model=reduceTranscriptEvent(model,adapter.translate({type:'RunStarted',_sequenza:2,sessionId:'s1',runId:'r1'}));
  model=reduceTranscriptEvent(model,adapter.translate(raw));
  const text=model.items.map(transcriptItemText).join('\n');
  assert.match(text,/limiting requests \(HTTP 429\)/u,text);
  assert.match(text,/Wait a moment/u,text);
});
