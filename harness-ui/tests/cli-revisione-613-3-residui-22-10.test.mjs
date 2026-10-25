/*
 * 22/10/2026 — revisione 3 della CLI sulla 0.6.13, i residui dopo r4 79dbe20e3.
 * S2-2 nel giro: l'emergenza DENTRO il giro applicava un riassunto che faceva CRESCERE il contesto (misura della CLI 15.631 → 16.040,
 *   pagato). Il registro lo rifiutava già; l'adattatore del giro no.
 * (S2-1 sta in `chiamata-secondaria.test.mjs`, sul fornitore finto vero.)
 * Fornitore finto via `fetchDiRete`, cartelle temporanee proprie, nessuna porta.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
/* Revisione 6 della CLI (S2-2): senza uno scarto misurato la prima richiesta di un giro porta la stima degli schemi degli attrezzi (i fornitori veri li contano). Il fornitore finto di questo file risponde `prompt_tokens` = stima dei soli MESSAGGI: lo scarto che il registro misurerebbe su di lui è 0, e lo si dichiara (`scartoMisurato: 0`) invece di cambiare tutte le soglie. */
const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
/* 22/10/2026 notte (verdetto della CLI sulla regola del riassunto, C1): un riassunto si prepara o si paga solo se toglie il 10% della soglia
   al netto del riassunto atteso (il suo budget d'uscita, almeno 2.000 token). Le storie preparate in anticipo sono quindi a 3.800 (erano
   3.450: sotto la soglia di 4.000 ma con un tratto vecchio troppo piccolo), e quella «grande» di NON-PAGA-02 a 4.500 (era 2.500). */

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

/* Pezzo C (§4.1 del rapporto della CLI, owner 22/10 «Tutto nella 0.6.13»): prima sul contesto pieno la guardia non scartava e un
   riassunto cresciuto si applicava. Ora non si applica MAI: al suo posto il riassunto senza modello, e il giro riparte lo stesso. */
test('S2-2-OVERFLOW-TESTO-01 — contesto pieno, solo testo, riassunto che cresce: NON si applica, si riparte senza di lui e il giro non muore', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-overflow-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { modello: 0, riassunti: 0 };
  const corpi = [];
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'dettaglio '.repeat(9000)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.modello += 1;
    corpi.push(corpo);
    if (conti.modello === 1) return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
  const r = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...storia(coppiePer(3000)), { role: 'user', content: 'Continua' }], contestoDelProgetto: 'Project files:\n', fetchDiRete });
  assert.equal(r.comeFinita, 'concluso', `il giro finisce (${r.comeFinita})`);
  assert.ok(conti.modello >= 2, `ha ritentato dopo il contesto pieno (${conti.modello})`);
  assert.ok(conti.riassunti <= 1, `al più un riassunto pagato nel giro (${conti.riassunti})`);
  assert.ok(!JSON.stringify(corpi[1].messages).includes('dettaglio dettaglio'), 'il riassunto cresciuto NON è nella richiesta ritentata');
  assert.ok(stima(corpi[1].messages) < stima(corpi[0].messages), `il ritento è più leggero (${stima(corpi[0].messages)} → ${stima(corpi[1].messages)})`);
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
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppie(3800)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
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
    const preparate = [];
    const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3800)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0,
      onGiro: (e) => { if (e?.tipo === 'compattazione-preparata' && e.fase === 'pronta') preparate.push(e); } });
    const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
    assert.ok(pronta, 'premessa');
    /* Revisione 4 della CLI (S3-2): l'evento «pronta» porta l'`at` del record, quello che la riga del giro porterà come `adottato` */
    assert.equal(preparate.at(-1)?.at, pronta.record.at, `l'evento «pronta» porta l'at del record (${JSON.stringify(preparate.at(-1))})`);
    /* come lo consegna il registro (`perIlGiro`): già annunciato da lui — col resto riuscito (conta 1) e col resto in errore (conta 0);
       l'«inefficace» riceve quello preparato da un giro */
    const daFineGiro = caso !== 'resto-inefficace';
    const inArrivo = Object.assign(new Promise((ok) => { setTimeout(() => ok(daFineGiro ? { ...pronta, origine: 'fine-giro' } : pronta), 300).unref(); }),
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
    const esitoDue = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      /* 22/10/2026 notte (verdetto della CLI, C1): il RESTO dopo la base si paga solo se toglie il 10% della soglia al netto del riassunto
         atteso (almeno 2.000 token). Con la sola richiesta nuova tutto il resto stava nella coda, che il riassunto non tocca: quattro scambi
         fra la base e la richiesta ne fanno un tratto vecchio vero. */
      messaggiIniziali: [...uno.messaggiFinali, ...storia(4, 2_800), { role: 'user', content: `Leggi g1-g4. ${'contesto '.repeat(350)}` }],
      compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ giro: e.giro, compattato: e.compattato, motivo: e.motivo ?? null, prima: e.record?.tokenPrima ?? null, resto: e.restoNonRiuscito ?? null, adottato: e.adottato ?? null, soloCoda: e.soloCoda === true }); } });
    const giroEmergenza = fini.find((f) => f.compattato === true)?.giro;
    assert.ok(giroEmergenza !== undefined, `premessa: c'è una compattazione (${JSON.stringify(fini)})`);
    /* Pezzo D (23/10): la riga del FRENO che tira non è una compattazione — la si dice una volta per armamento, a parte. Qui tira solo
       col resto «inefficace» (il conto vero dopo la base è ancora oltre la soglia, e il resto allunga: due colpi). */
    const delFreno = fini.filter((f) => f.giro === giroEmergenza && f.motivo === 'freno');
    assert.ok(delFreno.length <= (caso === 'resto-inefficace' ? 1 : 0), `il freno al più una volta, e solo col resto che allunga (${JSON.stringify(delFreno)})`);
    const dellaRichiesta = fini.filter((f) => f.giro === giroEmergenza && f.motivo !== 'freno');
    assert.equal(dellaRichiesta.length, 1, `una riga sola per la richiesta (${JSON.stringify(dellaRichiesta)})`);
    assert.equal(dellaRichiesta[0].compattato, true, 'e dice «compattato»: la base c\'è stata');
    assert.ok(dellaRichiesta[0].prima >= 4_800, `la riga parte dal numero della richiesta, sopra l'emergenza (${dellaRichiesta[0].prima})`);
    /* Revisione 4 della CLI (S3-2): la riga nasce da un record preparato altrove, e lo dice — l'`at` di quel record, da dove viene, il
       conto dopo di lui su questa richiesta, e se la riga copre anche il resto */
    const segno = dellaRichiesta[0].adottato;
    assert.equal(segno?.at, pronta.record.at, `la riga porta l'at del record adottato (${JSON.stringify(dellaRichiesta[0])})`);
    assert.equal(segno.origine, daFineGiro ? 'fine-giro' : 'giro', 'e da dove viene');
    assert.equal(segno.conResto, caso === 'resto-riuscito', 'e se la riga copre anche il resto');
    /* CLI, revisione 4: il conto del risultato conta le righe — base più resto è UNA compattazione per chi la legge; lo scambio del
       riassunto di fine giro senza resto non si conta (l'ha già annunciato il registro); F1 della revisione 9: nemmeno la «sola coda»,
       che non è un riassunto */
    const contate = fini.filter((f) => f.compattato === true && !f.soloCoda && !(f.adottato?.origine === 'fine-giro' && f.adottato.conResto !== true)).length;
    assert.equal(esitoDue.compattazioni, contate, `il conto è quello delle righe (${esitoDue.compattazioni} contro ${contate}: ${JSON.stringify(fini.map((f) => [f.compattato, f.soloCoda ?? false, f.adottato?.origine ?? null, f.adottato?.conResto ?? null, f.motivo ?? null]))})`);
    /* 22/10/2026 notte: con i quattro scambi del resto, le letture che arrivano DOPO la base possono riportare il giro sopra la soglia e
       fare una seconda compattazione legittima più avanti; il conto della richiesta della base è quello che si guarda qui */
    const piuAvanti = fini.filter((f) => f.giro !== giroEmergenza && f.compattato === true && !f.soloCoda && !(f.adottato?.origine === 'fine-giro' && f.adottato.conResto !== true)).length;
    if (caso === 'resto-500') assert.equal(esitoDue.compattazioni - piuAvanti, 0, 'la base di fine giro senza resto non si conta due volte');
    else assert.equal(esitoDue.compattazioni - piuAvanti, 1, 'una riga, una compattazione');
    assert.ok(Number.isSafeInteger(segno.tokenDopo) && segno.tokenDopo < dellaRichiesta[0].prima, `col conto dopo la base (${JSON.stringify(segno)})`);
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
    const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3800)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
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
      /* 22/10/2026 notte (verdetto della CLI, C1): il RESTO dopo la base si paga solo se toglie il 10% della soglia al netto del riassunto
         atteso (almeno 2.000 token). Con la sola richiesta nuova tutto il resto stava nella coda, che il riassunto non tocca: quattro scambi
         fra la base e la richiesta ne fanno un tratto vecchio vero. */
      messaggiIniziali: [...uno.messaggiFinali, ...storia(4, 2_800), { role: 'user', content: `Leggi g1-g4. ${'contesto '.repeat(350)}` }],
      compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access', segnaleStop: stop.signal,
      onGiro: (e) => { if (e?.tipo === 'compattazione-inizio' || e?.tipo === 'compattazione-fine') eventi.push({ giro: e.giro, tipo: e.tipo, compattato: e.compattato ?? null, at: e.record?.at ?? null, resto: e.restoNonRiuscito ?? null, adottato: e.adottato ?? null }); } });
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
    /* Revisione 4 della CLI (S3-2): lo scambio o la base nascono dal riassunto ereditato, e la riga lo dice con il suo at */
    assert.equal(eventi.find((e) => e.tipo === 'compattazione-fine' && e.compattato === true)?.adottato?.at, pronta.record.at, `la prima riga porta l'at del record ereditato (${JSON.stringify(eventi)})`);
  });
}

/* Revisione 4 della CLI sulla 0.6.13 (22/10/2026), S2-1: un log incollato negli ultimi scambi con poca storia vecchia. Il giro pagava
   un riassunto a OGNI giro (il tratto vecchio è due «OK»: il riassunto con la sua cornice viene più lungo) e lo buttava come
   «inefficace»; il registro no (`riassuntoNonPuoRidurre`). Sonda `paste-inner.mts` della CLI, qui sul fornitore finto. AL CONTRARIO:
   con una storia vecchia grande il riassunto parte (la regola non spegne la compattazione). */
const rispostaFinta = (contenuto, prompt = 10) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
async function treGiriConIncollato(t, messaggiVecchi) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-incollato-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { riassunti: 0, modello: 0, fini: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta(`## Riassunto\n${'Dettaglio del lavoro fatto. '.repeat(12)}`); }
    conti.modello += 1;
    return rispostaFinta('OK', stima(corpo.messages));
  };
  const incollato = `Ecco il log che ho incollato, rispondi solo OK.\n${'riga di log incollata '.repeat(1000)}`;
  let messaggi = [...messaggiVecchi, { role: 'user', content: incollato }];
  for (const domanda of ['Quarta: rispondi OK.', 'Quinta: rispondi OK.', null]) {
    const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
      contestoDelProgetto: 'Project files:\n', fetchDiRete,
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') conti.fini.push({ giro: e.giro, compattato: e.compattato, motivo: e.motivo ?? null }); } });
    assert.equal(ris.comeFinita, 'concluso', 'premessa: il giro finisce');
    if (domanda) messaggi = [...ris.messaggiFinali, { role: 'user', content: domanda }];
  }
  return conti;
}

test('S2-1-GIRO-NON-PAGA-01 — log incollato con poca storia vecchia: tre giri sopra l’emergenza, nessun riassunto pagato, nessun «inefficace»', async (t) => {
  const brevi = [1, 2, 3].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]);
  const conti = await treGiriConIncollato(t, brevi);
  assert.ok(conti.modello >= 3, `premessa: i tre giri hanno chiamato il modello (${conti.modello})`);
  assert.equal(conti.riassunti, 0, `nessun riassunto pagato: non poteva ridurre (${JSON.stringify(conti)})`);
  assert.equal(conti.fini.filter((f) => f.motivo === 'inefficace').length, 0, `nessun «inefficace» (${JSON.stringify(conti.fini)})`);
});

test('S2-1-GIRO-NON-PAGA-02 — AL CONTRARIO: con una storia vecchia grande il riassunto parte e compatta', async (t) => {
  const conti = await treGiriConIncollato(t, storia(coppiePer(4500)));
  assert.ok(conti.riassunti >= 1, `il riassunto è partito (${JSON.stringify(conti)})`);
  assert.ok(conti.fini.some((f) => f.compattato === true), `e ha compattato (${JSON.stringify(conti.fini)})`);
});

test('S2-1-GIRO-SOLA-CODA-01 — un esito d’attrezzo enorme negli ultimi scambi e poca storia vecchia: la coda si accorcia senza pagare un riassunto', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-sola-coda-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  let riassunti = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return rispostaFinta(`## Riassunto\n${'Dettaglio. '.repeat(12)}`); }
    return rispostaFinta('OK', stima(corpo.messages));
  };
  const messaggi = [
    ...[1, 2, 3].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]),
    { role: 'user', content: 'Leggi il file grande.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"grande.txt"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: `${'contenuto del file grande, riga dopo riga. '.repeat(600)}` },
    { role: 'assistant', content: 'Letto.' },
    { role: 'user', content: 'Ora rispondi OK.' },
  ];
  const fini = [];
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', fetchDiRete,
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ compattato: e.compattato, motivo: e.motivo ?? null, soloCoda: e.soloCoda === true }); } });
  assert.equal(ris.comeFinita, 'concluso', 'premessa');
  assert.ok(stima(messaggi) > 4_800, `premessa: la richiesta parte sopra l'emergenza (${stima(messaggi)})`);
  assert.equal(riassunti, 0, `nessun riassunto pagato (${JSON.stringify(fini)})`);
  assert.ok(fini.some((f) => f.compattato === true && f.soloCoda), `la coda si è accorciata da sola (${JSON.stringify(fini)})`);
});

/* Pezzo C (owner 22/10, punto 1 del testo approvato: «un riassunto si paga solo se toglie davvero… nemmeno sul rifiuto del fornitore»).
   Prima questa prova voleva il riassunto pagato anche qui; ora il rifiuto non lo giustifica più da solo: la storia vecchia sono tre
   scambi di poche parole e la richiesta che non entra è il log appena incollato — niente può bastare, niente si paga, e la STESSA
   richiesta non riparte. Il giro fallisce col rifiuto classificato e la diagnosi. */
test('S2-1-GIRO-OVERFLOW-01 — AL CONTRARIO: quando il fornitore dice «non entra» e niente può bastare, non si paga un riassunto e la stessa richiesta non riparte', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-overflow-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const conti = { riassunti: 0, modello: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta(`## Riassunto\n${'Dettaglio. '.repeat(12)}`); }
    conti.modello += 1;
    if (conti.modello === 1) return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 2048 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return rispostaFinta('OK', stima(corpo.messages));
  };
  const messaggi = [...[1, 2, 3].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]),
    { role: 'user', content: `Ecco un pezzo di log, rispondi OK.\n${'riga di log incollata '.repeat(300)}` }];
  assert.ok(stima(messaggi) < 4_000, `premessa: sotto la soglia, la compattazione la chiede solo il fornitore (${stima(messaggi)})`);
  let errore = null;
  try {
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n', fetchDiRete });
  } catch (e) { errore = e; }
  assert.ok(errore, 'il giro fallisce: niente poteva farla entrare');
  assert.equal(errore.classificazione, 'contesto-pieno');
  assert.equal(conti.riassunti, 0, `nessun riassunto pagato (${JSON.stringify(conti)})`);
  assert.equal(conti.modello, 1, `la stessa richiesta non riparte (${JSON.stringify(conti)})`);
  assert.ok(Number.isFinite(errore.contestoPieno?.bersaglio), `la diagnosi viaggia con l'errore (${JSON.stringify(errore.contestoPieno)})`);
});

/* Sesta passata avversaria (22/10/2026), R1: con l'istantanea accesa il giro prepara in sottofondo a ogni richiesta sopra l'80%; il
   controllo «non può ridurre» chiude subito la preparazione inutile. Prima: un «inizio» durevole per richiesta senza «pronta», e
   `preparate` contava riassunti mai pagati (3 contro 1). Sonda `p6-precalcolo` del revisore, diventata prova. */
test('S2-1-GIRO-PREPARATA-01 — una preparazione che non produce niente non si annuncia e non si conta: ogni «inizio» ha il suo «pronta»', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-preparata-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `f${i}.txt`), 'x\n');
  const messaggi = [{ role: 'user', content: 'Task: review the layout.' }, { role: 'assistant', content: 'Starting.' }];
  for (let i = 0; i < 4; i += 1) messaggi.push({ role: 'user', content: `q${i}` }, { role: 'assistant', content: `Answer ${i}: ${'word '.repeat(20)}` });
  messaggi.push({ role: 'user', content: `LOG ${'x'.repeat(13600)}` });
  const conti = { modello: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta('## R\nok.'); }
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (conti.modello <= 4) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${conti.modello}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${conti.modello}.txt`, path: `f${conti.modello}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage });
    return rispostaFinta('fatto', usage.prompt_tokens);
  };
  const eventi = [];
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, compattazioneIstantanea: true,
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-preparata') eventi.push(e.fase ?? e.motivo ?? null); } });
  await (ris.compattazioneInPreparazione ?? Promise.resolve(null)).catch(() => null);
  /* una preparazione in sottofondo finisce DOPO il giro (il suo «pronta» arriva quando il riassunto torna): si aspetta, con un tetto,
     che ogni «inizio» abbia il suo «pronta» — una preparazione annunciata e poi saltata non ci arriverebbe mai */
  for (let i = 0; i < 300 && eventi.filter((f) => f === 'inizio').length !== eventi.filter((f) => f === 'pronta').length; i += 1) await new Promise((ok) => setTimeout(ok, 10));
  const inizi = eventi.filter((f) => f === 'inizio').length;
  assert.ok(conti.modello >= 3, `premessa: più richieste sopra l'80% della soglia (${conti.modello})`);
  assert.equal(inizi, eventi.filter((f) => f === 'pronta').length, `ogni «inizio» ha il suo «pronta» (${JSON.stringify(eventi)})`);
  assert.equal(ris.preparazioniDiCompattazione.preparate, inizi, 'il conto delle preparazioni è quello degli inizi annunciati');
  assert.ok(ris.preparazioniDiCompattazione.preparate <= conti.riassunti, `e non conta preparazioni mai fatte (${JSON.stringify(ris.preparazioniDiCompattazione)} contro ${conti.riassunti} riassunti pagati)`);
});

test('S2-1-GIRO-PREPARATA-02 — anche la preparazione in sottofondo che accorcia solo la coda si annuncia e si conta, senza pagare un riassunto', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-preparata-coda-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  let riassunti = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return rispostaFinta('## R\nok.'); }
    return rispostaFinta('OK', stima(corpo.messages));
  };
  const messaggi = [
    ...[1, 2].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]),
    { role: 'user', content: 'Leggi il file.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"medio.txt"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: `${'riga del file di media lunghezza. '.repeat(380)}` },
    { role: 'assistant', content: 'Letto.' },
    { role: 'user', content: 'Ora rispondi OK.' },
  ];
  const eventi = [];
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, compattazioneIstantanea: true,
    contestoDelProgetto: 'Project files:\n', fetchDiRete,
    onGiro: (e) => { if (e?.tipo === 'compattazione-preparata') eventi.push(e.fase ?? e.motivo ?? null); } });
  await (ris.compattazioneInPreparazione ?? Promise.resolve(null)).catch(() => null);
  /* una preparazione in sottofondo finisce DOPO il giro (il suo «pronta» arriva quando il riassunto torna): si aspetta, con un tetto,
     che ogni «inizio» abbia il suo «pronta» — una preparazione annunciata e poi saltata non ci arriverebbe mai */
  for (let i = 0; i < 300 && eventi.filter((f) => f === 'inizio').length !== eventi.filter((f) => f === 'pronta').length; i += 1) await new Promise((ok) => setTimeout(ok, 10));
  const inizi = eventi.filter((f) => f === 'inizio').length;
  assert.ok(stima(messaggi) > 3_200 && stima(messaggi) < 4_000, `premessa: fra l'80% della soglia e la soglia (${stima(messaggi)})`);
  assert.equal(riassunti, 0, 'nessun riassunto pagato: basta accorciare la coda');
  assert.equal(inizi, 1, `una preparazione annunciata (${JSON.stringify(eventi)})`);
  assert.equal(eventi.filter((f) => f === 'pronta').length, inizi, 'col suo «pronta»');
  assert.equal(ris.preparazioniDiCompattazione.preparate, 1, 'e contata');
});

/* Revisione 5 della CLI (22/10/2026 notte), S2-2: sull'overflow del fornitore il giro aspettava il riassunto di fine giro ereditato
   SENZA tetto, Stop, «Salta» né firma (`await inVolo.promessa`): muto per minuti, e lo Stop non lo fermava. Ora la stessa strada
   dell'emergenza (`compattaDovuta`). Sonda `ovf-inflight` della CLI: il giro è SOTTO l'emergenza e il fornitore dice «context full». */
async function overflowConRiassuntoInArrivo(t, { stopDopoMs = null, tettoMs = undefined }) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-overflow-in-arrivo-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const r0 = async (_u, o) => { const corpo = JSON.parse(o.body); if (!corpo.tools?.length) return rispostaFinta(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); return rispostaFinta('fatto', stima(corpo.messages)); };
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3800)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta, 'premessa');
  const messaggi = [...uno.messaggiFinali, { role: 'user', content: 'Ancora una cosa.' }];
  const inArrivo = Object.assign(new Promise((ok) => { setTimeout(() => ok({ ...pronta, origine: 'fine-giro' }), 5_000).unref(); }),
    { firma: { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base } });
  const conti = { modello: 0, riassunti: 0 };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); }
    conti.modello += 1;
    if (conti.modello === 1) return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 2048 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    return rispostaFinta('fatto', stima(corpo.messages));
  };
  const stop = new AbortController();
  if (stopDopoMs !== null) setTimeout(() => stop.abort(), stopDopoMs).unref();
  const inizio = Date.now();
  let ris = null; let errore = null;
  try {
    ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
      compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete, segnaleStop: stop.signal,
      ...(tettoMs !== undefined ? { riassuntoTettoMs: tettoMs } : {}) });
  } catch (e) { errore = e; }
  assert.ok(stima(messaggi) < 4_000, `premessa: sotto la soglia, il «pieno» lo dice solo il fornitore (${stima(messaggi)})`);
  return { ris, errore, durata: Date.now() - inizio, conti };
}

test('S2-2-OVERFLOW-ATTESA-01 — sull’overflow lo Stop ferma subito l’attesa del riassunto ereditato', async (t) => {
  const { ris, errore, durata, conti } = await overflowConRiassuntoInArrivo(t, { stopDopoMs: 300 });
  assert.ok(conti.modello >= 1, 'premessa: il fornitore ha detto «context full»');
  assert.ok(durata < 2_500, `lo Stop ferma l'attesa (${durata} ms; il riassunto arrivava dopo 5 s)`);
  assert.equal(errore, null, `nessun errore (${errore?.message})`);
  assert.equal(ris.comeFinita, 'fermato', 'il giro finisce come fermato dalla persona');
});

test('S2-2-OVERFLOW-ATTESA-02 — sull’overflow l’attesa ha il suo tetto: allo scadere il riassunto senza modello, e il giro finisce', async (t) => {
  const { ris, errore, durata, conti } = await overflowConRiassuntoInArrivo(t, { tettoMs: 300 });
  assert.equal(errore, null, `nessun errore (${errore?.message})`);
  assert.ok(durata < 3_000, `l'attesa finisce al tetto (${durata} ms; il riassunto arrivava dopo 5 s)`);
  assert.equal(conti.riassunti, 0, 'nessun riassunto pagato: allo scadere quello senza modello');
  assert.equal(ris.comeFinita, 'concluso', 'e la richiesta riparte più leggera');
});

/* Revisione 5 della CLI (22/10/2026 notte), S2-1: la CORNICE. Un tratto vecchio di ~325 token (sopra i 256 di prima, sotto la
   cornice più un riassunto minimo) e la richiesta appena sopra la soglia: col pavimento NUDO il meglio di un riassunto finiva sotto
   la linea e si pagava; con la cornice (indice, blocco dei fatti, marcatore) si vede che non può ridurre. La soglia si ricava da una
   prima corsa di misura (la stessa richiesta senza tetto), così il caso non dipende da numeri scritti a mano. */
test('S2-1-GIRO-CORNICE-01 — un tratto vecchio più piccolo della cornice non fa pagare un riassunto, nemmeno appena sopra la soglia', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-cornice-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risposta = 'Answer line with several words to weigh the history of the talk. '.repeat(30).slice(0, 1_300);
  const messaggi = [{ role: 'user', content: 'Prima richiesta: rispondi.' }, { role: 'assistant', content: risposta },
    { role: 'user', content: 'Seconda richiesta: rispondi OK.' }, { role: 'assistant', content: 'OK' },
    { role: 'user', content: `Terza richiesta, il log: ${'riga di log incollata '.repeat(1_000)}` }];
  const corsa = async (tetto) => {
    process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(tetto);
    const conti = { riassunti: 0, prima: null };
    const fetchDiRete = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta('## Riassunto\nbreve.'); }
      conti.prima ??= stima(corpo.messages);
      return rispostaFinta('OK', stima(corpo.messages));
    };
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n', fetchDiRete });
    return conti;
  };
  const misura = await corsa(200_000);
  assert.equal(misura.riassunti, 0, 'premessa: senza tetto nessuna compattazione');
  /* la proiezione che il giro giudica pesa un po' più della richiesta misurata qui (sistema e note del giro): si scorre la soglia
     sopra e sotto, a passi di 10 token, così una delle soglie cade nella fascia in cui solo la cornice dice «non può ridurre» */
  const pagati = [];
  for (let tetto = misura.prima - 40; tetto <= misura.prima + 400; tetto += 10) {
    const conti = await corsa(tetto);
    if (conti.riassunti > 0) pagati.push(tetto);
  }
  assert.deepEqual(pagati, [], `nessun riassunto pagato a nessuna soglia: il tratto vecchio è più piccolo della cornice (richiesta ${misura.prima})`);
});

/* Revisione 5 della CLI (22/10/2026 notte), S2-1: la sonda `gap1300`. Il log incollato con risposte da 1.300 caratteri: col pavimento
   nudo e la soglia fissa il giro pagava 4 riassunti fra T3 e T6 — T3 buttato come «inefficace», T4 e T5 per guadagni dell'1-3% con la
   richiesta comunque sopra l'emergenza. Con `riassuntoUtile` si paga solo T6, quando il log passa nel tratto vecchio e il riassunto serve. */
/* §4.2, regola K (owner 22/10/2026, decisione presa nella sessione della CLI): il log incollato, quando diventa una richiesta VECCHIA
   (al giro 4), si accorcia per il modello — inizio e fine, il testo intero nel suo file — invece di pagare un riassunto: è il caso gap1300
   del rapporto della CLI (§4.1, «the paste is an older request, so it is shortened deterministically; the turn goes out and nothing is
   paid»). Prima di K qui si pagava UN riassunto a T6. */
test('S2-1-GIRO-UTILE-01 — un riassunto si paga solo se serve: in sei giri col log incollato, nessuno — al giro 4 il log, diventato vecchio, si accorcia senza modello e il testo intero resta nel suo file', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '8000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-1-utile-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const risposta = 'Answer line with several words to weigh the history of the talk. '.repeat(30).slice(0, 1_300);
  const conti = { riassunti: 0, fini: [] };
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta(`## Summary\n${'The person asked for answers and got them. '.repeat(6)}`); }
    return rispostaFinta(risposta, stima(corpo.messages));
  };
  let messaggi = [{ role: 'user', content: 'First request: say OK.' }, { role: 'assistant', content: risposta }, { role: 'user', content: 'Second request: say OK.' }, { role: 'assistant', content: risposta },
    { role: 'user', content: `Third request: here is the build log I pasted, just say OK.\n${'2026-10-22 12:00:00 INFO pasted build log line with some words\n'.repeat(1000).slice(0, 60000)}` }];
  let record = null;
  const cartellaIncollati = join(cartella, '.incollati-della-sessione');
  for (const [i, domanda] of ['Fourth request: say OK.', 'Fifth request: say OK.', 'Sixth request: say OK.', null].entries()) {
    const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n', fetchDiRete,
      cartellaIncollati, ...(record ? { recordCompattazioneIniziale: record } : {}),
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') conti.fini.push({ giro: i + 3, compattato: e.compattato, motivo: e.motivo ?? null, soloCoda: e.soloCoda === true, accorciati: e.accorciati ?? 0 }); } });
    if (ris.recordDiCompattazione?.length) record = ris.recordDiCompattazione.at(-1);
    if (domanda) messaggi = [...ris.messaggiFinali, { role: 'user', content: domanda }];
  }
  assert.equal(conti.riassunti, 0, `nessun riassunto pagato in sei giri (${JSON.stringify(conti.fini)})`);
  const compattate = conti.fini.filter((f) => f.compattato === true);
  assert.deepEqual(compattate.map((f) => [f.giro, f.soloCoda, f.accorciati]), [[4, true, 1]], `al giro 4 la sola coda, con il log accorciato (${JSON.stringify(conti.fini)})`);
  assert.equal(conti.fini.filter((f) => f.motivo === 'inefficace').length, 0, 'nessun «inefficace»');
  /* la proiezione porta il log accorciato con l'avviso in testa e il percorso; il file ha il testo intero, byte per byte */
  const accorciato = record.riassunto.find((m) => typeof m.content === 'string' && m.content.startsWith('[TALOS shortened this earlier message from the person'));
  assert.ok(accorciato, 'il record porta il log accorciato');
  const percorso = /saved at "([^"]+)"/u.exec(accorciato.content)?.[1];
  assert.ok(percorso && percorso.startsWith(cartellaIncollati), `con il percorso del file nella cartella della sessione (${percorso})`);
  const originale = messaggi.find((m) => typeof m.content === 'string' && m.content.startsWith('Third request:')).content;
  assert.equal(readFileSync(percorso, 'utf8'), originale, 'e il file ha il testo intero');
  assert.ok(accorciato.content.length < originale.length / 5, `molto più corto (${accorciato.content.length} contro ${originale.length})`);
});

test('S2-2-OVERFLOW-NIENTE-01 — sull’overflow, se la compattazione non riduce niente, la stessa richiesta piena non riparte uguale', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '200000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-s2-2-overflow-niente-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const corpi = [];
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return rispostaFinta('## Riassunto\nbreve.');
    corpi.push(o.body);
    return new Response(JSON.stringify({ error: { message: "This model's maximum context length is 2048 tokens (context_length_exceeded)" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  };
  let ris = null; let errore = null;
  try {
    ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [{ role: 'user', content: `Una richiesta sola e lunghissima: ${'parola '.repeat(3_000)}` }], contestoDelProgetto: 'Project files:\n', fetchDiRete });
  } catch (e) { errore = e; }
  assert.ok(corpi.length >= 1, 'premessa: il fornitore ha detto «context full»');
  const doppioni = corpi.filter((c, i) => corpi.indexOf(c) !== i).length;
  assert.equal(doppioni, 0, `la stessa richiesta piena non riparte identica (${corpi.length} invii, ${doppioni} uguali; esito ${ris?.comeFinita ?? errore?.message})`);
});

/* Revisione 6 della CLI (S2-1, sonda img-first): la scena gap1300 con un'IMMAGINE nella prima richiesta. La prima richiesta resta alla
   lettera per sempre, e l'esenzione della «stima cieca» guardava tutto il tratto vecchio, richieste tenute comprese: un'immagine lì
   spegneva la regola del 10% per tutta la sessione (4 riassunti invece di 1, uno buttato come «inefficace»). Ora tutto si pesa coi pezzi:
   la stessa scena, testo o immagine, paga gli stessi riassunti. */
test('S2-1-GIRO-IMMAGINE-01 — un\'immagine nella prima richiesta non spegne la regola: la scena gap1300 paga gli stessi riassunti con o senza l\'immagine, e nessun «inefficace»', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '8000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const risposta = 'Answer line with several words to weigh the history of the talk. '.repeat(30).slice(0, 1_300);
  const scena = async (primaRichiesta) => {
    const cartella = cartellaDiProva('talos-s2-1-immagine-');
    t.after(() => rimuoviCartellaDiProva(cartella));
    const conti = { riassunti: 0, inefficaci: 0 };
    const fetchDiRete = async (_u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta(`## Summary\n${'The person asked for answers and got them. '.repeat(6)}`); }
      return rispostaFinta(risposta, compattazione.stimaConPezzi(corpo.messages));
    };
    let messaggi = [primaRichiesta, { role: 'assistant', content: risposta }, { role: 'user', content: 'Second request: say OK.' }, { role: 'assistant', content: risposta },
      { role: 'user', content: `Third request: here is the build log I pasted, just say OK.\n${'2026-10-22 12:00:00 INFO pasted build log line with some words\n'.repeat(1000).slice(0, 60000)}` }];
    let record = null;
    for (const domanda of ['Fourth request: say OK.', 'Fifth request: say OK.', 'Sixth request: say OK.', null]) {
      const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n', fetchDiRete,
        ...(record ? { recordCompattazioneIniziale: record } : {}),
        onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.motivo === 'inefficace') conti.inefficaci += 1; } });
      if (ris.recordDiCompattazione?.length) record = ris.recordDiCompattazione.at(-1);
      if (domanda) messaggi = [...ris.messaggiFinali, { role: 'user', content: domanda }];
    }
    return conti;
  };
  const testo = await scena({ role: 'user', content: 'First request: say OK.' });
  const immagine = await scena({ role: 'user', content: [{ type: 'text', text: 'First request: say OK.' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] });
  assert.deepEqual(immagine, testo, `stessi riassunti con o senza l'immagine (testo ${JSON.stringify(testo)}, immagine ${JSON.stringify(immagine)})`);
  assert.equal(immagine.inefficaci, 0, 'nessun «inefficace»');
});
