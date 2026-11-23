/*
 * Second adversarial review of 0.6.2 (bugfixer, 13/10/2026, on e379b2b0a). RED ON PURPOSE: it proves a finding, it is not a cure.
 *
 * The commit says (B2): «`talos provider remove-key` goes through the catalog», so that what the status row's check knew of the
 * key («verified», kept for an hour) is forgotten at the next start. It is — unless a TALOS screen is open meanwhile, which is
 * the ordinary case (the person removes the key in a second terminal). Each catalog reads `provider-state.json` ONCE and, at
 * every later write, writes its WHOLE in-memory map back (catalog-service.ts `rememberProbedState`: «The whole cache is written
 * back»). The open screen still holds «available, verified» for the provider whose key was removed; its next write of ANY
 * provider (a model of another provider chosen, a `/provider` test, a late answer) puts that entry back on disk, with its old
 * `checkedAt`. The next start reads a fresh entry that vouches: «openrouter: verified», no check made, for a key that is gone.
 *
 * Two catalogs on one file stand for the two processes. Mocks only: fake probes, a temp folder, no key is real.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createTuiCatalogService,type TuiCatalogDeps} from '../../src/tui/catalog-service.ts';
import {providerStateVouches,readProviderStateSnapshot,writeProviderStateSnapshot} from '../../src/provider/provider-state-snapshot.ts';

const REGISTRY={
  openrouter:{id:'openrouter',destinazioneChat:true,etichetta:'OpenRouter',chiaveObbligatoria:true,baseUrl:'https://openrouter.example/api/v1'},
  openai:{id:'openai',destinazioneChat:true,etichetta:'OpenAI',chiaveObbligatoria:true,baseUrl:'https://openai.example/v1'},
};
const ACCEPTED=(id:string)=>({provider:id,esito:'collegato',credenzialeVerificata:true,millisecondi:12});
function catalogOn(file:string,counter:{calls:number}){
  return createTuiCatalogService({
    publicProviders:()=>[],registry:REGISTRY,
    runtimeFor:()=>({endpoint:'https://provider.example/v1',timeoutSeconds:5}),
    keyFor:()=>'sk-test-not-a-real-key',setKey:()=>{},clearKey:()=>{},
    createProbe:()=>({prova:async(id:string)=>{counter.calls+=1;return ACCEPTED(id);},elencaModelli:async()=>[]}),
    persistModel:async()=>{},providerStateFile:file,
  } as unknown as TuiCatalogDeps);
}

test('a key removed in another terminal stays forgotten: the open screen\'s next write does not bring «verified» back',async t=>{
  const root=mkdtempSync(join(tmpdir(),'talos-review-062b-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const file=join(root,'provider-state.json');const counter={calls:0};
  /* ten minutes ago a check accepted the OpenRouter key */
  const tenMinutesAgo=Date.now()-10*60_000;
  writeProviderStateSnapshot({file,now:tenMinutesAgo,providers:{openrouter:{state:'available',verified:true,checkedAt:tenMinutesAgo,latencyMs:20}}});
  /* the open screen: it read the file when it drew its row */
  const screen=catalogOn(file,counter);
  assert.equal(screen.providerState!('openrouter').state,'available');
  /* a second terminal: `talos provider remove-key openrouter` (provider-cli.ts -> catalog.clearProviderKey) */
  await catalogOn(file,counter).clearProviderKey('openrouter');
  assert.equal(readProviderStateSnapshot({file}).providers.openrouter?.state,'unverified','the premise: the removal reset the entry on disk');
  /* the open screen goes on: the person picks a model of another provider, whose check lands and is written */
  assert.equal((await screen.refreshProviderState!('openai')).state,'available');
  const onDisk=readProviderStateSnapshot({file}).providers.openrouter;
  assert.equal(providerStateVouches(onDisk),false,`the open screen wrote its old «verified» of the removed key back to the file: ${JSON.stringify(onDisk)}`);
  /* and the next start would not even check it: fresh, and it vouches */
  const next=catalogOn(file,counter);const before=counter.calls;
  const report=await next.refreshProviderState!('openrouter');
  assert.equal(counter.calls,before+1,`the next start made no check and reads ${report.state}/${String(report.verified)} for a key that was removed`);
});
