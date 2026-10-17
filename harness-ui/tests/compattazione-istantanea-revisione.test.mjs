/*
 * 15/10/2026 notte (bugfixer) — revisione avversaria della compattazione istantanea (d600805ae, 9593909e9, a070131e4).
 * Adapter desktop VERO, rete finta: nessun giro pagato. Le ROSSE sono difetti; le VERDI dicono ciò che regge.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

/** Il modello finto: `letture` chiamate all'attrezzo di lettura, poi «fatto». Il riassuntore: `riassunto(o)` decide come risponde. */
function rete({ letture = 0, riassunto }) {
  const conti = { modello: 0, riassunti: 0, promptModello: 0 };
  let fatte = 0;
  const fn = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return riassunto(o); }
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    conti.promptModello += usage.prompt_tokens;
    const nome = corpo.tools.map((t) => t.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (fatte < letture) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  return { fn, conti };
}
const RIASSUNTO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });

function cartellaConFile(t, letture, ripetizioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'istantanea-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= letture; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(ripetizioni)}\n`);
  return cartella;
}

test('IST-REV-01 — il riassunto preparato che arriva DOPO la fine del giro si paga, e il suo costo entra nel conto della SESSIONE: passa dall\'involucro dei fornitori come chiamata secondaria, che deposita il suo `consumo-fornitore` (SECONDARIA-01)', async (t) => {
  /* Riscritta da Nino1 il 15/10 notte. La prova del bugfixer chiedeva che il numero del GIRO contenesse quel costo: un giro chiuso non
     può contenere un costo arrivato dopo. Il conto giusto è quello della sessione, che sul server nasce dagli eventi
     `consumo-fornitore` dell'involucro (runtime-owner-adapter.mjs, `eseguiConFallback`). */
  const cartella = cartellaConFile(t, 0, 0);
  const r0 = rete({ riassunto: async () => { await attesa(400); return RIASSUNTO(); } });
  const depositati = [];
  const fetchConInvolucro = (u, o) => r0.fn(u, o);
  fetchConInvolucro.eseguiConFallback = async (chiama, opzioni) => { const esito = await chiama({}); if (!(opzioni.attrezzi?.length)) depositati.push({ secondaria: opzioni.secondaria === true, prompt: esito?.usage?.prompt_tokens ?? null }); return esito; };
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3450)),
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: fetchConInvolucro });
  assert.equal(depositati.length, 0, 'premessa: a fine giro il riassunto non è ancora arrivato');
  const pronta = await r.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa: è arrivato, e il registro lo passa al giro dopo');
  assert.deepEqual(depositati, [{ secondaria: true, prompt: 1000 }], 'arrivato dopo il giro, è passato dall\'involucro: il suo costo (1.000 token d\'ingresso) entra nel conto della sessione');
});

test('IST-REV-02 — [VERDE] un giro che si ferma mentre aspetta all\'emergenza il riassunto in volo esce subito: lo Stop interrompe anche il riassunto', async (t) => {
  const cartella = cartellaConFile(t, 4, 200);
  const controller = new AbortController();
  let abortiti = 0;
  const r0 = rete({ letture: 4, riassunto: (o) => new Promise((_r, rifiuta) => { o.signal?.addEventListener('abort', () => { abortiti += 1; rifiuta(Object.assign(new Error('abort'), { name: 'AbortError' })); }); }) });
  setTimeout(() => controller.abort(), 1_000);
  const inizio = Date.now();
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn, segnaleStop: controller.signal, permessi: 'Full access' });
  assert.equal(r.comeFinita, 'fermato');
  assert.ok(Date.now() - inizio < 3_000, `${Date.now() - inizio} ms`);
  assert.equal(abortiti, 1);
});

test('IST-REV-03 — [ROSSO, S5] dopo lo Stop all\'emergenza l\'adapter apre lo stesso una compattazione nuova: un «compattazione-inizio» che nessun «fine» chiude', async (t) => {
  const cartella = cartellaConFile(t, 4, 200);
  const controller = new AbortController();
  const eventi = [];
  const r0 = rete({ letture: 4, riassunto: (o) => new Promise((_r, rifiuta) => { o.signal?.addEventListener('abort', () => rifiuta(Object.assign(new Error('abort'), { name: 'AbortError' }))); }) });
  setTimeout(() => controller.abort(), 1_000);
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(3250)), { role: 'user', content: 'Leggi i file.' }],
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn, segnaleStop: controller.signal, permessi: 'Full access',
    onGiro: (e) => { if (/^compattazione-(inizio|fine)$/u.test(e?.tipo ?? '')) eventi.push(e.tipo); } });
  assert.deepEqual(eventi.filter((e) => e === 'compattazione-inizio').length, eventi.filter((e) => e === 'compattazione-fine').length,
    `eventi: ${JSON.stringify(eventi)} — dopo \`await inVolo.promessa\` (talosHarness.desktop-hotfix.mjs, ramo emergenza) manca il controllo di segnaleStop prima di compattaOra`);
});

test('IST-REV-04 — [VERDE] il riassunto pronto del giro prima si usa al giro dopo, sulla storia che il kernel restituisce (messaggiFinali)', async (t) => {
  const cartella = cartellaConFile(t, 0, 0);
  const r0 = rete({ riassunto: () => RIASSUNTO() });
  const s1 = storia(coppiePer(3450));
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: s1, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa');
  const eventi = [];
  const r1 = rete({ riassunto: () => RIASSUNTO() });
  const due = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [...uno.messaggiFinali, { role: 'user', content: `Adesso ${'altro testo '.repeat(300)}` }],
    compattazioneIstantanea: true, compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1.fn,
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e.istantanea === true); } });
  assert.deepEqual(eventi, [true], `scambio istantaneo alla soglia — eventi ${JSON.stringify(eventi)}, riassunti ${r1.conti.riassunti}, richieste ${r1.conti.modello}, conto ${JSON.stringify(due.preparazioniDiCompattazione)}`);
  assert.equal(r1.conti.riassunti, 0, 'e nessun riassunto nuovo pagato');
  assert.deepEqual(due.preparazioniDiCompattazione, { preparate: 0, usate: 1 });
});

test('IST-REV-00 — [ROSSO, S2] il cavo manca: `avviaSessione` (agent-service.mjs) non inoltra `compattazioneIstantanea` né `compattazionePronta` a talosLavora, e non restituisce il riassunto pronto al registro — sul server vero l\'istantanea è SPENTA', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const pronta = { record: { finto: true }, impronta: 'x', base: 'nessuna', soloCoda: false };
  let visto = null;
  const risultato = await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    compattazioneIstantanea: true, compattazionePronta: pronta,
    talosLavoraFn: async (input) => {
      visto = { istantanea: input.compattazioneIstantanea, pronta: input.compattazionePronta };
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [], compattazionePronta: pronta, compattazioneInPreparazione: null };
    },
  });
  assert.deepEqual(visto, { istantanea: true, pronta }, `il kernel riceve ${JSON.stringify(visto)}: l'elenco esplicito di agent-service.mjs (~2217-2240) non porta i due campi (lo stesso «cavo che mancava» di BUG-5 per finestraToken). Misurato dal vivo il 15/10 sul 4176 con glm-5.3-flash, conversazione legacy: al giro 2 una compattazione «soglia» in primo piano di 13,6 s, che col modo istantaneo non può esistere`);
  assert.deepEqual(risultato?.esito?.compattazionePronta ?? risultato?.compattazionePronta ?? null, pronta, 'e il riassunto pronto torna al registro (session-registry.mjs, `risultato?.esito?.compattazionePronta`)');
});

test('IST-REV-00b — [ROSSO, S2, c\'era già da 5ca876475] lo stesso cavo perde anche `recordCompattazioneIniziale`: ogni giro dopo una compattazione riparte dalla storia INTERA e ricompatta', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const record = { finto: true };
  let visto = 'mai chiamato';
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, recordCompattazioneIniziale: record,
    talosLavoraFn: async (input) => { visto = input.recordCompattazioneIniziale; return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; },
  });
  assert.equal(visto, record, `il kernel riceve ${JSON.stringify(visto)}. session-registry.mjs:8146 lo passa («decisione 3: il turno parte già proiettato»), agent-service lo scarta. Dal vivo (15/10, 4176, glm-5.3-flash): il giro 1 finisce compattato a ~3.200 token, il giro 2 alla seconda richiesta ne misura 30.273 e ricompatta in primo piano per 13,6 s`);
});

test('IST-REV-05 — owner 15/10 notte, «passa al giro dopo»: il giro che riceve il riassunto ancora in arrivo NON ne paga un secondo, e quando arriva lo scambia all\'istante; AL CONTRARIO, senza, ne prepara uno suo', async (t) => {
  for (const conInArrivo of [true, false]) {
    const cartella = cartellaConFile(t, 2, 200);
    const r0 = rete({ riassunto: () => RIASSUNTO() });
    const s1 = storia(coppiePer(3450));
    const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: s1, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn });
    const prontaVera = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
    assert.ok(prontaVera, 'premessa');
    let consegna;
    const inArrivo = new Promise((r) => { consegna = r; });
    setTimeout(() => consegna(prontaVera), 300);
    const eventi = [];
    const r1 = rete({ letture: 2, riassunto: async () => { await attesa(2_000); return RIASSUNTO(); } });
    const lente = async (u, o) => { const corpo = JSON.parse(o.body); if (corpo.tools?.length) await attesa(250); return r1.fn(u, o); };
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Leggi.' }, permessi: 'Full access',
      messaggiIniziali: [...uno.messaggiFinali, { role: 'user', content: `Adesso ${'altro testo '.repeat(300)}` }],
      compattazioneIstantanea: true, ...(conInArrivo ? { compattazioneInArrivo: inArrivo } : {}), contestoDelProgetto: 'Project files:\n', fetchDiRete: lente,
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e.istantanea === true); } });
    if (conInArrivo) {
      assert.equal(r1.conti.riassunti, 0, `nessun secondo riassunto pagato — eventi ${JSON.stringify(eventi)}`);
      assert.ok(eventi.includes(true), `lo scambio istantaneo col riassunto arrivato — eventi ${JSON.stringify(eventi)}`);
    } else {
      assert.ok(r1.conti.riassunti >= 1, 'senza il riassunto in arrivo, il giro ne prepara uno suo');
    }
  }
});

test('IST-REV-00c — anche il riassunto ancora in arrivo attraversa il cavo: `avviaSessione` lo passa a talosLavora così com\'è (la stessa promessa)', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const inArrivo = new Promise(() => {});
  let visto = 'mai chiamato';
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, compattazioneIstantanea: true, compattazioneInArrivo: inArrivo,
    talosLavoraFn: async (input) => { visto = input.compattazioneInArrivo; return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [] }; },
  });
  assert.equal(visto, inArrivo);
});

test('IST-REV-06 — il riassunto preparato in sottofondo chiede all\'involucro dei fornitori una chiamata `secondaria`; le richieste del giro no (giro vero 15/10: senza, PROVIDER_FALLBACK_BUSY e giro fallito)', async (t) => {
  const cartella = cartellaConFile(t, 0, 0);
  const r0 = rete({ riassunto: async () => { await attesa(200); return RIASSUNTO(); } });
  const visti = [];
  const fetchConInvolucro = (u, o) => r0.fn(u, o);
  fetchConInvolucro.eseguiConFallback = async (chiama, opzioni) => { visti.push({ secondaria: opzioni.secondaria === true, attrezzi: (opzioni.attrezzi?.length ?? 0) > 0 }); return chiama({}); };
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3450)),
    compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: fetchConInvolucro });
  await r.compattazioneInPreparazione;
  const riassunti = visti.filter((v) => !v.attrezzi);
  const giro = visti.filter((v) => v.attrezzi);
  assert.ok(riassunti.length >= 1, `premessa: un riassunto in sottofondo — ${JSON.stringify(visti)}`);
  assert.ok(riassunti.every((v) => v.secondaria), `il riassunto in sottofondo è secondario — ${JSON.stringify(visti)}`);
  assert.ok(giro.length >= 1 && giro.every((v) => !v.secondaria), `le richieste del giro restano normali — ${JSON.stringify(visti)}`);
});

test('IST-REV-06b — AL CONTRARIO: il riassunto DENTRO il giro (il giro lo aspetta) resta una chiamata normale, che se il fornitore cade può passare a quello di riserva', async (t) => {
  const cartella = cartellaConFile(t, 0, 0);
  const r0 = rete({ riassunto: () => RIASSUNTO() });
  const visti = [];
  const fetchConInvolucro = (u, o) => r0.fn(u, o);
  fetchConInvolucro.eseguiConFallback = async (chiama, opzioni) => { visti.push({ secondaria: opzioni.secondaria === true, attrezzi: (opzioni.attrezzi?.length ?? 0) > 0 }); return chiama({}); };
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(4600)),
    contestoDelProgetto: 'Project files:\n', fetchDiRete: fetchConInvolucro });
  const riassunti = visti.filter((v) => !v.attrezzi);
  assert.ok(riassunti.length >= 1, `premessa: una compattazione dentro il giro — ${JSON.stringify(visti)}`);
  assert.ok(riassunti.every((v) => !v.secondaria), `dentro il giro il riassunto NON è secondario — ${JSON.stringify(visti)}`);
});

test('IST-REV-07 — un riassunto pronto che alla soglia NON vale lo dice una volta, col perché (prefisso cambiato); AL CONTRARIO, uno che vale si scambia senza scarto', async (t) => {
  const cartella = cartellaConFile(t, 0, 0);
  const r0 = rete({ riassunto: () => RIASSUNTO() });
  const s1 = storia(coppiePer(3450));
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: s1, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0.fn });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa');
  for (const cambiaUnMessaggioVecchio of [true, false]) {
    const storiaDopo = uno.messaggiFinali.map((m, i) => (cambiaUnMessaggioVecchio && i === 2 ? { ...m, content: `${m.content} (modificato)` } : m));
    const eventi = [];
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [...storiaDopo, { role: 'user', content: `Adesso ${'altro testo '.repeat(300)}` }],
      compattazioneIstantanea: true, compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: rete({ riassunto: () => RIASSUNTO() }).fn,
      onGiro: (e) => { if (e?.tipo === 'compattazione-preparata' && e.fase === 'scartata') eventi.push(e.motivo); if (e?.tipo === 'compattazione-fine' && e.istantanea) eventi.push('ISTANTANEA'); } });
    if (cambiaUnMessaggioVecchio) assert.deepEqual(eventi.filter((x) => x !== 'ISTANTANEA'), ['prefix-changed'], JSON.stringify(eventi));
    else assert.deepEqual(eventi, ['ISTANTANEA'], JSON.stringify(eventi));
  }
});
