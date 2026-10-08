import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AcpAgentError } from '../../../src/acp-agent.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { testoDelCampo } from '../../src/components/testo-server.js';
import server from '../../src/i18n/testi/server.js';
const originali=JSON.parse(readFileSync(new URL('../../../tests/fixtures/k4b-cloud-acp-it.json',import.meta.url),'utf8'));
test('K4B-CLOUD-UI-01 — italiano originale, inglese e dollari nei valori anche dopo replay JSON',()=>{
 for(const [k,it] of Object.entries(originali)){
  const data=JSON.parse(JSON.stringify({motivo:server.en[k],motivoChiave:`server.${k}`,motivoParams:{provider:'Cloud $& $1'}}));
  for(const lingua of ['it','en']){
   impostaLingua(lingua);
   assert.equal(testoDelCampo(data,'motivo'),(lingua==='it'?it:server.en[k]).replace('{provider}',()=>data.motivoParams.provider),k);
  }
 }
 impostaLingua('it');
 assert.equal(testoDelCampo({motivo:'Evento vecchio $&'},'motivo'),'Evento vecchio $&');
});
test('K4B-ACP-UI-02 — il motivo di un errore ACP conserva l italiano del sorgente',()=>{
 const e=new AcpAgentError('ACP_VERSION_UNSUPPORTED');
 impostaLingua('it');
 assert.equal(testoDelCampo({motivo:e.message,motivoChiave:e.chiave},'motivo'),originali['acp.versionUnsupported']);
 impostaLingua('en');
 assert.equal(testoDelCampo({motivo:e.message,motivoChiave:e.chiave},'motivo'),server.en['acp.versionUnsupported']);
 impostaLingua('it');
});
test('K4B-ACP-UI-LINK-03 — i tre lettori reali del delta traducono la chiave (chat/replay, export e laboratorio)',()=>{
 const app=readFileSync(new URL('../../src/legacy/app.js',import.meta.url),'utf8');
 assert.match(app,/aggiungiBloccoStreamModelLab\('text',[^\n]+testoDelCampo\(event, 'delta'\)/u);
 assert.match(app,/testoBuffer\.set\([^\n]+testoDelCampo\(evento, 'delta'\)/u);
 assert.match(app,/const testoGrezzo = [^\n]+testoDelCampo\(evento, 'delta'\)/u);
 assert.match(app,/aggiungiBloccoStreamModelLab\('error',[^\n]+testoDelCampo\(event, 'message'\)/u);
 assert.match(app,/messaggio: testoDelCampo\(evento, 'message'\)/u);
 assert.match(app,/spiegaErrore\(testoDelCampo\(evento, 'message'\), evento.code/u);
});
