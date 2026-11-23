/*
 * 0.7.0 (judge v2451, list item 13): the first-run fixture lets a test reach only a loopback port a server of its own process listens
 * on. The probes of the local engines (Ollama 11434, LM Studio 1234) and any other loopback port are answered in the process as a
 * closed port answers, and recorded; the real fetch never sees them. A sentinel stands in for the real fetch, so nothing here
 * leaves the process either way.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {closedPort,hermetic,ownLoopbackPort,startFakeProvider} from './first-run-fixture.ts';

test('the fixture answers 11434, 1234 and any port of no server of this process as a closed port, and never passes them on',async()=>{
  const outer=globalThis.fetch;const reached:string[]=[];
  globalThis.fetch=(async(input:any)=>{reached.push(String(input?.url??input));return new Response('{"data":[]}',{status:200,headers:{'content-type':'application/json'}});}) as typeof fetch;
  try{
    await hermetic(async h=>{
      const gone=await closedPort();assert.equal(ownLoopbackPort(gone),false,'a closed server leaves the set');
      for(const url of ['http://127.0.0.1:11434/api/tags','http://127.0.0.1:1234/api/v1/models',`http://127.0.0.1:${gone}/models`]){
        await assert.rejects(fetch(url),(error:any)=>error instanceof TypeError&&error.message==='fetch failed'&&error.cause?.code==='ECONNREFUSED',url);
      }
      assert.deepEqual(h.network.localEngines,['http://127.0.0.1:11434','http://127.0.0.1:1234']);
      assert.deepEqual(h.network.blocked,[`http://127.0.0.1:${gone}`]);
      const provider=await startFakeProvider({goodKey:'k',models:[{id:'m',name:'m'}]});
      try{
        assert.equal(ownLoopbackPort(provider.port),true);
        assert.equal((await fetch(`${provider.url}/models`)).status,200,'a server of this process is reached');
      }finally{await provider.close();}
      assert.equal(ownLoopbackPort(provider.port),false);
    });
  }finally{globalThis.fetch=outer;}
  assert.equal(reached.filter(url=>/:(11434|1234)\//u.test(url)).length,0,'the local engines never reached the real fetch');
  assert.equal(reached.length,1,'only the fake provider of this process went on');
});
