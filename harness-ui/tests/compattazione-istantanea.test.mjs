/*
 * ⭐ 15/10/2026 — LA COMPATTAZIONE ISTANTANEA dell'adapter desktop (owner: «i minuti di compattazione non devono esistere»; decisioni
 *   nella ricerca `.claude/RICERCA-COMPATTAZIONE-ISTANTANEA-2026-10-15.md` §7). Acceso dall'ospite con `compattazioneIstantanea: true`.
 *   - dall'80% della soglia il riassunto si prepara in sottofondo, la richiesta non aspetta;
 *   - alla soglia si applica all'istante quello pronto, se il prefisso che copre è intatto e riporta sotto la soglia;
 *   - si aspetta solo all'emergenza.
 * Ogni caso ha il suo verso contrario. Ermetico come `desktop-hotfix-compaction.test.mjs`: modello finto, nessuna rete, TEMP privata.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { MARCATORE_RIASSUNTO, VARIABILE_TETTO_TOKEN, applicaRecord, creaRecord } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-istantanea-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50)); // ≈1.000 token per lettura
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}

const eRichiestaDiRiassunto = (body) => {
  const ultimo = String(body.messages.at(-1)?.content ?? '');
  return ultimo.includes('CONTEXT COMPACTION') || ultimo.includes('summarize your progress');
};
const testoDi = (m) => (typeof m?.content === 'string' ? m.content
  : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : JSON.stringify(m?.content ?? ''));
const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Il fornitore finto del banco della compattazione, con in più `ritardoRiassuntoMs` (un riassuntore lento, come quelli veri: il
 * cookbook di Anthropic misura 41 s) e l'ora di ogni richiesta, per misurare quanto il giro ASPETTA.
 */
function fintoFornitore({ chiamateTool = 10, riassunto, ritardoRiassuntoMs = 0, ritardoLavoroMs = 0, testoRiassunto = 'RIASSUNTO', lavoroAspettaPronta = false } = {}) {
  const corpi = [];
  const ore = [];
  let lavoro = 0;
  let riassunti = 0;
  let riassuntiInVolo = 0;
  const lavoroDuranteUnRiassunto = [];
  /*
   * IST-02 era rossa 1 volta su 5 da sola (`emergenza` al posto di `soglia`): fra l'80% e la soglia passano UNA o DUE richieste da
   * 30 ms, e sotto carico il riassunto in sottofondo arrivava dopo la soglia ⇒ si aspettava all'emergenza (comportamento voluto,
   * provato da IST-01). Con `lavoroAspettaPronta` la richiesta di lavoro partita mentre un riassunto si prepara risponde solo dopo
   * l'evento «pronta» del kernel: l'ordine che la prova vuole misurare, senza dipendere dall'orologio. Rete di 5 s se non arriva.
   */
  let attesaPronta = null;
  let liberaPronta = () => {};
  const suEvento = (e) => { if (e?.tipo === 'compattazione-preparata' && e.fase === 'pronta') { liberaPronta(); attesaPronta = null; } };
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const promptTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const usage = { prompt_tokens: promptTokens, completion_tokens: 5 };
    if (eRichiestaDiRiassunto(body)) {
      if (lavoroAspettaPronta && !attesaPronta) attesaPronta = new Promise((r) => { liberaPronta = r; setTimeout(r, 5_000).unref?.(); });
      riassunti += 1;
      riassuntiInVolo += 1;
      try {
        if (ritardoRiassuntoMs) await attesa(ritardoRiassuntoMs);
        const dato = riassunto?.(riassunti);
        const scelta = dato?.message ?? dato ?? { role: 'assistant', content: `${testoRiassunto} ${riassunti}: ho letto grande.txt più volte.` };
        const fine = dato?.finish_reason ?? (scelta.tool_calls ? 'tool_calls' : 'stop');
        return Response.json({ choices: [{ message: scelta, finish_reason: fine }], usage });
      } finally { riassuntiInVolo -= 1; }
    }
    lavoro += 1;
    ore.push(Date.now());
    if (ritardoLavoroMs) await attesa(ritardoLavoroMs); // un modello vero non risponde in 0 ms
    if (attesaPronta) await attesaPronta;
    if (riassuntiInVolo > 0) lavoroDuranteUnRiassunto.push(lavoro);
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  const lavori = () => corpi.filter((b) => !eRichiestaDiRiassunto(b));
  const pausaMassima = () => ore.slice(1).reduce((m, o, i) => Math.max(m, o - ore[i]), 0);
  return { fetchDiRete, corpi, lavori, ore, pausaMassima, lavoroDuranteUnRiassunto, suEvento, riassuntiChiesti: () => corpi.filter(eRichiestaDiRiassunto) };
}

async function giro(t, { cartella, fornitore, istantanea = true, ...resto } = {}) {
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: fornitore.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0',
    onGiro: (e) => { eventi.push(e); fornitore.suEvento?.(e); }, compattazioneIstantanea: istantanea,
    ...resto,
  });
  return { esito, eventi };
}

test('IST-01 — il banco del tempo d\'attesa: con un riassuntore lento il giro NON si ferma ad aspettarlo; AL CONTRARIO, spenta, sì', async (t) => {
  /* proporzioni di una sessione vera: fra l'80% della soglia e la soglia passano più richieste di quante ne duri un riassunto */
  conTetto(t, 20_000);
  const RITARDO = 400;
  const LAVORO = 200;
  const misure = {};
  for (const istantanea of [true, false]) {
    const fornitore = fintoFornitore({ chiamateTool: 25, ritardoRiassuntoMs: RITARDO, ritardoLavoroMs: LAVORO });
    const { esito, eventi } = await giro(t, { cartella: cartellaDiProva(t), fornitore, istantanea });
    if (istantanea) {
      assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 0, 'accesa: nessuna compattazione bloccante');
      assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.istantanea && e.motivo === 'soglia'), 'accesa: lo scambio arriva alla soglia');
    }
    assert.equal(esito.comeFinita, 'concluso');
    assert.ok(fornitore.riassuntiChiesti().length >= 1, 'la conversazione ha superato la soglia');
    misure[istantanea] = { pausa: fornitore.pausaMassima(), durante: fornitore.lavoroDuranteUnRiassunto.length };
  }
  t.diagnostic(`pausa massima fra due richieste: accesa ${misure.true.pausa} ms, spenta ${misure.false.pausa} ms (modello ${LAVORO} ms, riassunto ${RITARDO} ms)`);
  assert.ok(misure.true.durante >= 1, `accesa: il lavoro va avanti MENTRE il riassunto si prepara (${JSON.stringify(misure)})`);
  assert.ok(misure.true.pausa < LAVORO + RITARDO / 2, `accesa: fra due richieste passa solo il tempo del modello, mai quello del riassunto (${JSON.stringify(misure)})`);
  assert.equal(misure.false.durante, 0, 'spenta: nessuna richiesta parte mentre il riassunto è in corso');
  assert.ok(misure.false.pausa >= LAVORO + RITARDO, `spenta: il giro aspetta il riassunto (${JSON.stringify(misure)})`);
});

test('IST-02 — alla soglia lo scambio è istantaneo: niente «inizio» (nessuna barra), un «fine» con istantanea; il record si rigioca uguale', async (t) => {
  conTetto(t, 8_000);
  const fornitore = fintoFornitore({ chiamateTool: 10, ritardoLavoroMs: 30, lavoroAspettaPronta: true });
  const { esito, eventi } = await giro(t, { cartella: cartellaDiProva(t), fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 0, 'nessuna compattazione bloccante');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-preparata' && e.fase === 'inizio' && e.motivo === 'precalcolo'));
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-preparata' && e.fase === 'pronta'));
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato);
  assert.ok(fini.length >= 1);
  assert.equal(fini[0].istantanea, true);
  assert.equal(fini[0].motivo, 'soglia');
  const { record } = fini[0];
  assert.ok(record.tokenPrima >= 8_000 && record.tokenDopo < 8_000, `${record.tokenPrima} → ${record.tokenDopo}`);
  assert.deepEqual(esito.recordDiCompattazione[0], record);
  const proiezione = applicaRecord(esito.messaggiFinali, record);
  const dopo = fornitore.lavori().find((b) => b.messages.some((m) => testoDi(m).startsWith(MARCATORE_RIASSUNTO)));
  const forma = (lista) => lista.filter((m) => m.role !== 'system').map((m) => [m.role, testoDi(m), (m.tool_calls ?? []).map((c) => c.id).join(',')]);
  assert.deepEqual(forma(dopo.messages), forma(proiezione.slice(0, dopo.messages.length)), 'la richiesta dopo lo scambio è la proiezione del record');
  assert.deepEqual(esito.preparazioniDiCompattazione.usate >= 1, true, JSON.stringify(esito.preparazioniDiCompattazione));
});

test('IST-03 — un riassunto pronto e non usato passa al giro dopo e si usa SENZA ripagarlo; AL CONTRARIO, se il prefisso è cambiato, no', async (t) => {
  conTetto(t, 12_000); // il preambolo da solo vale ~3.000 token: con 8.000 lo scambio non potrebbe riportare sotto la soglia
  const cartella = cartellaDiProva(t);
  /* 7 letture: si supera l'80% (si prepara) ma il giro finisce prima della soglia — il riassunto resta pronto */
  const primo = fintoFornitore({ chiamateTool: 7, testoRiassunto: 'RIASSUNTO-PRONTO' });
  const { esito: e1 } = await giro(t, { cartella, fornitore: primo });
  await e1.compattazioneInPreparazione;
  const pronta = e1.compattazionePronta ?? await e1.compattazioneInPreparazione;
  assert.ok(pronta?.record && typeof pronta.impronta === 'string', 'premessa: un riassunto pronto a fine giro');
  const grande = { role: 'user', content: `seconda domanda ${'z'.repeat(10_000)}` }; // porta subito oltre la soglia, sotto l'emergenza
  for (const [storia, atteso] of [[e1.messaggiFinali, true], [e1.messaggiFinali.map((m, i) => (i === 3 ? { ...m, content: `${testoDi(m)} MODIFICATO` } : m)), false]]) {
    const secondo = fintoFornitore({ chiamateTool: 0 });
    const { eventi } = await giro(t, { cartella, fornitore: secondo, messaggiIniziali: [...storia, grande], compattazionePronta: pronta });
    const prima = secondo.lavori()[0];
    const usato = prima.messages.some((m) => testoDi(m).includes('RIASSUNTO-PRONTO'));
    assert.equal(usato, atteso, `prefisso ${atteso ? 'intatto' : 'cambiato'}: il riassunto del giro prima ${atteso ? 'si usa' : 'NON si usa'}`);
    if (atteso) {
      assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.istantanea), 'scambio istantaneo alla prima richiesta');
      assert.equal(secondo.riassuntiChiesti().filter((b) => secondo.corpi.indexOf(b) < secondo.corpi.indexOf(prima)).length, 0, 'nessun riassunto pagato prima della prima richiesta');
    }
  }
});

test('IST-04 — un riassunto pronto preparato su un\'altra base (la storia è stata compattata nel frattempo) non si usa', async (t) => {
  conTetto(t, 12_000);
  const cartella = cartellaDiProva(t);
  const primo = fintoFornitore({ chiamateTool: 7, testoRiassunto: 'RIASSUNTO-PRONTO' });
  const { esito: e1 } = await giro(t, { cartella, fornitore: primo });
  const pronta = e1.compattazionePronta ?? await e1.compattazioneInPreparazione;
  assert.ok(pronta?.record, 'premessa');
  const altraBase = creaRecord({ coveredThrough: 1, riassunto: [{ role: 'user', content: 'UN ALTRO RIASSUNTO' }], tokenPrima: 10, tokenDopo: 5, misura: 'stimato', at: '2026-10-15T00:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  const secondo = fintoFornitore({ chiamateTool: 0 });
  await giro(t, { cartella, fornitore: secondo, messaggiIniziali: [...e1.messaggiFinali, { role: 'user', content: `x ${'z'.repeat(10_000)}` }], compattazionePronta: pronta, recordCompattazioneIniziale: altraBase });
  assert.equal(secondo.lavori()[0].messages.some((m) => testoDi(m).includes('RIASSUNTO-PRONTO')), false);
});

test('IST-05 — un riassuntore che fallisce in sottofondo non ferma il giro, si dice (preparata, compattato:false, classe) e non si paga senza fine', async (t) => {
  conTetto(t, 8_000);
  const fornitore = fintoFornitore({ chiamateTool: 10, riassunto: () => ({ role: 'assistant', content: '' }) });
  const { esito, eventi } = await giro(t, { cartella: cartellaDiProva(t), fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const falliti = eventi.filter((e) => e.tipo === 'compattazione-preparata' && e.compattato === false);
  assert.ok(falliti.length >= 1 && falliti.every((e) => e.classe === 'vuoto'), JSON.stringify(falliti));
  assert.ok(fornitore.riassuntiChiesti().length <= 3, `il giro di fallimenti tiene: ${fornitore.riassuntiChiesti().length}`);
});

test('IST-06 — all\'emergenza si ASPETTA il riassunto già in preparazione e lo si usa; mai un secondo riassunto al suo posto', async (t) => {
  conTetto(t, 8_000); // soglia 8.000, emergenza 9.600
  const fornitore = fintoFornitore({ chiamateTool: 10, ritardoRiassuntoMs: 300 });
  const { esito, eventi } = await giro(t, { cartella: cartellaDiProva(t), fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato);
  assert.ok(fini.some((e) => e.istantanea && e.motivo === 'emergenza'), JSON.stringify(fini.map((e) => [e.motivo, e.istantanea])));
  assert.equal(eventi.filter((e) => e.tipo === 'compattazione-inizio').length, 0, 'nessuna compattazione sincrona: è bastato aspettare quella in corso');
  const massima = Math.max(...fornitore.lavori().map((b) => Math.ceil(JSON.stringify(b.messages).length / 4)));
  assert.ok(massima < 9_600 * 1.15, `nessuna richiesta molto oltre l'emergenza: ${massima}`);
});

test('IST-07 — letture grandi arrivate DOPO il riassunto si accorciano allo scambio: la richiesta resta limitata (il difetto misurato il 15/10)', async (t) => {
  conTetto(t, 20_000);
  const cartella = cartellaDiProva(t);
  writeFileSync(join(cartella, 'grande.txt'), Array.from({ length: 1_000 }, (_, i) => `riga ${i} ${'y'.repeat(50)}`).join('\n'));
  const fornitore = fintoFornitore({ chiamateTool: 12 });
  const { esito, eventi } = await giro(t, { cartella, fornitore });
  assert.equal(esito.comeFinita, 'concluso');
  const dimensioni = fornitore.lavori().map((b) => Math.ceil(JSON.stringify(b.messages).length / 4));
  assert.ok(Math.max(...dimensioni) < 40_000, `nessuna richiesta oltre il doppio del tetto: ${dimensioni.join(',')}`);
  assert.ok(eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato).length >= 3, 'la compattazione continua lungo il giro');
});

test('IST-08 — un riassunto pronto troppo vecchio (lo scambio non riporterebbe sotto la soglia) NON si usa: se ne fa uno nuovo; AL CONTRARIO, uno fresco sì (IST-03)', async (t) => {
  conTetto(t, 12_000); // soglia 12.000, emergenza 14.400
  const cartella = cartellaDiProva(t);
  const primo = fintoFornitore({ chiamateTool: 7, testoRiassunto: 'RIASSUNTO-PRONTO' });
  const { esito: e1 } = await giro(t, { cartella, fornitore: primo });
  const pronta = e1.compattazionePronta ?? await e1.compattazioneInPreparazione;
  assert.ok(pronta?.record, 'premessa: un riassunto pronto a fine giro');
  /* dopo il riassunto arrivano ~8.000 token di TESTO (non esiti di attrezzi: l'accorciamento della coda non li tocca) */
  const dopo = Array.from({ length: 16 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `messaggio ${i} ${'w'.repeat(2_000)}` }));
  const secondo = fintoFornitore({ chiamateTool: 0, testoRiassunto: 'RIASSUNTO-NUOVO' });
  const { eventi } = await giro(t, { cartella, fornitore: secondo, messaggiIniziali: [...e1.messaggiFinali, ...dopo, { role: 'user', content: 'e adesso?' }], compattazionePronta: pronta });
  const prima = secondo.lavori()[0];
  assert.equal(prima.messages.some((m) => testoDi(m).includes('RIASSUNTO-PRONTO')), false, 'il riassunto vecchio non si usa');
  assert.ok(prima.messages.some((m) => testoDi(m).includes('RIASSUNTO-NUOVO')), 'all\'emergenza se ne fa uno nuovo');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-inizio' && e.motivo === 'emergenza'), 'la compattazione nuova è quella dell’emergenza');
  assert.ok(eventi.some((e) => e.tipo === 'compattazione-fine' && e.compattato), JSON.stringify(eventi.map((e) => [e.tipo, e.motivo])));
});
