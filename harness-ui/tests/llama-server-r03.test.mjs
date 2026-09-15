import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

function banco(t, { gpu='driver', cpu='pronto', fallback=true }={}) {
  const chiamate=[], figli=[], serrature=[], sonde=[];
  const supervisor=createLlamaServerSupervisor({binaryPath:resolve('vulkan.exe'),fallbackBinaryPath:fallback?resolve('cpu.exe'):undefined,gpuLayers:99,
    motore:{variante:'vulkan',dispositivi:['AMD Radeon RX 9070 XT']},pollIntervalMs:10,healthTimeoutMs:2500,
    modelStore:{lock:async id=>serrature.push('+'+id),unlock:async id=>serrature.push('-'+id)},
    sondaBinario:(p,args)=>{sonde.push([p,args]);return p.endsWith('vulkan.exe')?'--spec-type ngram-mod':null;},
    spawnImpl:(p,args,options)=>{chiamate.push({p,args,options});const proc=spawn(process.execPath,[fileURLToPath(new URL('./fixtures/llama-server-r03.cjs',import.meta.url)),p.endsWith('cpu.exe')?cpu:gpu,...args],{...options,cwd:process.cwd()});figli.push(proc);return proc;},
  });
  t.after(async()=>{await supervisor.stop();await Promise.all(figli.map(async p=>{if(p.exitCode===null&&p.signalCode===null){const chiuso=once(p,'close');p.kill();await chiuso;}}));});
  return {supervisor,chiamate,serrature,sonde,figli};
}
const modello={modelId:'scelto-dalla-persona',modelPath:resolve('fixture.gguf'),contextLength:8192};
for(const gpu of ['driver','perso'])test('R03-RIPIEGO — '+gpu+' su processo vero passa una sola volta a CPU',async t=>{
  const {supervisor,chiamate,serrature,sonde}=banco(t,{gpu});const eventi=[];supervisor.subscribeLogs(e=>eventi.push(e));
  const stato=await supervisor.start(modello);assert.equal(stato.state,'ready');assert.equal(stato.motore.variante,'cpu');assert.equal(stato.motore.ripiego.da,'vulkan');
  assert.equal(chiamate.length,2);assert.equal(chiamate[1].p,resolve('cpu.exe'));const args=chiamate[1].args;
  assert.equal(args[args.indexOf('-ngl')+1],'0');assert.equal(args[args.indexOf('--device')+1],'none');assert.equal(args[args.indexOf('-c')+1],'8192');
  assert.equal(args.includes('-fa'),false);assert.equal(args.includes('--spec-type'),false);assert.ok(sonde.some(([p])=>p===resolve('cpu.exe')));
  assert.deepEqual(serrature,['+scelto-dalla-persona']);assert.ok(eventi.some(e=>e.ripiego?.a==='cpu'));
  assert.equal(JSON.stringify(stato).includes(chiamate[1].args[chiamate[1].args.indexOf('--api-key')+1]),false);
  await supervisor.stop();assert.deepEqual(serrature,['+scelto-dalla-persona','-scelto-dalla-persona']);
});
test('R03-DOPPIO-GUASTO — conserva le due code, non tenta un terzo processo',async t=>{
  const {supervisor,chiamate,serrature}=banco(t,{cpu:'cpuGuasta'});
  await assert.rejects(supervisor.start(modello),e=>e.code==='RUNTIME_PROCESS_FAILED'&&/ErrorIncompatibleDriver/.test(e.message)&&/CPU: impossibile/.test(e.message));
  assert.equal(chiamate.length,2);assert.equal(supervisor.status().state,'failed');assert.equal(supervisor.status().motore.ripiego.a,'cpu');assert.equal(serrature.length,2);
});
for(const [gpu,fallback] of [['generico',true],['driver',false],['memoria',true]])test('R03-NON-RIPIEGA — '+gpu+' fallback='+fallback,async t=>{
  const {supervisor,chiamate}=banco(t,{gpu,fallback});await assert.rejects(supervisor.start(modello),e=>e.code==='RUNTIME_PROCESS_FAILED');assert.equal(chiamate.length,1);
  assert.equal(supervisor.status().motore.ripiego,null);
  if(gpu==='memoria')assert.equal(supervisor.status().motore.proposta.a,'cpu');
});
test('R03-READY — avviso memoria senza morte non cambia motore; morte dopo ready non riparte',async t=>{
  const {supervisor,chiamate,figli}=banco(t,{gpu:'avvisoMemoria'});const stato=await supervisor.start(modello);assert.equal(stato.motore.variante,'vulkan');assert.equal(stato.motore.ripiego,null);
  const chiuso=once(figli[0],'close');figli[0].kill();await chiuso;assert.equal(supervisor.status().state,'failed');assert.equal(chiamate.length,1);
});
test('R03-RIPROVA — stop e nuovo caricamento ritentano il binario GPU originale',async t=>{
  const {supervisor,chiamate}=banco(t);await supervisor.start(modello);await supervisor.stop();await supervisor.start(modello);
  assert.deepEqual(chiamate.map(c=>c.p),[resolve('vulkan.exe'),resolve('cpu.exe'),resolve('vulkan.exe'),resolve('cpu.exe')]);
});
