/*
 * Decisioni 43 e 47 (forma FORMA-ALLEGATI-NEI-DATI): il nucleo ammette in lettura, senza carta, SOLO gli allegati di questa conversazione.
 * Il modello parla col nome corto; il percorso vero non esce mai. Prove sul nucleo vero, come `blocco26-registri-sfondo.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fornitore = (chiamate) => {
  let n = 0;
  return async () => {
    const c = chiamate[n];
    n += 1;
    const message = c
      ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
};

function banco(t) {
  /* `.native`: il percorso vero, come lo vedono il prodotto e Git. Sul runner di GitHub TEMP ha il nome corto 8.3 (`RUNNER~1`), e `realpathSync` di JavaScript lo lascia (ROSSO 4 della PR 91) */
  const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-allegati-nucleo-')));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartella = join(radice, 'progetto');
  const id = 'a'.repeat(24);
  const altro = 'b'.repeat(24);
  mkdirSync(cartella);
  mkdirSync(join(radice, 'dati', id, 'allegati'), { recursive: true });
  mkdirSync(join(radice, 'dati', altro, 'allegati'), { recursive: true });
  const percorso = join(radice, 'dati', id, 'allegati', 'nota.txt');
  writeFileSync(percorso, 'contenuto segreto della nota');
  writeFileSync(join(radice, 'dati', altro, 'allegati', 'altra.txt'), 'file di un altra chat');
  return { radice, cartella, id, altro, percorso, riferimento: `attachments/${id}/nota.txt`, dellAltra: `attachments/${altro}/altra.txt` };
}

async function giro(t, b, { chiamate, allegati, chiedi = async () => true, livelloAccesso = 'accesso-pieno' }) {
  const chieste = [], esiti = [], grezzi = [];
  await talosLavora({
    cartella: b.cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4, livelloAccesso,
    fetchDiRete: fornitore(chiamate),
    onGiro: (e) => { if (e.tipo === 'tool-esito') { esiti.push(togliConfiniDati(String(e.content))); grezzi.push(String(e.content)); } },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return chiedi(a); },
    ...(allegati ? { allegatiConversazioneFn: allegati } : {}),
  });
  return { chieste, esiti, grezzi };
}

test('NUCLEO-01: il nome corto di un allegato di questa chat si legge senza carta, anche con «Chiede prima», e il percorso vero non esce', async (t) => {
  const b = banco(t);
  const { chieste, esiti, grezzi } = await giro(t, b, { livelloAccesso: 'su-richiesta', chiamate: [['leggi', { percorso: b.riferimento }]],
    allegati: () => [{ riferimento: b.riferimento, percorso: b.percorso }] });
  assert.equal(chieste.length, 0);
  assert.match(esiti[0], /contenuto segreto della nota/u);
  assert.ok(grezzi[0].includes(b.riferimento), 'il confine dei dati nomina il nome corto');
  assert.ok(!grezzi[0].includes(b.radice), 'mai il percorso del PC');
});

test('NUCLEO-02: al contrario, un allegato di un altra chat non si legge, col nome corto o col percorso; il percorso pieno non apre niente di nuovo', async (t) => {
  const b = banco(t);
  const allegati = () => [{ riferimento: b.riferimento, percorso: b.percorso }];
  const corto = await giro(t, b, { chiamate: [['leggi', { percorso: b.dellAltra }]], allegati });
  assert.doesNotMatch(corto.esiti[0], /file di un altra chat/u);
  assert.doesNotMatch(corto.esiti[0], /contenuto segreto/u, 'e nemmeno il file di questa chat: il riferimento vale solo intero');
  const pieno = await giro(t, b, { livelloAccesso: 'su-richiesta', chiedi: async () => false, chiamate: [['leggi', { percorso: join(b.radice, 'dati', b.altro, 'allegati', 'altra.txt') }]], allegati });
  assert.equal(pieno.chieste.length, 1, 'fuori dal progetto si chiede come sempre');
  assert.doesNotMatch(pieno.esiti[0], /file di un altra chat/u);
});

test('NUCLEO-03: al contrario, una cartella sostituita da una giunzione verso un altra chat si rifiuta e non legge', async (t) => {
  const b = banco(t);
  const cartellaVera = join(b.radice, 'dati', b.id);
  renameSync(cartellaVera, `${cartellaVera}-via`);
  execFileSync('cmd.exe', ['/c', 'mklink', '/J', cartellaVera, `${cartellaVera}-via`], { stdio: 'ignore' });
  const { chieste, esiti } = await giro(t, b, { chiamate: [['leggi', { percorso: b.riferimento }]], allegati: () => [{ riferimento: b.riferimento, percorso: b.percorso }] });
  assert.equal(chieste.length, 0, 'niente carta che proponga il percorso vero');
  assert.match(esiti[0], /^REFUSED\. The attachment/u);
  assert.doesNotMatch(esiti[0], /contenuto segreto/u);
  assert.ok(!esiti[0].includes(b.radice));
});

test('NUCLEO-04: al contrario, senza il lettore (una figlia, la CLI, il telefono in locale) il nome corto è un percorso qualunque: niente lettura', async (t) => {
  const b = banco(t);
  const { esiti } = await giro(t, b, { chiamate: [['leggi', { percorso: b.riferimento }]] });
  assert.doesNotMatch(esiti[0], /contenuto segreto/u);
});

test('NUCLEO-05: un lettore che lancia non apre niente, e un percorso normale del progetto non lo interroga', async (t) => {
  const b = banco(t);
  writeFileSync(join(b.cartella, 'mio.txt'), 'del progetto');
  let interrogato = 0;
  const allegati = () => { interrogato += 1; throw new Error('rotto'); };
  const normale = await giro(t, b, { chiamate: [['leggi', { percorso: 'mio.txt' }]], allegati });
  assert.match(normale.esiti[0], /del progetto/u);
  assert.equal(interrogato, 0, 'la lettura normale non paga niente');
  const rotto = await giro(t, b, { chiamate: [['leggi', { percorso: b.riferimento }]], allegati });
  assert.equal(interrogato, 1);
  assert.doesNotMatch(rotto.esiti[0], /contenuto segreto/u);
});

test('NUCLEO-06 (BD17): `./attachments/…`, le barre di Windows e le maiuscole trovano lo stesso allegato, e il percorso vero non esce', async (t) => {
  const b = banco(t);
  const allegati = () => [{ riferimento: b.riferimento, percorso: b.percorso }];
  for (const percorso of [`./${b.riferimento}`, b.riferimento.replaceAll('/', '\\'), `.\\${b.riferimento.replaceAll('/', '\\')}`, b.riferimento.replace('nota.txt', 'NOTA.TXT'), b.riferimento.replace('attachments', 'Attachments')]) {
    const { chieste, esiti, grezzi } = await giro(t, b, { livelloAccesso: 'su-richiesta', chiamate: [['leggi', { percorso }]], allegati });
    assert.equal(chieste.length, 0, percorso);
    assert.match(esiti[0], /contenuto segreto della nota/u, percorso);
    assert.ok(!grezzi[0].includes(b.radice), percorso);
  }
});

test('NUCLEO-07 (BD18): un allegato non si scrive e non si modifica: niente file col suo nome nel progetto, e il modello lo sa', async (t) => {
  const b = banco(t);
  const allegati = () => [{ riferimento: b.riferimento, percorso: b.percorso }];
  const scritto = await giro(t, b, { chiamate: [['scrivi', { percorso: b.riferimento, contenuto: 'nuovo' }]], allegati });
  assert.match(scritto.esiti[0], /^REFUSED\. An attached file cannot be changed/u);
  const modificato = await giro(t, b, { chiamate: [['file_edit', { percorso: b.riferimento, old_string: 'nota', new_string: 'altro' }]], allegati });
  assert.match(modificato.esiti[0], /^REFUSED\. An attached file cannot be changed/u);
  assert.equal(existsSync(join(b.cartella, 'attachments')), false);
  assert.equal(readFileSync(b.percorso, 'utf8'), 'contenuto segreto della nota');
});

test('NUCLEO-08 (BD18): al contrario, un percorso uguale senza legame resta un file del progetto come gli altri', async (t) => {
  const b = banco(t);
  const { esiti } = await giro(t, b, { chiamate: [['scrivi', { percorso: b.dellAltra, contenuto: 'mio' }]], allegati: () => [{ riferimento: b.riferimento, percorso: b.percorso }] });
  assert.doesNotMatch(esiti[0], /^REFUSED/u);
  assert.ok(existsSync(join(b.cartella, b.dellAltra)));
});
