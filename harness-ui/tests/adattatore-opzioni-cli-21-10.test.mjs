/*
 * Lane CLI, 21/10/2026 — tre richieste per caricare l'adapter desktop nella 0.6.13:
 * (a) il tetto della compattazione come opzione di talosLavora (`tettoCompattazioneToken`), non solo `TALOS_COMPACTION_TOKEN_CAP`;
 * (b) l'avviso di inattività deviabile (`onStallo`) invece del solo `console.warn`;
 * (c) il commento che dava la CLI già sull'adapter (solo testo, nessuna prova).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

delete process.env.TALOS_COMPACTION_TOKEN_CAP;
const { talosLavora, STALL_DIAGNOSTIC_EVENT } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const storia = (coppie) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(60)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(60)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

function rete({ attesaMs = 0 } = {}) {
  return async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (attesaMs) await new Promise((r) => { setTimeout(r, attesaMs); });
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'Riassunto della conversazione.' }, finish_reason: 'stop' }], usage });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
}

async function giro(t, extra) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-opzioni-cli-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const inizi = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' },
    messaggiIniziali: storia(coppiePer(extra.token ?? 4_400)), contestoDelProgetto: 'Project files:\n', fetchDiRete: rete(extra.rete),
    onGiro: (e) => { if (e?.tipo === 'compattazione-inizio') inizi.push(e); }, ...extra.input });
  return inizi;
}

test('CLI-OPZ-01 il tetto passato come opzione fa scattare la compattazione alla sua soglia; senza, il tetto di serie (200K) no', async (t) => {
  const conOpzione = await giro(t, { input: { tettoCompattazioneToken: 4_000 } });
  assert.ok(conOpzione.length >= 1, 'con il tetto a 4.000 una storia da ~4.400 token si compatta');
  assert.equal(conOpzione[0].soglia, 4_000, JSON.stringify(conOpzione[0]));
  assert.deepEqual(await giro(t, { input: {} }), [], 'verso contrario: senza opzione e senza ambiente, 200K, niente compattazione');
});

test('CLI-OPZ-02 un valore che non è un intero positivo non è un tetto: ricade sull\'ambiente', async (t) => {
  for (const errato of ['4000', 0, -4_000, 4_000.5, Number.NaN, null]) {
    assert.deepEqual(await giro(t, { input: { tettoCompattazioneToken: errato } }), [], `ignorato: ${String(errato)}`);
  }
  process.env.TALOS_COMPACTION_TOKEN_CAP = '5000';
  try {
    const daAmbiente = await giro(t, { token: 5_400, input: { tettoCompattazioneToken: '4000' } });
    assert.equal(daAmbiente[0]?.soglia, 5_000, 'opzione scartata ⇒ vale la variabile');
    const vinceOpzione = await giro(t, { input: { tettoCompattazioneToken: 4_000 } });
    assert.equal(vinceOpzione[0]?.soglia, 4_000, 'opzione valida ⇒ vince sull\'ambiente');
  } finally {
    delete process.env.TALOS_COMPACTION_TOKEN_CAP;
  }
});

test('CLI-OPZ-03 con onStallo l\'avviso di inattività va all\'ospite e non su stderr; senza, il console.warn di sempre', async (t) => {
  const prima = process.env.TALOS_DESKTOP_HOTFIX_STALL_MS;
  process.env.TALOS_DESKTOP_HOTFIX_STALL_MS = '40';
  const avvisi = [];
  const warnOriginale = console.warn;
  console.warn = (...a) => { avvisi.push(a.join(' ')); };
  try {
    const ricevuti = [];
    await giro(t, { rete: { attesaMs: 200 }, input: { onStallo: (r) => { ricevuti.push(r); } } });
    assert.ok(ricevuti.some((r) => r.event === STALL_DIAGNOSTIC_EVENT && Number.isFinite(r.stalledMs)), JSON.stringify(ricevuti));
    assert.equal(avvisi.filter((a) => a.includes('[desktop-blackbox]')).length, 0, 'con onStallo niente console.warn');

    await giro(t, { rete: { attesaMs: 200 }, input: { onStallo: () => { throw new Error('ospite rotto'); } } });
    /* revisione C-1: un ospite asincrono che rifiuta — senza il gestore, Node termina il processo (rifiuto senza gestore) */
    const rifiutiSenzaGestore = [];
    const spia = (motivo) => { rifiutiSenzaGestore.push(motivo); };
    process.on('unhandledRejection', spia);
    try {
      await giro(t, { rete: { attesaMs: 200 }, input: { onStallo: async () => { throw new Error('ospite asincrono rotto'); } } });
      await new Promise((r) => { setTimeout(r, 20); });
    } finally {
      process.off('unhandledRejection', spia);
    }
    assert.deepEqual(rifiutiSenzaGestore, [], 'un onStallo asincrono che rifiuta non lascia rifiuti senza gestore');

    await giro(t, { rete: { attesaMs: 200 }, input: {} });
    assert.ok(avvisi.some((a) => a.includes('[desktop-blackbox]') && a.includes(STALL_DIAGNOSTIC_EVENT)), 'verso contrario: senza onStallo resta il console.warn');
  } finally {
    console.warn = warnOriginale;
    if (prima === undefined) delete process.env.TALOS_DESKTOP_HOTFIX_STALL_MS; else process.env.TALOS_DESKTOP_HOTFIX_STALL_MS = prima;
  }
});
