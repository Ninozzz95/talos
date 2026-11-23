import test from 'node:test';
import assert from 'node:assert/strict';
import {createForgeFacade} from '../../src/services/forge-facade.ts';

const manifest={id:'safe-tool',title:'Safe',description:'Safe tool',flow:{entry:'c',maxTransitions:8,nodes:[{id:'c',type:'capability',capability:'notes.create',input:{title:'sim'},target:'$.state.note',next:'r'},{id:'r',type:'return',value:{$ref:'$.state.note'}}]}};
const pkg={schemaVersion:1,revision:1,manifest,simulation:{input:{},capabilityResults:{'notes.create':{id:'simulated-note'}}}};

function deps(){
  const calls:any[]=[];
  const registry:any={
    installaVersioneToolForgiato:async(sessionId:string,spec:any)=>{calls.push(['install',sessionId,spec]);return{ok:true,strumento:{id:spec.manifest.id,ownerRevision:spec.revision,abilitato:false}}},
    versioniToolForgiato:async(sessionId:string,id:string)=>{calls.push(['versions',sessionId,id]);return{ok:true,versioni:[{revision:1}]}},
    ripristinaVersioneToolForgiato:async(sessionId:string,id:string,revision:number)=>{calls.push(['rollback',sessionId,id,revision]);return{ok:true,strumento:{id,ownerRevision:revision,abilitato:false}}},
    abilitaToolForgiato:async(sessionId:string,id:string,enabled:boolean)=>{calls.push(['enable',sessionId,id,enabled]);return{ok:true}},
  };
  return{calls,value:{
    registry,
    loadContract:async()=>({
      validaManifestForgeLocale:()=>({ok:true,diagnostica:[],capacita:['notes.create'],azioni:['write'],rischio:'R2'}),
      eseguiFlowForgeLocale:async(_:any,input:any,{capacitaFn}:any)=>({ok:true,value:await capacitaFn('notes.create',{title:'sim'}),trace:[{node:'c'},{node:'r'}],input}),
    }),
    loadStore:async()=>({elencaToolForgiati:async()=>[{id:'safe-tool',manifest,abilitato:false,ownerManaged:true,ownerRevision:1}],leggiToolForgiato:async()=>({id:'safe-tool',manifest,abilitato:false,ownerManaged:true,ownerRevision:1})}),
    now:()=>new Date('2026-09-21T12:00:00.000Z'),
  }};
}

test('M10-C RED — simulation uses canonical interpreter behind a sealed fake capability boundary and emits digest-bound side-effect-free evidence',async()=>{
  const d=deps();const facade=createForgeFacade({forgeRoot:'/forge',repoRoot:'/repo'},d.value as any);
  const analysis=await facade.analyzePackage(pkg as any);
  assert.equal(analysis.validation.ok,true);assert.equal(analysis.scan.ok,true);assert.equal(analysis.simulation.ok,true);
  assert.deepEqual(analysis.simulation.capabilityRequests,[{capability:'notes.create',input:{title:'sim'},result:{id:'simulated-note'}}]);
  assert.equal(analysis.evidence.sideEffects,false);assert.equal(analysis.evidence.sandbox.kind,'declarative-fake-capability-boundary');
  assert.match(analysis.evidence.packageDigest,/^[a-f0-9]{64}$/u);assert.equal(analysis.evidence.ownerRevision,1);
});

test('M10-C RED — owner install requires passing analysis, delegates only to owner registry, and remains disabled',async()=>{
  const d=deps();const facade=createForgeFacade({forgeRoot:'/forge',repoRoot:'/repo'},d.value as any);
  const result=await facade.installPackage('owner-session',pkg as any);
  assert.equal(result.instrument.ownerRevision,1);assert.equal(result.instrument.abilitato,false);
  assert.equal(d.calls[0][0],'install');assert.equal(d.calls[0][1],'owner-session');
  assert.equal(d.calls[0][2].manifest.version,undefined,'owner revision must not leak into executable manifest');
  assert.equal(d.calls[0][2].evidence.sideEffects,false);
});

test('M10-C RED — rollback and enable are separate owner actions',async()=>{
  const d=deps();const facade=createForgeFacade({forgeRoot:'/forge',repoRoot:'/repo'},d.value as any);
  await facade.rollback('owner-session','safe-tool',1);
  await facade.setEnabled('owner-session','safe-tool',true);
  assert.deepEqual(d.calls.map(x=>x[0]),['rollback','enable']);
});

test('M10-C RED — blocking scan or failed simulation prevents owner install entirely',async()=>{
  const d=deps();d.value.loadContract=async()=>({validaManifestForgeLocale:()=>({ok:false,diagnostica:['bad'],capacita:[],azioni:[],rischio:'R1'}),eseguiFlowForgeLocale:async()=>({ok:true})});
  const facade=createForgeFacade({forgeRoot:'/forge',repoRoot:'/repo'},d.value as any);
  await assert.rejects(()=>facade.installPackage('owner-session',pkg as any),/FORGE_ANALYSIS_BLOCKED/u);
  assert.deepEqual(d.calls,[]);
});
