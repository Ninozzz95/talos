import {test} from 'node:test';import assert from 'node:assert/strict';
import {datiRuntimeModello} from '../../src/components/runtime-modelli.js';
test('R03-UI — scheda nominata e processore senza dettagli tecnici', () => {
  const r={runtimeId:'llama.cpp',state:'observed',runtimeState:'ready'};
  assert.equal(datiRuntimeModello({...r,motore:{variante:'vulkan',dispositivi:['AMD Radeon RX 9070 XT'],ripiego:null}}).motore,'Motore locale: scheda grafica (Vulkan) · AMD Radeon RX 9070 XT');
  const cpu=datiRuntimeModello({...r,motore:{variante:'cpu',dispositivi:[],ripiego:null}});
  assert.equal(cpu.motore,'Motore locale: processore'); assert.equal(cpu.avvisoMotore,''); assert.equal(cpu.riprovaGrafica,false);
});
test('R03-UI-RIPIEGO — avviso solo sullo stato reale, CPU fallita non dichiara un modello in esecuzione', () => {
  const r={runtimeId:'llama.cpp',state:'observed',runtimeState:'ready',modelId:'scelto',motore:{variante:'cpu',dispositivi:[],ripiego:{da:'vulkan',a:'cpu',motivo:'dispositivo-perso'}}};
  assert.equal(datiRuntimeModello(r).avvisoMotore,'La scheda grafica non è disponibile: il modello gira sul processore');
  assert.equal(datiRuntimeModello(r).riprovaGrafica,true);
  assert.doesNotMatch(datiRuntimeModello({...r,runtimeState:'failed'}).avvisoMotore,/gira sul processore/);
});
test('R03-UI-OOM — propone la CPU da confermare nel menu, non dichiara un ripiego già fatto', () => {
  const d=datiRuntimeModello({runtimeId:'llama.cpp',state:'observed',runtimeState:'failed',motore:{variante:'vulkan',dispositivi:[],ripiego:null,proposta:{a:'cpu',motivo:'memoria-dispositivo-esaurita'}}});
  assert.match(d.avvisoMotore,/Motore locale.*Processore/); assert.match(d.avvisoMotore,/lento/); assert.equal(d.riprovaGrafica,false);
});
test('RUN-OSSERVATO-VUOTO: raggiunto anche senza modelli',()=>{const d=datiRuntimeModello({runtimeId:'ollama',state:'observed',models:[]});assert.equal(d.stato,'Raggiunto');assert.equal(d.modelli,'Nessun modello disponibile');});
test('RUN-CARICATI: disponibili non significa caricati',()=>{for(const runtimeId of ['ollama','lmstudio'])assert.equal(datiRuntimeModello({runtimeId,state:'observed',models:[{id:'uno'}]}).caricamento,'Non rilevato');assert.equal(datiRuntimeModello({runtimeId:'llama.cpp',state:'observed',runtimeState:'ready',models:[{id:'uno'}]}).caricamento,'Modello caricato da TALOS');});
test('RUN-ELENCO-ERRORE: fallimento lista distinto dalla connessione',()=>{const d=datiRuntimeModello({runtimeId:'ollama',state:'observed',modelsError:'RUNTIME_FAILED',models:[]});assert.equal(d.stato,'Raggiunto');assert.equal(d.modelli,'Lettura dei modelli non riuscita');assert.equal(d.errore,'RUNTIME_FAILED');});
test('RUN-DATI-MANCANTI: non certifico stato e data ignoti',()=>{const d=datiRuntimeModello({runtimeId:'ollama',state:'unknown',models:[{id:'vecchio'}],observedAt:'non-data'});assert.equal(d.stato,'Non raggiunto');assert.equal(d.modelli,'Disponibilità non verificata');assert.equal(d.data,'Non rilevata');assert.equal(d.caricamento,'Non rilevato');});
test('RUN-SUPERVISORE: observed del controllore non è motore avviato',()=>{for(const [runtimeState,stato]of [['unavailable','Non avviato'],['loading','Caricamento in corso'],['stopping','Arresto in corso'],['failed','Avvio non riuscito']]){const d=datiRuntimeModello({runtimeId:'llama.cpp',state:'observed',runtimeState,models:[]});assert.equal(d.stato,stato);assert.notEqual(d.caricamento,'Modello caricato da TALOS');}});
