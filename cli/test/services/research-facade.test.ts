import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchFacade} from '../../src/services/research-facade.ts';

const metadata={id:'r1',domanda:'Question?',profondita:'deep',terminata:null,avviataAlle:'2026-09-21T10:00:00.000Z',conclusaAlle:null};
const record={
  version:1,question:'Question?',summary:'Summary',judge:'judge:model',
  claims:[
    {text:'Claim A',sourceIndex:1,passage:'Exact passage A',checks:{quotePresent:true,quoteSpan:{start:0,end:15},claimSupported:'contested',supportReason:'opposing source',judge:'judge:model',judgedAt:'2026-09-21T10:02:00.000Z',opposing:[{url:'https://opposing.example',title:'Opposing',passage:'No'}]}},
    {text:'Claim B',sourceIndex:1,passage:'Exact passage B',checks:{quotePresent:true,quoteSpan:{start:16,end:31},claimSupported:'partial',supportReason:'partial',judge:'judge:model',judgedAt:'2026-09-21T10:02:00.000Z'}},
    {text:'Claim C',sourceIndex:1,passage:'Exact passage C',checks:{quotePresent:true,quoteSpan:{start:32,end:47},claimSupported:'yes',supportReason:'yes',judge:'judge:model',judgedAt:'2026-09-21T10:02:00.000Z'}},
    {text:'Claim D',sourceIndex:1,passage:'Exact passage D',checks:{quotePresent:true,quoteSpan:{start:48,end:63},claimSupported:'no',supportReason:'no',judge:'judge:model',judgedAt:'2026-09-21T10:02:00.000Z'}},
    {text:'Claim E',sourceIndex:1,passage:'Exact passage E',checks:{quotePresent:false,quoteSpan:null,claimSupported:'unchecked',supportReason:'unchecked',judge:null,judgedAt:null}},
  ],
  sources:[{url:'https://source.example',title:'Source title',publishedAt:'2026-09-20',obtained:'page'}],
};

function deps(overrides:any={}){
  const calls:string[]=[];let written:any=null;let exported:any=null;
  const registry:any={
    pausaRicerca:async(owner:string,id:string)=>{calls.push('pause:'+owner+':'+id);return{ok:true,esito:'pause_requested'};},
    riprendiRicerca:async(owner:string,id:string)=>{calls.push('resume:'+owner+':'+id);return{ok:true,esito:'running'};},
    annullaRicerca:async(owner:string,id:string)=>{calls.push('cancel:'+owner+':'+id);return{ok:true,esito:'cancel_requested'};},
    ferma:()=>{throw new Error('generic stop must not be used');},
  };
  return {calls,get written(){return written;},get exported(){return exported;},value:{
    loadStore:async()=>({
      elencaRicerche:async()=>[metadata],leggiRicerca:async({id}:any)=>id==='r1'?metadata:null,
      leggiGiornale:async()=>({eventi:[{kind:'plan_ready'}],righeSaltate:0,byte:42}),
      leggiPiano:async()=>[{id:'b1'}],leggiRapporto:async()=> 'canonical report document',
    }),
    loadRun:async()=>({
      talosResearchReplay:()=>({status:'pause_requested'}),
      talosResearchProgressOf:()=>({done:2,total:5}),
      talosResearchSpent:()=>({searches:3,pages:2}),
    }),
    parseReport:()=>record,
    exportResearch:async(input:any)=>{exported=input;return{formato:input.formato,nomeFile:'research.json',mediaType:'application/json',bytes:new TextEncoder().encode('EXACT')};},
    writeExportFile:async(path:string,bytes:Uint8Array)=>{written={path,bytes:[...bytes]};},
    registry,...overrides,
  }};
}

test('M10-A RED — journal phase/progress and claim→source→passage evidence are projected without collapsing verification states',async()=>{
  const d=deps();const facade=createResearchFacade({projectRoot:'/project',repoRoot:'/repo'},d.value as any);
  const detail=await facade.read('r1');
  assert.equal(detail.phase,'pause_requested');assert.deepEqual(detail.progress,{done:2,total:5});assert.equal(detail.journal?.skippedRows,0);
  assert.deepEqual(detail.claims?.map((c:any)=>c.verification),['contested','partial','yes','no','unchecked']);
  assert.equal(detail.claims?.[0]?.passage,'Exact passage A');assert.equal(detail.claims?.[0]?.source?.number,1);assert.equal(detail.claims?.[0]?.source?.url,'https://source.example');
  assert.equal(detail.summary,'Summary');
});

test('M10-A RED — absent report stays unmeasured instead of becoming verified-none',async()=>{
  const d=deps({parseReport:()=>null});const facade=createResearchFacade({projectRoot:'/project',repoRoot:'/repo'},d.value as any);
  const detail=await facade.read('r1');assert.equal(detail.claims,null);assert.equal(detail.sources,null);assert.equal(detail.verification,null);
});

test('M10-A RED — pause resume cancel delegate only to the owner research APIs on the supplied live registry',async()=>{
  const d=deps();const facade=createResearchFacade({projectRoot:'/project',repoRoot:'/repo'},d.value as any);
  await facade.pause('owner-session','r1');await facade.resume('owner-session','r1');await facade.cancel('owner-session','r1');
  assert.deepEqual(d.calls,['pause:owner-session:r1','resume:owner-session:r1','cancel:owner-session:r1']);
});

test('M10-A RED — export uses canonical research exporter and writes its exact bytes',async()=>{
  const d=deps();const facade=createResearchFacade({projectRoot:'/project',repoRoot:'/repo'},d.value as any);
  const result=await facade.exportFile('r1','json','/out/research.json');
  assert.equal(d.exported.formato,'json');assert.equal(d.exported.ricerca.id,'r1');assert.equal(d.exported.ricerca.contenutoRapporto,'canonical report document');
  assert.deepEqual(d.written,{path:'/out/research.json',bytes:[69,88,65,67,84]});assert.equal(result.mediaType,'application/json');
});


test('M10-A hardening RED — numeric journal counters narrow unknown before Number.isFinite so strict typecheck has no unknown→number call',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../../src/services/research-facade.ts',import.meta.url),'utf8');
  assert.match(source,/typeof value==='number'&&Number\.isFinite\(value\)/u);
});
