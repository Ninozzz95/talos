/*
 * R4 lane F — `talos provider test` speaks English (owner decision Q-R4-16 (a), gate E11). The kernel's probe explains its
 * result in Italian (`harness-ui/src/provider-probe.mjs`, `motivo`). Its sentences are kernel CONSTANTS with the provider label,
 * a count, a status or a number of seconds as the only variables: each is matched WHOLE against a pinned template and printed
 * in English; any other sentence is not printed (the state and the remedy lines still are). The JSON profile is data and keeps
 * the kernel's detail. The templates are pinned against the kernel source, so a reworded kernel turns this test red.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';
import {KERNEL_PROBE_REASONS,kernelProbeDetail} from '../../src/i18n/kernel-map.ts';

const PROBE_SOURCE=readFileSync(new URL('../../../harness-ui/src/provider-probe.mjs',import.meta.url),'utf8');
const ITALIAN=/\b(catalogo|raggiunto|visibili|generazione|provata|chiave|credenziale|fornitore|risposta|nessuna|indirizzo|rifiutato)\b/iu;

async function providerTest(detail:string,state='available',format:'text'|'json'='text'){
  const out:string[]=[];
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:'/p',paths:{},repoRoot:'/repo',
    createRuntimeContext:async()=>({providerStore:{},tuiCatalog:{},providerControlPlane:{probe:async()=>({id:'ollama',label:'Ollama Local',lastHealth:{state,detail,latencyMs:3,observedAt:1,httpStatus:200},remediation:{code:'none',message:''}})}})};
  const code=await runProviderCommand(ctx,['test','ollama']);
  return{code,text:out.join('')};
}

test('Q-R4-16: the kernel\'s "catalogue reached" sentence is printed in English',async()=>{
  const {code,text}=await providerTest('Ollama Local: catalogo raggiunto, 1 modelli visibili. La generazione non è stata provata.');
  assert.equal(code,0);
  assert.equal(text,'Ollama Local: available · 3 ms\nOllama Local answered with its model list: 1 model. No message was generated.\n');
  assert.doesNotMatch(text,ITALIAN);
});

test('Q-R4-16: every pinned sentence has English words and none of the Italian ones',()=>{
  const cases:[string,RegExp][]=[
    ['OpenAI: catalogo raggiunto, 42 modelli visibili. La generazione non è stata provata.',/^OpenAI answered with its model list: 42 models\. No message was generated\.$/u],
    ['Qwen: catalogo raggiunto, 7 modelli visibili nella prima pagina. La generazione non è stata provata.',/^Qwen answered with its model list: 7 models on the first page\. No message was generated\.$/u],
    ['OpenRouter: catalogo pubblico raggiunto, 300 modelli visibili; chiave non verificata. La generazione non è stata provata.',/^OpenRouter answered with its public model list: 300 models\. The key was not checked, and no message was generated\.$/u],
    ['Z.ai: credenziale accettata.',/^Z\.ai accepted the key\.$/u],
    ['Non è stato possibile raggiungere Ollama Local.',/^Ollama Local could not be reached\.$/u],
    ['LM Studio: nessuna risposta entro 30 secondi.',/^LM Studio did not answer within 30 seconds\.$/u],
    ['OpenAI ha rifiutato la credenziale (HTTP 401).',/^OpenAI refused the key \(HTTP 401\)\.$/u],
    ['OpenAI: credenziale non accettata (HTTP 401).',/^OpenAI did not accept the key \(HTTP 401\)\.$/u],
    ['OpenAI: accesso negato (HTTP 403); controlla i permessi.',/^OpenAI denied access \(HTTP 403\); check the key's permissions\.$/u],
    ['OpenAI ha risposto HTTP 500.',/^OpenAI answered HTTP 500\.$/u],
    ["Manca l'indirizzo di LM Studio.",/^LM Studio has no address set\.$/u],
    ['Nessuna chiave salvata per OpenAI.',/^No key is saved for OpenAI\.$/u],
    ['DeepInfra: richiesta minima di generazione riuscita; elenco modelli non verificato.',/^DeepInfra answered a one-token request; its model list was not checked\.$/u],
  ];
  for(const [italian,english] of cases){
    const text=kernelProbeDetail(italian);
    assert.ok(text,`not mapped: ${italian}`);
    assert.match(text!,english);assert.doesNotMatch(text!,ITALIAN,text!);
  }
});

test('Q-R4-16: a sentence no template matches is not printed; the state and the remedy still are',async()=>{
  assert.equal(kernelProbeDetail('Questo è un messaggio nuovo del kernel.'),null);
  assert.equal(kernelProbeDetail('Ollama Local: catalogo raggiunto, 1 modelli visibili. La generazione non è stata provata. E altro.'),null,'matched whole, never searched');
  const {text}=await providerTest('Una frase nuova che nessun modello conosce.','error');
  assert.equal(text,'Ollama Local: error · 3 ms\n');
});

test('Q-R4-16: the JSON profile keeps the kernel\'s detail as data',async()=>{
  const detail='Ollama Local: catalogo raggiunto, 1 modelli visibili. La generazione non è stata provata.';
  const {text}=await providerTest(detail,'available','json');
  assert.equal(JSON.parse(text).lastHealth.detail,detail);
});

test('Q-R4-16: the TUI\'s provider check gets the same English (it falls back to the detail when there is no remedy)',async()=>{
  const {createTuiCatalogService}=await import('../../src/tui/catalog-service.ts');
  const probeWith=(detail:string)=>createTuiCatalogService({publicProviders:()=>[],registry:{ollama:{id:'ollama',etichetta:'Ollama Local',destinazioneChat:true}},runtimeFor:()=>({}),keyFor:()=>null,setKey(){},clearKey(){},persistModel:async()=>{},createProbe:()=>({prova:async()=>({}),elencaModelli:async()=>({})}),
    controlPlane:{list:()=>[],get:()=>({}) as any,invalidate(){},readiness:()=>({ready:true}) as any,probe:async()=>({id:'ollama',label:'Ollama Local',lastHealth:{state:'available',detail,latencyMs:1,observedAt:1,httpStatus:200},remediation:{code:'none',message:''}}) as any}}).probeProvider('ollama');
  assert.equal((await probeWith('Ollama Local: catalogo raggiunto, 2 modelli visibili. La generazione non è stata provata.')).detail,'Ollama Local answered with its model list: 2 models. No message was generated.');
  assert.equal((await probeWith('HTTP 401')).detail,'HTTP 401','a detail the CLI wrote in English is kept');
  assert.equal((await probeWith('Una frase nuova che nessun modello conosce.')).detail,'','an Italian sentence no template matches is not shown');
});

test('Q-R4-16: each template is pinned against the kernel source',()=>{
  /* K4: the kernel writes English now; the Italian rows stay for details saved before it and carry no pin */
  const pinned=KERNEL_PROBE_REASONS.filter(row=>!row.legacy);
  assert.ok(pinned.length>=18,'every reason the CLI words has its English row');
  for(const row of pinned)assert.ok(row.fragment&&PROBE_SOURCE.includes(row.fragment),`the kernel no longer says "${row.fragment}" (provider-probe.mjs): update the template`);
  for(const row of KERNEL_PROBE_REASONS.filter(row=>row.legacy))assert.equal(row.fragment,undefined,'a legacy row is not pinned');
});

test('Q-R4-16 (K4): the kernel\'s English sentence gets the CLI\'s own wording, like the Italian one before it',async()=>{
  const {kernelProbeDetail}=await import('../../src/i18n/kernel-map.ts');
  const english=kernelProbeDetail('Ollama Local: catalog reached, 2 models visible. Generation was not tested.');
  assert.equal(english,kernelProbeDetail('Ollama Local: catalogo raggiunto, 2 modelli visibili. La generazione non è stata provata.'));
  assert.equal(english,'Ollama Local answered with its model list: 2 models. No message was generated.');
  assert.equal(kernelProbeDetail('Could not reach OpenRouter.'),kernelProbeDetail('Non è stato possibile raggiungere OpenRouter.'));
});
