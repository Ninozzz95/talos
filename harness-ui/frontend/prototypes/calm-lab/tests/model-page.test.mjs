import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createState,loadSnapshot,DEMO_MODELS} from '../src/domain.mjs';
import {parseModelRoute,modelRoute} from '../src/model-navigation.mjs';
import {renderModelLab} from '../src/model-lab.mjs';
import {renderModelPage,renderModelCard,renderModelFiles,MODEL_SOURCES} from '../src/model-page.mjs';
const fresh=()=>createState(loadSnapshot({getItem:()=>null}));
test('catalogo: non esiste un inspector e nessun dettaglio preaperto',()=>{
 const html=renderModelLab(fresh());assert.doesNotMatch(html,/model-inspector|data-model-page|readme-surface/);assert.match(html,/catalog-full/);
});
test('destinazione modello: sostituisce il catalogo senza aggiungere un aside',()=>{
 const s=fresh();s.detailId='local:qwen8';const h=renderModelLab(s);assert.match(h,/readme-surface/);assert.doesNotMatch(h,/<aside|catalog-toolbar|setup-band/);
});
test('la semplice apertura non sceglie il modello',()=>{
 const s=fresh();s.detailId='local:gemma';renderModelLab(s);assert.equal(s.defaultId,'local:qwen8');assert.equal(s.models[1].installed,true);
});
test('scheda: markup testuale con dati pericolosi viene escapato',()=>{
 const s=fresh(),m={...s.models[0],name:'<img src=x onerror=alert(1)>'};const h=renderModelPage(m,s);assert.doesNotMatch(h,/<img/);assert.match(h,/&lt;img/);
});
test('nessuna risorsa remota incorporata',()=>{
 const s=fresh(),h=renderModelPage(s.models[0],s);assert.doesNotMatch(h,/<iframe|<img|<script|<object|<embed/);
});
test('link fonte canonico con isolamento dell’opener',()=>{
 const s=fresh(),h=renderModelCard(s.models[0],s);assert.match(h,/https:\/\/huggingface.co\/Qwen\/Qwen3-8B-GGUF/);assert.match(h,/rel="noopener noreferrer"/);
});
test('modello base e artefatto locale non sono equiparati',()=>{
 const s=fresh(),h=renderModelCard(s.models[1],s);assert.match(h,/Non dimostra la provenienza del file GGUF/);assert.equal(MODEL_SOURCES[s.models[1].id].kind,'Modello base');
});
test('modelli cloud senza repository non inventano una scheda HF',()=>{
 const s=fresh(),h=renderModelPage(s.models[3],s);assert.match(h,/Scheda provider/);assert.doesNotMatch(h,/https:\/\/huggingface.co\//);
});
test('stati mancanti/errore/caricamento non impediscono file e uso locale',()=>{
 for(const st of ['loading','missing','error']){const s=fresh();s.cardStatus=st;const h=renderModelPage(s.models[0],s);assert.match(h,/data-action="test-model"/);assert.doesNotMatch(h,/readme-overview/);assert.match(renderModelFiles(s.models[0],s),/Qwen3-8B-Q4_K_M.gguf/);}
});
test('offline: anteprima incorporata non etichettata come aggiornata',()=>{
 const s=fresh();s.scenario='offline';assert.match(renderModelCard(s.models[0],s),/non una scheda aggiornata/);
});
test('route codec: identità e tab sopravvivono al roundtrip',()=>{
 const s=fresh();s.detailId='local:gemma';s.detailTab='files';const parsed=parseModelRoute(modelRoute(s),s.models);assert.equal(parsed.detailId,s.detailId);assert.equal(parsed.detailTab,'files');
});
test('route: escape malformato, id sconosciuto e tab invalido',()=>{
 assert.equal(parseModelRoute('#/impostazioni/modelli/scheda/%E0%A4%A/card',DEMO_MODELS).detailId,null);
 assert.equal(parseModelRoute('#/impostazioni/modelli/scheda/no/card',DEMO_MODELS).detailId,null);
 assert.equal(parseModelRoute('#/impostazioni/modelli/scheda/local%3Aqwen8/no',DEMO_MODELS).detailTab,'card');
});
test('rotte delle impostazioni preesistenti',()=>{
 for(const tab of ['models','providers','downloads','system'])assert.equal(parseModelRoute('#/impostazioni/modelli/'+tab,DEMO_MODELS).tab,tab);
 assert.equal(parseModelRoute('#/impostazioni/aspetto',DEMO_MODELS).section,'appearance');
});
test('stato di navigazione indipendente tra istanze',()=>{
 const a=fresh(),b=fresh();a.detailScroll.card=400;a.detailId='local:qwen8';assert.deepEqual(b.detailScroll,{});assert.equal(b.detailId,null);
});
