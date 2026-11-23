/*
 * Third adversarial review of 0.6.2 (bugfixer, 13/10/2026, on 550e25973). RED ON PURPOSE: it proves a finding, it is not a cure.
 *
 * The status row keeps a «verified» for an hour and, at the next start, shows it with NO check (catalog-service.ts
 * `refreshProviderState`: fresh and it vouches -> answered from the file). Nothing on that path asks whether this process HAS a
 * key for the provider. So whenever the key went away by a door that did not reset the file — an environment key that is not
 * set in this shell any more, a key removed by an older TALOS or in the system's credential manager, a reset whose write failed
 * (`writeProviderStateSnapshot` returns false and nobody reads it) — the next start reads «<provider>: verified» for a provider
 * that needs a key and has none, and makes no check that would say otherwise. The first turn then fails for a missing key.
 *
 * Mocks only: a fake probe, a snapshot in a temp folder, no key is real, nothing leaves the machine.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {providerStateVouches,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';

const REGISTRY={
  openai:{id:'openai',destinazioneChat:true,etichetta:'OpenAI',chiaveObbligatoria:true,baseUrl:'https://openai.example/v1'},
};

test('a provider that needs a key and has none is not «verified» at the next start, whatever the file kept',async t=>{
  const root=mkdtempSync(join(tmpdir(),'talos-review-062c-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=join(root,'provider-state.json');
  /* ten minutes ago, in another run, a check accepted the key that was in use then (an environment key, say) */
  const tenMinutesAgo=Date.now()-10*60_000;
  writeProviderStateSnapshot({file,now:tenMinutesAgo,providers:{openai:{state:'available',verified:true,checkedAt:tenMinutesAgo,latencyMs:20}}});
  /* this start: there is NO key for the provider any more */
  let probes=0;
  const catalog=createTuiCatalogService({
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://openai.example/v1',timeoutSeconds:5}),
    keyFor:()=>null,setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string)=>{probes+=1;return{provider:id,esito:'non-provabile',codice:'PROVIDER_KEY_MISSING'};},elencaModelli:async()=>[]}),
    persistModel:async()=>{},providerStateFile:file,
  } as unknown as TuiCatalogDeps);
  /* what the screen does at start: the one refresh, then it reads the row */
  await catalog.refreshProviderState!('openai');
  const row=catalog.providerState!('openai')!;
  assert.equal(providerStateVouches(row)&&row.fresh,false,`the row reads «openai: verified» with no key at all (probes made: ${probes}): ${JSON.stringify(row)}`);
});
