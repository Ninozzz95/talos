/*
 * 23/10/2026 sera — revisione 11 della CLI sul §4 (kernel `b7e21eaaa`, DO-NOT-PUBLISH). Ogni cura nei due versi:
 *   R11-1 (S2) un messaggio che ENTRA fermato come «troppo grande»: lo scarto misurato comprende la storia che il fornitore conta più
 *          della stima (codice, base64 negli esiti d'attrezzo), e regola N e bersaglio lo trattavano come cornice fissa;
 *   R11-2 i numeri «del fornitore» nella sua scala;
 *   R11-3 la lista della richiesta era la storia del kernel: la riscrittura sul rifiuto sostituiva la storia VERA con la proiezione;
 *   R11-4 / R11-11 l'unione delle due copie del freno (ricariche contate, colpi della copia che li ha cambiati, riarmo da adesso);
 *   R11-5 il riassunto giudicato inutile nel giro non si ripaga uguale a fine giro;
 *   R11-6 freno tirato all'emergenza e richiesta certamente oltre la finestra dichiarata: il riassunto senza modello PRIMA di mandare;
 *   R11-7 la finestra del rifiuto si ricorda (come Hermes), e la stessa richiesta rifiutata non riparte uguale;
 *   R11-8 «non entra» sul rifiuto: sulla linea certa, col pavimento oltre la finestra e la `riserva`;
 *   R11-9 la frase del freno dopo la riga della compattazione che l'ha fatto tirare.
 * Fornitore finto via `fetchDiRete`, cartelle temporanee, nessuna porta.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { nomeDellaRichiestaSalvata } from '../src/kernel/richieste-vecchie.mjs';
import { CODICE_RICHIESTA_TROPPO_GRANDE } from '../src/kernel/richiesta-troppo-grande.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';

/* Il fornitore finto: conta stima dei messaggi (+ schemi, se `conAttrezzi`) e, per gli esiti d'attrezzo, `pesante` token in più per
   carattere (il codice e il base64 che il fornitore conta più fitti della stima); tutto per `scala`. Rifiuta oltre `massimo` coi numeri
   nella forma di OpenAI. `risposta(n, corpo)` decide la risposta della n-esima richiesta del giro. */
function fornitore({ massimo = null, pesante = 0, scala = 1, conAttrezzi = true, risposta = () => ({ content: 'fatto' }) } = {}) {
  const conti = { richieste: 0, rifiutate: 0, riassunti: 0, corpi: [] };
  const conto = (corpo) => Math.round((stima(corpo.messages) + (conAttrezzi ? compattazione.stimaDegliAttrezzi(corpo.tools) : 0)
    + corpo.messages.filter((m) => m.role === 'tool').reduce((n, m) => n + Math.round(String(m.content ?? '').length * pesante), 0)) * scala);
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) {
      conti.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nbreve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    conti.richieste += 1;
    conti.corpi.push(corpo);
    const veri = conto(corpo);
    if (massimo !== null && veri > massimo) {
      conti.rifiutate += 1;
      return new Response(JSON.stringify({ error: { message: `This model's maximum context length is ${massimo} tokens. However, you requested ${veri} tokens. Please reduce the length of the messages.` } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const r = risposta(conti.richieste, corpo);
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: r.content ?? null, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) },
      finish_reason: r.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: veri, completion_tokens: 1 } });
  };
  return { fetchDiRete, conti, conto };
}

async function giro(t, { cartella = null, messaggiIniziali, rete, ...resto }) {
  const c = cartella ?? cartellaDiProva('talos-r11-');
  if (!cartella) t.after(() => rimuoviCartellaDiProva(c));
  const eventi = [];
  let esito = null;
  let errore = null;
  try {
    esito = await talosLavora({ cartella: c, modello: MODELLO, chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali, contestoDelProgetto: 'Project files:\n',
      fetchDiRete: rete.fetchDiRete, permessi: 'Full access',
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(e); }, ...resto });
  } catch (e) { errore = e; }
  return { esito, errore, eventi };
}
const racconta = (r) => JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo ?? null, e.compattato ?? null, e.ripiego ?? null, e.ragione ?? null]));
/* un testo di prosa della stima voluta (in token) come messaggio della persona */
const prosa = (token) => {
  const msg = (k) => ({ role: 'user', content: `Ecco il documento: ${'parola '.repeat(k)}` });
  let basso = 1;
  let alto = 1;
  while (compattazione.stimaConPezzi([msg(alto)]) < token) alto *= 2;
  while (basso < alto) { const m = Math.floor((basso + alto) / 2); if (compattazione.stimaConPezzi([msg(m)]) < token) basso = m + 1; else alto = m; }
  return msg(basso);
};
const leggiFile = (percorso) => ({ tool_calls: [{ id: `l-${percorso}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso }) } }] });

/* ------------------------------------------------------------------ R11-3 */

test('R11-3 — la riscrittura sul rifiuto non tocca la storia del kernel: un giro riuscito dopo il rifiuto e uno fallito finiscono con la storia VERA (estende quella di partenza) e un record dentro di lei', async (t) => {
  const coppie = Array.from({ length: 8 }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(214)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(214)}` }]).flat();
  const iniziali = () => [{ role: 'system', content: `You are a coding agent.\n${'regola '.repeat(200)}` }, ...coppie, { role: 'user', content: 'Continua.' }];
  for (const rifiutaSempre of [false, true]) {
    const base = fornitore({ massimo: 8_192 });
    const rete = rifiutaSempre ? { ...base, fetchDiRete: async (u, o) => {
      const corpo = JSON.parse(o.body);
      if (!corpo.tools?.length) return base.fetchDiRete(u, o);
      base.conti.richieste += 1;
      return new Response(JSON.stringify({ error: { message: `This model's maximum context length is 8192 tokens. However, you requested ${Math.max(8_193, base.conto(corpo))} tokens.` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    } } : base;
    const prima = iniziali();
    const r = await giro(t, { messaggiIniziali: prima, rete });
    const storia = r.esito?.messaggiFinali ?? r.errore?.messaggiDelGiro;
    const record = (r.esito?.recordDiCompattazione ?? r.errore?.recordDiCompattazione)?.at(-1);
    assert.ok(base.conti.richieste >= 2, `premessa: rifiuto e ritentativo (${base.conti.richieste})`);
    assert.ok(record, `premessa: la compattazione sul rifiuto c'è stata ${racconta(r)}`);
    assert.equal(rifiutaSempre, r.errore !== null, `premessa: ${rifiutaSempre ? 'il giro fallisce' : 'il giro riesce'} (${r.errore?.message})`);
    assert.ok(Array.isArray(storia) && storia.length >= prima.length, `la storia non è la proiezione accorciata (${storia?.length} contro ${prima.length})`);
    assert.ok(prima.every((m, i) => JSON.stringify(storia[i]) === JSON.stringify(m)), 'la storia del giro estende quella di partenza');
    assert.ok(record.coveredThrough <= storia.length, `il record copre la storia vera (${record.coveredThrough} su ${storia.length})`);
  }
});

/* ------------------------------------------------------------------ R11-1, R11-2, R11-8 */

/* Il caso della CLI: un file di codice letto al giro 1 (il fornitore lo conta più fitto della stima), prosa incollata al giro 2. */
async function codiceLettoPoiProsa(t, { massimo, sopraLaLineaDiProsa, pesante = 1 / 12 }) {
  const cartella = cartellaDiProva('talos-r11-1-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'codice.js'), 'const a = b.map((x) => x * 2); // riga di codice\n'.repeat(1_000));
  const primo = fornitore({ pesante, risposta: (n) => (n === 1 ? leggiFile('codice.js') : { content: 'Fa il parsing dei dati.' }) });
  const g1 = await giro(t, { cartella, messaggiIniziali: [{ role: 'user', content: 'Leggi codice.js e dimmi cosa fa.' }], rete: primo });
  assert.equal(g1.errore, null, `premessa: il giro 1 riesce (${g1.errore?.message})`);
  const corpo = primo.conti.corpi.at(-1);
  const cornice = compattazione.stimaConPezzi(corpo.messages.filter((m) => m.role === 'system')) + compattazione.stimaDegliAttrezzi(corpo.tools);
  const riserva = Math.ceil(massimo * compattazione.RISERVA_USCITA_SENZA_NUMERI);
  const linea = massimo - riserva;
  const nuova = prosa(linea - cornice + sopraLaLineaDiProsa);
  const rete = fornitore({ massimo, pesante });
  const g2 = await giro(t, { cartella, messaggiIniziali: [...g1.esito.messaggiFinali, nuova], rete, scartoMisurato: g1.esito.scartoMisurato,
    stimaAttrezziMisurati: g1.esito.stimaAttrezzi, cartellaIncollati: cartella });
  return { g1, g2, rete, cornice, nuova, scartoG1: g1.esito.scartoMisurato };
}

test('R11-1 — un messaggio che ENTRA (cornice + messaggio sotto la linea certa) dopo un file di codice contato fitto: si accorcia l\'esito vecchio gratis e la richiesta passa; prima era «troppo grande»', async (t) => {
  const { g2, rete, scartoG1 } = await codiceLettoPoiProsa(t, { massimo: 60_000, sopraLaLineaDiProsa: -2_000 });
  assert.ok(scartoG1 > 3_000, `premessa: lo scarto del giro 1 porta la storia pesante (${scartoG1})`);
  assert.ok(rete.conti.rifiutate >= 1, 'premessa: la prima richiesta intera è rifiutata');
  assert.notEqual(g2.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `non è «troppo grande»: ${g2.errore?.message}`);
  assert.equal(g2.errore, null, `il giro finisce (${g2.errore?.message}) ${racconta(g2)}`);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato: bastano i passi gratuiti');
});

test('R11-1 al contrario e R11-2 — un messaggio che NON entra nemmeno da solo è «troppo grande», coi numeri del fornitore; il fornitore che conta il 25% in più li vede nella sua scala', async (t) => {
  const { g2, nuova } = await codiceLettoPoiProsa(t, { massimo: 60_000, sopraLaLineaDiProsa: 3_000 });
  assert.equal(g2.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `fermato (${g2.errore?.message}) ${racconta(g2)}`);
  assert.equal(g2.errore.dati.fonte, 'fornitore');
  const stimata = compattazione.stimaConPezzi([nuova]);
  assert.ok(Math.abs(g2.errore.dati.tokensRichiesta - stimata) / stimata < 0.05, `a scala ~1 i numeri sono quelli della stima (${g2.errore.dati.tokensRichiesta} ~ ${stimata})`);
  /* R11-2: lo stesso giro con un fornitore che conta tutto il 25% in più — i numeri detti sono nella sua scala */
  const cartella = cartellaDiProva('talos-r11-2-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const primo = fornitore({ scala: 1.25 });
  const g1 = await giro(t, { cartella, messaggiIniziali: [{ role: 'user', content: 'Prima domanda.' }], rete: primo });
  const incollato = prosa(30_000);
  const rete = fornitore({ massimo: 16_384, scala: 1.25 });
  const g = await giro(t, { cartella, messaggiIniziali: [...g1.esito.messaggiFinali, incollato], rete, scartoMisurato: g1.esito.scartoMisurato, cartellaIncollati: cartella });
  assert.equal(g.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `fermato (${g.errore?.message})`);
  const stima25 = compattazione.stimaConPezzi([incollato]) * 1.25;
  assert.ok(Math.abs(g.errore.dati.tokensRichiesta - stima25) / stima25 < 0.06,
    `«come lo conta il fornitore»: ${g.errore.dati.tokensRichiesta} ~ ${Math.round(stima25)} (la stima è ${compattazione.stimaConPezzi([incollato])})`);
});

/* La cornice vera di un giro (i `system` che il kernel aggiunge e gli schemi degli attrezzi), misurata con un giro di prova: così una
   scena mette la cornice esattamente dove serve, qualunque cosa il kernel aggiunga. */
const sistemaDi = (caratteri) => ({ role: 'system', content: `You are a coding agent.\n${'regola del progetto '.repeat(Math.max(1, Math.round(caratteri / 20)))}` });
async function misuraCornice(t) {
  const rete = fornitore();
  await giro(t, { messaggiIniziali: [sistemaDi(100), { role: 'user', content: 'Ciao.' }], rete });
  const corpo = rete.conti.corpi[0];
  const altri = corpo.messages.filter((m) => m.role === 'system' && !String(m.content).startsWith('You are a coding agent.'));
  const attrezzi = compattazione.stimaDegliAttrezzi(corpo.tools);
  const cornice = (caratteri) => compattazione.stimaConPezzi([...altri, sistemaDi(caratteri)]) + attrezzi;
  /* i caratteri del `system` della scena perché la cornice valga `token` */
  const caratteriPer = (token) => {
    let basso = 1;
    let alto = 64;
    while (cornice(alto) < token) alto *= 2;
    while (basso < alto) { const m = Math.floor((basso + alto) / 2); if (cornice(m) < token) basso = m + 1; else alto = m; }
    return basso;
  };
  return { cornice, caratteriPer, attrezzi };
}

test('R11-8 — «non entra» sul rifiuto si dice sulla linea CERTA: la cornice fra la finestra meno la riserva e la finestra non entra con lo spazio per la risposta — il pavimento detto porta la riserva ed è oltre la finestra; AL CONTRARIO con la cornice sotto la linea certa non si dice', async (t) => {
  const { cornice, caratteriPer } = await misuraCornice(t);
  const massimo = 8_192;
  const riserva = Math.ceil(massimo * compattazione.RISERVA_USCITA_SENZA_NUMERI);
  const scena = async (tokenCornice) => {
    const caratteri = caratteriPer(tokenCornice);
    const rete = fornitore({ massimo });
    const r = await giro(t, { messaggiIniziali: [sistemaDi(caratteri), ...storia(10), { role: 'user', content: 'Ciao.' }], rete });
    return { r, rete, valore: cornice(caratteri) };
  };
  const { r, rete, valore } = await scena(massimo - Math.round(riserva / 2));
  assert.ok(valore > massimo - riserva && valore < massimo, `premessa: la cornice (${valore}) fra la linea certa e la finestra`);
  assert.ok(rete.conti.rifiutate >= 1, 'premessa: la storia la porta oltre la finestra e il fornitore rifiuta');
  const nonEntra = r.eventi.filter((e) => e.motivo === 'non-entra');
  assert.equal(nonEntra.length, 1, racconta(r));
  assert.ok(nonEntra[0].pavimento > nonEntra[0].finestra, `il pavimento detto è oltre la finestra (${nonEntra[0].pavimento} su ${nonEntra[0].finestra})`);
  assert.equal(nonEntra[0].riserva, riserva, `la riserva, intera (${nonEntra[0].riserva})`);
  /* AL CONTRARIO: la cornice sotto la linea certa — si accorcia la storia e il giro va avanti, niente «non entra» */
  const sotto = await scena(massimo - riserva * 2);
  assert.ok(sotto.rete.conti.rifiutate >= 1, 'premessa: anche qui la storia porta la richiesta oltre la finestra');
  assert.equal(sotto.r.eventi.filter((e) => e.motivo === 'non-entra').length, 0, racconta(sotto.r));
  assert.equal(sotto.r.errore, null, `il giro finisce (${sotto.r.errore?.message})`);
});

/* ------------------------------------------------------------------ R11-4, R11-11 (funzioni pure) */

test('R11-4 — con la base comune le ricariche si CONTANO: il fine giro del giro prima e il riassunto nel giro portano lo stesso numero e sono due; AL CONTRARIO senza base si uniscono per giro (come prima)', () => {
  const base = { ricariche: [2], modello: MODELLO };
  const delGiro = { ricariche: [2, 3], modello: MODELLO };
  const delRegistro = { ricariche: [2, 3], modello: MODELLO };
  const unito = compattazione.unisciFreni(delGiro, delRegistro, base);
  assert.deepEqual(unito.ricariche, [2, 3, 3]);
  assert.ok(compattazione.frenoTirato(unito), 'tre riassunti pagati in due giri: tirato');
  assert.deepEqual(compattazione.unisciFreni(delGiro, delRegistro).ricariche, [2, 3], 'senza base: per giro');
  /* una ricarica già unita durante il giro (nella copia del giro) non si conta due volte: la base è l'ultima copia vista */
  assert.deepEqual(compattazione.unisciFreni({ ricariche: [2, 3, 3], modello: MODELLO }, { ricariche: [2, 3], modello: MODELLO }, { ricariche: [2, 3] }).ricariche, [2, 3, 3]);
  /* partiti senza freno: la base è vuota, non ignota */
  assert.deepEqual(compattazione.unisciFreni({ ricariche: [4] }, { ricariche: [4] }, null).ricariche, [4, 4]);
  /* il riferimento del riarmo: il più recente */
  assert.equal(compattazione.unisciFreni({ mezzoAlVerdetto: 500 }, { mezzoAlVerdetto: 900 }, {}).mezzoAlVerdetto, 900);
});

test('R11-11 — i colpi della copia che li ha CAMBIATI: una lettura sotto la soglia del giro non viene annullata dai colpi vecchi del registro; AL CONTRARIO un colpo nuovo del registro resta', () => {
  const base = { colpi: 1, modello: MODELLO };
  const azzerato = compattazione.unisciFreni({ colpi: 0, modello: MODELLO }, { colpi: 1, modello: MODELLO }, base);
  assert.equal(azzerato.colpi, 0);
  assert.ok(!compattazione.frenoTirato(azzerato));
  const colpoDelRegistro = compattazione.unisciFreni({ colpi: 1, modello: MODELLO }, { colpi: 2, at: 'R', detto: true, modello: MODELLO }, base);
  assert.deepEqual([colpoDelRegistro.colpi, colpoDelRegistro.at, colpoDelRegistro.detto], [2, 'R', true]);
  /* tutte e due cambiate: i più alti */
  assert.equal(compattazione.unisciFreni({ colpi: 0 }, { colpi: 2 }, base).colpi, 2);
});

/* ------------------------------------------------------------------ R11-4 nel giro, R11-6, R11-9 */

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 2; while (stima(storia(c + 1)) < token) c += 1; return c; };
function conTetto(t, valore) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
}
const inEmergenza = () => [...storia(coppiePer(6_500)), { role: 'user', content: 'Adesso continua' }];

test('R11-4 nel giro — una tirata che arriva DETTA dal registro col riferimento vecchio si misura da adesso: il giro non si riarma e non paga; AL CONTRARIO la stessa tirata già sua si riarma per crescita e paga (Z-K2 c)', async (t) => {
  conTetto(t, 4_000);
  const vecchio = { colpi: 1, mezzoAlVerdetto: 10, ricariche: [], modello: MODELLO };
  const tiratoDalRegistro = { colpi: 2, mezzoAlVerdetto: 10, ricariche: [], at: 'R', detto: true, modello: MODELLO };
  const rete = fornitore({ conAttrezzi: false });
  const r = await giro(t, { messaggiIniziali: inEmergenza(), rete, freno: vecchio, versioneGiro: 5, frenoVivo: () => tiratoDalRegistro, scartoMisurato: 0 });
  assert.equal(rete.conti.riassunti, 0, `niente pagato subito dopo «in pausa» ${racconta(r)}`);
  assert.ok(!r.eventi.some((e) => e.motivo === 'freno'), 'e non lo ridice');
  const suo = fornitore({ conAttrezzi: false });
  await giro(t, { messaggiIniziali: inEmergenza(), rete: suo, freno: tiratoDalRegistro, versioneGiro: 5, frenoVivo: () => tiratoDalRegistro, scartoMisurato: 0 });
  assert.ok(suo.conti.riassunti >= 1, 'AL CONTRARIO: la tirata è sua, il tratto è cresciuto del 10% della soglia dal verdetto: si riarma e paga');
});

test('R11-9 — la frase del freno viene DOPO la riga della compattazione che l\'ha fatto tirare (la terza ricarica)', async (t) => {
  conTetto(t, 4_000);
  const rete = fornitore({ conAttrezzi: false });
  const r = await giro(t, { messaggiIniziali: inEmergenza(), rete, freno: { ricariche: [4, 5], modello: MODELLO }, versioneGiro: 5, scartoMisurato: 0 });
  assert.equal(rete.conti.riassunti, 1, `premessa: un riassunto pagato, la terza ricarica ${racconta(r)}`);
  const fini = r.eventi.filter((e) => e.tipo === 'compattazione-fine');
  const iCompattata = fini.findIndex((e) => e.compattato === true);
  const iFreno = fini.findIndex((e) => e.motivo === 'freno');
  assert.ok(iCompattata >= 0 && iFreno >= 0, racconta(r));
  assert.ok(iCompattata < iFreno, `prima «compattato», poi «in pausa» ${racconta(r)}`);
});

test('R11-6 — freno tirato all\'emergenza, richiesta certamente oltre la finestra DICHIARATA: il riassunto senza modello (ragione «freno») PRIMA di mandare, nessun rifiuto, niente pagato; AL CONTRARIO fra l\'emergenza e la finestra parte com\'è', async (t) => {
  const finestra = 8_000;
  const soglie = compattazione.calcolaSoglie({ finestraToken: finestra });
  const tirato = { colpi: 2, at: 'X', detto: true, modello: MODELLO, finestra };
  const oltre = [...storia(coppiePer(Math.round(finestra * 1.15))), { role: 'user', content: 'Adesso continua' }];
  const rete = fornitore({ massimo: finestra, conAttrezzi: false });
  const r = await giro(t, { messaggiIniziali: oltre, rete, finestraToken: finestra, freno: tirato, scartoMisurato: 0 });
  assert.equal(rete.conti.rifiutate, 0, `nessuna richiesta mandata oltre la finestra ${racconta(r)}`);
  assert.equal(rete.conti.riassunti, 0, 'niente pagato');
  assert.ok(r.eventi.some((e) => e.compattato === true && e.ripiego === true && e.ragione === 'freno'), `il riassunto senza modello, ragione «freno» ${racconta(r)}`);
  assert.equal(r.errore, null, `il giro finisce (${r.errore?.message})`);
  /* AL CONTRARIO: sopra l'emergenza ma sotto la finestra — non è certo, decide il fornitore: niente scritto, parte com'è */
  const fra = [...storia(coppiePer(Math.round((soglie.emergenza + finestra) / 2))), { role: 'user', content: 'Adesso continua' }];
  assert.ok(stima(fra) > soglie.emergenza && stima(fra) < finestra, `premessa: fra emergenza e finestra (${stima(fra)})`);
  const reteFra = fornitore({ massimo: finestra, conAttrezzi: false });
  const f = await giro(t, { messaggiIniziali: fra, rete: reteFra, finestraToken: finestra, freno: tirato, scartoMisurato: 0 });
  assert.ok(!f.eventi.some((e) => e.compattato === true), `niente scritto ${racconta(f)}`);
  assert.deepEqual([reteFra.conti.richieste, reteFra.conti.rifiutate], [1, 0], 'una richiesta, accettata');
});

/* ------------------------------------------------------------------ R11-7 */

test('R11-7 — la stessa richiesta già rifiutata (stessa impronta) col rifiuto ricordato: con «Invia come allegato» parte SUBITO allegata, senza ripartire uguale; senza, si ferma prima di mandare; AL CONTRARIO un\'altra richiesta entro la finestra parte', async (t) => {
  const cartella = cartellaDiProva('talos-r11-7-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const incollato = prosa(30_000);
  const rifiutoNoto = { finestra: 16_384, scala: 1.25, impronta: nomeDellaRichiestaSalvata(incollato.content) };
  const storiaPrima = [{ role: 'user', content: 'Prima domanda.' }, { role: 'assistant', content: 'Risposta.' }];
  const allegata = fornitore({ massimo: 16_384, scala: 1.25 });
  const a = await giro(t, { cartella, messaggiIniziali: [...storiaPrima, incollato], rete: allegata, rifiutoNoto, allegaSeTroppoGrande: true, cartellaIncollati: cartella });
  assert.equal(allegata.conti.rifiutate, 0, `nessun rifiuto: la richiesta rifiutata non riparte uguale (${a.errore?.message})`);
  assert.equal(a.errore, null, `il giro finisce (${a.errore?.message})`);
  assert.ok(allegata.conti.corpi[0].messages.every((m) => m.content !== incollato.content), 'la prima richiesta porta la forma allegata, non il testo intero');
  const ferma = fornitore({ massimo: 16_384, scala: 1.25 });
  const f = await giro(t, { cartella, messaggiIniziali: [...storiaPrima, incollato], rete: ferma, rifiutoNoto, cartellaIncollati: cartella });
  assert.equal(f.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `fermato prima di mandare (${f.errore?.message})`);
  assert.equal(ferma.conti.richieste, 0, 'niente partito');
  /* AL CONTRARIO: un testo diverso e piccolo, col rifiuto ricordato — parte */
  const piccola = fornitore({ massimo: 16_384, scala: 1.25 });
  const p = await giro(t, { cartella, messaggiIniziali: [...storiaPrima, { role: 'user', content: 'Una domanda breve.' }], rete: piccola, rifiutoNoto, cartellaIncollati: cartella });
  assert.equal(p.errore, null, `parte (${p.errore?.message})`);
  assert.equal(piccola.conti.richieste, 1);
});

test('R11-7 con la finestra nota — l\'impronta conta: la STESSA richiesta rifiutata, che nella nostra stima entra nella finestra ma nella scala del fornitore no, parte subito allegata; AL CONTRARIO una richiesta diversa della stessa misura parte com\'è (decide il fornitore)', async (t) => {
  const { cornice } = await misuraCornice(t);
  const finestra = 16_384;
  const daRichiesta = Math.round(finestra * 0.88) - cornice(100); // nella nostra stima entra, ×1,25 no
  const testo = prosa(daRichiesta);
  const rifiutoNoto = { finestra, scala: 1.25, impronta: nomeDellaRichiestaSalvata(testo.content) };
  const cartella = cartellaDiProva('talos-r11-7-nota-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const stessa = fornitore({ massimo: finestra, scala: 1.25 });
  const a = await giro(t, { cartella, messaggiIniziali: [sistemaDi(100), testo], rete: stessa, finestraToken: finestra, rifiutoNoto,
    allegaSeTroppoGrande: true, cartellaIncollati: cartella });
  assert.equal(stessa.conti.rifiutate, 0, `la stessa richiesta non riparte uguale (${a.errore?.message})`);
  assert.equal(a.errore, null, `il giro finisce (${a.errore?.message})`);
  assert.ok(stessa.conti.corpi[0].messages.every((m) => m.content !== testo.content), 'parte la forma allegata');
  /* AL CONTRARIO: un testo diverso della stessa misura — niente impronta, la scala non si applica (al più 1): parte com'è */
  const diversa = prosa(daRichiesta);
  diversa.content = diversa.content.replace('Ecco il documento:', 'Ecco un altro documento:');
  const altra = fornitore({ massimo: finestra, scala: 1.25 });
  await giro(t, { cartella, messaggiIniziali: [sistemaDi(100), diversa], rete: altra, finestraToken: finestra, rifiutoNoto, allegaSeTroppoGrande: true, cartellaIncollati: cartella });
  assert.ok(altra.conti.corpi[0].messages.some((m) => m.content === diversa.content), 'la prima richiesta porta il testo intero');
});

test('R11-7 nel servizio — il rifiuto ricordato arriva al giro attraverso il servizio; AL CONTRARIO senza, niente', async () => {
  const rifiutoNoto = { finestra: 16_384, scala: 1.25, impronta: 'abc' };
  const ricevuti = [];
  const talosLavoraFn = async (input) => { ricevuti.push(input.rifiutoNoto); return { comeFinita: 'concluso', messaggiFinali: [], detto: 'ok' }; };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, rifiutoNoto, talosLavoraFn });
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.deepEqual(ricevuti, [rifiutoNoto, undefined]);
});

/* ------------------------------------------------------------------ il registro: R11-4 a fine giro, R11-5, R11-7 */

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
const coppie = (n, l = 600) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(l / 7)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(l / 7)}` }]).flat();
const storiaLunga = () => [{ role: 'system', content: 's' }, { role: 'user', content: 'Consegna' }, ...coppie(14, 1_400), { role: 'user', content: 'ultima' }, { role: 'assistant', content: 'ok' }];
function registro(t, opzioni = {}) {
  const cartellaStore = cartellaDiProva('talos-r11-registro-');
  const giri = [];
  const riassunti = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({ input, concludi(storiaFinale, extra = {}) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storiaFinale, recordDiCompattazione: [], ...extra } }); },
      fallisci(extra = {}) { input.onEvento({ type: 'RunError', message: 'x', code: 'REQUEST_TOO_LARGE' }); risolvi({ threadId: 't', runId: 'r', ok: false, esito: null, erroreInterno: 'x', codiceErrore: 'REQUEST_TOO_LARGE', ...extra }); } });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  const riassumiPerCompattazioneFn = opzioni.riassumiPerCompattazioneFn ?? (async () => { riassunti.push(1); return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; });
  let ms = Date.parse('2026-10-23T18:00:00.000Z');
  const crea = () => createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: MODELLO, chiave: 'k', riassumiPerCompattazioneFn, clock: () => new Date(ms += 1000), finestraTokenFn: () => 8_000, ...opzioni });
  const assesta = async (sessionId) => { await attendiScritture({ cartellaStore, sessionId }); await new Promise((ok) => setTimeout(ok, 80)); await attendiScritture({ cartellaStore, sessionId }); };
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { crea, giri, riassunti, assesta, cartellaStore };
}
const righe = (cartellaStore, sessionId, tipo) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r)).filter((r) => r.tipo === tipo);
const righeFreno = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n')
  .filter((r) => r.includes('"talos.compattazione"') && r.includes('"motivo":"freno"'));

test('R11-4 nel registro — il fine giro del giro prima e il riassunto del giro portano lo stesso numero: a fine giro sono TRE ricariche (la base è la copia vista dal giro), il freno tira e lo si dice una volta', async (t) => {
  let rilascia;
  const trattenuto = new Promise((r) => { rilascia = r; });
  const amb = registro(t, { riassumiPerCompattazioneFn: async () => { await trattenuto; return { scelta: { role: 'assistant', content: '## Riassunto\nR' }, finishReason: 'stop', usage: null }; } });
  const reg = amb.crea();
  const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
  const v0 = amb.giri[0].input.versioneGiro;
  amb.giri[0].concludi(storiaLunga(), { freno: { ricariche: [v0], modello: MODELLO, finestra: 8_000 } });
  await amb.assesta(sessionId);
  reg.resume(sessionId, 'ancora');
  const giro1 = amb.giri.at(-1);
  const v1 = giro1.input.versioneGiro;
  rilascia();
  await new Promise((ok) => setTimeout(ok, 200));
  await amb.assesta(sessionId);
  const visto = giro1.input.frenoVivo();
  assert.deepEqual(visto?.ricariche, [v0, v1], `premessa: il fine giro del giro prima ha pagato nel giro ${v1} (${JSON.stringify(visto)})`);
  /* il giro ha unito la copia del registro e ha pagato il suo riassunto, nello stesso giro */
  giro1.concludi([...storiaLunga(), { role: 'user', content: 'ancora' }, { role: 'assistant', content: 'ok' }],
    { freno: { ricariche: [v0, v1, v1], modello: MODELLO, finestra: 8_000 }, frenoVisto: visto });
  await amb.assesta(sessionId);
  const ultimo = righe(amb.cartellaStore, sessionId, 'freno').at(-1)?.freno;
  assert.deepEqual(ultimo?.ricariche, [v0, v1, v1], `tre ricariche, non due (${JSON.stringify(ultimo)})`);
  assert.ok(ultimo?.detto === true && compattazione.frenoTirato(ultimo), 'tirato e detto');
  assert.equal(righeFreno(amb.cartellaStore, sessionId).length, 1, 'detto una volta');
});

test('R11-5 — il riassunto pagato che il giro ha giudicato inutile sul record di adesso non si ripaga uguale a fine giro; AL CONTRARIO, cresciuta la conversazione (o senza ricordo), il fine giro paga', async (t) => {
  const corsa = async (riassuntoInefficace) => {
    const amb = registro(t);
    const reg = amb.crea();
    const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
    amb.giri[0].concludi(storiaLunga(), riassuntoInefficace ? { riassuntoInefficace } : {});
    await amb.assesta(sessionId);
    await new Promise((ok) => setTimeout(ok, 200));
    await amb.assesta(sessionId);
    return amb.riassunti.length;
  };
  const base = compattazione.chiaveBaseDelRecord(null);
  assert.equal(await corsa({ token: 1_000_000, base }), 0, 'giudicato inutile sullo stesso record e la conversazione non è cresciuta: niente fine giro');
  assert.ok(await corsa(null) >= 1, 'AL CONTRARIO senza ricordo il fine giro paga');
  assert.ok(await corsa({ token: 10, base }) >= 1, 'AL CONTRARIO cresciuta oltre il 10% dal giudizio: si riprova');
  assert.ok(await corsa({ token: 1_000_000, base: 'un-altro-record' }) >= 1, 'AL CONTRARIO su un altro record il ricordo non vale');
});

test('R11-7 nel registro — il rifiuto coi numeri si ricorda per il modello della sessione: il giro dopo riceve la finestra del fornitore (il catalogo non la sa) e il rifiuto con l\'impronta; AL CONTRARIO un catalogo più piccolo vince', async (t) => {
  const corsa = async (catalogo) => {
    const amb = registro(t, { finestraTokenFn: () => catalogo });
    const reg = amb.crea();
    const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
    amb.giri[0].fallisci({ messaggiDelGiro: storiaLunga(),
      statoDelGiro: { rifiutoDelFornitore: { finestra: 16_384, scala: 1.25, impronta: 'abc' } } });
    await amb.assesta(sessionId);
    reg.resume(sessionId, 'riprova');
    assert.equal(amb.giri.length, 2, 'premessa: il giro dopo è partito');
    return amb.giri.at(-1).input;
  };
  const ignota = await corsa(null);
  assert.equal(ignota.finestraToken, 16_384, `la finestra del fornitore (${ignota.finestraToken})`);
  assert.deepEqual(ignota.rifiutoNoto, { finestra: 16_384, scala: 1.25, impronta: 'abc' });
  const piuPiccolo = await corsa(8_000);
  assert.equal(piuPiccolo.finestraToken, 8_000, 'il catalogo più piccolo resta');
  const piuGrande = await corsa(128_000);
  assert.equal(piuGrande.finestraToken, 16_384, 'il catalogo più grande cede alla finestra detta dal fornitore');
});

/*
 * Revisione 12 della CLI (23/10/2026 sera), le cure del registro: R12-3 (un rifiuto strano non stringe la sessione per sempre), R12-5 (un
 * rifiuto per modello), R12-2 (il ripiego dal motore detto una volta per sessione finché non guarisce). Stesso registro di R11-7.
 */
test('R12-3 nel registro — un rifiuto con una finestra più PICCOLA di una richiesta già accettata dallo stesso modello non si ricorda; AL CONTRARIO uno coerente sì', async (t) => {
  const corsa = async (accettato) => {
    const amb = registro(t, { finestraTokenFn: () => null });
    const reg = amb.crea();
    const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
    amb.giri[0].concludi(storiaLunga(), { massimoAccettato: accettato });
    await amb.assesta(sessionId);
    reg.resume(sessionId, 'ancora');
    amb.giri.at(-1).fallisci({ messaggiDelGiro: storiaLunga(), statoDelGiro: { rifiutoDelFornitore: { finestra: 12_288, scala: 1, impronta: null } } });
    await amb.assesta(sessionId);
    reg.resume(sessionId, 'riprova');
    return amb.giri.at(-1).input;
  };
  /* il caso della CLI: TURN#4 accettato a 14.058, TURN#5 rifiutato con «massimo 12.288» */
  const strano = await corsa(14_058);
  assert.equal(strano.rifiutoNoto, undefined, `un rifiuto contro l'evidenza non si ricorda (${JSON.stringify(strano.rifiutoNoto)})`);
  assert.notEqual(strano.finestraToken, 12_288, 'e la finestra della sessione non si stringe');
  const coerente = await corsa(10_000);
  assert.deepEqual(coerente.rifiutoNoto, { finestra: 12_288, scala: 1, impronta: null }, 'AL CONTRARIO: sotto il rifiuto, il rifiuto vale');
  assert.equal(coerente.finestraToken, 12_288);
});

test('R12-5 nel registro — un rifiuto per MODELLO: il rifiuto di un secondo modello non cancella quello del primo; AL CONTRARIO il modello nuovo non eredita la finestra dell\'altro', async (t) => {
  const amb = registro(t, { finestraTokenFn: () => null });
  const reg = amb.crea();
  const ALTRO = 'openai/gpt-5.5-mini';
  const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].fallisci({ messaggiDelGiro: storiaLunga(), statoDelGiro: { rifiutoDelFornitore: { finestra: 16_384, scala: 1.25, impronta: 'a' } } });
  await amb.assesta(sessionId);
  assert.notEqual((await reg.aggiornaImpostazioni(sessionId, { modello: ALTRO }))?.ok, false, 'premessa: il modello cambia');
  reg.resume(sessionId, 'col secondo');
  const sulSecondo = amb.giri.at(-1).input;
  assert.equal(sulSecondo.rifiutoNoto, undefined, 'AL CONTRARIO: il secondo modello non eredita il rifiuto del primo');
  amb.giri.at(-1).fallisci({ messaggiDelGiro: storiaLunga(), statoDelGiro: { rifiutoDelFornitore: { finestra: 8_000, scala: 1, impronta: 'b' } } });
  await amb.assesta(sessionId);
  assert.notEqual((await reg.aggiornaImpostazioni(sessionId, { modello: MODELLO }))?.ok, false, 'premessa: si torna al primo');
  reg.resume(sessionId, 'di nuovo col primo');
  assert.deepEqual(amb.giri.at(-1).input.rifiutoNoto, { finestra: 16_384, scala: 1.25, impronta: 'a' }, 'il primo modello ritrova il SUO rifiuto');
});

test('R12-2 nel registro — il ripiego dal motore già detto viaggia al giro dopo, e un giro col motore sano lo azzera', async (t) => {
  const amb = registro(t);
  const reg = amb.crea();
  const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].concludi(storiaLunga(), { ripiegoDetto: 'CTX_CONTEXT_OVERFLOW' });
  await amb.assesta(sessionId);
  reg.resume(sessionId, 'ancora');
  assert.equal(amb.giri.at(-1).input.ripiegoDetto, 'CTX_CONTEXT_OVERFLOW', 'il giro dopo sa che è già stato detto');
  amb.giri.at(-1).concludi(storiaLunga(), { ripiegoDetto: null });
  await amb.assesta(sessionId);
  reg.resume(sessionId, 'e ancora');
  assert.equal(amb.giri.at(-1).input.ripiegoDetto, undefined, 'AL CONTRARIO: guarito, il prossimo guasto si dice di nuovo');
});

test('R12-3 nel registro, l\'altro ordine — un rifiuto già ricordato smette di valere quando lo stesso modello accetta DOPO una richiesta più grande della sua finestra', async (t) => {
  const amb = registro(t, { finestraTokenFn: () => null });
  const reg = amb.crea();
  const { sessionId } = reg.avvia('task-vero', { modelloScelto: MODELLO });
  amb.giri[0].fallisci({ messaggiDelGiro: storiaLunga(), statoDelGiro: { rifiutoDelFornitore: { finestra: 12_288, scala: 1, impronta: null } } });
  await amb.assesta(sessionId);
  reg.resume(sessionId, 'ancora');
  assert.deepEqual(amb.giri.at(-1).input.rifiutoNoto, { finestra: 12_288, scala: 1, impronta: null }, 'premessa: ricordato');
  amb.giri.at(-1).concludi(storiaLunga(), { massimoAccettato: 14_058 });
  await amb.assesta(sessionId);
  reg.resume(sessionId, 'e ancora');
  assert.equal(amb.giri.at(-1).input.rifiutoNoto, undefined, 'smentito dai fatti: non vale più');
  assert.notEqual(amb.giri.at(-1).input.finestraToken, 12_288);
});
