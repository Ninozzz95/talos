/*
 * F-B-001 (stress test 0.5.0, owner's tester 08/10/2026): `talos provider configure <id> --endpoint <url>` answered
 * PROVIDER_RUNTIME_INVALID for every one of the 29 providers. The command handed the store the WHOLE runtime it had read
 * (`provider`, `endpointConfigured`, …), and the kernel store accepts only `endpoint`, `timeoutSeconds` and `modelli`
 * (provider-credential-store.mjs setRuntime, its whitelist). The old test used a fake store whose runtime had only two
 * fields, so it could not see it; this one goes through the REAL kernel store.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';

const storeModule=pathToFileURL(join(import.meta.dirname,'..','..','..','harness-ui','src','provider-credential-store.mjs')).href;

async function withRealStore(fn:(x:{store:any;run:(args:string[])=>Promise<number>;out:string[]})=>Promise<void>){
  const dir=mkdtempSync(join(tmpdir(),'talos-fb001-'));
  try{
    const {createProviderCredentialStore}=await import(storeModule) as any;
    const store=createProviderCredentialStore({env:{},runtimeFile:join(dir,'provider-runtime.json'),ignoraSemiAmbiente:true});
    const out:string[]=[];
    const runtime={providerStore:store,tuiCatalog:{listProviders:async()=>[]}};
    const ctx={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:dir,paths:{},repoRoot:'/repo',createRuntimeContext:async()=>runtime} as any;
    await fn({store,run:args=>runProviderCommand(ctx,args),out});
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('F-B-001: configure --endpoint saves the address of a provider that takes one (real kernel store)',async()=>{
  await withRealStore(async({store,run})=>{
    assert.equal(await run(['configure','ollama','--endpoint','http://127.0.0.1:11434']),0);
    assert.equal(store.getRuntime('ollama').endpoint,'http://127.0.0.1:11434');
    assert.equal(store.getRuntime('ollama').endpointConfigured,true);
    assert.equal(await run(['configure','openai','--endpoint','https://api.example.com/v1/']),0);
    assert.equal(store.getRuntime('openai').endpoint,'https://api.example.com/v1');
  });
});

test('F-B-001: configure --timeout alone keeps the address that was saved',async()=>{
  await withRealStore(async({store,run})=>{
    assert.equal(await run(['configure','ollama','--endpoint','http://127.0.0.1:11434']),0);
    assert.equal(await run(['configure','ollama','--timeout','90']),0);
    assert.equal(store.getRuntime('ollama').timeoutSeconds,90);
    assert.equal(store.getRuntime('ollama').endpoint,'http://127.0.0.1:11434');
    assert.equal(store.getRuntime('ollama').endpointConfigured,true);
  });
});

test('F-B-001: configure --timeout on a provider with no saved address keeps its default address',async()=>{
  await withRealStore(async({store,run})=>{
    const before=store.getRuntime('ollama').endpoint;
    assert.equal(await run(['configure','ollama','--timeout','45']),0);
    assert.equal(store.getRuntime('ollama').timeoutSeconds,45);
    assert.equal(store.getRuntime('ollama').endpoint,before);
  });
});

test('F-B-001: an address that is not one is still refused, by the store',async()=>{
  await withRealStore(async({run})=>{
    await assert.rejects(run(['configure','openai','--endpoint','not a url']),(error:any)=>String(error?.code??error?.message).includes('PROVIDER_RUNTIME_INVALID'));
  });
});
