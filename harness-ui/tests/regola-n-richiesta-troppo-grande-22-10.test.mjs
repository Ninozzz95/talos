/*
 * §4.2, regola N (owner 22/10/2026, decisione presa nella sessione della CLI): «se l'ultimo messaggio da solo non entra, niente si paga: il
 * giro si ferma con un messaggio chiaro, il testo torna nella casella e c'è un solo pulsante "Invia come allegato"».
 * Il caso della CLI (`review613-6/paste-overflow`): un log incollato nella richiesta NUOVA, più grande di quanto la finestra regga con
 * sistema e attrezzi. Prima la compattazione pagava un riassunto inutile e poi il fornitore rifiutava.
 * Contratto con la CLI: `REQUEST_TOO_LARGE` coi dati `{ tokensRichiesta, tokensCornice, finestra, fonte }` (in alto e in `messageParams`),
 * l'evento durevole `talos.richiesta-non-inviata { at, indice }` PRIMA del RunError, l'opzione `allegaSeTroppoGrande`.
 * Adattatore VERO con fornitore finto; agent-service e registro veri con un giro finto. Ogni prova ha la sua scena AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import {
  CARATTERI_MINIMI_PER_ALLEGARE, CHIAVE_RICHIESTA_TROPPO_GRANDE, CODICE_RICHIESTA_TROPPO_GRANDE, RichiestaTroppoGrande, indiceRichiestaNuova,
  pesoDellaRichiestaNuova, testoAllegabile,
} from '../src/kernel/richiesta-troppo-grande.mjs';
import { MARCATORE_RICHIESTA_ALLEGATA, MARCATORE_RICHIESTA_ACCORCIATA, nomeDellaRichiestaSalvata, pianoRichiesteVecchie } from '../src/kernel/richieste-vecchie.mjs';
import { VARIABILE_TETTO_TOKEN, eRichiestaVera, stimaConPezzi, stimaDegliAttrezzi } from '../src/kernel/compattazione-desktop.mjs';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { ricostruisciStoriaDaRecord } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

/* Il fornitore finto risponde `prompt_tokens` = stima dei soli messaggi: lo scarto che il registro misurerebbe su di lui è 0 (vedi
   `riassunto-utile-verdetto-cli-22-10.test.mjs`) */
const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
const FINESTRA = 64_000; // emergenza a 57.600

function cartella(t, nome = 'talos-regola-n-') {
  const c = realpathSync.native(mkdtempSync(join(tmpdir(), nome)));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const lungo = (etichetta, caratteri) => `${etichetta}\n${Array.from({ length: Math.ceil(caratteri / 50) }, (_, i) => `${etichetta} riga ${String(i).padStart(5, '0')} ${'x'.repeat(30)}`).join('\n')}`;
const rispostaFinta = (messaggio, prompt = 10) => Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: messaggio.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
/** Il fornitore: `passo(n, corpo)` decide la risposta n-esima (un attrezzo `[nome, argomenti]` o il testo). Conta le chiamate e i riassunti. */
function fornitore(passo = () => 'OK') {
  const corpi = [];
  let riassunti = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return rispostaFinta({ role: 'assistant', content: '## Riassunto\nfatto' }); }
    const n = corpi.length;
    corpi.push(corpo);
    const azione = passo(n, corpo);
    if (Array.isArray(azione)) {
      return rispostaFinta({ role: 'assistant', content: '', tool_calls: [{ id: `c${n}`, type: 'function', function: { name: azione[0], arguments: JSON.stringify(azione[1]) } }] }, stima(corpo.messages));
    }
    return rispostaFinta({ role: 'assistant', content: azione ?? 'OK' }, stima(corpo.messages));
  };
  return { fetchDiRete, corpi, get riassunti() { return riassunti; } };
}
const storiaBreve = () => [
  { role: 'system', content: 'You are a coding agent' },
  { role: 'user', content: 'Prima richiesta: rispondi OK.' }, { role: 'assistant', content: 'OK' },
];
async function giro(t, { richiesta, finestraToken = FINESTRA, sistema = null, ...extra }) {
  const workspace = cartella(t);
  const f = fornitore(extra.passo);
  const storia = storiaBreve();
  if (sistema) storia[0] = { role: 'system', content: sistema };
  const messaggiIniziali = [...storia, { role: 'user', content: richiesta }];
  const { passo: _passo, ...resto } = extra;
  let esito = null;
  let errore = null;
  /* la cartella delle copie intere c'è sempre sul desktop (il registro la passa a ogni giro); senza, l'allegato non può partire e
     `allegabile` è false (F2b della revisione 9) — una prova che la vuole assente la passa `null` */
  const cartellaIncollati = 'cartellaIncollati' in resto ? resto.cartellaIncollati : cartella(t, 'talos-incollati-');
  try {
    esito = await talosLavora({ cartella: workspace, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: f.fetchDiRete, ...(finestraToken ? { finestraToken } : {}), ...resto, cartellaIncollati });
  } catch (e) { errore = e; }
  return { esito, errore, f, messaggiIniziali, workspace, cartellaIncollati };
}

test('N-NUOVA-01 — la richiesta NUOVA è l\'ultimo messaggio che non è sistema né nota di TALOS; una già seguita da una risposta o da un attrezzo non lo è', () => {
  const u = { role: 'user', content: 'domanda' };
  assert.equal(indiceRichiestaNuova([{ role: 'system', content: 's' }, u]), 1);
  assert.equal(indiceRichiestaNuova([u, { role: 'system', content: 'aggiornamento del progetto' }]), 0, 'un sistema accodato dopo non la nasconde');
  assert.equal(indiceRichiestaNuova([u, { role: 'user', content: '[TALOS] nota del kernel' }]), 0, 'una nota di TALOS dopo non la nasconde');
  assert.equal(indiceRichiestaNuova([u, { role: 'assistant', content: 'risposta' }]), -1, 'AL CONTRARIO: già risposta');
  assert.equal(indiceRichiestaNuova([u, { role: 'assistant', content: '', tool_calls: [{ id: 'a' }] }, { role: 'tool', tool_call_id: 'a', content: 'esito' }]), -1, 'a metà giro non c\'è una richiesta nuova');
  assert.equal(indiceRichiestaNuova([{ role: 'user', content: '[TALOS] solo una nota' }]), -1, 'una nota non è una richiesta');
  /* la cornice: tutti i sistemi, gli effimeri e gli schemi degli attrezzi */
  const attrezzi = [{ type: 'function', function: { name: 'leggi', description: 'd'.repeat(400), parameters: { type: 'object' } } }];
  const sistemi = [{ role: 'system', content: 's'.repeat(4_000) }, { role: 'system', content: 'a'.repeat(400) }];
  const effimeri = [{ role: 'system', content: 'e'.repeat(800) }];
  const peso = pesoDellaRichiestaNuova([sistemi[0], u, sistemi[1]], { attrezzi, effimeri });
  assert.equal(peso.indice, 1);
  assert.equal(peso.tokensCornice, stimaConPezzi(sistemi) + stimaConPezzi(effimeri) + stimaDegliAttrezzi(attrezzi), 'sistemi + effimeri + attrezzi');
  assert.ok(peso.tokensCornice > stimaConPezzi(sistemi) + stimaConPezzi(effimeri), 'gli attrezzi contano');
  assert.equal(peso.tokensRichiesta, stima([u]));
});

test('N-GIRO-01 — una richiesta nuova che con sistema e attrezzi supera la linea d\'emergenza ferma il giro PRIMA di ogni chiamata: REQUEST_TOO_LARGE coi numeri, e la storia del giro senza di lei; AL CONTRARIO una che entra parte', async (t) => {
  const grande = lungo('INCOLLATO', 320_000); // ~80.000 token, più della finestra
  const { errore, f, messaggiIniziali } = await giro(t, { richiesta: grande });
  assert.ok(errore, 'il giro si ferma');
  assert.equal(errore.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(errore.chiave, CHIAVE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(f.corpi.length, 0, 'nessuna richiesta al fornitore');
  assert.equal(f.riassunti, 0, 'e nessun riassunto pagato');
  assert.equal(errore.dati.finestra, FINESTRA);
  assert.equal(errore.dati.fonte, 'stima');
  assert.equal(errore.dati.allegabile, true, 'solo testo e lungo: si può mandare come allegato');
  assert.ok(Math.abs(errore.dati.tokensRichiesta - stima([{ role: 'user', content: grande }])) <= 8, `la richiesta pesata da sola (${errore.dati.tokensRichiesta})`);
  assert.ok(errore.dati.tokensCornice > 1_000, `la cornice porta sistema e attrezzi (${errore.dati.tokensCornice})`);
  assert.deepEqual(errore.params, { ...errore.dati }, 'gli stessi numeri per la frase dell\'interfaccia');
  assert.match(errore.message, /does not fit this model's 64,000-token window\. Nothing was summarized or sent\./u);
  /* la storia del giro: tutto tranne la richiesta (il kernel non la sostituisce con la sua) */
  assert.ok(Array.isArray(errore.messaggiDelGiro));
  assert.ok(!errore.messaggiDelGiro.some((m) => m.content === grande), 'la richiesta non è nella storia del giro');
  assert.deepEqual(errore.messaggiDelGiro.slice(0, messaggiIniziali.length - 1), messaggiIniziali.slice(0, -1), 'la storia di prima è intera, in testa');
  assert.equal(messaggiIniziali.indexOf(messaggiIniziali.at(-1)), errore.indice, '`indice` è la posizione della richiesta nella storia grezza');
  const piccola = await giro(t, { richiesta: lungo('PICCOLA', 8_000) });
  assert.equal(piccola.errore, null, `AL CONTRARIO: una richiesta che entra parte (${piccola.errore?.message})`);
  assert.equal(piccola.esito.comeFinita, 'concluso');
  assert.equal(piccola.f.corpi.length, 1);
});

test('N-CORNICE-01 — conta la cornice: una richiesta che da sola starebbe sotto la linea ma con sistema e attrezzi no si ferma; AL CONTRARIO, la stessa con un sistema corto parte', async (t) => {
  const prova = await giro(t, { richiesta: lungo('MISURA', 40_000) });
  assert.equal(prova.errore, null, 'premessa: ~10.000 token entrano');
  /* un sistema che porta la cornice a ~57.000: ora 10.000 di richiesta superano la FINESTRA (64.000), senza che la cornice da sola ci
     arrivi (F2a della revisione 9: la linea prima del rifiuto è la finestra, non l'emergenza) */
  const sistemaGrande = `You are a coding agent.\n${'regola del progetto '.repeat(11_000)}`;
  const { errore, f } = await giro(t, { richiesta: lungo('MISURA', 40_000), sistema: sistemaGrande });
  assert.equal(errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `si ferma (${errore?.message})`);
  assert.ok(errore.dati.tokensRichiesta < FINESTRA * 0.9, `la richiesta da sola entrerebbe (${errore.dati.tokensRichiesta})`);
  assert.ok(errore.dati.tokensCornice > 50_000 && errore.dati.tokensCornice < FINESTRA, `è la cornice a non farla entrare (${errore.dati.tokensCornice})`);
  assert.ok(errore.dati.tokensCornice + errore.dati.tokensRichiesta >= FINESTRA, 'insieme superano la finestra');
  assert.equal(f.corpi.length + f.riassunti, 0, 'niente pagato');
});

test('N-F2A-01 — F2a della revisione 9 della CLI: fra l\'emergenza (0,90) e la finestra la richiesta PARTE — può entrare, decide il fornitore; AL CONTRARIO oltre la finestra si ferma', async (t) => {
  /* la cornice a ~50.000 più 10.000 di richiesta: ~60.000, sopra l'emergenza (57.600) e sotto la finestra (64.000) */
  const sistemaMedio = `You are a coding agent.\n${'regola del progetto '.repeat(9_500)}`;
  const fraLeDue = await giro(t, { richiesta: lungo('MISURA', 40_000), sistema: sistemaMedio });
  const corpo = fraLeDue.f.corpi[0];
  assert.equal(fraLeDue.errore?.code, undefined, `parte (${fraLeDue.errore?.message})`);
  assert.ok(corpo, 'la richiesta è arrivata al fornitore');
  const pesata = pesoDellaRichiestaNuova(corpo.messages, { attrezzi: corpo.tools });
  assert.ok(pesata.tokensCornice + pesata.tokensRichiesta > FINESTRA * 0.9 && pesata.tokensCornice + pesata.tokensRichiesta < FINESTRA,
    `premessa: fra l'emergenza e la finestra (${pesata.tokensCornice + pesata.tokensRichiesta})`);
  const oltre = await giro(t, { richiesta: lungo('MISURA', 64_000), sistema: sistemaMedio });
  assert.equal(oltre.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, 'AL CONTRARIO: oltre la finestra è certo, si ferma');
  assert.match(oltre.errore.message, /does not fit this model's 64,000-token window/u);
});

test('N-FINESTRA-01 — senza una finestra dichiarata la regola non decide (il tetto di compattazione non è la finestra): la richiesta parte; AL CONTRARIO con la finestra si ferma', async (t) => {
  const grande = lungo('SENZA-FINESTRA', 320_000);
  const senza = await giro(t, { richiesta: grande, finestraToken: null });
  assert.equal(senza.errore, null, `senza finestra non si ferma qui (${senza.errore?.message})`);
  assert.ok(senza.f.corpi.length >= 1, 'decide il fornitore');
  const con = await giro(t, { richiesta: grande });
  assert.equal(con.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  /* la stessa cosa col tetto di compattazione dell'ospite (la CLI, `compactAtTokens`) MOLTO sotto la richiesta: il tetto decide quando
     compattare, non se una richiesta entra — senza finestra dichiarata decide ancora il fornitore */
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '20000';
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
  assert.ok(stima([{ role: 'user', content: grande }]) > 24_000, 'premessa: la richiesta supera la linea d\'emergenza del tetto');
  const colTetto = await giro(t, { richiesta: grande, finestraToken: null });
  assert.notEqual(colTetto.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `col solo tetto la regola N non decide (${colTetto.errore?.message})`);
  assert.ok(colTetto.f.corpi.length >= 1, 'la richiesta parte: decide il fornitore');
});

test('N-ALLEGA-01 — «Invia come allegato»: la richiesta parte come inizio + fine col file intero, resta così per TUTTE le richieste del giro, `leggi` apre il file senza chiedere e la storia grezza resta intera; AL CONTRARIO senza la scelta si ferma', async (t) => {
  const copie = join(cartella(t, 'talos-regola-n-copie-'), 'incollati', 'sessione-n');
  const grande = lungo('ALLEGATO', 320_000);
  const percorso = join(copie, nomeDellaRichiestaSalvata(grande));
  const esiti = [];
  const chieste = [];
  const { esito, errore, f } = await giro(t, {
    richiesta: grande, allegaSeTroppoGrande: true, cartellaIncollati: copie, giriMassimi: 4,
    passo: (n) => (n === 0 ? ['leggi', { percorso, offset: 3_000, limite: 5 }] : 'OK'),
    onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))); },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
  });
  assert.equal(errore, null, `il giro parte (${errore?.message})`);
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(f.corpi.length, 2, 'due richieste: l\'attrezzo e la risposta');
  assert.equal(f.riassunti, 0, 'nessun riassunto pagato');
  for (const [i, corpo] of f.corpi.entries()) {
    const richiesta = corpo.messages.find((m) => m.role === 'user' && String(m.content).startsWith(MARCATORE_RICHIESTA_ALLEGATA));
    assert.ok(richiesta, `richiesta ${i}: parte come allegato`);
    assert.ok(richiesta.content.includes(`saved at "${percorso}"`), 'col percorso del file intero');
    assert.ok(richiesta.content.includes('ALLEGATO riga 00000') && richiesta.content.includes(grande.slice(-40)), 'inizio e fine');
    assert.ok(!richiesta.content.includes('ALLEGATO riga 03000'), `richiesta ${i}: il mezzo non parte nella richiesta`);
    assert.ok(!corpo.messages.some((m) => m.role === 'user' && m.content === grande), `richiesta ${i}: il testo intero non parte`);
  }
  assert.equal(readFileSync(percorso, 'utf8'), grande, 'il file ha il testo intero');
  assert.equal(chieste.length, 0, `\`leggi\` apre il file della sessione senza chiedere (${JSON.stringify(chieste)})`);
  assert.match(esiti[0] ?? '', /ALLEGATO riga 029/u, 'e il mezzo arriva al modello quando lo chiede');
  assert.ok(esito.messaggiFinali.some((m) => m.role === 'user' && m.content === grande), 'la storia grezza ha il testo intero');
  /* un giro dopo: la richiesta è vecchia e la regola K la accorcia nello stesso file */
  const piano = pianoRichiesteVecchie([...esito.messaggiFinali, { role: 'user', content: 'e adesso?' }], { budgetToken: 9_600, cartella: copie, eRichiesta: eRichiestaVera, stima });
  assert.ok(piano.daSalvare.some((d) => d.percorso === percorso), 'la regola K la accorcia nello stesso file');
  const senza = await giro(t, { richiesta: grande, cartellaIncollati: copie });
  assert.equal(senza.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, 'AL CONTRARIO: senza la scelta della persona si ferma');
});

test('N-ALLEGA-02 — la scelta per TESTO (il registro): la funzione riceve il testo intero; «no» o un errore della funzione fermano il giro; AL CONTRARIO «sì» lo manda come allegato', async (t) => {
  const copie = join(cartella(t, 'talos-regola-n-copie-'), 'incollati', 's');
  const grande = lungo('SCELTA', 320_000);
  const visti = [];
  const no = await giro(t, { richiesta: grande, cartellaIncollati: copie, allegaSeTroppoGrande: (testo) => { visti.push(testo); return false; } });
  assert.equal(no.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(no.errore.dati.allegabile, true, 'si poteva allegare: il pulsante va offerto');
  assert.equal(visti[0], grande, 'la funzione riceve il testo intero della richiesta');
  const rotta = await giro(t, { richiesta: grande, cartellaIncollati: copie, allegaSeTroppoGrande: () => { throw new Error('rotta'); } });
  assert.equal(rotta.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, 'una funzione che lancia vale «no»');
  const si = await giro(t, { richiesta: grande, cartellaIncollati: copie, allegaSeTroppoGrande: (testo) => testo === grande });
  assert.equal(si.errore, null, `AL CONTRARIO: «sì» lo manda (${si.errore?.message})`);
  assert.ok(String(si.f.corpi[0].messages.at(-1)?.content ?? JSON.stringify(si.f.corpi[0].messages)).length > 0);
  assert.ok(si.f.corpi[0].messages.some((m) => m.role === 'user' && String(m.content).startsWith(MARCATORE_RICHIESTA_ALLEGATA)));
});

test('N-ALLEGA-03 — non si allega ciò che non si può: una richiesta con un\'immagine, una cornice che da sola non entra, un file che non si scrive; il giro si ferma col motivo (`allegabile`)', async (t) => {
  const radice = cartella(t, 'talos-regola-n-copie-');
  const copie = join(radice, 'incollati', 's');
  const grande = lungo('IMMAGINE', 320_000);
  const conImmagine = await giro(t, { richiesta: [{ type: 'text', text: grande }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }], allegaSeTroppoGrande: true, cartellaIncollati: copie });
  assert.equal(conImmagine.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(conImmagine.errore.dati.allegabile, false, 'con un\'immagine non si manda come allegato');
  assert.equal(conImmagine.f.corpi.length, 0);
  /* una cornice che regge appena: inizio + fine + il percorso la portano oltre la linea, e allegare non basterebbe. (S4-1: una cornice che
     da sola è già oltre la linea non è più di questa regola — è la finestra, «non entra»: N-S41-01.) Il peso vero della cornice viene da
     una sonda, così la finestra è stretta il giusto qualunque siano gli attrezzi del kernel */
  const sonda = await giro(t, { richiesta: lungo('CORNICE', 40_000), finestraToken: 12_000 });
  const pesoCornice = sonda.errore?.dati?.tokensCornice;
  assert.ok(Number.isFinite(pesoCornice), `premessa: la sonda dà il peso della cornice (${sonda.errore?.message})`);
  const strettissima = Math.ceil((pesoCornice + 200) / 0.9);
  const cornice = await giro(t, { richiesta: lungo('CORNICE', 40_000), finestraToken: strettissima, allegaSeTroppoGrande: true, cartellaIncollati: copie });
  assert.equal(cornice.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(cornice.errore.dati.allegabile, false, 'nemmeno come allegato entra');
  assert.equal(cornice.f.corpi.length, 0);
  /* il file non si scrive: una cartella sotto un FILE */
  const blocco = join(radice, 'blocco');
  writeFileSync(blocco, 'x');
  const senzaFile = await giro(t, { richiesta: grande.replaceAll('IMMAGINE', 'SENZAFILE'), allegaSeTroppoGrande: true, cartellaIncollati: join(blocco, 'sotto') });
  assert.equal(senzaFile.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, 'senza il file il mezzo non si leggerebbe: non parte');
  assert.equal(senzaFile.f.corpi.length, 0);
  assert.ok(!existsSync(join(blocco, 'sotto')));
});

test('N-ALLEGA-04 — si allega solo testo abbastanza lungo perché inizio + fine tolgano qualcosa: un testo corto no, un\'immagine no; AL CONTRARIO un testo lungo sì, intero', () => {
  const lungo = 'r'.repeat(CARATTERI_MINIMI_PER_ALLEGARE + 1);
  assert.equal(testoAllegabile({ role: 'user', content: 'una richiesta corta' }), null, 'corto: niente allegato');
  assert.equal(testoAllegabile({ role: 'user', content: 'r'.repeat(CARATTERI_MINIMI_PER_ALLEGARE) }), null, 'al limite: niente');
  assert.equal(testoAllegabile({ role: 'user', content: [{ type: 'text', text: lungo }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }), null, 'con un\'immagine: niente');
  assert.equal(testoAllegabile({ role: 'user', content: lungo }), lungo, 'AL CONTRARIO: lungo, intero');
});

test('N-K-01 — la regola K non riaccorcia una richiesta mandata come allegato (porta già inizio, fine e percorso)', () => {
  const allegata = `${MARCATORE_RICHIESTA_ALLEGATA} it is 300000 characters ...]\n${'x'.repeat(12_000)}`;
  const piano = pianoRichiesteVecchie([{ role: 'user', content: allegata }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'nuova' }],
    { budgetToken: 10, eRichiesta: eRichiestaVera, stima });
  assert.equal(piano.accorciati, 0);
  const vecchia = lungo('VECCHIA', 12_000);
  const controllo = pianoRichiesteVecchie([{ role: 'user', content: vecchia }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'nuova' }],
    { budgetToken: 10, eRichiesta: eRichiestaVera, stima });
  assert.ok(controllo.messaggi[0].content.startsWith(MARCATORE_RICHIESTA_ACCORCIATA), 'AL CONTRARIO: una vecchia lunga sì');
});

test('N-SERVIZIO-01 — agent-service: `talos.richiesta-non-inviata { at, indice }` durevole PRIMA del RunError, i numeri in alto e in `messageParams`, la storia senza la richiesta nel ritorno; AL CONTRARIO un altro errore non lo scrive', async () => {
  const eventi = [];
  const opzioni = [];
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }];
  const scelta = (testo) => testo === 'X';
  const ris = await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', allegaSeTroppoGrande: scelta,
    onEvento: (e, o) => { eventi.push(e); opzioni.push(o); },
    talosLavoraFn: async (input) => {
      assert.equal(input.allegaSeTroppoGrande, scelta, 'la scelta arriva al motore così com\'è');
      throw new RichiestaTroppoGrande({ tokensRichiesta: 15_600, tokensCornice: 9_000, finestra: 16_000, indice: 3, allegabile: true, messaggiDelGiro: storia });
    },
  });
  const iNonInviata = eventi.findIndex((e) => e.type === 'CUSTOM' && e.name === 'talos.richiesta-non-inviata');
  const iErrore = eventi.findIndex((e) => e.type === 'RunError');
  assert.ok(iNonInviata >= 0 && iNonInviata < iErrore, 'l\'evento arriva PRIMA del RunError');
  assert.deepEqual(opzioni[iNonInviata], { durable: true }, 'ed è durevole');
  assert.equal(eventi[iNonInviata].value.indice, 3);
  assert.ok(!Number.isNaN(Date.parse(eventi[iNonInviata].value.at)), 'con l\'istante');
  const errore = eventi[iErrore];
  assert.equal(errore.code, 'REQUEST_TOO_LARGE');
  assert.equal(errore.messageChiave, 'server.run.requestTooLarge');
  assert.deepEqual(errore.messageParams, { tokensRichiesta: 15_600, tokensCornice: 9_000, finestra: 16_000, fonte: 'stima', allegabile: true });
  for (const [campo, valore] of Object.entries(errore.messageParams)) assert.equal(errore[campo], valore, `${campo} anche in alto`);
  assert.equal(ris.codiceErrore, 'REQUEST_TOO_LARGE');
  assert.deepEqual(ris.messaggiDelGiro, storia, 'la storia senza la richiesta arriva al registro');
  const altri = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { altri.push(e); },
    talosLavoraFn: async () => { throw Object.assign(new Error('rete giù'), { code: 'NETWORK_DOWN' }); } });
  assert.ok(!altri.some((e) => e.name === 'talos.richiesta-non-inviata'), 'AL CONTRARIO: un altro errore non lo scrive');
  assert.ok(altri.some((e) => e.type === 'RunError' && e.code === 'NETWORK_DOWN'));
});

test('N-SERVIZIO-02 — R13 (revisione 13 della CLI) lungo il filo di agent-service: le posizioni delle richieste non inviate arrivano al motore; `archiviataDalMotore` torna al registro e l\'evento lo dice (`nelMotore`); `riserva` sta in alto e nei parametri con la sua chiave; un riassunto annullato dal motore diventa `fase:\'annullata\'`; AL CONTRARIO senza nessuna di queste cose niente cambia', async () => {
  const eventi = [];
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'a' }, { role: 'user', content: 'grande' }];
  const ris = await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', richiesteNonInviate: [4, 9],
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      assert.deepEqual(input.richiesteNonInviate, [4, 9], 'le posizioni arrivano al motore');
      input.onGiro?.({ tipo: 'compattazione-annullata', at: '2026-10-23T18:00:00.000Z', coveredThrough: 7, motivo: 'giro-fallito' });
      input.onGiro?.({ tipo: 'compattazione-annullata', at: 'non-una-data', coveredThrough: 7 });
      throw Object.assign(new RichiestaTroppoGrande({ tokensRichiesta: 15_005, tokensCornice: 6_607, finestra: 24_000, fonte: 'fornitore', indice: 2, allegabile: true, messaggiDelGiro: storia, riserva: 2_400 }), { archiviataDalMotore: true });
    },
  });
  const nonInviata = eventi.find((e) => e.name === 'talos.richiesta-non-inviata');
  assert.equal(nonInviata?.value.nelMotore, true, 'l\'evento lo dice');
  assert.equal(nonInviata.value.indice, 2);
  assert.equal(ris.archiviataDalMotore, true, 'il registro lo sa');
  const errore = eventi.find((e) => e.type === 'RunError');
  assert.equal(errore.messageChiave, 'server.run.requestTooLargeReply');
  assert.equal(errore.riserva, 2_400, 'in alto');
  assert.equal(errore.messageParams.riserva, 2_400, 'e nei parametri');
  const annullate = eventi.filter((e) => e.name === 'talos.compattazione' && e.value?.fase === 'annullata');
  assert.deepEqual(annullate.map((e) => e.value), [{ fase: 'annullata', at: '2026-10-23T18:00:00.000Z', coveredThrough: 7, motivo: 'giro-fallito' }], 'una sola: l\'istante non valido non passa');
  // AL CONTRARIO
  const altri = [];
  const ris2 = await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { altri.push(e); },
    talosLavoraFn: async (input) => {
      assert.equal(input.richiesteNonInviate, undefined, 'senza posizioni niente campo');
      throw new RichiestaTroppoGrande({ tokensRichiesta: 15_600, tokensCornice: 9_000, finestra: 16_000, indice: 3, allegabile: true, messaggiDelGiro: storia });
    } });
  assert.equal(altri.find((e) => e.name === 'talos.richiesta-non-inviata')?.value.nelMotore, undefined);
  assert.equal(ris2.archiviataDalMotore, undefined);
  assert.equal(altri.find((e) => e.type === 'RunError').messageChiave, 'server.run.requestTooLarge', 'senza riserva la chiave di prima');
});

/* ---------- registro ---------- */
const CLOUD = 'z-ai/glm-5.3-flash';
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
function registroDiProva(t) {
  const cartellaStore = cartellaDiProva('talos-regola-n-registro-');
  const giri = [];
  const avviaSessioneFn = async (input) => {
    let risolvi;
    const attesa = new Promise((r) => { risolvi = r; });
    giri.push({
      input,
      concludi(storia) { input.onEvento({ type: 'RunFinished' }); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [] } }); },
      troppoGrande(messaggiDelGiro) {
        input.onEvento({ type: 'RunError', code: 'REQUEST_TOO_LARGE', message: 'too large' });
        risolvi({ ok: false, esito: null, erroreInterno: 'too large', codiceErrore: 'REQUEST_TOO_LARGE', messaggiDelGiro });
      },
      /* R13-2: come agent-service quando il motore del contesto aveva già archiviato la richiesta (`archiviataDalMotore`) */
      troppoGrandeNelMotore(indice, messaggiDelGiro) {
        input.onEvento({ type: 'CUSTOM', name: 'talos.richiesta-non-inviata', value: { at: '2026-10-23T19:00:00.000Z', indice, nelMotore: true } }, { durable: true });
        input.onEvento({ type: 'RunError', code: 'REQUEST_TOO_LARGE', message: 'too large' });
        risolvi({ ok: false, esito: null, erroreInterno: 'too large', codiceErrore: 'REQUEST_TOO_LARGE', messaggiDelGiro, archiviataDalMotore: true });
      },
    });
    input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${giri.length}` });
    return attesa;
  };
  let ms = Date.parse('2026-10-22T10:00:00.000Z');
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: CLOUD, chiave: 'k', clock: () => new Date(ms += 1000) });
  t.after(async () => { await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  return { registro, giri, cartellaStore };
}
const attesa = (ms = 30) => new Promise((ok) => setTimeout(ok, ms));

test('N-REGISTRO-01 — `resume` con la scelta: la funzione del giro dice «sì» per quel testo (anche con un racconto attorno) una volta sola; un testo corto non si segna; AL CONTRARIO senza scelta «no»', async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t);
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  const grande = lungo('RIPRESA', 20_000);
  assert.equal(giri[0].input.allegaSeTroppoGrande(grande), false, 'prima della scelta: «no»');
  assert.equal(registro.resume(sessionId, grande, [], { allegaSeTroppoGrande: true }).sessionId, sessionId);
  const fn = giri[1].input.allegaSeTroppoGrande;
  assert.equal(typeof fn, 'function');
  assert.equal(fn(`Comandi lanciati dalla persona: ...\n\n${grande}`), true, 'il testo scelto, anche con un racconto attorno');
  assert.equal(fn(grande), false, 'la scelta si consuma alla prima richiesta che la usa');
  giri[1].concludi([...storia, { role: 'user', content: grande }, { role: 'assistant', content: 'ok' }]);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  registro.resume(sessionId, 'corto', [], { allegaSeTroppoGrande: true });
  assert.equal(giri[2].input.allegaSeTroppoGrande('corto'), false, 'un testo corto non si allega mai');
});

test('N-REGISTRO-02 — `avviaLibero` e la coda portano la scelta: la consegna dell\'avvio e una voce consegnata a giro in corso; AL CONTRARIO una voce senza la scelta no', async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t);
  const grande = lungo('AVVIO', 20_000);
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartellaStore, consegna: grande, allegaSeTroppoGrande: true });
  assert.ok(sessionId);
  assert.equal(giri[0].input.allegaSeTroppoGrande(grande), true, 'la consegna dell\'avvio');
  const inCoda = lungo('CODA', 20_000);
  const senzaScelta = lungo('SENZA', 20_000);
  assert.equal(registro.accodaMessaggio(sessionId, senzaScelta).ok, true);
  assert.equal(registro.accodaMessaggio(sessionId, inCoda, [], { allegaSeTroppoGrande: true }).ok, true);
  const primo = giri[0].input.codaMessaggiFn();
  assert.equal(primo?.testo ?? primo, senzaScelta);
  assert.equal(giri[0].input.allegaSeTroppoGrande(senzaScelta), false, 'AL CONTRARIO: la voce senza scelta');
  const secondo = giri[0].input.codaMessaggiFn();
  assert.equal(secondo?.testo ?? secondo, inCoda);
  assert.equal(giri[0].input.allegaSeTroppoGrande(inCoda), true, 'la voce scelta, consegnata a giro in corso');
  giri[0].concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }]);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
});

test('N-REGISTRO-03 — un giro fermato da REQUEST_TOO_LARGE: la storia salvata non ha la richiesta, e la rigiocata del giornale nemmeno', async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t);
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  const grande = lungo('NON-INVIATA', 20_000);
  registro.resume(sessionId, grande);
  giri[1].troppoGrande([...storia, { role: 'system', content: 'aggiornamento del progetto' }]);
  await attendiScritture({ cartellaStore, sessionId }); await attesa(60);
  const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').trim().split('\n').map((r) => JSON.parse(r));
  const ricostruita = ricostruisciStoriaDaRecord(righe);
  const messaggi = ricostruita.finale?.messaggi ?? ricostruita.ripresa?.messaggi ?? [];
  assert.ok(messaggi.length >= storia.length, `una storia c'è (${JSON.stringify(ricostruita).slice(0, 200)})`);
  assert.ok(!messaggi.some((m) => m.content === grande), 'la richiesta non inviata non torna alla rigiocata');
  /* il giro dopo riparte dalla storia senza la richiesta */
  assert.equal(registro.resume(sessionId, 'piccola').sessionId, sessionId);
  assert.ok(!JSON.stringify(giri[2].input.messaggiIniziali ?? []).includes('NON-INVIATA riga'), 'il giro dopo non la vede');
});

/* ---------- S4-1 (revisione 9 della CLI, 23/10/2026) ---------- */
const sistemaDi = (caratteri) => `You are a coding agent.\n${'regola del progetto '.repeat(Math.ceil(caratteri / 20))}`;
const conEventi = async (t, opzioni) => {
  const ordine = [];
  const r = await giro(t, { ...opzioni, onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.motivo === 'non-entra') ordine.push(['non-entra', e]); } });
  return { ...r, nonEntra: ordine.map(([, e]) => e) };
};

test('N-REGISTRO-04 — R13-2 (owner 23/10 via la CLI): col motore del contesto una richiesta troppo grande già nel suo archivio RESTA nella storia (l\'archivio è a sola aggiunta), il giornale la segna «non inviata» con `nelMotore`, e il giro dopo — anche dopo un riavvio — riceve la sua posizione per la nota; AL CONTRARIO senza il motore esce dalla storia come prima (N-REGISTRO-03)', async (t) => {
  const { registro, giri, cartellaStore } = registroDiProva(t);
  const { sessionId } = registro.avvia('task-vero', { modelloScelto: CLOUD });
  const storia = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'ok' }];
  giri[0].concludi(storia);
  await attendiScritture({ cartellaStore, sessionId }); await attesa();
  const grande = lungo('NEL-MOTORE', 20_000);
  registro.resume(sessionId, grande);
  const indice = giri[1].input.messaggiIniziali.findIndex((m) => m.content === grande);
  assert.ok(indice > 0, `premessa: la richiesta è nella storia del giro (${JSON.stringify(giri[1].input.messaggiIniziali.map((m) => m.role))})`);
  giri[1].troppoGrandeNelMotore(indice, [...storia]);
  await attendiScritture({ cartellaStore, sessionId }); await attesa(60);
  const righe = readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8');
  assert.ok(/talos\.richiesta-non-inviata[^\n]*"nelMotore":true/u.test(righe), 'il giornale la segna «non inviata», col motore');
  // il giro dopo: la storia la TIENE (allineata all'archivio) e la posizione arriva per la nota
  registro.resume(sessionId, 'piccola');
  assert.equal(giri[2].input.messaggiIniziali[indice]?.content, grande, 'la storia la tiene, alla stessa posizione');
  assert.deepEqual(giri[2].input.richiesteNonInviate, [indice], 'la posizione arriva al giro');
  giri[2].concludi([...giri[2].input.messaggiIniziali, { role: 'assistant', content: 'ok' }]);
  await attendiScritture({ cartellaStore, sessionId }); await attesa(60);
  // dopo un riavvio: dal giornale
  const giriDopo = [];
  const riavviato = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: CLOUD, chiave: 'k',
    avviaSessioneFn: async (input) => { giriDopo.push({ input }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'rr' }); return new Promise(() => {}); } });
  await riavviato.ripristina();
  riavviato.resume(sessionId, 'dopo il riavvio');
  await attesa();
  assert.deepEqual(giriDopo[0]?.input.richiesteNonInviate, [indice], 'dopo un riavvio la posizione viene dal giornale');
});

test('N-S41-01 — il caso della CLI: «hello» su una finestra da 4.096 con sistema e attrezzi che da soli la superano NON è «troppo grande» — niente REQUEST_TOO_LARGE, «non entra» detto una volta per la finestra, e la richiesta va al fornitore; AL CONTRARIO un testo lungo con una cornice che ci sta resta della regola N', async (t) => {
  /* F2a della revisione 9: la linea è la finestra — la cornice da sola deve superarla per essere «non entra» */
  const piccola = await conEventi(t, { richiesta: 'hello', finestraToken: 4_096, sistema: sistemaDi(12_000) });
  assert.notEqual(piccola.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `non è il messaggio a non entrare (${piccola.errore?.message})`);
  assert.ok(piccola.f.corpi.length >= 1, 'la richiesta va al fornitore: decide lui');
  assert.equal(piccola.nonEntra.length, 1, '«non entra» detto una volta');
  assert.equal(piccola.nonEntra[0].finestra, 4_096);
  assert.ok(piccola.nonEntra[0].pavimento >= 4_096, `il pavimento è la cornice oltre la finestra (${piccola.nonEntra[0].pavimento})`);
  /* già detto per questa finestra (il registro lo passa al giro dopo): non si ripete */
  const giaDetto = await conEventi(t, { richiesta: 'hello', finestraToken: 4_096, sistema: sistemaDi(12_000), nonEntraDetto: 4_096 });
  assert.equal(giaDetto.nonEntra.length, 0, 'una volta per finestra');
  /* AL CONTRARIO: cornice corta, testo lungo ⇒ è il messaggio: REQUEST_TOO_LARGE. Su 4.096 nemmeno la forma allegata (inizio + fine +
     nota) ci sta con la cornice: `allegabile:false`, detto la PRIMA volta (F2b della revisione 9) */
  const lungoTesto = await conEventi(t, { richiesta: lungo('LUNGO', 40_000), finestraToken: 4_096 });
  assert.equal(lungoTesto.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(lungoTesto.errore.dati.allegabile, false, 'su 4.096 la forma allegata non entra: il pulsante non si offre');
  assert.equal(lungoTesto.nonEntra.length, 0, 'e non si dice «non entra»: la finestra regge la cornice');
  const allegabile = await conEventi(t, { richiesta: lungo('LUNGO', 80_000), finestraToken: 16_384 });
  assert.equal(allegabile.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(allegabile.errore.dati.allegabile, true, 'su 16.384 la forma allegata entra: un testo lungo si può mandare come allegato');
});

test('N-F2B-01 — F2b della revisione 9 della CLI: `allegabile` si decide sulla forma allegata VERA prima della prima risposta, e il file si scrive solo se serve davvero', async (t) => {
  /* (1) la forma allegata non entra: `allegabile:false` subito, e con «Invia come allegato» la stessa risposta — nessun file in `incollati` */
  const primo = await giro(t, { richiesta: lungo('LUNGO', 40_000), finestraToken: 4_096 });
  assert.equal(primo.errore?.dati?.allegabile, false, `prima risposta onesta (${primo.errore?.message})`);
  const conAllegato = await giro(t, { richiesta: lungo('LUNGO', 40_000), finestraToken: 4_096, allegaSeTroppoGrande: true });
  assert.equal(conAllegato.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE);
  assert.equal(conAllegato.errore.dati.allegabile, false, 'la stessa risposta anche dopo il clic');
  assert.deepEqual(readdirSync(conAllegato.cartellaIncollati), [], 'e nessun file orfano nella cartella delle copie');
  /* (2) senza una cartella per le copie l'allegato non può partire mai */
  const senzaCartella = await giro(t, { richiesta: lungo('LUNGO', 80_000), finestraToken: 16_384, cartellaIncollati: null });
  assert.equal(senzaCartella.errore?.dati?.allegabile, false, 'senza cartella: non allegabile');
  /* AL CONTRARIO (3): la forma allegata entra ⇒ `allegabile:true`; col clic la richiesta parte e il file c'è, col nome dell'impronta */
  const testo = lungo('LUNGO', 80_000);
  const entra = await giro(t, { richiesta: testo, finestraToken: 16_384, allegaSeTroppoGrande: true });
  assert.equal(entra.errore, null, `parte come allegato (${entra.errore?.message})`);
  assert.deepEqual(readdirSync(entra.cartellaIncollati), [nomeDellaRichiestaSalvata(testo)], 'il file intero, uno solo');
  assert.ok(JSON.stringify(entra.f.corpi[0].messages).includes(nomeDellaRichiestaSalvata(testo)), 'e la richiesta lo nomina col percorso previsto');
});

test('N-S41-02 — un testo CORTO che con la cornice supera la linea non è «troppo grande»: l\'allegato non aiuterebbe, decide la strada di sempre e la richiesta parte; AL CONTRARIO un\'immagine nella stessa posizione resta REQUEST_TOO_LARGE con allegabile:false', async (t) => {
  const corto = 'c'.repeat(8_800); // sotto i 9.000 caratteri: non allegabile
  const conCorto = await conEventi(t, { richiesta: corto, finestraToken: 4_096 });
  assert.ok(stima([{ role: 'user', content: corto }]) + 2_000 > 4_096 * 0.9, 'premessa: con la cornice supera la linea');
  assert.notEqual(conCorto.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `un testo corto non è «troppo grande» (${conCorto.errore?.message})`);
  assert.ok(conCorto.f.corpi.length >= 1, 'la richiesta parte');
  const conImmagine = await conEventi(t, { richiesta: [{ type: 'text', text: 'guarda' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
    finestraToken: 3_600 }); // linea a 3.240: la cornice ci sta, la cornice con l'immagine (1.500) no
  assert.equal(conImmagine.errore?.code, CODICE_RICHIESTA_TROPPO_GRANDE, `AL CONTRARIO: l'immagine sì (${conImmagine.errore?.message})`);
  assert.equal(conImmagine.errore.dati.allegabile, false, 'e non si offre l\'allegato');
});
