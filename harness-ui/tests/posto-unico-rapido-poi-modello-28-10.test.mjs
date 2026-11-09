/*
 * Owner 28/10/2026, «Rapido subito, il modello dopo» (`decisione-owner-riassunto-locale-rapido-poi-modello-28-10`), contratto con la CLI
 * `Downloads/handoff-talos-2026-09-27/CONTRATTO-POSTO-UNICO-RAPIDO-POI-MODELLO-2026-10-28.md`. Sul motore a POSTO UNICO (`local:`,
 * `locale-ospite:`) all'emergenza il giro aspettava il riassunto del modello locale. Ora:
 *   P1 — parte SUBITO col rapido (ragione 'in-arrivo') e il record lo dice (`aFineGiro: true`); nessun riassunto del modello DENTRO il
 *        giro: occuperebbe l'unico posto mentre la richiesta del giro è in volo (409 LOCAL_ENGINE_BUSY, Pad 21/10).
 * Adapter desktop VERO, rete finta che conta le richieste in volo: nessun giro pagato.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora: talosLavoraVero } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
/* Come `compattazione-posto-unico-21-10.test.mjs`: il fornitore finto risponde `prompt_tokens` = stima dei soli messaggi, lo scarto è 0 */
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

/** Un giro che parte già OLTRE l'emergenza (sonda del 28/10: a 6.287 token, col tetto di 4.000, la prima richiesta compatta per «emergenza»). */
async function giroAllEmergenza(t, modello, { istantanea = true } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'posto-unico-rapido-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(20)}\n`);
  const r = rete(1);
  const eventi = [];
  const esito = await talosLavora({ cartella, modello, chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Leggi il file.' }],
    compattazioneIstantanea: istantanea, contestoDelProgetto: 'Project files:\n', fetchDiRete: r.fn, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-/u.test(e?.tipo ?? '')) eventi.push(e); } });
  return { esito, eventi, conti: r.conti };
}
const rapidiDi = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego === true && e.ragione === 'in-arrivo');

for (const modello of ['locale-ospite:lfm2.5-2.6b-q4_0.gguf', 'local:qwen3-8b.gguf']) {
  test(`PU-RAPIDO-01 ${modello}: all'emergenza il rapido parte SUBITO e dice «a fine giro»; nessun riassunto del modello dentro il giro, mai due richieste insieme`, async (t) => {
    const { eventi, conti } = await giroAllEmergenza(t, modello);
    const [rapido] = rapidiDi(eventi);
    assert.ok(rapido, `il rapido «in arrivo»: ${JSON.stringify(eventi.map((e) => `${e.tipo}/${e.ragione ?? e.motivo ?? ''}`))}`);
    assert.equal(rapido.record?.aFineGiro, true, 'il record dice che il riassunto del modello lo scrive il fine giro');
    assert.equal(conti.riassunti, 0, 'nessun riassunto del modello mentre il giro ha il posto');
    assert.equal(eventi.some((e) => e.tipo === 'compattazione-preparata'), false, 'nessuna preparazione in sottofondo nel giro');
    assert.equal(conti.piccoInVolo, 1, 'una richiesta alla volta sul motore');
    assert.equal('lavoroDelMotore' in rapido.record, false, 'non è la strada del motore del contesto');
  });
}

test('PU-RAPIDO-02 (verso contrario) — un modello a chiave all\'emergenza: il rapido e la preparazione in sottofondo come oggi, nessun «a fine giro»', async (t) => {
  const { eventi } = await giroAllEmergenza(t, 'z-ai/glm-5.3-flash');
  const [rapido] = rapidiDi(eventi);
  assert.ok(rapido, 'il rapido «in arrivo»');
  assert.equal('aFineGiro' in rapido.record, false);
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-preparata'), 'la preparazione in sottofondo parte');
});

test('PU-RAPIDO-03 — il servizio passa `aFineGiro` all\'evento della chat (la TUI della CLI lo legge); AL CONTRARIO, solo `true` passa', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  const record = { schema: 'talos.compattazione.v1', coveredThrough: 4, riassunto: [], at: '2026-10-28T11:00:00.000Z', tokenPrima: 10, tokenDopo: 5 };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'local:qwen3-8b.gguf', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, record: { ...record, aFineGiro: true }, ripiego: true, ragione: 'in-arrivo' });
      onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record: { ...record, at: '2026-10-28T11:01:00.000Z', aFineGiro: 'sì' }, ripiego: true, ragione: 'in-arrivo' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [] };
    } });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal(fini[0].aFineGiro, true);
  assert.equal('aFineGiro' in fini[1], false, 'un valore che non è `true` non passa');
});
