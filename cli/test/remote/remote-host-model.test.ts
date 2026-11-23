/*
 * Live run 27/10/2026 with the Pad: a device's new session names no model, so `talos remote` gives it the host's. That model is the
 * one asked with --model, else the person's configured one, else the default. Before, the configuration was skipped and a profile set
 * to another provider refused the device's sessions for a missing OpenAI key.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {remoteHostModel} from '../../src/commands/remote-cli.ts';
import {resolveCliPaths} from '../../src/paths.ts';

test('the host\'s model for a device session: --model, else the configured one, else the default',async()=>{
  const base=mkdtempSync(join(tmpdir(),'talos-remote-model-'));
  try{
    for(const d of ['r','l','u','proj'])mkdirSync(join(base,d),{recursive:true});
    const paths=resolveCliPaths({APPDATA:join(base,'r'),LOCALAPPDATA:join(base,'l'),USERPROFILE:join(base,'u'),HOME:join(base,'u')},'win32',join(base,'u'));
    const ctx=(model?:string)=>({paths,projectRoot:join(base,'proj'),invocation:{...(model?{model}:{})}} as any);
    assert.equal(await remoteHostModel(ctx()),'openai:gpt-5-mini','nothing configured: the default');
    mkdirSync(paths.configRoot,{recursive:true});
    writeFileSync(join(paths.configRoot,'config.json'),JSON.stringify({model:'ollama:qwen3-coder-test'}));
    assert.equal(await remoteHostModel(ctx()),'ollama:qwen3-coder-test','the configured model');
    assert.equal(await remoteHostModel(ctx('anthropic:claude-haiku-4-5')),'anthropic:claude-haiku-4-5','--model wins');
  }finally{rmSync(base,{recursive:true,force:true});}
});

test('live run 27/10: the host restores the saved sessions BEFORE it serves a device, with the configured model',async()=>{
  const {openHost}=await import('../../src/commands/remote-cli.ts');
  const order:string[]=[];let askedModel='';
  const context={remoteKeyring:{},chatImageStore:null,credentialStore:{kind:'file'},registry:{ripristina:async()=>{order.push('ripristina');}}};
  const ctx:any={paths:{dataRoot:'D',configRoot:'C'},projectRoot:'P',repoRoot:'R',invocation:{model:'ollama:x'},
    createRuntimeContext:async(input:any)=>{askedModel=input.model;return context;}};
  const got=await openHost(ctx,{httpDeps:(async()=>({})) as any,createHost:(async(input:any)=>{order.push(`host:${input.ephemeral}`);return{remote:{},stop:async()=>{}};}) as any});
  assert.deepEqual(order,['ripristina','host:false'],'restored first; a file keyring is not ephemeral');
  assert.equal(askedModel,'ollama:x');
  assert.equal(got.context,context);
});
