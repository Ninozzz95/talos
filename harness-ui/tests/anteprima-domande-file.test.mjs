/*
 * Anteprima nelle domande (owner 29/10/2026: «la prima opzione, ma fai attenzione a formattare documenti tipo pdf md html»; nota 2 della
 * CLI). Il modello può indicare in un'anteprima il percorso di un documento del progetto, e il lettore lo apre. Un file indicato dal
 * MODELLO passa dalla stessa regola dei segreti della lettura: mai `.env` o una chiave a schermo senza la domanda che `leggi` farebbe.
 * Registro VERO, rotta VERA, cartella di prova vera.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function conProgetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-anteprima-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  mkdirSync(join(progetto, 'docs'), { recursive: true });
  mkdirSync(join(radice, 'sessioni'));
  writeFileSync(join(progetto, 'docs', 'piano.md'), '# Piano\n\n- uno\n- due\n');
  writeFileSync(join(progetto, '.env'), 'OPENROUTER_API_KEY=sk-or-v1-finta\n');
  writeFileSync(join(progetto, 'id_rsa'), '-----BEGIN OPENSSH PRIVATE KEY-----\nfinta\n-----END OPENSSH PRIVATE KEY-----\n');
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
  return { registry, sessionId };
}

test('ANTEPRIMA-FILE-01 — un file indicato dal modello: il documento sì, `.env` e la chiave privata no; dall\'albero (la persona) come prima', async (t) => {
  const { registry, sessionId } = await conProgetto(t);
  const doc = await registry.scaricaFile(sessionId, 'docs/piano.md', { perIlModello: true });
  assert.equal(doc.ok, true);
  assert.match(doc.bytes.toString('utf8'), /# Piano/u);
  for (const segreto of ['.env', 'id_rsa']) {
    const no = await registry.scaricaFile(sessionId, segreto, { perIlModello: true });
    assert.equal(no.code, 'PREVIEW_FILE_SECRET', segreto);
    assert.equal(no.bytes, undefined, `nessun byte di ${segreto}`);
  }
  /* AL CONTRARIO: la persona che apre il file dall'albero lo vede come prima (è lei a sceglierlo) */
  const daPersona = await registry.scaricaFile(sessionId, '.env');
  assert.equal(daPersona.ok, true);
});

test('ANTEPRIMA-FILE-02 — la rotta: `origine=modello` passa la regola, un altro valore è una richiesta sbagliata, il PDF uguale', async (t) => {
  const { registry, sessionId } = await conProgetto(t);
  const server = createServer(createHttpApp({ staticHandler: () => {}, sessionRegistry: registry }));
  await new Promise((fatto) => server.listen(0, '127.0.0.1', fatto));
  t.after(() => new Promise((fatto) => server.close(fatto)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}`;
  const leggi = (rotta, query) => fetch(`${base}/${rotta}?${new URLSearchParams(query)}`);
  assert.equal((await leggi('file', { percorso: 'docs/piano.md', origine: 'modello' })).status, 200);
  const segreto = await leggi('file', { percorso: '.env', origine: 'modello' });
  assert.equal(segreto.status, 403);
  assert.equal((await segreto.json()).error.code, 'PREVIEW_FILE_SECRET');
  assert.equal((await leggi('file/anteprima', { percorso: '.env', origine: 'modello' })).status, 403);
  assert.equal((await leggi('file', { percorso: 'docs/piano.md', origine: 'persona' })).status, 400);
  /* AL CONTRARIO: senza `origine` (l'albero dei file) la rotta resta quella di prima */
  assert.equal((await leggi('file', { percorso: '.env' })).status, 200);
});
