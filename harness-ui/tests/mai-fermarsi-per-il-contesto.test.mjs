/*
 * Decisione 245 (owner 05/11/2026): il modello non si ferma più «per il contesto». DeepSeek dentro TALOS chiudeva il giro dicendo che il
 * contesto era agli ultimi token, mentre TALOS compatta da solo. Forma con Performance (P1-P4), Mobile (M1-M4) e CLI (C1-C4):
 * `in-corso/FORMA-MAI-FERMARSI-PER-IL-CONTESTO-2026-11-05.md`. Tre parti: la frase nelle istruzioni, i marcatori neutri, UN richiamo.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  talosLavora, diceDiFermarsiPerIlContesto, decidiFermataPerContesto, NOTA_FERMATA_CONTESTO, storiaDelGiroFallito,
  attrezziDopoLUltimoUser,
} from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { MARCATORE_BLOCCO_TAGLIATO } from '../src/kernel/ricarica-post-compact.mjs';
import { registraRiga, registraRigaSync, leggiRegistro, attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const DEEPSEEK = 'Riprendo dal punto 1 al prossimo giro: il contesto di questa sessione è agli ultimi token e non voglio lasciare modifiche a metà nell\'albero.';
const verde = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
const shell = (comando, id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] });
const testo = (t) => ({ content: t });
const VUOTA = { vuota: true };
const enc = new TextEncoder();
const flussoMuto = () => new Response(new ReadableStream({
  start(c) {
    for (const f of [{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, { choices: [], usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 } }]) {
      c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
    }
    c.enqueue(enc.encode('data: [DONE]\n\n'));
    c.close();
  },
}), { headers: { 'content-type': 'text/event-stream' } });

function rete(risposte, { primaDiRispondere } = {}) {
  const corpi = [];
  const fetchDiRete = async (_url, o) => {
    corpi.push(JSON.parse(o.body));
    primaDiRispondere?.(corpi.length);
    const r = risposte[corpi.length - 1] ?? testo('Chiuso.');
    /* una risposta vuota vera arriva come flusso muto (come `vuotaMuta` in risposta-vuota.test.mjs): così la riconosce il kernel */
    if (r.vuota) return flussoMuto();
    const fine = r.finish ?? (r.tool_calls ? 'tool_calls' : 'stop');
    return new Response(JSON.stringify({ choices: [{ index: 0, finish_reason: fine, message: { role: 'assistant', content: r.content ?? null, ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}) } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { corpi, fetchDiRete };
}
const giro = (risposte, extra = {}, opzioniRete = {}) => {
  const r = rete(risposte, opzioniRete); const eventi = [];
  const esito = talosLavora({ cartella: cartellaDiProva('talos-mai-fermarsi-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y', permessi: 'bypass', fetchDiRete: r.fetchDiRete, onGiro: (e) => eventi.push(e), ...extra });
  return { ...r, eventi, esito };
};
const richiami = (eventi) => eventi.filter((e) => e.tipo === 'continuazione' && e.motivo === 'fermata-contesto');
const conLaNota = (corpo) => corpo.messages.some((m) => m.role === 'user' && m.content === NOTA_FERMATA_CONTESTO);

/* ───────────── riconoscimento (parte 3) ───────────── */

test('MFC-01: la frase vera di DeepSeek si riconosce', () => {
  assert.equal(diceDiFermarsiPerIlContesto(DEEPSEEK), true);
});

test('MFC-02 (M1) AL CONTRARIO: la finestra detta come fatto, o un «riprendo domani» senza contesto, non scattano', () => {
  assert.equal(diceDiFermarsiPerIlContesto('la finestra di contesto di questo modello è di 128k token'), false);
  assert.equal(diceDiFermarsiPerIlContesto('riprendo domani dal punto 1'), false);
  /* le due parole in frasi DIVERSE non bastano */
  assert.equal(diceDiFermarsiPerIlContesto('La finestra di contesto è di 128k token. Riprendo domani dal punto 1.'), false);
});

test('MFC-03 (C3) AL CONTRARIO: il motore del contesto che riprende il riassunto non è il modello che si ferma', () => {
  assert.equal(diceDiFermarsiPerIlContesto('The context engine now resumes the summary on the next turn'), false);
  assert.equal(diceDiFermarsiPerIlContesto('The context engine now resumes the summary on the next turn.'), false);
});

test('MFC-04 (M1) inglese misto a italiano, nei due versi', () => {
  assert.equal(diceDiFermarsiPerIlContesto('Il context è quasi pieno, so I\'ll continue nel prossimo giro.'), true);
  assert.equal(diceDiFermarsiPerIlContesto('The context window di questo modello è 128k tokens.'), false);
  assert.equal(diceDiFermarsiPerIlContesto('I\'m running low on context, mi fermo qui.'), true);
});

test('MFC-05: le forme inglesi della fermata per il contesto', () => {
  for (const t of [
    'I\'m running out of context, so I\'ll stop here and continue in the next turn.',
    'Given the remaining context, I will pause here and resume next turn.',
    'Stopping here because the context window is nearly full.',
    'With only a few tokens left I’ll pick this up in the next turn.',
    'Il contesto è quasi esaurito: proseguirò al prossimo giro.',
  ]) assert.equal(diceDiFermarsiPerIlContesto(t), true, t);
  for (const t of [
    'I fixed the context menu and the tests are green.',
    /* i confini di parola: «contextual» non è «context», «continuous» non è «continuo» */
    'I\'ll continue with the contextual help panel.',
    'Il test continuous-integration è verde: il contestuale resta.',
    'The context window is 200k tokens.',
    'Next turn the engine will resume.',
    '',
  ]) assert.equal(diceDiFermarsiPerIlContesto(t), false, t);
  assert.equal(diceDiFermarsiPerIlContesto(null), false);
});

test('MFC-06 (P3): 50 KB di testo si guardano in meno di 5 ms, anche nel caso peggiore', () => {
  const peggiore = 'context token contesto ultimi token I will '.repeat(1_300).slice(0, 50_000);
  const normale = `${'Ho letto il file e ho corretto la funzione del parser. '.repeat(900)}`.slice(0, 50_000 - DEEPSEEK.length) + DEEPSEEK;
  for (const t of [peggiore, normale]) diceDiFermarsiPerIlContesto(t); // a caldo
  const tempi = [];
  for (const t of [peggiore, normale]) {
    const misure = [];
    for (let i = 0; i < 9; i += 1) { const t0 = process.hrtime.bigint(); diceDiFermarsiPerIlContesto(t); misure.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    misure.sort((a, b) => a - b);
    tempi.push(misure[4]);
  }
  console.log(`MFC-06 mediane: peggiore ${tempi[0].toFixed(3)} ms, normale ${tempi[1].toFixed(3)} ms`);
  for (const ms of tempi) assert.ok(ms < 5, `${ms} ms`);
  assert.equal(diceDiFermarsiPerIlContesto(normale), true, 'la frase in fondo a 50 KB si trova');
});

/* ───────────── la decisione pura (stessa forma di decidiRispostaVuota) ───────────── */

test('MFC-07: decidiFermataPerContesto richiama UNA volta, e mai fermato, al tetto, senza attrezzi o dopo un\'altra chiamata in più', () => {
  const base = { testo: DEEPSEEK, dopoAttrezzi: true, fermato: false, alTettoDeiPassi: false, altraChiamataInPiu: false };
  const stato = { richiamato: false };
  assert.deepEqual(decidiFermataPerContesto(stato, base), { azione: 'richiama' });
  assert.deepEqual(decidiFermataPerContesto(stato, base), { azione: 'fine' }, 'una volta per giro');
  for (const [k, v] of [['fermato', true], ['alTettoDeiPassi', true], ['altraChiamataInPiu', true], ['dopoAttrezzi', false], ['testo', 'Fatto.']]) {
    const s = { richiamato: false };
    assert.deepEqual(decidiFermataPerContesto(s, { ...base, [k]: v }), { azione: 'fine' }, k);
    assert.equal(s.richiamato, false, k);
  }
});

/* ───────────── nel ciclo ───────────── */

test('MFC-08: dopo gli attrezzi, la fermata per il contesto si richiama una volta con la nota; la risposta resta nella storia', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), testo('Fatto: punto 1 corretto.')]);
  const e = await g.esito;
  assert.equal(g.corpi.length, 3);
  assert.equal(conLaNota(g.corpi[2]), true);
  assert.equal(conLaNota(g.corpi[1]), false);
  assert.equal(richiami(g.eventi).length, 1);
  assert.equal(e.comeFinita, 'concluso');
  assert.ok(e.messaggiFinali.some((m) => m.role === 'assistant' && m.content === DEEPSEEK), 'la risposta che si fermava resta');
});

test('MFC-09: se si ferma di nuovo, il giro si chiude come oggi (una chiamata in più, non due)', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), testo(DEEPSEEK)]);
  const e = await g.esito;
  assert.equal(g.corpi.length, 3);
  assert.equal(richiami(g.eventi).length, 1);
  assert.equal(e.comeFinita, 'concluso');
});

test('MFC-10 AL CONTRARIO: senza attrezzi nel giro non si richiama', async () => {
  const g = giro([testo(DEEPSEEK)]);
  await g.esito;
  assert.equal(g.corpi.length, 1);
  assert.equal(richiami(g.eventi).length, 0);
});

test('MFC-11 (C2, M2) AL CONTRARIO: dopo uno Stop (persona, sistema, tempo: tutti `controller.abort()`) non si richiama', async () => {
  const controllo = new AbortController();
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK)], { segnaleStop: controllo.signal }, { primaDiRispondere: (n) => { if (n === 2) controllo.abort(); } });
  await g.esito.catch(() => {});
  assert.equal(g.corpi.length, 2);
  assert.equal(richiami(g.eventi).length, 0);
});

test('MFC-12 (C2) AL CONTRARIO: al tetto dei passi non si richiama (il richiamo conta nel tetto)', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK)], { _giriMassimiInterno: 2 });
  await g.esito;
  assert.equal(g.corpi.length, 2);
  assert.equal(richiami(g.eventi).length, 0);
});

test('MFC-13 (P3): una risposta vuota dopo il richiamo chiude il giro come oggi, senza spinte né ritentativi', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), VUOTA], { onDelta: () => {} });
  const e = await g.esito;
  assert.equal(g.corpi.length, 3, 'nessuna richiesta oltre il richiamo');
  assert.equal(e.comeFinita, 'concluso');
  assert.notEqual(e.messaggiFinali.at(-1)?.content, NOTA_FERMATA_CONTESTO, 'la nota non resta in coda');
  assert.equal(e.messaggiFinali.at(-1)?.content, DEEPSEEK);
});

test('MFC-14 (P3) AL CONTRARIO: dopo la spinta della risposta vuota nello stesso giro non si richiama', async () => {
  const g = giro([shell(verde, 'a'), VUOTA, testo(DEEPSEEK)], { onDelta: () => {} });
  await g.esito;
  assert.equal(g.corpi.length, 3);
  assert.equal(richiami(g.eventi).length, 0);
});

/* R2 della revisione di 245 (05/11/2026): dopo il richiamo il modello ha LAVORATO con gli attrezzi, poi è tornato vuoto. Il P3 di prima
   («nessun gradino dopo il richiamo») lo chiudeva con l'errore, buttando il lavoro nuovo. Come Hermes (`agent_runtime_helpers.py:3358`
   `tool_results_this_turn`: la finestra degli attrezzi si apre dopo l'ULTIMO messaggio user, note comprese), la spinta della risposta vuota
   torna disponibile, una volta sola nel giro. */
test('MFC-18 (R2): dopo il richiamo, attrezzi e poi una risposta vuota ⇒ la spinta, una volta, e il giro si chiude sulla risposta', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), shell(verde, 'b'), VUOTA, testo('Fatto: prove verdi.')], { onDelta: () => {} });
  const e = await g.esito;
  assert.equal(g.corpi.length, 5, 'attrezzo, fermata, richiamo con attrezzo, vuota, spinta');
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(e.messaggiFinali.at(-1)?.content, 'Fatto: prove verdi.');
  assert.equal(richiami(g.eventi).length, 1);
  assert.ok(g.corpi[4].messages.some((m) => m.role === 'user' && /returned an empty response/u.test(String(m.content))), 'la quinta richiesta porta la spinta');
});

test('MFC-18c (R2): la spinta dopo il richiamo è UNA sola nel giro: attrezzi, vuota, spinta, attrezzi, vuota ⇒ errore onesto', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), shell(verde, 'b'), VUOTA, shell(verde, 'c'), VUOTA, testo('mai')], { onDelta: () => {} });
  const errore = await g.esito.then(() => null, (x) => x);
  assert.equal(errore?.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(g.corpi.length, 6, 'nessuna settima richiesta: niente seconda spinta né ritentativi');
});

test('MFC-18d (R2) AL CONTRARIO: dopo il richiamo, una nota del kernel e poi una risposta vuota senza attrezzi nuovi ⇒ errore onesto, nessuna spinta', async () => {
  const g = giro([shell(verde, 'a'), testo(DEEPSEEK), { content: 'Riprendo: ', finish: 'length' }, VUOTA, testo('mai')], { onDelta: () => {} });
  const errore = await g.esito.then(() => null, (x) => x);
  assert.equal(errore?.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(g.corpi.length, 4, 'attrezzo, fermata, richiamo tagliato dal tetto, continuazione vuota: niente spinta');
});

test('MFC-18e (R2): la finestra degli attrezzi si chiude a QUALSIASI user, note comprese', () => {
  const t = { role: 'tool', tool_call_id: 'a', content: 'ok' };
  const a = { role: 'assistant', content: null, tool_calls: [{ id: 'a' }] };
  assert.equal(attrezziDopoLUltimoUser([{ role: 'user', content: 'x' }, a, t]), true);
  assert.equal(attrezziDopoLUltimoUser([{ role: 'user', content: 'x' }, a, t, { role: 'user', content: NOTA_FERMATA_CONTESTO }]), false);
  assert.equal(attrezziDopoLUltimoUser([a, t, { role: 'assistant', content: 'r' }, { role: 'user', content: '[TALOS: continua]' }, { role: 'assistant', content: 'p' }]), false);
  assert.equal(attrezziDopoLUltimoUser([]), false);
});

const scrivi = (id) => ({ tool_calls: [{ id, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: `f-${id}.txt`, contenuto: 'x' }) } }] });
const rosso = `${JSON.stringify(process.execPath)} -e "process.exit(1)"`;
const riaperture = (eventi) => eventi.filter((e) => e.tipo === 'continuazione' && e.motivo === 'comando-rosso');
const lavoro = (ultimo) => [scrivi('a'), shell(verde, 'b'), shell(verde, 'c'), ultimo];

test('MFC-19 (P3): dopo il richiamo il comando rosso non riapre (sarebbe la seconda chiamata in più)', async () => {
  const g = giro([...lavoro(shell(verde, 'd')), testo(DEEPSEEK), shell(rosso, 'e'), testo('Il lavoro non è completo: le prove sono rosse.')]);
  await g.esito;
  assert.equal(richiami(g.eventi).length, 1);
  assert.equal(riaperture(g.eventi).length, 0);
  assert.equal(g.corpi.length, 7);
});

test('MFC-20 (P3) AL CONTRARIO: dopo la riapertura sul comando rosso non si richiama', async () => {
  const g = giro([...lavoro(shell(rosso, 'd')), testo('Il lavoro non è completo: le prove sono rosse.'), testo(DEEPSEEK)]);
  await g.esito;
  assert.equal(riaperture(g.eventi).length, 1, 'la riapertura c\'è stata');
  assert.equal(richiami(g.eventi).length, 0);
  assert.equal(g.corpi.length, 6);
});

test('MFC-21 AL CONTRARIO: un modello che rifiuta non si richiama', async () => {
  const g = giro([shell(verde, 'a'), { content: DEEPSEEK, finish: 'content_filter' }]);
  await g.esito.catch(() => {});
  assert.equal(richiami(g.eventi).length, 0);
  assert.equal(g.corpi.length, 2);
});

test('MFC-22 (P3) AL CONTRARIO: dopo le continuazioni del tetto d\'uscita esaurite non si richiama', async () => {
  const lunga = { content: DEEPSEEK, finish: 'length' };
  const g = giro([shell(verde, 'a'), lunga, lunga, lunga, lunga]);
  await g.esito.catch(() => {});
  assert.equal(richiami(g.eventi).length, 0);
  assert.equal(g.corpi.length, 5, 'attrezzo, risposta tagliata e le sue tre continuazioni');
});

test('MFC-15: la nota è di TALOS (mai «prima richiesta» in compattazione) e un giro fallito non la lascia in coda', () => {
  assert.equal(compattazione.eNotaDiTalos({ role: 'user', content: NOTA_FERMATA_CONTESTO }), true);
  assert.ok(NOTA_FERMATA_CONTESTO.includes('Context is compacted automatically and is not a reason to stop. Continue the task from where you are.'));
  const storia = storiaDelGiroFallito([{ role: 'user', content: 'x' }, { role: 'assistant', content: DEEPSEEK }, { role: 'user', content: NOTA_FERMATA_CONTESTO }], 'boom');
  assert.equal(storia.at(-1).content, DEEPSEEK);
});

test('MFC-16 (parte 1): la frase sta nelle istruzioni del modello in rete', async () => {
  const g = giro([testo('Fatto.')]);
  await g.esito;
  const sistema = g.corpi[0].messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
  assert.match(sistema, /Context is never a reason to stop: TALOS compacts the conversation by itself and keeps your task and a summary\. Never end a turn, defer work or say you are running out of context\. A note that older output was trimmed is TALOS keeping things short, not a limit on you\./u);
});

test('MFC-17: il richiamo arriva al giornale su disco come riga contabile durevole, mai a schermo', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const visti = [];
  await avviaSessione({ cartella: cartellaDiProva('talos-mai-fermarsi-as-'), task: { consegna: 'prova' }, modello: 'x', chiave: 'k',
    onEvento: (e, opzioni) => { visti.push([e, opzioni]); },
    talosLavoraFn: async (input) => {
      input.onGiro?.({ giro: 1, tipo: 'continuazione', motivo: 'fermata-contesto', tentativo: 1, tentativiMassimi: 1 });
      input.onGiro?.({ giro: 2, tipo: 'continuazione', motivo: 'comando-rosso', tentativo: 1, tentativiMassimi: 1 });
      return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [] };
    },
  });
  const trovati = visti.filter(([x]) => x?.name === 'talos.continuazione');
  assert.equal(trovati.length, 1, 'solo la fermata per il contesto, le altre continuazioni come prima');
  const [e, opzioni] = trovati[0];
  assert.equal(opzioni?.durable, true);
  assert.equal(e.value.motivo, 'fermata-contesto');
  assert.equal(e.value.riga, 'ripreso dopo una fermata per il contesto');
  const { EVENTI_CONTABILI } = await import('../frontend/src/components/trascrizione-eventi-interni.js');
  assert.ok(EVENTI_CONTABILI.includes('talos.continuazione'), 'la chat non la disegna e il Markdown non la esporta');
});

/* ───────────── marcatori neutri (parte 2) ───────────── */

test('MK-01 (C1, P2): nessun marcatore dice più «to fit the context window»; «kept» solo dove il testo si recupera, e dice come', () => {
  const lungo = 'x'.repeat(50_000);
  const accorciato = compattazione.accorciaTesto(lungo, { inizio: 100, fine: 100 });
  for (const m of [compattazione.MARCATORE_ACCORCIATO, compattazione.ESITO_DOPPIONE, compattazione.SEGNAPOSTO_IMMAGINE_VECCHIA, MARCATORE_BLOCCO_TAGLIATO, accorciato]) {
    assert.doesNotMatch(m, /context window/u, m.slice(0, 80));
    assert.match(m, /trimmed by TALOS/u, m.slice(0, 80));
  }
  assert.match(accorciato, /the full text is kept/u);
  assert.match(accorciato, /leggi/u, 'dice come recuperare');
  assert.match(compattazione.ESITO_DOPPIONE, /full text is kept in the identical, more recent result below/u);
  for (const m of [compattazione.SEGNAPOSTO_IMMAGINE_VECCHIA, MARCATORE_BLOCCO_TAGLIATO]) assert.doesNotMatch(m, /kept/u, m);
});

test('MK-02 (P4): UNA regex riconosce la forma vecchia e la nuova del taglio', () => {
  const re = compattazione.RE_MARCATORE_ACCORCIATO;
  assert.ok(re instanceof RegExp);
  assert.match('12 characters omitted to fit the context window (TALOS', re);
  assert.match(`12 ${compattazione.MARCATORE_ACCORCIATO} (TALOS`, re);
  assert.doesNotMatch('12 characters omitted here: see the note at the top', re);
});

/* La forma VECCHIA del taglio, copiata alla lettera da `accorciaTesto` di r4 50533433a (compattazione-desktop.mjs:1133). */
const tagliataVecchia = (t, inizio, fine) => `${t.slice(0, inizio)}\n[… ${(t.length - inizio - fine).toLocaleString('en-US')} characters omitted to fit the context window (TALOS context projection, not a byte range). Original message kept in session history. Use leggi (offset/limit are lines; byteOffset continues inside an over-long line), or process_output when outputId is available. Do not re-run a command to recover omitted bytes.]\n${t.slice(-fine)}`;

async function sessioneSalvataPrimaDellaCura({ modello, sincrona }) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-mfc-archivio-'));
  try {
    const sessionId = 'sessione-prima-della-cura';
    const intera = `Correggi il parser. ${'riga del log '.repeat(10_000)}`;
    const vecchia = tagliataVecchia(intera, compattazione.PRIMA_RICHIESTA_INIZIO, compattazione.PRIMA_RICHIESTA_FINE);
    const storia = [{ role: 'system', content: 'sys' }, { role: 'user', content: intera },
      ...Array.from({ length: 12 }, (_, i) => [{ role: 'user', content: `r${i}` }, { role: 'assistant', content: `a${i}` }]).flat()];
    /* il record com'era su disco prima della cura: la proiezione porta la copia accorciata con la scritta vecchia */
    const riassunto = [{ role: 'system', content: 'sys' }, { role: 'user', content: vecchia }, { role: 'user', content: '[TALOS] Summary of earlier work.' }];
    const record = compattazione.creaRecord({ coveredThrough: storia.length, riassunto, at: '2026-11-04T10:00:00.000Z', modello, coperti: storia });
    const riga = { tipo: 'compattazione', versioneGiro: 0, record };
    if (sincrona) registraRigaSync({ cartellaStore, sessionId, record: riga });
    else { await registraRiga({ cartellaStore, sessionId, record: riga }); await attendiScritture({ cartellaStore, sessionId }); }
    const letti = await leggiRegistro({ cartellaStore, sessionId });
    const salvato = letti.findLast((r) => r.tipo === 'compattazione' && compattazione.eRecordValido(r.record)).record;
    const cresciuta = [...storia, ...Array.from({ length: 12 }, (_, i) => [{ role: 'user', content: `n${i}` }, { role: 'assistant', content: `b${i}` }]).flat()];
    const vista = compattazione.applicaRecord(cresciuta, salvato);
    assert.equal(vista[1].content, vecchia, 'il record salvato si applica');
    return { vecchia, tenuta: compattazione.dividiPerCompattazione(vista).richiesteLetterali[0].content };
  } finally { rimuoviCartellaDiProva(cartellaStore); }
}

test('MK-03 (P4): una sessione del desktop salvata PRIMA della cura non si riaccorcia alla compattazione dopo', async () => {
  const { vecchia, tenuta } = await sessioneSalvataPrimaDellaCura({ modello: 'openai/gpt-5.5', sincrona: false });
  assert.equal(tenuta, vecchia, 'la copia già accorciata resta identica, col conto vero dei caratteri tolti');
});

test('MK-04 (M3): la stessa cosa per una sessione del motore del telefono (stesso archivio r4, modello locale-ospite, scrittura sincrona)', async () => {
  const { vecchia, tenuta } = await sessioneSalvataPrimaDellaCura({ modello: 'locale-ospite:lfm2.5-1.2b', sincrona: true });
  assert.equal(tenuta, vecchia);
});
