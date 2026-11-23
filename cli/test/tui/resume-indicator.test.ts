import assert from 'node:assert/strict';
import test from 'node:test';
import {createResumeIndicatorComponent,RESUME_INDICATOR_APPEAR_MS,RESUME_INDICATOR_TICK_MS_REDUCED,resumeIndicatorText,resumeIndicatorVisible} from '../../src/tui/resume-indicator.ts';

/*
 * Owner request 05/10 (dossier RICERCA-5x5x5x5-TUI-LOADING-RESUME): ONE constant-height loading line while the boot
 * holds the screen. Reviewed adversarially 06/10 (review A): the risky part is the COMPONENT — its own timer, its
 * periods, its death on unmount — so those behaviours are tested here directly, with a tiny effect-running React
 * harness and node:test mock timers, not only through the pure helpers.
 */

const GLYPHS={spinner:['⠋','⠙','⠹'],bullet:'•'} as const;

test('visibility rides the boot phase machine: only `waiting` shows the line, past the floor',()=>{
  /* A healthy boot is ready during or right after its own reveal (`completeBoot` goes straight to `ready` when
     `runtimeReady` is already true) — `waiting` exists ONLY when the reveal ended and the runtime is still not ready. */
  assert.equal(resumeIndicatorVisible('revealing',0),false);
  assert.equal(resumeIndicatorVisible('revealing',RESUME_INDICATOR_APPEAR_MS),false,'nemmeno un reveal lungo mostra la riga: i frame del boot sono già il feedback');
  assert.equal(resumeIndicatorVisible('revealing',100_000),false);
  assert.equal(resumeIndicatorVisible('waiting',RESUME_INDICATOR_APPEAR_MS-1),false,'belt and braces: il pavimento resta');
  assert.equal(resumeIndicatorVisible('waiting',RESUME_INDICATOR_APPEAR_MS),true);
  assert.equal(resumeIndicatorVisible('waiting',60_000),true);
  assert.equal(resumeIndicatorVisible('ready',60_000),false);
  assert.equal(resumeIndicatorVisible('error',60_000),false);
});

test('one line only: word from the existing vocabulary, no newline, honest clock formats',()=>{
  const motion=resumeIndicatorText({elapsedMs:12_400,glyphs:GLYPHS,motion:true});
  assert.equal(motion.includes('\n'),false,'un rigo a altezza costante: mai newline');
  assert.match(motion,/starting/u,'la parola è quella del vocabolario BusyKind, non una nuova');
  assert.match(motion,/·\s12s$/u);
  assert.equal(resumeIndicatorText({elapsedMs:75_000,glyphs:GLYPHS,motion:true}).match(/·\s(.*)$/u)?.[1],'1m 15s');
  const reduced=resumeIndicatorText({elapsedMs:12_400,glyphs:GLYPHS,motion:false});
  assert.match(reduced,/^• starting · 12s$/u,'reduced motion: bullet statico del tema, non un frame dello spinner');
});

/* ——— il componente: timer, periodi, morte all'unmount (review A, finding maggiore) ——— */
function componentHarness(){
  const hooks:any[]=[];let renderCount=0;let lastTree:any=null;let ComponentRef:((props:any)=>any)|null=null;let currentProps:any=null;let cursor=0;
  const doRender=()=>{if(!ComponentRef)return;cursor=0;renderCount++;lastTree=ComponentRef(currentProps);};
  const React:any={
    useState(init:any){
      const i=cursor++;hooks[i]=hooks[i]??{value:typeof init==='function'?init():init};
      return[hooks[i].value,(next:any)=>{
        const v=typeof next==='function'?next(hooks[i].value):next;
        if(v!==hooks[i].value){hooks[i].value=v;doRender();}
      }];
    },
    useEffect(create:()=>any,deps:unknown[]){
      const i=cursor++;hooks[i]=hooks[i]??{deps:undefined as unknown[]|undefined,cleanup:undefined as (()=>void)|undefined};
      const cell=hooks[i];const prev=cell.deps;
      const changed=prev===undefined||deps.length!==prev.length||deps.some((d,k)=>d!==prev[k]);
      if(changed){
        if(typeof cell.cleanup==='function')cell.cleanup();
        const outcome=create();cell.cleanup=typeof outcome==='function'?outcome:undefined;
        cell.deps=[...deps];
      }
    },
    createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),
  };
  return{
    React,
    get renderCount(){return renderCount;},
    get visible(){return lastTree!==null;},
    get text(){return typeof lastTree?.children?.[0]==='string'?lastTree.children[0]:'';},
    mount(component:(props:any)=>any,props:any){ComponentRef=component;currentProps=props;doRender();},
    update(patch:any){currentProps={...currentProps,...patch};doRender();},
    unmount(){for(const cell of [...hooks].reverse()){if(typeof cell?.cleanup==='function')cell.cleanup();cell.cleanup=undefined;}},
  };
}
const InkFinto:any={Box:'Box',Text:'Text'};
const baseProps=(over:any={})=>({phase:'waiting',startedAt:Date.now(),motion:false,glyphs:GLYPHS,color:'#9D7F24',...over});

test('component, reduced motion: the clock runs at 1 Hz and dies with the unmount (B1 slice 20)',t=>{
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:new Date('2026-10-06T08:00:00Z')});
  const h=componentHarness();const ResumeIndicator=createResumeIndicatorComponent(h.React,InkFinto);
  h.mount(ResumeIndicator,baseProps({phase:'waiting'}));
  assert.equal(h.visible,false,'a elapsed 0 la riga non c\u2019è ancora');
  const start=h.renderCount;
  t.mock.timers.tick(RESUME_INDICATOR_TICK_MS_REDUCED);
  assert.equal(h.renderCount,start+1,'un solo tick in un secondo: 1 Hz');
  assert.ok(h.visible,'a 1 s la riga è visibile (pavimento 400 ms superato)');
  assert.match(h.text,/^• starting · 1s$/u);
  t.mock.timers.tick(500);
  assert.equal(h.renderCount,start+1,'a metà periodo nessun tick');
  t.mock.timers.tick(500);
  assert.equal(h.renderCount,start+2);
  assert.match(h.text,/·\s2s$/u,'l\u2019orologio avanza di secondo in secondo');
  h.unmount();
  t.mock.timers.tick(10_000);
  assert.equal(h.renderCount,start+2,'dopo l\u2019unmount il timer è morto: nessun render, nessun setState orfano');
});

test('component, motion: the spinner runs on the shared 120 ms frame',t=>{
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:new Date('2026-10-06T08:00:00Z')});
  const h=componentHarness();const ResumeIndicator=createResumeIndicatorComponent(h.React,InkFinto);
  h.mount(ResumeIndicator,baseProps({phase:'waiting',motion:true}));
  const start=h.renderCount;
  t.mock.timers.tick(120);
  assert.equal(h.renderCount,start+1,'un tick per frame da 120 ms');
  t.mock.timers.tick(120);
  assert.equal(h.renderCount,start+2);
  assert.equal(h.visible,false,'a 240 ms il pavimento di 400 ms non è ancora superato');
  t.mock.timers.tick(240);
  assert.ok(h.visible,'superato il pavimento (480 ms), la riga compare');
  assert.match(h.text,/^⠙ starting/u,'a 480 ms il frame è il secondo glifo del tema (480/120 % 3)');
});

test('component: in ready and error no timer is even born',t=>{
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:new Date('2026-10-06T08:00:00Z')});
  const h=componentHarness();const ResumeIndicator=createResumeIndicatorComponent(h.React,InkFinto);
  h.mount(ResumeIndicator,baseProps({phase:'ready'}));
  const start=h.renderCount;
  assert.equal(h.visible,false);
  t.mock.timers.tick(10_000);
  assert.equal(h.renderCount,start,'il giro del boot è finito: nessun tick, nessun render');
});

test('component: the reveal never shows the line, however long; the stall (waiting) shows it at once',t=>{
  t.mock.timers.enable({apis:['Date','setInterval','setTimeout'],now:new Date('2026-10-06T08:00:00Z')});
  const h=componentHarness();const ResumeIndicator=createResumeIndicatorComponent(h.React,InkFinto);
  h.mount(ResumeIndicator,baseProps({phase:'revealing'}));
  t.mock.timers.tick(60_000);
  assert.equal(h.visible,false,'60 s di reveal: i frame del boot sono il feedback, la riga non raddoppia');
  h.update({phase:'waiting'});
  assert.ok(h.visible,'il reveal è finito e il runtime non è pronto: la riga compare SUBITO, senza aspettare un altro tick');
  assert.match(h.text,/·\s1m/u,'e l\u2019orologio dice il vero tempo passato');
});
