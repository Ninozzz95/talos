// Controlled transport faults through the real upstream components. These are
// resilience characterizations, never model-quality or native-app scores.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from './engines.mjs';
import { createRecorder, createLoopbackBridge } from './runtime.mjs';
import { makeMemoryHistory, writeCheckpoint, validateSummary } from './cases.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const evidence=join(repo,'scratchpad/prove/autocompact-qualification-20260908');
const root=join(evidence,'faults',new Date().toISOString().replaceAll(':','-'));
await mkdir(root,{recursive:true});
const sources=JSON.parse(await readFile(join(evidence,'sources.json'),'utf8'));
const ownerModule=resolve(repo,'../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs');
const results=[];
for(const arm of ['talos','pi','hermes','lcm']) for(const fault of ['empty','truncated','cancelled','persistence','no-reduction']) {
  const home=join(root,`${arm}-${fault}`);
  await mkdir(home);
  const record=createRecorder(home);
  const original=makeMemoryHistory();
  const checkpoint=join(home,'checkpoint.json');
  await writeCheckpoint(checkpoint,{generation:0,messages:original});
  const baseline=await readFile(checkpoint,'utf8');
  await writeFile(join(home,'original.json'),JSON.stringify(original,null,2));
  let calls=0, engine, bridge, native;
  const row={arm,fault,scope:'real component + controlled transport; external checkpoint guard',tokenCounter:'controlled JSON chars/4, not a model tokenizer'};
  const runtime={model:'controlled-fixture',record,request:async(path,body)=>{
    await record('controlled-request',{path,body});
    if(path.endsWith('input_tokens'))return {input_tokens:Math.ceil(JSON.stringify(body.messages).length/4)};
    if(++calls>12)throw new Error('CONTROLLED_CALL_CEILING');
    if(fault==='cancelled')throw new DOMException('Controlled transport cancelled','AbortError');
    const text=fault==='empty'?'':fault==='no-reduction'?'cronologia invariata '.repeat(8000):'Livia, progetto Aurora, ramo quercia-47, ticket AQ-193, consegna giovedì. Solo letture.';
    const response={id:'controlled',model:'controlled-fixture',created:1,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:fault==='truncated'?'length':'stop'}],usage:{prompt_tokens:1000,completion_tokens:fault==='truncated'?4096:50,total_tokens:1050}};
    await record('controlled-response',{response});
    return response;
  }};
  try {
    bridge=await createLoopbackBridge(runtime);
    engine=await createEngine(arm,{runtime,bridge,sources,home,ownerModule,sessionId:`fault-${arm}-${fault}`});
    native=await engine.compact(structuredClone(original),6000);
    await writeFile(join(home,'native-result.json'),JSON.stringify(native,null,2));
    row.nativeReturned=true;
    row.nativeChanged=JSON.stringify(native.messages)!==JSON.stringify(original);
    // A cancelled owner turn never publishes a checkpoint, even if an upstream
    // handles a transport error by returning a deterministic fallback.
    if(fault==='cancelled')throw new DOMException('Cancelled before publication','AbortError');
    validateSummary(native,{before:JSON.stringify(original).length,after:JSON.stringify(native.messages).length,limit:JSON.stringify(original).length-1});
    await writeCheckpoint(checkpoint,{generation:1,messages:native.messages},{beforeRename:async()=>{if(fault==='persistence')throw new Error('CONTROLLED_PERSISTENCE_FAILURE');}});
    row.externalGuard='published';
  }catch(error){row.error=error.message;row.externalGuard='rejected';}
  finally {await engine?.close();await bridge?.close();}
  row.requestCount=calls;
  row.previousCheckpointUnchanged=(await readFile(checkpoint,'utf8'))===baseline;
  row.originalUnchanged=JSON.stringify(JSON.parse(await readFile(join(home,'original.json'),'utf8')))===JSON.stringify(original);
  results.push(row);
  await appendFile(join(root,'results.jsonl'),JSON.stringify(row)+'\n');
  console.log(JSON.stringify(row));
}
await writeFile(join(root,'summary.json'),JSON.stringify({root,results,qualityBenchmark:false,nativeApplicationPersistenceQualified:false},null,2));
