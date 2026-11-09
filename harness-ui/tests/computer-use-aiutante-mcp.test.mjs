/*
 * L'aiutante MCP del computer use (passo 5 del piano, forma FORMA-ATTREZZO-COLLEGAMENTO §3): parte solo con l'impronta giusta, mai con
 * le chiavi dei fornitori nell'ambiente, uno per macchina, spento dopo l'inattività. L'aiutante è finto (un processo Node che parla MCP
 * su stdio): nessuna prova tocca lo schermo vero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaAiutanteMcp, aiutantePerMacchina, ambientePulito, IMPRONTA_AIUTANTE_PC, NON_DISPONIBILE } from '../src/computer-use/aiutante-mcp.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FINTO = join(QUI, 'fixtures', 'aiutante-mcp-finto.mjs');
const IMPRONTA_FINTA = createHash('sha256').update(readFileSync(FINTO)).digest('hex');
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/** `avvia` che conta gli avvii e lancia il finto con Node al posto del `.exe`. */
function avviaContato() {
  const chiamate = [];
  const avvia = (exe, args, opzioni) => { chiamate.push({ exe, args, opzioni }); return spawn(process.execPath, [exe, ...args], opzioni); };
  return { avvia, chiamate };
}

test('AIUT-01: binario assente ⇒ nessun processo, motivo «binario»', async () => {
  const { avvia, chiamate } = avviaContato();
  const a = creaAiutanteMcp({ exe: join(QUI, 'fixtures', 'non-esiste.exe'), improntaAttesa: IMPRONTA_FINTA, avvia });
  assert.deepEqual(await a.apri(), { ok: false, motivo: 'binario' });
  assert.equal(chiamate.length, 0);
  assert.equal(a.stato().vivo, false);
});

test('AIUT-02: impronta diversa ⇒ nessun processo, motivo «impronta»; impronta non fissata ⇒ idem', async () => {
  const { avvia, chiamate } = avviaContato();
  const diversa = creaAiutanteMcp({ exe: FINTO, improntaAttesa: 'a'.repeat(64), avvia });
  assert.deepEqual(await diversa.apri(), { ok: false, motivo: 'impronta' });
  const nessuna = creaAiutanteMcp({ exe: FINTO, improntaAttesa: null, avvia });
  assert.deepEqual(await nessuna.apri(), { ok: false, motivo: 'impronta-non-fissata' });
  assert.equal(chiamate.length, 0, 'nessun avvio senza la sua impronta');
  // dal 05/11/2026 l'impronta di serie è quella della build di rilascio (RIL-03); il testo intero lo prova RIL-02
  assert.match(IMPRONTA_AIUTANTE_PC, /^[0-9a-f]{64}$/u);
  assert.ok(NON_DISPONIBILE.startsWith('computer_use is not available on this computer'), NON_DISPONIBILE);
});

test('AIUT-03: impronta giusta ⇒ parte in modo mcp, risponde agli strumenti, senza chiavi dei fornitori nell\'ambiente', async (t) => {
  const { avvia, chiamate } = avviaContato();
  const ambiente = { ...process.env, OPENROUTER_API_KEY: 'sk-finta', OPENAI_API_KEY: 'sk-finta', ANTHROPIC_API_KEY: 'sk-finta', TALOS_SEGRETO: 'x' };
  const a = creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia, ambiente });
  t.after(() => a.chiudi());
  assert.deepEqual(await a.apri(), { ok: true });
  assert.equal(chiamate.length, 1);
  assert.deepEqual(chiamate[0].args, ['mcp']);
  const eco = await a.chiama('list_windows', { on_screen_only: true });
  assert.equal(eco.ok, true);
  assert.deepEqual(eco.dati, { nome: 'list_windows', argomenti: { on_screen_only: true } });
  assert.deepEqual(eco.immagine, { base64: 'QUJD', mime: 'image/png' });
  const amb = await a.chiama('ambiente', {});
  for (const k of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TALOS_SEGRETO']) assert.ok(!amb.dati.chiavi.includes(k), k);
  assert.ok(amb.dati.chiavi.includes('DO_NOT_TRACK'));
  // una seconda apertura non avvia un secondo processo
  await a.apri();
  assert.equal(chiamate.length, 1);
  assert.deepEqual(Object.keys(ambientePulito({ OPENROUTER_API_KEY: 'x', PATH: 'p' })).sort(), ['CUA_TELEMETRY', 'DO_NOT_TRACK', 'PATH']);
});

test('AIUT-04: richiesta annullata dal segnale ⇒ esito d\'errore subito, mai un\'eccezione', async (t) => {
  const { avvia } = avviaContato();
  const a = creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia });
  t.after(() => a.chiudi());
  await a.apri();
  const ctl = new AbortController();
  const p = a.chiama('lento', {}, ctl.signal);
  ctl.abort();
  const r = await p;
  assert.equal(r.ok, false);
  assert.equal(r.errore, 'aborted');
});

test('AIUT-05: spento dopo l\'inattività, mai mentre un compito gira; uno per macchina', async (t) => {
  const { avvia, chiamate } = avviaContato();
  const a = creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia, msInattivo: 60 });
  t.after(() => a.chiudi());
  await a.apri();
  const fine = a.compito();
  await attendi(150);
  assert.equal(a.stato().vivo, true, 'un compito in corso tiene acceso l\'aiutante');
  fine();
  await attendi(150);
  assert.equal(a.stato().vivo, false, 'spento dopo l\'inattività');
  // alla chiamata dopo si riapre, e l'impronta si ricontrolla
  assert.deepEqual(await a.apri(), { ok: true });
  assert.equal(chiamate.length, 2);
  const uno = aiutantePerMacchina({ exe: 'C:/finto/uno.exe', improntaAttesa: null });
  assert.equal(aiutantePerMacchina({ exe: 'C:/finto/uno.exe', improntaAttesa: null }), uno);
});
