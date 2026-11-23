/*
 * Bugfixer, adversarial review of 0.6.1 (caff9b156), 13/10/2026. A MEASURE through the real gate and the real composition:
 * `talos model list` (plain, --provider, --json) in a folder that is not trusted reads and writes nothing of that folder, leaves
 * TALOS's own neutral folder empty, records no trust and asks nothing outside the machine; `model use`/`model effort` are as before.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,listFiles,type Hermetic} from '../provider/first-run-fixture.ts';
import {runModelCommand} from '../../src/commands/provider-cli.ts';
import {createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {assessProjectTrust} from '../../src/security/project-trust-gate.ts';

function untrusted(h:Hermetic){
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'folder-chosen:model-xyz',credentials:{store:'memory'}})+'\n');
}
async function bench(h:Hermetic,format:'text'|'json',args:string[]){
  const asked:any[]=[];const built:any[]=[];const out:string[]=[];
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(text:string)=>out.push(text),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:undefined,
    createRuntimeContext:async(input:any)=>{asked.push(input);const {repoRoot:_none,...rest}=input;const context=await createCliRuntimeContext(rest);built.push(context);return context;}};
  try{return{code:await runModelCommand(ctx,args),asked,built,out:out.join('')};}
  finally{for(const context of built)await context.runtime.close?.().catch(()=>{});}
}

for(const [format,args] of [['text',['list']],['json',['list']],['text',['list','--provider','chatgpt']],['json',['list','--provider','chatgpt']],['text',['list','--provider','openai']]] as const){
  test(`model ${args.join(' ')} (${format}) in a folder that is not trusted: nothing of the folder is read or written`,{timeout:120_000},async()=>hermetic(async h=>{
    untrusted(h);const before=listFiles(h.project);
    const done=await bench(h,format,[...args]);
    assert.equal(done.code,0,done.out);
    const neutral=path.join(h.paths.dataRoot,'no-project');
    assert.equal(done.asked.length,2);assert.equal(done.asked[0].trustVerified,undefined);assert.equal(done.asked[1].projectRoot,neutral);assert.equal(done.asked[1].trustVerified,true);
    assert.equal(done.asked[0].model,done.asked[1].model,'the same model is asked for on both tries');
    assert.equal(done.built.length,1);
    assert.doesNotMatch(done.out,/folder-chosen|model-xyz/u,'the model the folder chose is on the list');
    assert.notEqual(done.built[0].credentialStore?.source,'config');
    assert.deepEqual(listFiles(h.project),before);
    assert.deepEqual(fs.readdirSync(neutral),[],'the neutral folder is still empty');
    assert.equal((await assessProjectTrust({projectRoot:h.project,trustRoot:h.paths.trust.projects})).trusted,false);
    console.log(`# ${args.join(' ')} (${format}): blocked=${JSON.stringify(h.network.blocked)} out=${JSON.stringify(done.out.slice(0,160))}`);
    assert.deepEqual(h.network.blocked,[],'something tried to leave the machine');
  }));
}
