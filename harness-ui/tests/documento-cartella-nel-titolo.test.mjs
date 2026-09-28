/*
 * ⛔⛔ UNA CARTELLA NEL TITOLO DI UN DOCUMENTO SI RISPETTA — owner 26/09/2026 («Rispettare la cartella»).
 *
 * Il caso vero (sessione `c15ba17c`, 25/09): il modello ha chiesto `document_create` col titolo
 * `tokenizer project/ricerca_tokenizer_gpt`; il file è nato come `Desktop\tokenizer project ricerca_tokenizer_gpt.md`
 * (la barra diventata spazio), fuori dalla cartella voluta, e l'esito diceva solo «Created … in the workspace»: il
 * modello l'ha poi cercato con `elenca`/`cerca`.
 *
 * La cura: la parte prima dell'ultima barra è una cartella RELATIVA, creata se manca, sempre DENTRO lo spazio di
 * lavoro (Hermes `tools/file_operations.py:1254`, «creating parent directories as needed»); assoluti e `..` si
 * rifiutano con la frase che dice la strada giusta; l'esito dice il percorso completo. Provata con la funzione VERA
 * sul disco, anche nel verso in cui una cartella esistente è una giunzione che porta fuori.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { creaFileWorkspace, normalizzaSottocartella, WorkspaceFileError } from '../src/workspace-files.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TASK = { consegna: 'Scrivi il documento', consegnaCorta: 'documento' };

function cartellaTemporanea(t, prefisso) {
  const dir = mkdtempSync(join(tmpdir(), prefisso));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

test('DOC-FOLDER-REAL-DISK — la cartella si crea dentro lo spazio di lavoro e il file ci finisce, col percorso completo nell esito', async (t) => {
  const radice = cartellaTemporanea(t, 'talos-doc-cartella-');
  const esito = await creaFileWorkspace({ cartella: radice, nome: 'ricerca_tokenizer_gpt.md', bytes: '# ciao', sottocartella: 'tokenizer project' });
  assert.equal(esito.percorso, 'tokenizer project/ricerca_tokenizer_gpt.md');
  assert.equal(readFileSync(join(radice, 'tokenizer project', 'ricerca_tokenizer_gpt.md'), 'utf8'), '# ciao');
  assert.ok(esito.assoluto.endsWith(join('tokenizer project', 'ricerca_tokenizer_gpt.md')), esito.assoluto);
  assert.equal(existsSync(join(radice, 'tokenizer project ricerca_tokenizer_gpt.md')), false, 'mai più il nome storpiato nella radice');
  // Più livelli, e una cartella che esiste già si riusa
  const secondo = await creaFileWorkspace({ cartella: radice, nome: 'b.md', bytes: 'b', sottocartella: 'tokenizer project/note/2026' });
  assert.equal(secondo.percorso, 'tokenizer project/note/2026/b.md');
  // Senza sottocartella: esattamente come prima
  const piatto = await creaFileWorkspace({ cartella: radice, nome: 'c.md', bytes: 'c' });
  assert.equal(piatto.percorso, 'c.md');
});

test('DOC-FOLDER-LOCK — AL CONTRARIO: la serratura rifiuta per nome tutto ciò che porterebbe fuori o che Windows non accetta', () => {
  for (const cattiva of ['../fuori', 'a/../../fuori', 'C:/Windows', 'c:x', '/assoluta', '\\\\server\\share', 'a:b', 'con', 'NUL.txt', 'finisce.', 'finisce ', 'a/b?c', 'x/'.repeat(9) + 'y']) {
    assert.throws(() => normalizzaSottocartella(cattiva), (e) => e instanceof WorkspaceFileError && e.code === 'FOLDER_INVALID', JSON.stringify(cattiva));
  }
  assert.equal(normalizzaSottocartella('a//b/./c'), 'a/b/c', 'le barre doppie e i punti singoli si semplificano');
  assert.equal(normalizzaSottocartella('a\\b'), 'a/b', 'la barra rovesciata è una barra');
  assert.equal(normalizzaSottocartella(''), '');
});

test('DOC-FOLDER-JUNCTION-ESCAPE — AL CONTRARIO: una cartella esistente che è una giunzione verso fuori NON riceve il file', async (t) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-doc-radice-'));
  const fuori = mkdtempSync(join(tmpdir(), 'talos-doc-fuori-'));
  mkdirSync(join(radice, 'sotto'));
  const porta = join(radice, 'sotto', 'porta');
  symlinkSync(fuori, porta, 'junction');
  /* ⛔ UN gancio solo, in quest'ordine: la giunzione si STACCA con `rmdir` prima di rimuovere l'albero (la lezione di robocopy
   *   del 17/09) — mai lasciare a una rimozione ricorsiva la scelta se seguirla. */
  t.after(() => {
    if (existsSync(porta)) rmdirSync(porta);
    rimuoviCartellaDiProva(radice);
    rimuoviCartellaDiProva(fuori);
  });
  await assert.rejects(
    creaFileWorkspace({ cartella: radice, nome: 'segreto.md', bytes: 'x', sottocartella: 'sotto/porta' }),
    (e) => e instanceof WorkspaceFileError && e.code === 'FOLDER_INVALID',
  );
  assert.equal(existsSync(join(fuori, 'segreto.md')), false, 'niente scritto fuori dallo spazio di lavoro');
});

function kernelCheChiedeUnDocumento(argomenti, esiti) {
  return async (input) => {
    input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: 'ecco', tool_calls: [] } });
    esiti.push(await input.onDocumento?.(argomenti));
    return { comeFinita: 'concluso', detto: 'fatto' };
  };
}

async function giroConDocumento(argomenti) {
  const esiti = [];
  const titoliGenerati = [];
  const chiamateCrea = [];
  await avviaSessione({
    cartella: 'C:/progetto', task: TASK, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: kernelCheChiedeUnDocumento(argomenti, esiti),
    generateTalosDocumentFn: async (spec) => { titoliGenerati.push(spec.title); return { format: spec.format, fileName: `${spec.title}.md`, mediaType: 'text/markdown', bytes: new TextEncoder().encode('# x') }; },
    verifyTalosDocumentFn: async () => ({ ok: true, detail: '1 riga' }),
    salvaVoceLibreriaFn: async () => 'lib-finto',
    creaFileWorkspaceFn: async (richiesta) => {
      chiamateCrea.push(richiesta);
      const percorso = richiesta.sottocartella ? `${richiesta.sottocartella}/${richiesta.nome}` : richiesta.nome;
      return { percorso, assoluto: `C:\\progetto\\${percorso.replaceAll('/', '\\')}` };
    },
  });
  return { esito: esiti[0], titoliGenerati, chiamateCrea };
}

test('DOC-FOLDER-FROM-TITLE — il titolo con la cartella: il documento si chiama come l ultimo pezzo, la cartella passa alla serratura, l esito dice dove', async () => {
  const { esito, titoliGenerati, chiamateCrea } = await giroConDocumento({ format: 'md', title: 'tokenizer project/ricerca_tokenizer_gpt', body: 'x' });
  assert.equal(esito.ok, true, esito.esito);
  assert.deepEqual(titoliGenerati, ['ricerca_tokenizer_gpt'], 'il titolo del documento è l ultimo pezzo, senza la cartella');
  assert.equal(chiamateCrea[0].sottocartella, 'tokenizer project');
  assert.match(esito.esito, /Created "tokenizer project\/ricerca_tokenizer_gpt\.md"/u);
  assert.match(esito.esito, /at C:\\progetto\\tokenizer project\\ricerca_tokenizer_gpt\.md/u, 'l esito dice il percorso completo sul disco');
});

test('DOC-FOLDER-TITLE-REFUSALS — AL CONTRARIO: assoluto, «..» e barra finale si rifiutano con la strada giusta; senza barra non cambia niente', async () => {
  for (const [titolo, attesa] of [['C:/Windows/relazione', /absolute path/u], ['/etc/relazione', /absolute path/u], ['../fuori/relazione', /outside the workspace/u], ['cartella/', /ends with a slash/u]]) {
    const { esito, chiamateCrea } = await giroConDocumento({ format: 'md', title: titolo, body: 'x' });
    assert.equal(esito.ok, false, titolo);
    assert.match(esito.esito, attesa, titolo);
    assert.equal(chiamateCrea.length, 0, `${titolo}: niente scritto`);
  }
  const { esito, chiamateCrea, titoliGenerati } = await giroConDocumento({ format: 'md', title: 'Relazione semplice', body: 'x' });
  assert.equal(esito.ok, true);
  assert.deepEqual(titoliGenerati, ['Relazione semplice']);
  assert.equal('sottocartella' in chiamateCrea[0], false, 'senza barra la chiamata resta quella di prima');
});
