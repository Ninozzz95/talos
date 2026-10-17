/*
 * 16/10/2026 (bugfixer) — revisione avversaria di ca89c4035 (#44 del mobile: i rifiuti dell'albero dei file uscivano «Invalid query»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { toPublicProblem } from '../src/public-problem.mjs';
import { FRASI_DEI_MOTIVI_DEI_FILE } from '../src/motivi-dei-file.mjs';
import { WorkspaceFileError } from '../src/workspace-files.mjs';
import { WorkspaceTreeError } from '../src/workspace-tree.mjs';

test('MOTIVI-REV-01 — [VERDE] tutte le 23 frasi passano il filtro di pubblicazione: l\'explanation è ESATTAMENTE la frase della tabella', () => {
  const non = Object.entries(FRASI_DEI_MOTIVI_DEI_FILE).filter(([m, f]) => toPublicProblem(new WorkspaceFileError(f, 'QUERY_INVALID', { reason: m }), { requestId: 'r', operation: 'o' }).explanation !== f);
  assert.deepEqual(non, []);
});

test('MOTIVI-REV-02 — [CURATO 16/10, era S4 latente] un errore con un motivo della tabella pubblica il SUO message, e il filtro dei percorsi non vede quelli di Windows (barre rovesciate): oggi nessun rifiuto lo fa, ma la garanzia sta nel modo di costruirli, non nella pubblicazione', () => {
  const conPercorso = new WorkspaceFileError('Invalid file name: C:\\Users\\persona\\segreto.txt', 'QUERY_INVALID', { reason: 'file-name-invalid' });
  const pubblica = toPublicProblem(conPercorso, { requestId: 'r', operation: 'o' }).explanation;
  assert.ok(!pubblica.includes('persona') &&!pubblica.includes('segreto'), `explanation: «${pubblica}» — \`messaggioPubblicabile\` (public-problem.mjs:160) cerca solo \`/x/\`, e per i motivi dei file pubblica \`error.message\`. Pubblicare \`FRASI_DEI_MOTIVI_DEI_FILE[reason]\` invece del message chiude il caso; la regex andrebbe estesa anche alle barre rovesciate (il desktop gira su Windows)`);
  const conNome = new WorkspaceTreeError('folder-not-found');
  assert.equal(conNome.message, 'Folder not found');
});

test('MOTIVI-REV-03 — [CURATO 16/10, era S5] il fratello dell\'albero: un allegato della chat con un nome illeggibile (troppo lungo, con una barra) esce ancora «Invalid query», senza motivo', async () => {
  const { saveChatFile } = await import('../src/chat-file-upload.mjs');
  let errore = null;
  try { await saveChatFile({ rootDir: '/tmp/non-usata', name: `${'a'.repeat(300)}.txt`, source: null }); } catch (e) { errore = e; }
  assert.equal(errore?.code, 'QUERY_INVALID', `premessa: ${errore?.code} ${errore?.message}`);
  assert.equal(typeof errore?.reason, 'string', `chat-file-upload.mjs:23/28 — \`new WorkspaceFileError('Invalid file name', 'QUERY_INVALID')\` senza motivo: alla persona arriva la copia generica del codice. C'è già 'file-name-invalid' nella tabella`);
});
