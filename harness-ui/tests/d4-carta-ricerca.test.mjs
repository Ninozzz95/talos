/*
 * D4 (collaudo del treno, 02/11/2026; decisione 35 dell'owner con la modifica dopo la ricerca; OK di CLI, Mobile e Performance).
 *   D4: dalla chat una ricerca approfondita parte solo col sì sulla carta, a ogni livello, una per ricerca, con domanda modificabile,
 *   profondità e costo nelle parole.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { CARTA_SEMPRE, MOTIVO_RICERCA_SENZA_PERSONA, PREFISSO_DOMANDA_CORRETTA, azioneCartaRicerca, talosLavora } from '../src/kernel/talosHarness.mjs';

const chiama = (id, nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const FINE = { role: 'assistant', content: 'ok' };
const rete = (...risposte) => {
  const corpi = [];
  return { corpi, fetch: async (_url, o) => {
    const scelta = risposte[Math.min(corpi.length, risposte.length - 1)];
    corpi.push(JSON.parse(o.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  } };
};
const esitoTool = (r) => r.corpi.at(-1).messages.filter((m) => m.role === 'tool').map((m) => String(m.content)).join('\n');
const FALSA = 'persona-abc';
async function ricerca(t, { argomenti = { question: 'Come fanno i concorrenti?', depth: 'quick' }, risposta = true, idChiamata = 'c1', ...opzioni } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'd4-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  const r = rete(chiama(idChiamata, 'research_start', argomenti), FINE);
  const carte = []; const avviate = [];
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_start'],
    chiediApprovazioneFn: async (azione) => { carte.push(azione); return risposta; },
    onRicercaAvvia: async (a) => { avviate.push(a); return { ok: true, esito: 'started' }; }, ...opzioni });
  return { carte, avviate, esito: esitoTool(r), corpi: r.corpi };
}

test('D4-1 Accesso pieno: una carta con domanda, profondità e costo; la ricerca parte col sì', async (t) => {
  const { carte, avviate } = await ricerca(t);
  assert.equal(carte.length, 1);
  assert.equal(carte[0].tipo, 'research_start');
  assert.equal(carte[0].question, 'Come fanno i concorrenti?');
  assert.match(carte[0].frase, /^Depth: quick\. Estimated cost: searches ~2, pages ~10, tokens ~\d+k, time ~\d+ min\.$/u);
  assert.equal(carte[0].fraseChiave, 'server.approval.research.quick');
  assert.equal(carte[0][CARTA_SEMPRE], true, 'un sì automatico non apre questa carta');
  assert.equal(carte[0].semprePersona, undefined, 'condizione della CLI: strada normale');
  assert.deepEqual(avviate, [{ question: 'Come fanno i concorrenti?', depth: 'quick' }]);
});

test('D4-2 la domanda corretta sulla carta è quella che parte, e il modello lo sa', async (t) => {
  const { avviate, esito } = await ricerca(t, { risposta: { approvato: true, domandaModificata: 'Solo Hermes e Codex' } });
  assert.deepEqual(avviate, [{ question: 'Solo Hermes e Codex', depth: 'quick' }]);
  assert.match(esito, /The person edited the question on the card; this is what runs: Solo Hermes e Codex/u);
});

test('D4-3 AL CONTRARIO: un no non avvia niente', async (t) => {
  const { avviate, esito } = await ricerca(t, { risposta: false });
  assert.deepEqual(avviate, []);
  assert.match(esito, /^DECLINED\. .*Do not ask again.*No research was started\./su); // Tester R4: annullata, il modello non la richiede
});

test('D4-4 «Chiede prima» e «sempre»: una carta sola, mai due', async (t) => {
  const su = await ricerca(t, { livelloAccesso: 'su-richiesta' });
  assert.equal(su.carte.length, 1);
  assert.equal(su.avviate.length, 1);
  const sempre = await ricerca(t, { livelloAccesso: undefined, permessiPerAttrezzo: { research_start: 'sempre' } });
  assert.equal(sempre.carte.length, 1, 'un «sempre» dato prima non salta la carta');
  assert.equal(sempre.avviate.length, 1);
});

for (const [nome, opzioni] of [['nessuno davanti', { nessunoDavanti: true }], ['figlia', { agentRole: 'child' }], ['senza canale', { chiediApprovazioneFn: undefined }]]) {
  test(`D4-5 senza una persona (${nome}): rifiuto con la frase chiara, nessuna carta, nessuna partenza`, async (t) => {
    const { carte, avviate, esito } = await ricerca(t, opzioni);
    assert.equal(carte.length, 0);
    assert.deepEqual(avviate, []);
    assert.ok(esito.includes(MOTIVO_RICERCA_SENZA_PERSONA), esito);
  });
}

test('D4-6 profondità di serie e costo in un punto solo', () => {
  const azione = azioneCartaRicerca('c', { question: ' q ' });
  assert.equal(azione.question, 'q');
  assert.equal(azione.fraseChiave, 'server.approval.research.deep');
  assert.deepEqual(Object.keys(azione.fraseParams).sort(), ['minuti', 'pagine', 'ricerche', 'token']);
  assert.equal(JSON.stringify(azione).includes('cartaSempre'), false, 'il segno non viaggia negli eventi');
});

/* Il registro: la domanda corretta passa solo con un sì e solo su quella carta; un sì automatico non apre la carta */
async function scenaRegistro(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'd4-r-'));
  const giri = [];
  const registry = createSessionRegistry({ promuoviDalTesto: true, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); } });
  t.after(async () => { await registry.chiudi?.().catch?.(() => {}); try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ } try { rimuoviCartellaDiProva(cartellaStore); } catch { /* già sparita */ } });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' });
  return { registry, sessionId, chiedi: giri[0].chiediApprovazioneFn };
}
test('D4-7 registro: un sì con la domanda corretta la porta al nucleo; su un no o su un\'altra carta si rifiuta e la carta resta', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi(azioneCartaRicerca('c1', { question: 'q' }));
  await new Promise((ok) => setTimeout(ok, 10));
  const carta = registry.domandaInAttesa(sessionId);
  assert.equal(carta?.azione?.tipo, 'research_start');
  assert.equal(registry.rispondiApprovazione(sessionId, carta.requestId, false, { domandaModificata: 'x' }).code, 'QUERY_INVALID');
  assert.equal(registry.rispondiApprovazione(sessionId, carta.requestId, true, { domandaModificata: '   ' }).code, 'QUERY_INVALID');
  assert.equal(registry.rispondiApprovazione(sessionId, carta.requestId, true, { domandaModificata: 'x'.repeat(501) }).code, 'QUERY_INVALID');
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, carta.requestId, 'la carta resta in attesa');
  registry.rispondiApprovazione(sessionId, carta.requestId, true, { domandaModificata: ' Solo Hermes ' });
  assert.deepEqual(await risposta, { approvato: true, domandaModificata: 'Solo Hermes' });
});
test('D4-8 registro: sulla carta di un comando il campo non vale; un sì senza campo resta un sì semplice', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi({ tipo: 'shell', comando: 'ls', toolCallId: 'c2' });
  await new Promise((ok) => setTimeout(ok, 10));
  const carta = registry.domandaInAttesa(sessionId);
  assert.equal(registry.rispondiApprovazione(sessionId, carta.requestId, true, { domandaModificata: 'x' }).code, 'QUERY_INVALID');
  registry.rispondiApprovazione(sessionId, carta.requestId, true);
  assert.equal(await risposta, true);
});
test('D4-9 registro: un sì automatico non apre la carta della ricerca', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi(azioneCartaRicerca('c3', { question: 'q' }));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { motivo: 'regola' });
  const esito = await risposta;
  assert.equal(esito.approvato, false);
  assert.match(esito.motivo, /only the person can approve/u);
});

/* Revisione avversaria del blocco (02/11/2026 notte) */
test('R1 un id che comincia per persona- non vale la porta della sezione: Accesso pieno', async (t) => {
  const { carte, avviate } = await ricerca(t, { idChiamata: FALSA, risposta: false });
  assert.equal(carte.length, 1, 'la carta esce');
  assert.equal(carte[0].fraseChiave, 'server.approval.research.quick');
  assert.deepEqual(avviate, []);
});
for (const [nome, opzioni] of [['nessuno davanti', { nessunoDavanti: true }], ['figlia', { agentRole: 'child' }]]) {
  test(`R1 un id che comincia per persona- non salta il rifiuto: ${nome}`, async (t) => {
    const { carte, avviate, esito } = await ricerca(t, { idChiamata: FALSA, ...opzioni });
    assert.equal(carte.length, 0);
    assert.deepEqual(avviate, []);
    assert.ok(esito.includes(MOTIVO_RICERCA_SENZA_PERSONA), esito);
  });
}
test('R1 in «Chiede prima» con quell\'id esce la carta col costo, non quella vecchia', async (t) => {
  const { carte } = await ricerca(t, { idChiamata: FALSA, livelloAccesso: 'su-richiesta', risposta: false });
  assert.equal(carte.length, 1);
  assert.equal(carte[0].fraseChiave, 'server.approval.research.quick');
});
test('R1 AL CONTRARIO: la chiamata vera della sezione resta senza carta', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'd4-s-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  const r = rete(FINE); const carte = []; const avviate = [];
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_start'],
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'dalla sezione', depth: 'deep' } },
    chiediApprovazioneFn: async (a) => { carte.push(a); return true; }, onRicercaAvvia: async (a) => { avviate.push(a); return { ok: true, esito: 'started' }; } });
  assert.equal(carte.length, 0);
  assert.deepEqual(avviate, [{ question: 'dalla sezione', depth: 'deep' }]);
});

test('R3 un modello locale che scrive la ricerca come testo porta UNA carta, quella col costo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'd4-t-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  const r = rete({ role: 'assistant', content: 'Vado.\n<tool_call>{"name":"research_start","arguments":{"question":"q","depth":"quick"}}</tool_call>' }, FINE);
  const carte = []; const avviate = [];
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'local:qwen', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_start'], personaPresenteFn: () => true, promuoviDalTesto: true,
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return true; }, onRicercaAvvia: async (a) => { avviate.push(a); return { ok: true, esito: 'started' }; } });
  assert.deepEqual(carte, ['research_start']);
  assert.equal(avviate.length, 1);
});
test('R3 AL CONTRARIO: un altro attrezzo scritto come testo ha ancora la sua carta del testo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'd4-t2-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  const r = rete({ role: 'assistant', content: 'Vado.\n<tool_call>{"name":"elenca","arguments":{}}</tool_call>' }, FINE);
  const carte = [];
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'local:qwen', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', personaPresenteFn: () => true, promuoviDalTesto: true,
    chiediApprovazioneFn: async (a) => { carte.push(a.tipo); return true; } });
  assert.deepEqual(carte, ['chiamata-dal-testo']);
});

for (const [nome, argomenti] of [['vuota', { question: '   ' }], ['assente', {}], ['un numero', { question: 7 }], ['oltre 500 caratteri', { question: 'x'.repeat(501) }]]) {
  test(`R11-R12 domanda ${nome}: nessuna carta, nessuna partenza, il modello sa cosa manca`, async (t) => {
    const { carte, avviate, esito } = await ricerca(t, { argomenti });
    assert.equal(carte.length, 0);
    assert.deepEqual(avviate, []);
    assert.match(esito, /REFUSED\..*1 to 500 characters.*No research was started\./su);
  });
}
test('R11 AL CONTRARIO: 500 caratteri esatti escono sulla carta', async (t) => {
  const { carte } = await ricerca(t, { argomenti: { question: 'x'.repeat(500) } });
  assert.equal(carte.length, 1);
});

test('R15 la ricevuta di una ricerca approvata in Accesso pieno dice che la persona ha detto sì', async (t) => {
  const ricevute = [];
  await ricerca(t, { onGiro: (e) => { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta); } });
  assert.equal(ricevute.length, 1);
  assert.notEqual(ricevute[0].permesso?.via ?? ricevute[0].via, 'nessun-vincolo');
});

test('R13-R14 l\'esito comincia col prefisso, e la domanda corretta è una riga sola', async (t) => {
  const esiti = [];
  const { avviate } = await ricerca(t, { risposta: { approvato: true, domandaModificata: 'riga' }, onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(e.content); } });
  assert.equal(avviate[0].question, 'riga');
  assert.ok(esiti[0].startsWith(`${PREFISSO_DOMANDA_CORRETTA}riga\n`), esiti[0]);
});
test('R13 registro: una domanda su più righe diventa una riga sola', { timeout: 20_000 }, async (t) => {
  const { registry, sessionId, chiedi } = await scenaRegistro(t);
  const risposta = chiedi(azioneCartaRicerca('c9', { question: 'q' }));
  await new Promise((ok) => setTimeout(ok, 10));
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { domandaModificata: ' prima\n\n  seconda ' });
  assert.deepEqual(await risposta, { approvato: true, domandaModificata: 'prima seconda' });
});

/* Decisioni 57 e 144 (04/11/2026): dollari dove il prezzo è noto, altrimenti il lavoro come oggi. Il prezzo lo dice l'ospite
   (`prezzoDelModelloFn`, dal catalogo); la cifra è quella di `talosResearchPlanCost` sullo stesso piano, la forma di `formattaDollari`. */
test('D4-DOLLARI-1 prezzo noto: la carta dice i dollari e il lavoro resta', async (t) => {
  const chiesti = [];
  const { carte } = await ricerca(t, { prezzoDelModelloFn: async (m) => { chiesti.push(m); return { in: 0.4, out: 1.6 }; } });
  assert.deepEqual(chiesti, ['f'], 'il prezzo del modello del giro');
  assert.equal(carte[0].fraseChiave, 'server.approval.research.quickPriced');
  assert.match(carte[0].frase, /^Depth: quick\. Estimated cost: ~\$0\.\d{2,4} at the published price; searches ~2, pages ~10, tokens ~\d+k, time ~\d+ min\.$/u);
  assert.match(carte[0].fraseParams.dollari, /^~\$0\.\d{2,4}$/u);
});
for (const [nome, prezzoDelModelloFn] of [['ignoto', async () => null], ['in errore', async () => { throw new Error('catalogo giù'); }], ['storto', async () => ({ in: 1 })], ['assente (la CLI)', undefined]]) {
  test(`D4-DOLLARI-2 AL CONTRARIO: prezzo ${nome} ⇒ il lavoro come oggi`, async (t) => {
    const { carte, avviate } = await ricerca(t, prezzoDelModelloFn ? { prezzoDelModelloFn } : {});
    assert.equal(carte[0].fraseChiave, 'server.approval.research.quick');
    assert.deepEqual(Object.keys(carte[0].fraseParams).sort(), ['minuti', 'pagine', 'ricerche', 'token']);
    assert.doesNotMatch(carte[0].frase, /\$/u);
    assert.equal(avviate.length, 1, 'la ricerca parte lo stesso');
  });
}
test('D4-DOLLARI-3 la cifra è quella del piano: stesso numero di talosResearchPlanCost, nelle tre profondità', async () => {
  const { talosResearchPlanCost, talosResearchPlanFor, talosResearchPlanTotals } = await import('../src/research/plan.mjs');
  const { formattaDollari } = await import('../src/kernel/costo-in-dollari.mjs');
  for (const depth of ['quick', 'deep', 'exhaustive']) {
    const azione = azioneCartaRicerca('c', { question: 'q', depth }, { in: 3, out: 15 });
    const atteso = talosResearchPlanCost(talosResearchPlanTotals(talosResearchPlanFor('q', depth)), { currency: 'USD', promptPerMillion: 3, completionPerMillion: 15 });
    assert.equal(azione.fraseChiave, `server.approval.research.${depth}Priced`);
    assert.equal(azione.fraseParams.dollari, formattaDollari(atteso.amount), depth);
  }
  assert.equal(azioneCartaRicerca('c', { question: 'q' }, { in: 0, out: 0 }).fraseParams.dollari, '$0.00', 'gratis detto come gratis');
  assert.equal(azioneCartaRicerca('c', { question: 'q' }, null).fraseChiave, 'server.approval.research.deep');
});
test('D4-DOLLARI-4 la ricerca dalla sezione (gesto della persona) non chiede il prezzo: lì non c\'è carta', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'd4-p-'));
  t.after(() => { try { rimuoviCartellaDiProva(cartella); } catch { /* già sparita */ } });
  const r = rete(FINE); let chiesto = 0;
  await talosLavora({ cartella, task: { consegna: 'x' }, modello: 'f', chiave: 'k', fetchDiRete: r.fetch, livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_start'],
    chiamataIniziale: { nome: 'research_start', argomenti: { question: 'dalla sezione', depth: 'deep' } }, prezzoDelModelloFn: async () => { chiesto += 1; return { in: 1, out: 1 }; },
    chiediApprovazioneFn: async () => true, onRicercaAvvia: async () => ({ ok: true, esito: 'started' }) });
  assert.equal(chiesto, 0);
});

/* Il catalogo si chiede solo se una carta può uscire: senza persona davanti, o con una domanda che torna al modello, nessuna carta ⇒ nessuna
   attesa sul prezzo (fino a 3 s) per niente. */
for (const [nome, opzioni] of [['nessuno davanti', { nessunoDavanti: true }], ['figlia', { agentRole: 'child' }],
  ['domanda vuota', { argomenti: { question: '  ', depth: 'quick' } }]]) {
  test(`D4-DOLLARI-5 AL CONTRARIO: nessuna carta (${nome}) ⇒ il prezzo non si chiede`, async (t) => {
    let chiesto = 0;
    const { carte } = await ricerca(t, { ...opzioni, prezzoDelModelloFn: async () => { chiesto += 1; return { in: 1, out: 1 }; } });
    assert.equal(carte.length, 0);
    assert.equal(chiesto, 0);
  });
}

/* Condizione 1 di Performance (04/11/2026): catalogo freddo con la rete che pende ⇒ la carta esce entro il tetto di 300 ms, col lavoro.
   Il tetto esatto lo prova DOLL-08 con l'orologio finto; qui l'orologio vero, con un margine per i timer di Windows sotto carico. */
test('D4-DOLLARI-6 Performance: catalogo freddo e rete che pende ⇒ la carta esce entro il tetto, col lavoro', async (t) => {
  let chiestoAlle = null;
  let cartaAlle = null;
  let carta = null;
  await ricerca(t, {
    prezzoDelModelloFn: () => { chiestoAlle = performance.now(); return new Promise(() => {}); },
    chiediApprovazioneFn: async (azione) => { cartaAlle = performance.now(); carta = azione; return true; },
  });
  assert.equal(carta?.fraseChiave, 'server.approval.research.quick', 'senza prezzo: il lavoro, come oggi');
  const attesa = cartaAlle - chiestoAlle;
  assert.ok(attesa < 450, `la carta ha aspettato il prezzo ${Math.round(attesa)} ms (tetto 300 ms)`);
});

/* Prova dell'escape (Desktop 04/11/2026, dopo la prova CRC-11 del Mobile: con escapeParameter acceso «~$<0.0001» usciva «~$&lt;0.0001»
   sul telefono). Sul PC i dollari restano testo in tutti e due i posti: la frase della carta (CLI e giornale la leggono così) e ciò che il
   modello legge quando la ricerca parte. Un importo minuscolo («~$<0.0001») e uno normale. */
const SEGNI_HTML = /&(?:lt|gt|amp|quot|#\d+);/u;
for (const [nome, prezzo, minuscolo] of [['sotto il decimo di millesimo', { in: 0.000001, out: 0.000001 }, true], ['importo normale', { in: 0.4, out: 1.6 }, false]]) {
  test(`D4-DOLLARI-ESCAPE ${nome}: la carta e il modello leggono i dollari come testo, mai come HTML`, async (t) => {
    let detto = null;
    const { carte, esito } = await ricerca(t, { prezzoDelModelloFn: async () => prezzo,
      onRicercaAvvia: async () => ({ ok: true, esito: `Research started, ${detto} at the published price.` }),
      chiediApprovazioneFn: async (azione) => { detto = azione.fraseParams?.dollari ?? null; return true; } });
    const dollari = carte.length ? carte[0].fraseParams.dollari : detto;
    if (minuscolo) assert.equal(dollari, '~$<0.0001');
    else assert.match(dollari, /^~\$\d+\.\d{2,4}$/u);
    assert.equal(detto, dollari);
    assert.ok(esito.includes(`${dollari} at the published price`), esito);
    assert.doesNotMatch(esito, SEGNI_HTML);
  });
}
for (const [nome, prezzo, minuscolo] of [['sotto il decimo di millesimo', { in: 0.000001, out: 0.000001 }, true], ['importo normale', { in: 0.4, out: 1.6 }, false]]) {
  test(`D4-DOLLARI-ESCAPE-CARTA ${nome}: la frase inglese della carta porta i dollari com'erano, per ogni profondità`, () => {
    for (const depth of ['quick', 'deep', 'exhaustive']) {
      const carta = azioneCartaRicerca('c', { question: 'q', depth }, prezzo);
      const dollari = carta.fraseParams.dollari;
      if (minuscolo) assert.equal(dollari, '~$<0.0001', depth);
      else assert.match(dollari, /^~\$\d+\.\d{2,4}$/u, depth);
      assert.ok(carta.frase.includes(`Estimated cost: ${dollari} at the published price;`), carta.frase);
      assert.doesNotMatch(carta.frase, SEGNI_HTML);
    }
  });
}
