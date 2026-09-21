import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora, discoNode } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-full-access-'));
  const workspace = join(root, 'project'); mkdirSync(workspace);
  t.after(() => rimuoviCartellaDiProva(root));
  return { root, workspace };
}
function call(id, name, args) { return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }; }
async function run(workspace, calls, options = {}) {
  let request = 0;
  const receipts = [];
  const result = await talosLavora({
    cartella: workspace, task: { consegna: 'Controlla questi file di prova.' }, modello: 'test', chiave: 'test',
    livelloAccesso: 'accesso-pieno',
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: request++ === 0 ? {role:'assistant',content:null,tool_calls:calls} : {role:'assistant',content:'Controllo completato.'} }],
      usage: { prompt_tokens:10, completion_tokens:10 },
    }) }),
    onGiro: e => { if(e.tipo === 'ricevuta') receipts.push(e.ricevuta); },
    ...options,
  });
  return { result, receipts };
}

for (const withChannel of [false, true]) test(`FULL-ACCESS-01 trifecta osservabile senza blocco, canale ${withChannel}`, async t => {
  const {workspace} = fixture(t); let approvals = 0;
  const {result, receipts} = await run(workspace, [
    call('write','scrivi',{percorso:'prima.txt',contenuto:'prova'}),
    call('one','shell',{comando:'echo prima'}),
    call('two','shell',{comando:'echo seconda'}),
  ], { permessiPerAttrezzo: {scrivi:'sempre',shell:'sempre'},
    ...(withChannel ? {chiediApprovazioneFn:async()=>{approvals++;return false;}} : {}) });
  assert.equal(approvals,0);
  assert.equal(receipts.at(-1).status,'succeeded');
  assert.equal(receipts.at(-1).trifecta,true);
  assert.match(result.messaggiFinali.find(m=>m.tool_call_id==='two').content,/seconda/);
  assert.doesNotMatch(result.messaggiFinali.find(m=>m.tool_call_id==='two').content,/REFUSED/);
});

test('FULL-ACCESS-02 deny, chiedi e livelli limitati mantengono il proprio effetto', async t => {
  const {root,workspace} = fixture(t); const target=join(root,'outside.txt');
  for (const options of [
    {permessiPerAttrezzo:{scrivi:'nega'}},
    {permessiPerAttrezzo:{scrivi:'chiedi'},chiediApprovazioneFn:async()=>false},
    {livelloAccesso:'lettura'},
    {livelloAccesso:'scrittura-area'},
  ]) {
    const {result}=await run(workspace,[call('write','scrivi',{percorso:target,contenuto:'vietato'})],options);
    assert.match(result.messaggiFinali.find(m=>m.tool_call_id==='write').content,/REFUSED/);
    assert.equal(existsSync(target),false);
  }
});

test('FULL-ACCESS-03 leggi e scrivi risolvono il file assoluto esterno corretto', async t => {
  const {root,workspace} = fixture(t); const target=join(root,'outside.txt');
  writeFileSync(target,'originale');
  assert.equal(await discoNode({radice:workspace}).leggi(target),'originale');
  const {result}=await run(workspace,[call('write','scrivi',{percorso:target,contenuto:'aggiornato'}),call('read','leggi',{percorso:target})]);
  assert.equal(readFileSync(target,'utf8'),'aggiornato');
  assert.equal(result.messaggiFinali.find(m=>m.tool_call_id==='read').content,'aggiornato');
  assert.equal(existsSync(join(workspace,'outside.txt')),false);
});
