/*
 * 16/10/2026 (segnalato dalla sessione mobile il 15/10 su r4 2161afb32, fixture `albero-2161afb32.json`) — I RIFIUTI DELL'ALBERO DEI
 *   FILE COL LORO MOTIVO. Prima ognuno usciva come 400 QUERY_INVALID «Invalid query», e la frase vera restava nel log.
 * Qui si prova solo src/ (gira anche nel ramo della CLI); il dizionario dell'interfaccia sta in `motivi-dei-file-desktop.test.mjs`.
 * Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FRASI_DEI_MOTIVI_DEI_FILE } from '../src/motivi-dei-file.mjs';
import { eliminaFile, leggiContenutoFile, rinominaFile, spostaFile, WorkspaceFileError } from '../src/workspace-files.mjs';
import { leggiAlberoWorkspace, WorkspaceTreeError } from '../src/workspace-tree.mjs';
import { toPublicProblem } from '../src/public-problem.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartellaDiProva(t) {
  const radice = mkdtempSync(join(tmpdir(), 'motivi-file-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  mkdirSync(join(radice, 'docs', 'interna'), { recursive: true });
  writeFileSync(join(radice, 'docs', 'nota.md'), 'ciao');
  return radice;
}

/** Il rifiuto, come la busta lo pubblica: codice, motivo e la spiegazione per la persona. */
async function rifiuto(promessa) {
  try { await promessa; } catch (errore) {
    assert.ok(errore instanceof WorkspaceFileError || errore instanceof WorkspaceTreeError, `${errore?.name}: ${errore?.message}`);
    return { code: errore.code, reason: errore.reason, explanation: toPublicProblem(errore).explanation };
  }
  assert.fail('doveva essere rifiutato');
}

test('MOTIVI-FILE-01 — i sei casi del mobile escono col loro motivo e con la frase vera, non «Invalid query»', async (t) => {
  const cartella = cartellaDiProva(t);
  const casi = [
    ['rinomina con la barra', () => rinominaFile({ cartella, percorso: 'docs/nota.md', nuovoNome: 'a/b.md' }), 'new-name-invalid'],
    ['sposta dentro sé stessa', () => spostaFile({ cartella, percorso: 'docs', cartellaDestinazione: 'docs/interna' }), 'move-into-itself'],
    ['apri una cartella come file', () => leggiContenutoFile({ cartella, percorso: 'docs' }), 'not-a-file-preview'],
    ['albero di ../', () => leggiAlberoWorkspace({ cartella, percorso: '../' }), 'path-outside-session'],
    ['albero di una cartella che non c\'è', () => leggiAlberoWorkspace({ cartella, percorso: 'non-esiste' }), 'folder-not-found'],
    ['elimina la radice', () => eliminaFile({ cartella, percorso: '' }), null],
  ];
  for (const [nome, promessa, atteso] of casi) {
    const r = await rifiuto(promessa());
    assert.equal(r.code, 'QUERY_INVALID', nome);
    assert.ok(typeof r.reason === 'string' && Object.hasOwn(FRASI_DEI_MOTIVI_DEI_FILE, r.reason), `${nome}: motivo ${r.reason}`);
    if (atteso) assert.equal(r.reason, atteso, nome);
    assert.equal(r.explanation, FRASI_DEI_MOTIVI_DEI_FILE[r.reason], `${nome}: la spiegazione è la frase del motivo`);
  }
});

test('MOTIVI-FILE-02 — AL CONTRARIO: lo stesso codice senza motivo resta la copia generica, e un motivo sconosciuto non pubblica il suo testo', () => {
  const senza = Object.assign(new Error('Path outside the session folder'), { code: 'QUERY_INVALID' });
  assert.notEqual(toPublicProblem(senza).explanation, 'Path outside the session folder');
  const inventato = Object.assign(new Error('C:\\Users\\segreto non va pubblicato'), { code: 'QUERY_INVALID', reason: 'motivo-inventato' });
  assert.ok(!toPublicProblem(inventato).explanation.includes('segreto'));
});

test('MOTIVI-FILE-03 — ogni frase è per lo schermo (corta, senza percorsi né identificatori), e ogni motivo della tabella è usato nel sorgente', () => {
  const sorgente = ['../src/workspace-files.mjs', '../src/workspace-tree.mjs'].map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
  for (const [motivo, frase] of Object.entries(FRASI_DEI_MOTIVI_DEI_FILE)) {
    assert.match(motivo, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, motivo);
    assert.ok(frase.length >= 12 && frase.length <= 240, `${motivo}: ${frase.length} caratteri`);
    assert.ok(!/[\\/]|[0-9a-f]{8}-[0-9a-f]{4}/iu.test(frase), `${motivo}: niente percorsi né identificatori`);
    assert.equal(toPublicProblem(Object.assign(new Error(frase), { code: 'QUERY_INVALID', reason: motivo })).explanation, frase, `${motivo}: pubblicata`);
    assert.ok(sorgente.includes(`'${motivo}'`), `${motivo}: nessun rifiuto lo usa`);
  }
  // AL CONTRARIO: nel sorgente non resta un rifiuto senza motivo che uscirebbe come «Invalid query»
  assert.deepEqual([...sorgente.matchAll(/new WorkspaceFileError\('((?:[^'\\]|\\.)*)'\)/gu)].map((m) => m[1]), []);
});

test('MOTIVI-FILE-04 — il motivo arriva fino al rifiuto del REGISTRO, che è ciò che la rotta HTTP pubblica', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const cartella = cartellaDiProva(t);
  let finisci;
  const attesa = new Promise((r) => { finisci = r; });
  let onEvento = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => { onEvento = input.onEvento; input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return attesa; },
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  t.after(() => { onEvento?.({ type: 'RunFinished', threadId: 't', runId: 'r' }); finisci({ ok: true }); });
  const rinomina = await registro.rinominaFile(sessionId, 'docs/nota.md', 'a/b.md');
  assert.deepEqual(rinomina, { erroreAvvio: FRASI_DEI_MOTIVI_DEI_FILE['new-name-invalid'], code: 'QUERY_INVALID', reason: 'new-name-invalid' });
  const albero = await registro.albero(sessionId, 'non-esiste');
  assert.equal(albero.reason, 'folder-not-found');
  // AL CONTRARIO: un rifiuto che ha già un codice suo resta com'era, senza un motivo inventato
  writeFileSync(join(cartella, 'docs', 'altra.md'), 'x');
  const esiste = await registro.rinominaFile(sessionId, 'docs/nota.md', 'altra.md');
  assert.equal(esiste.code, 'FILE_EXISTS');
  assert.equal('reason' in esiste, false);
});

test('MOTIVI-FILE-05 — per un motivo dei file si pubblica la frase della TABELLA, mai il message con cui l\'errore è stato costruito (MOTIVI-REV-02)', () => {
  const altroTesto = Object.assign(new Error('Nome scelto da qualcuno: segreto del progetto'), { code: 'QUERY_INVALID', reason: 'file-name-invalid' });
  assert.equal(toPublicProblem(altroTesto).explanation, FRASI_DEI_MOTIVI_DEI_FILE['file-name-invalid']);
  // AL CONTRARIO: un percorso di Windows nel message di un codice che pubblica il suo message resta nel log
  for (const conPercorso of ['The session at C:\\Users\\nino\\progetto cannot start', 'Cannot read cartella\\sotto\\file.txt now']) {
    const errore = Object.assign(new Error(conPercorso), { code: 'SESSION_NOT_READY' });
    assert.ok(!toPublicProblem(errore).explanation.includes('\\'), conPercorso);
  }
  // e la frase senza percorso dello stesso codice passa ancora
  const pulita = Object.assign(new Error('The session is not ready: start a new one'), { code: 'SESSION_NOT_READY' });
  assert.equal(toPublicProblem(pulita).explanation, 'The session is not ready: start a new one');
});
