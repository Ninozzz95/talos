import test from 'node:test';import assert from 'node:assert/strict';
import {collectHeadlessResume,collectHeadlessFork} from '../../src/headless/run.ts';

/*
 * RICERCA 5×5×5×5 cambio-modello (2026-10-05, dossier §0.2/§5.1) — il difetto
 * #2 lato headless: `collectHeadlessResume`/`collectHeadlessFork` chiamavano
 * `runtime.resume(id,prompt)` SENZA portare il `--model` di riga di comando,
 * che main.ts aveva già messo in `common.model`. Contratto §5.1: il flag
 * viaggia nell'options-bag `{model}` del runtime; senza flag, nessuna opzione.
 */

function runtimeFinto(){
  const resumeArgs:any[]=[];const forkArgs:any[]=[];
  return{
    resumeArgs,forkArgs,
    resume:async(...args:any[])=>{resumeArgs.push(args);return 's';},
    fork:async(...args:any[])=>{forkArgs.push(args);return 's2';},
    subscribe(_id:string,sink:(e:any)=>void,_from?:number){queueMicrotask(()=>[{type:'RunFinished'}].forEach(sink));return()=>{};},
    answerApproval:async()=>{},cancel:async()=>{},
  };
}
const BASE={projectRoot:process.cwd(),model:'mm',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]}} as any;

test('resume headless: il --model di riga di comando arriva al runtime nell\u2019options-bag',async()=>{
  const rt=runtimeFinto();
  /* review B #1: il flag viaggia in explicitModel — `model` è sempre il default di config (selectedModel di main.ts). */
  await collectHeadlessResume(rt,'s','continua',{...BASE,explicitModel:'mm'} as any);
  assert.equal(rt.resumeArgs.length,1);
  assert.deepEqual(rt.resumeArgs[0]!.slice(0,2),['s','continua']);
  assert.deepEqual(rt.resumeArgs[0]![3],{model:'mm'},'il flag --model viaggia fino al runtime (dossier §5.1)');
});

test('resume headless senza modello esplicito: nessuna opzione, il runtime usa il modello salvato',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessResume(rt,'s','continua',{...BASE,model:undefined} as any);
  assert.equal(rt.resumeArgs[0]![3],undefined,'nessun override inventato');
});

test('resume headless con modello vuoto/spazi: nessuna opzione',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessResume(rt,'s','continua',{...BASE,model:'   '} as any);
  assert.equal(rt.resumeArgs[0]![3],undefined);
});

test('fork headless: stesso contratto per il modello esplicito',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessFork(rt,'s','ramo',{...BASE,explicitModel:'mm'} as any);
  assert.equal(rt.forkArgs.length,1);
  assert.deepEqual(rt.forkArgs[0]!.slice(0,2),['s','ramo']);
  assert.deepEqual(rt.forkArgs[0]![3],{model:'mm'});
  const rt2=runtimeFinto();
  await collectHeadlessFork(rt2,'s','ramo',{...BASE,model:undefined} as any);
  assert.equal(rt2.forkArgs[0]![3],undefined);
});

/* review B #1 (2026-10-06): main.ts riempie `model` col DEFAULT DI CONFIG (selectedModel, mai vuoto) — leggerlo come
   override persisteva quel default sul modello salvato della sessione a ogni resume/fork dato senza --model.
   L'override viaggia SOLO in `explicitModel`, il flag che la persona ha scritto davvero; questi test usano la forma
   esatta del bag che main.ts produce, non forme sintetiche (il punto cieco della prima fornitura di test). */
const WIRING={...BASE,model:'openai:gpt-5-mini'} as any;/* il bag che main.ts costruisce quando --model NON c'è */

test('resume headless col bag di main.ts SENZA flag: NESSUN override (il default di config non si persiste)',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessResume(rt,'s','continua',{...WIRING} as any);
  assert.equal(rt.resumeArgs[0]![3],undefined,'modelOverride ignora il default di config: nessun options-bag');
});

test('resume headless col bag di main.ts CON --model esplicito: l\u2019override viaggia in explicitModel',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessResume(rt,'s','continua',{...WIRING,explicitModel:'nuovo:m'} as any);
  assert.deepEqual(rt.resumeArgs[0]![3],{model:'nuovo:m'});
  const rt2=runtimeFinto();
  await collectHeadlessResume(rt2,'s','continua',{...WIRING,explicitModel:'   '} as any);
  assert.equal(rt2.resumeArgs[0]![3],undefined,'un flag vuoto non è un override');
});

test('fork headless: stesso contratto col bag di main.ts',async()=>{
  const rt=runtimeFinto();
  await collectHeadlessFork(rt,'s','ramo',{...WIRING} as any);
  assert.equal(rt.forkArgs[0]![3],undefined,'nemmeno il fork persiste il default di config');
  const rt2=runtimeFinto();
  await collectHeadlessFork(rt2,'s','ramo',{...WIRING,explicitModel:'nuovo:m'} as any);
  assert.deepEqual(rt2.forkArgs[0]![3],{model:'nuovo:m'});
});

/* review B #5: replay senza prompt — un --model esplicito scartato non sparisce senza parola. */
test('replay senza prompt con --model esplicito: il warning dichiara che il flag è ignorato',async()=>{
  const sincrono={subscribe(_id:string,sink:(e:any)=>void,_from?:number){[{type:'RunFinished'}].forEach(sink);return()=>{};}};
  const rt={...runtimeFinto(),...sincrono};
  const senza=await collectHeadlessResume(rt,'s',undefined,{...WIRING} as any);
  assert.deepEqual((senza.result as any).warnings,['No prompt given: the pending turn was not restarted; the session was replayed as-is. Pass a prompt or pipe one to continue the turn.'],'senza flag il messaggio resta quello pinnato dal test C1');
  const con=await collectHeadlessResume(rt,'s',undefined,{...WIRING,explicitModel:'nuovo:m'} as any);
  assert.match(((con.result as any).warnings as string[])[0]!,/The --model flag was ignored: without a prompt there is no turn to apply it to\./u);
});
