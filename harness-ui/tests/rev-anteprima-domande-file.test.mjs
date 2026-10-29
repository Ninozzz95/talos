/*
 * Revisione avversaria dell'anteprima nelle domande (29/10/2026). Proposta: NON committata.
 * Il commit dice: «un'anteprima non mostra mai ciò che `leggi` chiederebbe prima di aprire». Qui si prova lo stesso file con le due
 * porte: `motivoDaChiedere` (la lettura del modello) e `scaricaFile(…, { perIlModello: true })` (l'anteprima).
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { motivoDaChiedere } from '../src/path-policy.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function conProgetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-rev-anteprima-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  mkdirSync(join(progetto, 'docs'), { recursive: true });
  mkdirSync(join(radice, 'sessioni'));
  writeFileSync(join(progetto, '.env'), 'OPENROUTER_API_KEY=sk-or-v1-finta\n');
  /* una cartella segreta per NOME (`.ssh`) con dentro un file dal nome innocuo e un'estensione che il lettore mostra */
  mkdirSync(join(progetto, '.ssh'));
  writeFileSync(join(progetto, '.ssh', 'appunti.txt'), 'passphrase: finta\n');
  const registry = createSessionRegistry({ cartellaStore: join(radice, 'sessioni'), modello: 'test/model', chiave: 'test',
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: () => ({ cartella: progetto, comandoProva: 'node --test', task: { id: 'test', consegna: 'prova' } }),
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [] } };
    },
  });
  const { sessionId } = registry.avvia('test');
  return { registry, sessionId, progetto };
}

test('REV-ANTEPRIMA-01 — una GIUNZIONE dentro il progetto verso una cartella segreta: `leggi` chiede, l\'anteprima non deve mostrarla', async (t) => {
  const { registry, sessionId, progetto } = await conProgetto(t);
  // una giunzione non vuole privilegi su Windows; su POSIX è un collegamento simbolico di cartella
  symlinkSync(join(progetto, '.ssh'), join(progetto, 'docs', 'cfg'), 'junction');
  const percorso = 'docs/cfg/appunti.txt';
  const chiede = motivoDaChiedere({ tipo: 'leggi', percorso, cartella: progetto });
  assert.ok(chiede, 'premessa: la lettura del modello chiede davanti a questo file');
  const esito = await registry.scaricaFile(sessionId, percorso, { perIlModello: true });
  assert.equal(esito.code, 'PREVIEW_FILE_SECRET', `l'anteprima ha restituito ${esito.ok ? JSON.stringify(esito.bytes?.toString('utf8')) : esito.code}`);
});

test('REV-ANTEPRIMA-02 — un collegamento simbolico di FILE verso `.env` (se il sistema lo permette): stessa regola di `leggi`', async (t) => {
  const { registry, sessionId, progetto } = await conProgetto(t);
  try { symlinkSync(join(progetto, '.env'), join(progetto, 'docs', 'leak.txt'), 'file'); }
  catch (errore) { t.skip(`collegamento simbolico di file non permesso qui: ${errore.code}`); return; }
  const percorso = 'docs/leak.txt';
  assert.ok(motivoDaChiedere({ tipo: 'leggi', percorso, cartella: progetto }), 'premessa: `leggi` chiede');
  const esito = await registry.scaricaFile(sessionId, percorso, { perIlModello: true });
  assert.equal(esito.code, 'PREVIEW_FILE_SECRET', `l'anteprima ha restituito ${esito.ok ? JSON.stringify(esito.bytes?.toString('utf8')) : esito.code}`);
});

test('REV-ANTEPRIMA-03 — il segreto scritto in altro modo (maiuscole, barra rovescia, punto o spazio finale) resta un segreto o non si apre', async (t) => {
  const { registry, sessionId } = await conProgetto(t);
  for (const forma of ['.ENV', '.Env', 'docs\\..\\.env', './.env', '.env.', '.env ', '.env::$DATA', '.ssh/APPUNTI.TXT', '.SSH/appunti.txt']) {
    const esito = await registry.scaricaFile(sessionId, forma, { perIlModello: true });
    assert.notEqual(esito.ok, true, `«${forma}» ha restituito ${JSON.stringify(esito.bytes?.toString('utf8'))}`);
  }
});

test('REV-ANTEPRIMA-04 — un HARD LINK dal nome innocuo verso `.env` (uccide il mutante «eUnFileSegreto senza `cartella`»)', async (t) => {
  const { registry, sessionId, progetto } = await conProgetto(t);
  const { linkSync } = await import('node:fs');
  linkSync(join(progetto, '.env'), join(progetto, 'docs', 'note.txt'));
  const esito = await registry.scaricaFile(sessionId, 'docs/note.txt', { perIlModello: true });
  assert.equal(esito.code, 'PREVIEW_FILE_SECRET', `l'anteprima ha restituito ${esito.ok ? JSON.stringify(esito.bytes?.toString('utf8')) : esito.code}`);
});
