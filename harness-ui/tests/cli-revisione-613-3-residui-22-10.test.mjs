/*
 * 22/10/2026 — revisione 3 della CLI sulla 0.6.13, i residui dopo r4 79dbe20e3.
 * S2-2 nel giro: l'emergenza DENTRO il giro applicava un riassunto che faceva CRESCERE il contesto (misura della CLI 15.631 → 16.040,
 *   pagato). Il registro lo rifiutava già; l'adattatore del giro no.
 * (S2-1 sta in `chiamata-secondaria.test.mjs`, sul fornitore finto vero.)
 * Fornitore finto via `fetchDiRete`, cartelle temporanee proprie, nessuna porta.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

async function giroInEmergenza(t, { testoRiassunto, istantanea }) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-giro-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { riassunti: 0, richieste: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: testoRiassunto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste.push(stima(corpo.messages));
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const eventi = [];
  const messaggiIniziali = [...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }];
  const r = await talosLavora({
    cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali, contestoDelProgetto: 'Project files:\n', fetchDiRete,
    ...(istantanea ? { compattazioneIstantanea: true } : {}),
    onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); },
  });
  return { r, eventi, conti, primaStimata: stima(messaggiIniziali) };
}

for (const istantanea of [false, true]) {
  test(`S2-2-GIRO-01${istantanea ? 'b' : 'a'} — emergenza nel giro${istantanea ? ' (istantanea accesa)' : ''}: un riassunto che fa CRESCERE il contesto non si applica, si dice «inefficace» e la richiesta parte com'era`, async (t) => {
    const { r, eventi, conti, primaStimata } = await giroInEmergenza(t, { testoRiassunto: `## Riassunto\n${'dettaglio '.repeat(9000)}`, istantanea });
    assert.ok(r, 'il giro finisce');
    assert.equal(conti.riassunti, 1, 'un riassunto solo: dopo un tentativo inefficace non si ripaga nel giro');
    const fine = eventi.filter((e) => e.tipo === 'compattazione-fine');
    assert.equal(fine.length, 1, JSON.stringify(eventi.map((e) => [e.tipo, e.motivo])));
    assert.equal(fine[0].compattato, false);
    assert.equal(fine[0].motivo, 'inefficace');
    assert.ok(!eventi.some((e) => e.tipo === 'compattazione-fine' && e.record), 'nessun record applicato');
    assert.ok(conti.richieste[0] <= primaStimata + 1_000, `la richiesta non porta il riassunto gonfio (${conti.richieste[0]} contro ${primaStimata})`);
  });
}

test('S2-2-GIRO-02 — AL CONTRARIO: un riassunto che accorcia si applica come prima', async (t) => {
  const { eventi, conti, primaStimata } = await giroInEmergenza(t, { testoRiassunto: '## Riassunto\nok', istantanea: false });
  const fine = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.equal(fine.length, 1);
  assert.equal(fine[0].compattato, true);
  assert.ok(conti.richieste[0] < primaStimata, `la richiesta parte accorciata (${conti.richieste[0]} contro ${primaStimata})`);
});

/*
 * Revisione avversaria di 068b2c172 (22/10/2026). F1: la guardia confrontava due STIME, e la stima non vede i messaggi a parti
 * (immagini, testo degli allegati: valgono 0). Un riassunto che toglieva dodici immagini «cresceva», si buttava, la richiesta ripartiva
 * con le dodici immagini; sul contesto pieno il giro moriva. F3: il conteggio «al massimo due riassunti per giro» non aveva una prova.
 * Le sonde del revisore, diventate prove.
 */
const conImmagini = (coppie) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: [{ type: 'text', text: `Look at screenshot ${i}: what is wrong with the layout? ${'detail '.repeat(60)}` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(6000)}` } }] },
  { role: 'assistant', content: `Screenshot ${i}: the header overlaps.` },
]).flat();
const immaginiIn = (messaggi) => messaggi.filter((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'image_url')).length;

/* Fornitore finto: il numero VERO del prompt conta ~1.000 token per immagine (la stima non le vede); la prima richiesta del modello
   chiede una lettura, poi «done». `overflowPrimo`: la prima richiesta è rifiutata per contesto pieno. */
function reteConImmagini({ overflowPrimo = false } = {}) {
  const conti = { modello: 0, riassunti: 0, immagini: [] };
  const RIASSUNTO = `## Summary\n${'The user reviewed screenshots of the layout; the header overlaps the sidebar in all of them. '.repeat(8)}`;
  const fn = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: RIASSUNTO }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 100 } });
    }
    conti.modello += 1;
    const immagini = immaginiIn(corpo.messages);
    conti.immagini.push(immagini);
    if (overflowPrimo && conti.modello === 1) {
      return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const usage = { prompt_tokens: immagini * 1000 + stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (conti.modello === 1) {
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: 'f1.txt', path: 'f1.txt' }) } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }], usage });
  };
  return { fn, conti };
}
async function giroConImmagini(t, { overflowPrimo }) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-immagini-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'f1.txt'), 'hello\n');
  const rete = reteConImmagini({ overflowPrimo });
  const eventi = [];
  const storia = [...conImmagini(12), { role: 'user', content: 'Now read f1.txt and continue.' }];
  assert.ok(stima(storia) < 1_000, `premessa: la stima non vede le immagini (${stima(storia)})`);
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: storia,
    contestoDelProgetto: 'Project files:\n', fetchDiRete: rete.fn, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); } });
  return { r, rete, eventi };
}

test('S2-2-IMMAGINI-01 — emergenza nel giro con dodici immagini: il riassunto che le toglie si APPLICA (la stima non le vede, quindi non giudica)', async (t) => {
  const { rete, eventi } = await giroConImmagini(t, { overflowPrimo: false });
  assert.equal(eventi[0]?.compattato, true, JSON.stringify(eventi.map((e) => [e.compattato, e.motivo])));
  assert.equal(rete.conti.immagini[0], 12, 'premessa: la prima richiesta porta le dodici immagini');
  assert.ok(rete.conti.immagini[1] < 12, `la richiesta dopo il riassunto ne porta meno (${rete.conti.immagini})`);
});

test('S2-2-IMMAGINI-02 — contesto pieno (overflow) con dodici immagini: il giro riparte più leggero, non muore', async (t) => {
  const { r, rete } = await giroConImmagini(t, { overflowPrimo: true });
  assert.equal(r.comeFinita, 'concluso', `il giro finisce (${r.comeFinita})`);
  assert.ok(rete.conti.modello >= 2, `il giro ha ritentato dopo il contesto pieno (${rete.conti.modello} richieste)`);
  assert.ok(rete.conti.immagini[1] < rete.conti.immagini[0], `il ritento porta meno immagini (${rete.conti.immagini})`);
});

test('S2-2-CONTA-01 — emergenza con riassunti che non riducono, cinque richieste nel giro: se ne pagano al massimo DUE, non uno a richiesta', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-conta-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `f${i}.txt`), 'x\n');
  const conti = { riassunti: 0, modello: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'dettaglio '.repeat(9000)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (conti.modello <= 4) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${conti.modello}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${conti.modello}.txt`, path: `f${conti.modello}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...storia(coppiePer(6500)), { role: 'user', content: 'Leggi i file.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access' });
  assert.equal(conti.modello, 5, 'premessa: cinque richieste del modello nel giro');
  assert.ok(conti.riassunti >= 1 && conti.riassunti <= 2, `riassunti pagati ${conti.riassunti}`);
});

test('S2-2-OVERFLOW-TESTO-01 — contesto pieno, solo testo, riassunto che non riduce: il giro NON muore (sul contesto pieno la guardia non scarta)', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-overflow-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { modello: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'dettaglio '.repeat(9000)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.modello += 1;
    if (conti.modello === 1) return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...storia(coppiePer(3000)), { role: 'user', content: 'Continua' }], contestoDelProgetto: 'Project files:\n', fetchDiRete });
  assert.equal(r.comeFinita, 'concluso', `il giro finisce (${r.comeFinita})`);
  assert.ok(conti.modello >= 2, `ha ritentato dopo il contesto pieno (${conti.modello})`);
});

/* Seconda passata avversaria (22/10/2026), N1: l'esenzione «stima cieca» era tutto-o-niente — UNA immagine in una sessione di solo
   testo spegneva la guardia. Le guardie ora pesano i pezzi come Hermes (`stimaConPezzi`, 1.500 token per immagine). */
test('S2-2-UNA-IMMAGINE-01 — una sola immagine piccola nella sessione NON spegne la guardia: un riassunto che fa crescere il contesto resta «inefficace»', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-una-immagine-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { riassunti: 0, richieste: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'dettaglio '.repeat(9000)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    conti.richieste.push(stima(corpo.messages));
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const img = { role: 'user', content: [{ type: 'text', text: 'logo' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] };
  const iniziali = [img, { role: 'assistant', content: 'ok' }, ...storia(coppiePer(6500)), { role: 'user', content: 'Adesso continua' }];
  const eventi = [];
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: iniziali,
    contestoDelProgetto: 'Project files:\n', fetchDiRete, onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); } });
  assert.equal(eventi[0]?.compattato, false, JSON.stringify(eventi.map((e) => [e.compattato, e.motivo])));
  assert.equal(eventi[0]?.motivo, 'inefficace');
  assert.ok(conti.richieste[0] <= stima(iniziali) + 1_000, `la richiesta non porta il riassunto gonfio (${conti.richieste[0]})`);
});

test('S2-2-PESO-01 — la stima delle guardie conta il testo dei pezzi e 1.500 token per immagine; il segnaposto del riassunto pesa come testo', () => {
  const testo = { role: 'user', content: 'ciao '.repeat(40) };
  const conImmagine = { role: 'user', content: [{ type: 'text', text: 'ciao '.repeat(40) }, { type: 'image_url', image_url: { url: 'data:,' } }] };
  assert.equal(compattazione.stimaConPezzi([testo]), stima([testo]), 'sul testo semplice uguale alla stima di sempre');
  assert.equal(compattazione.stimaConPezzi([conImmagine]), stima([testo]) + compattazione.COSTO_IMMAGINE_TOKEN);
  assert.equal(compattazione.COSTO_IMMAGINE_TOKEN, 1_500, 'il valore di Hermes prima della taratura');
});

/* Seconda passata, N2: la firma della PREPARAZIONE del giro stesso. Percorso costruito dal revisore: istantanea accesa, il giro avvia la sua
   preparazione (lenta), alla soglia si scambia un riassunto pronto più vecchio (la base cambia e la preparazione in volo non vale più),
   poi l'emergenza: senza firma il giro aspettava la preparazione che non vale (3.051 ms contro 56). */
test('S2-2-FIRMA-PREPARAZIONE-01 — all\'emergenza il giro non aspetta la SUA preparazione diventata vecchia (la base è cambiata nel frattempo)', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-firma-prep-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'f1.txt'), `${'riga corta '.repeat(20)}\n`);
  writeFileSync(join(cartella, 'f2.txt'), `${'riga lunga del file numero due '.repeat(400)}\n`);
  const coppie = (token) => { let c = 4; while (stima(storia(c + 1)) < token) c += 1; return c; };
  const r0 = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(700)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppie(3450)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa: un riassunto pronto più vecchio');
  let riassunti = 0;
  let modello = 0;
  const r1 = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      riassunti += 1;
      if (riassunti === 1) await new Promise((ok) => { setTimeout(ok, 3_000); });
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    const file = modello === 1 ? 'f1.txt' : modello <= 6 ? 'f2.txt' : null;
    if (file) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${modello}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: file, path: file }) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const inizio = Date.now();
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...uno.messaggiFinali, { role: 'user', content: `Leggi f1 e f2. ${'contesto '.repeat(60)}` }],
    compattazioneIstantanea: true, compattazionePronta: pronta, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access' });
  assert.ok(riassunti >= 1, 'premessa: la preparazione è partita');
  assert.ok(Date.now() - inizio < 1_500, `il giro non ha aspettato la preparazione che non vale più (${Date.now() - inizio} ms; prima ~3.051)`);
});

/* Terza passata avversaria (22/10/2026), R1 e R2: dopo una base adottata all'emergenza, il resto (a) riesce, (b) è «inefficace»,
   (c) fallisce con un 500. In tutti e tre: UNA riga per la richiesta, nessun «non compattato» accanto a un «compattato», e la riga
   parte dal numero della richiesta (sopra l'emergenza), non da quello della base. Sonda `p3-n3` del revisore, diventata prova. */
for (const caso of ['resto-riuscito', 'resto-inefficace', 'resto-500']) {
  test(`S2-2-BASE-RIGA-01 ${caso} — base adottata all'emergenza: una riga sola per la richiesta, che parte dal suo numero`, async (t) => {
    const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
    process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
    t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
    const cartella = cartellaDiProva('talos-s2-2-base-riga-');
    t.after(() => rimuoviCartellaDiProva(cartella));
    for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${'riga lunga del file '.repeat(400)}\n`);
    const testo = (contenuto) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    const r0 = async (_u, o) => { const corpo = JSON.parse(o.body); if (!corpo.tools?.length) return testo(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } }); };
    const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3450)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
    const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
    assert.ok(pronta, 'premessa');
    const inArrivo = Object.assign(new Promise((ok) => { setTimeout(() => ok(pronta), 300).unref(); }),
      { firma: { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base } });
    let modello = 0;
    const r1 = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) {
        if (caso === 'resto-500') return new Response(JSON.stringify({ error: { message: 'upstream error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        return testo(caso === 'resto-riuscito' ? '## Riassunto\nbreve.' : `## Riassunto\n${'dettaglio '.repeat(9000)}`);
      }
      modello += 1;
      const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
      const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
      if (modello === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [1, 2, 3, 4].map((i) => ({ id: `c${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `g${i}.txt`, path: `g${i}.txt` }) } })) }, finish_reason: 'tool_calls' }], usage });
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
    };
    const fini = [];
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...uno.messaggiFinali, { role: 'user', content: `Leggi g1-g4. ${'contesto '.repeat(350)}` }],
      compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ giro: e.giro, compattato: e.compattato, motivo: e.motivo ?? null, prima: e.record?.tokenPrima ?? null, resto: e.restoNonRiuscito ?? null }); } });
    const giroEmergenza = fini.find((f) => f.compattato === true)?.giro;
    assert.ok(giroEmergenza !== undefined, `premessa: c'è una compattazione (${JSON.stringify(fini)})`);
    const dellaRichiesta = fini.filter((f) => f.giro === giroEmergenza);
    assert.equal(dellaRichiesta.length, 1, `una riga sola per la richiesta (${JSON.stringify(dellaRichiesta)})`);
    assert.equal(dellaRichiesta[0].compattato, true, 'e dice «compattato»: la base c\'è stata');
    assert.ok(dellaRichiesta[0].prima >= 4_800, `la riga parte dal numero della richiesta, sopra l'emergenza (${dellaRichiesta[0].prima})`);
    /* Quarta passata avversaria (Q3): il fallimento del resto non disegna una riga sua, ma il suo PERCHÉ viaggia sulla riga della base
       (il giornale e il Doctor lo vedono; l'interfaccia no). */
    const resto = dellaRichiesta[0].resto;
    if (caso === 'resto-riuscito') assert.equal(resto, null, 'il resto è riuscito: nessun perché da portare');
    else if (caso === 'resto-inefficace') assert.equal(resto?.motivo, 'inefficace', `il perché del resto viaggia sulla riga della base (${JSON.stringify(dellaRichiesta[0])})`);
    else {
      assert.ok(resto && typeof resto.motivo === 'string', `il perché del resto viaggia sulla riga della base (${JSON.stringify(dellaRichiesta[0])})`);
      assert.notEqual(resto.motivo, 'inefficace', 'e dice il guasto, non «inefficace»');
      assert.ok(Number.isSafeInteger(resto.fallimentiConsecutivi) && resto.fallimentiConsecutivi >= 1, `con il conto dei fallimenti (${JSON.stringify(resto)})`);
    }
  });
}

/* Quarta passata avversaria (22/10/2026), F1: uno Stop mentre si riassume il RESTO dopo una base adottata. Prima: la riga aperta
   restava senza «fine» e il record della base (quello che il registro salva) non aveva una riga — niente Annulla. Sonda `p4-stop` del
   revisore, diventata prova. Due casi: il riassunto ereditato arriva dopo 300 ms (base all'emergenza) o subito (scambio alla soglia,
   che per costruzione non ha «inizio»: la regola è «ogni richiesta con un inizio ha UNA fine»). */
for (const attesaEreditato of [300, 0]) {
  test(`S2-2-BASE-STOP-01 ereditato dopo ${attesaEreditato} ms — Stop durante il riassunto del resto: ogni inizio ha la sua fine, il record ha la sua riga`, async (t) => {
    const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
    process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
    t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
    const cartella = cartellaDiProva('talos-s2-2-base-stop-');
    t.after(() => rimuoviCartellaDiProva(cartella));
    for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${'riga lunga del file '.repeat(400)}\n`);
    const testo = (contenuto) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    const r0 = async (_u, o) => { const corpo = JSON.parse(o.body); if (!corpo.tools?.length) return testo(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } }); };
    const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3450)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
    const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
    assert.ok(pronta, 'premessa');
    const firma = { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base };
    const inArrivo = Object.assign(attesaEreditato ? new Promise((ok) => { setTimeout(() => ok(pronta), attesaEreditato).unref(); }) : Promise.resolve(pronta), { firma });
    const stop = new AbortController();
    let modello = 0;
    let riassunti = 0;
    const r1 = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) {
        riassunti += 1;
        setTimeout(() => stop.abort(), 50).unref();
        return new Promise((_ok, ko) => { const s = o.signal; const ferma = () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' })); if (s?.aborted) ferma(); else s?.addEventListener('abort', ferma, { once: true }); });
      }
      modello += 1;
      const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
      const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
      if (modello === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [1, 2, 3, 4].map((i) => ({ id: `c${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `g${i}.txt`, path: `g${i}.txt` }) } })) }, finish_reason: 'tool_calls' }], usage });
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
    };
    const eventi = [];
    const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...uno.messaggiFinali, { role: 'user', content: `Leggi g1-g4. ${'contesto '.repeat(350)}` }],
      compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access', segnaleStop: stop.signal,
      onGiro: (e) => { if (e?.tipo === 'compattazione-inizio' || e?.tipo === 'compattazione-fine') eventi.push({ giro: e.giro, tipo: e.tipo, compattato: e.compattato ?? null, at: e.record?.at ?? null, resto: e.restoNonRiuscito ?? null }); } });
    assert.equal(ris.comeFinita, 'fermato', 'premessa: lo Stop ha fermato il giro');
    assert.ok(riassunti >= 1, 'premessa: lo Stop è arrivato durante un riassunto');
    const conInizio = [...new Set(eventi.filter((e) => e.tipo === 'compattazione-inizio').map((e) => e.giro))];
    assert.ok(conInizio.length >= 1, `premessa: una compattazione è cominciata (${JSON.stringify(eventi)})`);
    for (const giro of conInizio) {
      assert.equal(eventi.filter((e) => e.giro === giro && e.tipo === 'compattazione-fine').length, 1, `la richiesta ${giro} ha UNA fine (${JSON.stringify(eventi)})`);
    }
    const record = ris.recordDiCompattazione ?? [];
    assert.ok(record.length >= 1, 'premessa: c\'è un record da salvare');
    const rigaDelRecord = eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.at === record.at(-1).at);
    assert.ok(rigaDelRecord, `il record che il registro salva ha la sua riga (${JSON.stringify(eventi)})`);
    if (attesaEreditato) assert.equal(rigaDelRecord.resto?.motivo, 'interrotta', `la riga della base dice che il resto è stato interrotto (${JSON.stringify(rigaDelRecord)})`);
  });
}
