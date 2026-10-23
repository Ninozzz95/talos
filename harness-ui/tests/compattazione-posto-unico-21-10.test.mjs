/*
 * 21/10/2026, dal vivo sul Pad (sessione lunga del Mobile, LFM2.5 sul motore dell'app): un motore a POSTO UNICO serve una richiesta
 * alla volta. Il riassunto preparato in sottofondo è partito mentre il giro aveva una richiesta in volo, e la richiesta successiva
 * ha preso 409 LOCAL_ENGINE_BUSY. Su `locale-ospite:` e `local:` niente precalcolo in parallelo al giro: si compatta FRA due passi.
 * Adapter desktop VERO, rete finta: nessun giro pagato. Il verso contrario (un modello a chiave) resta istantaneo come prima.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora: talosLavoraVero, motoreAPostoUnico } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
/* Revisione 6 della CLI (S2-2): senza uno scarto misurato la prima richiesta di un giro porta la stima degli schemi degli attrezzi (i fornitori veri li contano). Il fornitore finto di questo file risponde `prompt_tokens` = stima dei soli MESSAGGI: lo scarto che il registro misurerebbe su di lui è 0, e lo si dichiara (`scartoMisurato: 0`) invece di cambiare tutte le soglie. */
const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
const RIASSUNTO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });

/** Rete finta che conta le richieste IN VOLO insieme: un motore a posto unico ne regge una sola. */
function rete(letture) {
  const conti = { modello: 0, riassunti: 0, inVolo: 0, piccoInVolo: 0 };
  let fatte = 0;
  const fn = async (_u, o) => {
    conti.inVolo += 1;
    conti.piccoInVolo = Math.max(conti.piccoInVolo, conti.inVolo);
    try {
      const corpo = JSON.parse(o.body);
      await attesa(40);
      if (!corpo.tools?.length) { conti.riassunti += 1; return RIASSUNTO(); }
      conti.modello += 1;
      const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
      const nome = corpo.tools.map((t) => t.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
      if (fatte < letture) {
        fatte += 1;
        return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
      }
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
    } finally { conti.inVolo -= 1; }
  };
  return { fn, conti };
}

async function giro(t, modello) {
  const cartella = mkdtempSync(join(tmpdir(), 'posto-unico-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r = rete(12);
  const eventi = [];
  const esito = await talosLavora({ cartella, modello, chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r.fn, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(inizio|fine|preparata)$/u.test(e?.tipo ?? '')) eventi.push(`${e.tipo}${e.fase ? `/${e.fase}` : ''}${e.istantanea ? '/istantanea' : ''}`); } });
  return { esito, eventi, conti: r.conti };
}

test('PU-01 motoreAPostoUnico: il motore dell\'app e quello del PC sì, un fornitore a chiave no', () => {
  assert.equal(motoreAPostoUnico('locale-ospite:lfm2.5-2.6b-q4_0.gguf'), true);
  assert.equal(motoreAPostoUnico('local:qwen3-8b.gguf'), true);
  for (const m of ['z-ai/glm-5.3-flash', 'openrouter:z-ai/glm-5.3-flash', 'localai:x', 'lmstudio:local:x', undefined, null, 42]) {
    assert.equal(motoreAPostoUnico(m), false, String(m));
  }
});

for (const modello of ['locale-ospite:lfm2.5-2.6b-q4_0.gguf', 'local:qwen3-8b.gguf']) {
  test(`PU-02 ${modello}: oltre la soglia si compatta fra due passi, mai una seconda richiesta in volo`, async (t) => {
    const { eventi, conti } = await giro(t, modello);
    assert.equal(eventi.some((e) => e.startsWith('compattazione-preparata')), false, JSON.stringify(eventi));
    assert.equal(eventi.some((e) => e.includes('/istantanea')), false, JSON.stringify(eventi));
    assert.ok(eventi.some((e) => e.startsWith('compattazione-inizio')), `la compattazione avviene, aspettando: ${JSON.stringify(eventi)}`);
    assert.ok(conti.riassunti >= 1, 'il riassunto c\'è');
    assert.equal(conti.piccoInVolo, 1, 'una richiesta alla volta sul motore');
  });
}

test('PU-03 verso contrario: un modello a chiave resta istantaneo (riassunto preparato in sottofondo)', async (t) => {
  const { eventi } = await giro(t, 'z-ai/glm-5.3-flash');
  assert.ok(eventi.some((e) => e.startsWith('compattazione-fine/istantanea')), JSON.stringify(eventi));
});
