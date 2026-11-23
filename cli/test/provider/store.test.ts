import assert from 'node:assert/strict';
import test from 'node:test';
import {createCliProviderStore} from '../../src/provider/store.ts';

test('provider store prefers environment but never persists it', async()=>{
  const saved:Record<string,string>={};
  const keyring={get:async()=>saved.openai??null,set:async(_s:string,_a:string,v:string)=>{saved.openai=v;},remove:async()=>{delete saved.openai;}};
  const store=createCliProviderStore({env:{OPENAI_API_KEY:'env-key'},keyring,definitions:{openai:{env:['OPENAI_API_KEY'],requiresKey:true}}});
  assert.equal(await store.getKey('openai'),'env-key');
  assert.equal(saved.openai,undefined);
});

test('provider keyring uses CLI service namespace', async()=>{
  const calls:string[][]=[];
  const keyring={get:async(s:string,a:string)=>{calls.push(['get',s,a]);return null;},set:async(s:string,a:string,v:string)=>{calls.push(['set',s,a,v]);},remove:async()=>{}};
  const store=createCliProviderStore({env:{},keyring,definitions:{openai:{env:['OPENAI_API_KEY'],requiresKey:true}}});
  await store.setKey('openai','sk-test');
  assert.deepEqual(calls[0]?.slice(0,3),['set','talos-cli-provider','openai']);
});

test('provider public listing never exposes key value', async()=>{
  const keyring={get:async()=> 'secret-value',set:async()=>{},remove:async()=>{}};
  const store=createCliProviderStore({env:{},keyring,definitions:{openai:{env:['OPENAI_API_KEY'],requiresKey:true,label:'OpenAI'}}});
  const rows=await store.listPublic();
  assert.equal(rows[0]?.configured,true);
  assert.equal(JSON.stringify(rows).includes('secret-value'),false);
});
