/**
 * ricerca-permesso-e-consegna.test.mjs — L1 (11/09/2026): il livello `'ricerca'`, l'attrezzo
 * `research_deposit` e il filtro della lista degli attrezzi sul livello.
 *
 * ⛔ Il guasto che questi test chiudono è REALE e riprodotto sui dati veri del 4174: la ricerca
 *   `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35` dell'11/09 è partita `permessi:'Read only'`, le è
 *   stato offerto `document_create`, è stata respinta due volte, e il rapporto permanente
 *   salvato in Libreria sono 290 byte di scusa con `terminata:'done'`.
 *
 * ⛔⛔⛔ OGNI CANCELLO SI PROVA ANCHE NEL VERSO IN CUI DEVE DIRE DI NO. Non è una formalità di
 *   stile: in questo repo un cancello semantico è rimasto INERTE per mesi perché tutti i suoi
 *   test provavano solo che una scrittura LEGITTIMA passasse — e un cancello spento supera
 *   quella prova esattamente come uno vero.
 *
 * ⭐ Ricerca web PRIMA di scrivere (obbligo owner), fonte + data:
 *   - «Agent Safety Is Action Alignment» (arXiv:2606.28739, 27/06/2026): il minimo privilegio
 *     si impone «outside the model at the action boundary». ⇒ il filtro della lista NON è la
 *     difesa, e qui si prova offrendo l'attrezzo A FORZA e verificando che il cancello morda
 *     lo stesso.
 *   - «When Lower Privileges Suffice» (arXiv:2606.20023, 18/06/2026): la scelta di un attrezzo
 *     a privilegio più alto è comune ed è amplificata dai fallimenti transitori (cioè da un
 *     REFUSED). ⇒ togliere l'attrezzo più largo dalla lista è una cura misurata, non un gusto.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import {
  ATTREZZI_ESTESI_OPENAI, ATTREZZI_OPENAI, attrezziNegatiDalLivello, talosLavora,
} from '../src/kernel/talosHarness.mjs';
import {
  cartellaDellaRicerca, dentroLaRadice, idRicercaValido, leggiRapporto,
  percorsoRapporto, rileggiRapportoMinimo, scriviRapporto, STATI_TERMINATI,
} from '../src/research-store.mjs';

/* ─────────────────────────── impalcatura ─────────────────────────── */

function cartellaVuota(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-ricerca-'));
  t.after(() => { try { rimuoviCartellaDiProva(dir); } catch { /* già sparita */ } });
  return dir;
}

/** Stessa forma della rete finta dei test del kernel: risposte scritte, nessuna chiamata vera. */
function reteDiRisposte(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (url, opzioni) => {
      const indice = chiamate.length;
      chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) });
      const scelta = risposte[Math.min(indice, risposte.length - 1)];
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        text: async () => '',
      };
    },
  };
}

const TASK_RICERCA = { consegna: 'una ricerca qualunque, per la prova', ricercaId: 'ric-1' };
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });

const RAPPORTO_VERO = ['# Titolo del rapporto', '', 'Una affermazione documentata.', '', '## Fonti', '- https://arxiv.org/abs/2606.20023'].join('\n');

function rispostaTool(rete) {
  return rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content;
}

/* ───────────────── L1a — il cancello: `'ricerca'` nega tutto tranne la consegna ───────────────── */

test('⛔⛔⛔ VERSO CONTRARIO — sotto `ricerca`, `scrivi` è RESPINTO e il file non esiste sul disco', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('scrivi', { percorso: 'nuovo.txt', contenuto: 'ciao' }), CONCLUSO);
  await talosLavora({ cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca' });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.match(rispostaTool(rete), /ricerca approfondita/);
  assert.equal(existsSync(join(cartella, 'nuovo.txt')), false, 'una ricerca non scrive nel progetto ospite: l\'intenzione originale resta intatta');
});

test('⛔⛔⛔ VERSO CONTRARIO — sotto `ricerca`, `shell` è RESPINTO e il comando non gira mai', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('shell', { comando: 'echo segno>marker.txt' }), CONCLUSO);
  await talosLavora({ cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca' });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.equal(existsSync(join(cartella, 'marker.txt')), false);
});

test('⛔⛔⛔ VERSO CONTRARIO — sotto `ricerca`, `document_create` è RESPINTO anche se lo si OFFRE a forza: il filtro della lista non è la difesa, il cancello sì', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('document_create', { format: 'md', title: 't', body: 'b' }), CONCLUSO);
  let onDocumentoChiamata = false;
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca',
    /* ⛔ Offerto ESPLICITAMENTE, scavalcando il filtro per livello: è il punto del test. */
    strumentiEstesi: ['document_create'],
    onDocumento: async () => { onDocumentoChiamata = true; return { ok: true, esito: 'creato' }; },
  });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.equal(onDocumentoChiamata, false, 'il generatore non va MAI chiamato se il permesso rifiuta prima');
});

test('⭐⭐⭐ sotto `ricerca`, `research_deposit` SCRIVE il rapporto nella cartella della ricerca', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: RAPPORTO_VERO }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca',
    strumentiEstesi: ['research_deposit'],
  });
  const risposta = rispostaTool(rete);
  assert.match(risposta, /^deposited:/);
  assert.match(risposta, /Do not deposit the same thing again/, 'il messaggio scoraggia la ripetizione IDENTICA, che è il modo in cui i giri si esauriscono');
  /*
   * ⭐⭐⭐ L8 (12/09/2026) — la frase è cambiata da «Do not deposit it again» a «Do not deposit
   *   the SAME THING again», e non è stile: da oggi un deposito senza record verificabile deve
   *   poter essere RIFATTO con gli argomenti strutturati. Un «non farlo più» secco chiuderebbe
   *   l'unica via di rimedio — il 12/09 il modello ha depositato prosa senza record, ha letto
   *   «non ripeterlo», e la ricerca è finita `senza-rapporto` con cinque minuti di lavoro perso.
   *   Questo rapporto è la fixture del MODO VECCHIO (prosa senza recinto): il messaggio deve
   *   dirlo, e qui si prova che lo dice.
   */
  assert.match(risposta, /It carries NO verifiable record/, 'L8 — il deposito senza record lo dichiara, invece di far credere che sia andato tutto bene');
  const percorso = percorsoRapporto(cartella, 'ric-1');
  assert.equal(existsSync(percorso), true, 'il rapporto è un artefatto su disco, non una frase in chat');
  assert.equal(readFileSync(percorso, 'utf8'), RAPPORTO_VERO);
});

test('⛔⛔⛔ VERSO CONTRARIO — un `ricercaId` OSTILE (`../../altrove`) non deposita niente fuori dalla cartella della ricerca', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: RAPPORTO_VERO }), CONCLUSO);
  await talosLavora({
    cartella,
    /* ⛔ Un id che tenta di risalire: non può venire dal modello (il server lo scrive), ma il
       cancello deve morderlo lo stesso — due difese indipendenti sullo stesso confine. */
    task: { consegna: 'x', ricercaId: '../../altrove' },
    modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
  });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.equal(existsSync(join(cartella, '..', '..', 'altrove')), false, 'niente è stato scritto fuori dalla cartella della ricerca');
});

test('⛔ sotto `ricerca`, `research_deposit` con testo VUOTO è respinto e non lascia un file vuoto', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: '   ' }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca',
    strumentiEstesi: ['research_deposit'],
  });
  assert.match(rispostaTool(rete), /^REFUSED\. Empty report/);
  assert.equal(existsSync(percorsoRapporto(cartella, 'ric-1')), false);
});

test('⛔ `research_deposit` FUORI da una sessione di ricerca (nessun task.ricercaId): lo dice, non inventa una cartella', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: RAPPORTO_VERO }), CONCLUSO);
  await talosLavora({
    cartella, task: { consegna: 'una chat normale' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    /* Una chat con pieno accesso: il cancello passa, e a fermarlo resta solo l'onestà del ramo. */
    livelloAccesso: 'accesso-pieno', strumentiEstesi: ['research_deposit'],
  });
  assert.match(rispostaTool(rete), /only available inside a deep research session/);
});

test('⛔⛔⛔ RIDUZIONE MONOTONA DEL PRIVILEGIO (CAPMAS, arXiv:2609.06500, 06/09/2026) — una madre in sola lettura non può nemmeno AVVIARE una ricerca: `ricerca` non è mai un\'escalation', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_start', { question: 'qualcosa' }), CONCLUSO);
  let avviata = false;
  await talosLavora({
    cartella, task: { consegna: 'x' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
    strumentiEstesi: ['research_start'], onRicercaAvvia: async () => { avviata = true; return { ok: true, esito: 'started' }; },
  });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.equal(avviata, false, 'senza questo, una sessione read-only otterrebbe per interposta ricerca una scrittura che il suo livello nega');
});

test('⛔ `lettura` resta INVARIATO: `research_deposit` è respinto lì come tutto il resto', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(chiamata('research_deposit', { testo: RAPPORTO_VERO }), CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'lettura',
    strumentiEstesi: ['research_deposit'],
  });
  assert.match(rispostaTool(rete), /^REFUSED\./);
  assert.match(rispostaTool(rete), /sola lettura/, 'il motivo è quello di sempre: il livello lettura non ha cambiato una virgola');
  assert.equal(existsSync(percorsoRapporto(cartella, 'ric-1')), false);
});

/* ───────────────── L1b — la lista degli attrezzi si filtra sul livello ───────────────── */

test('⛔⛔⛔ LA REGRESSIONE CHE TEMO — TALOS-BANCO non passa `livelloAccesso`: la sua lista di attrezzi NON cambia di un nome', () => {
  assert.equal(attrezziNegatiDalLivello({}).size, 0);
  assert.equal(attrezziNegatiDalLivello({ livelloAccesso: undefined }).size, 0);
  /*
   * ⛔ Il banco chiama `talosLavora` senza `livelloAccesso` e (nelle campagne di coding) senza
   * `strumentiEstesi`: la lista che il modello vede deve restare ESATTAMENTE i sette attrezzi
   * base — 505 token contro i 42.272 di claude-code, il numero su cui la parità è costruita.
   */
  const negati = attrezziNegatiDalLivello({});
  const listaDelBanco = ATTREZZI_OPENAI.filter((a) => !negati.has(a.function.name)).map((a) => a.function.name);
  assert.deepEqual(listaDelBanco, ['elenca', 'cerca', 'leggi', 'scrivi', 'prova', 'shell', 'naviga']);
});

test('⛔⛔⛔ REGRESSIONE, IL VERSO FORTE — con `strumentiEstesi` e nessun livello (la forma con cui il banco misura le varianti) la lista è identica a quella di prima del filtro', () => {
  const estesi = ['web_search', 'document_create', 'time_now'];
  const negati = attrezziNegatiDalLivello({});
  const attesa = [...ATTREZZI_OPENAI, ...ATTREZZI_ESTESI_OPENAI.filter((a) => estesi.includes(a.function.name))].map((a) => a.function.name);
  const reale = [...ATTREZZI_OPENAI, ...ATTREZZI_ESTESI_OPENAI.filter((a) => estesi.includes(a.function.name))]
    .filter((a) => !negati.has(a.function.name)).map((a) => a.function.name);
  assert.deepEqual(reale, attesa);
  assert.ok(reale.includes('document_create'), 'senza un livello dichiarato non si toglie NIENTE a nessuno');
});

test('§6.4 — sotto `ricerca` il modello non riceve scrivi/shell/document_create/mutazioni Libreria/generate_image/tool_create, ma riceve le letture, web_search e research_deposit', () => {
  const negati = attrezziNegatiDalLivello({ livelloAccesso: 'ricerca' });
  for (const nome of ['scrivi', 'shell', 'prova', 'document_create', 'generate_image', 'tool_create',
    'library_rename', 'library_delete', 'library_export', 'library_context_policy_update']) {
    assert.equal(negati.has(nome), true, `${nome} non deve essere offerto a una ricerca`);
  }
  for (const nome of ['elenca', 'cerca', 'leggi', 'naviga', 'web_search', 'time_now',
    'library_list', 'library_read', 'research_list', 'research_read', 'research_deposit']) {
    assert.equal(negati.has(nome), false, `${nome} serve a una ricerca e deve restare offerto`);
  }
});

test('§6.4 — sotto `lettura` nemmeno `research_deposit` è offerto: l\'unica differenza fra i due livelli è quella, ed è dichiarata', () => {
  const lettura = attrezziNegatiDalLivello({ livelloAccesso: 'lettura' });
  const ricerca = attrezziNegatiDalLivello({ livelloAccesso: 'ricerca' });
  assert.equal(lettura.has('research_deposit'), true);
  const differenza = [...lettura].filter((n) => !ricerca.has(n));
  assert.deepEqual(differenza, ['research_deposit']);
});

test('⛔⛔ un override per-attrezzo `sempre`/`chiedi` VINCE sul livello nel cancello ⇒ quell\'attrezzo resta OFFERTO (un permesso concesso dalla persona non diventa irraggiungibile)', () => {
  assert.equal(attrezziNegatiDalLivello({ livelloAccesso: 'lettura', permessiPerAttrezzo: { scrivi: 'sempre' } }).has('scrivi'), false);
  assert.equal(attrezziNegatiDalLivello({ livelloAccesso: 'lettura', permessiPerAttrezzo: { shell: 'chiedi' } }).has('shell'), false);
  // `nega` invece non è un'eccezione: resta negato, quindi resta fuori dalla lista.
  assert.equal(attrezziNegatiDalLivello({ livelloAccesso: 'lettura', permessiPerAttrezzo: { scrivi: 'nega' } }).has('scrivi'), true);
});

test('§6.4, dal vivo — una sessione `ricerca` NON riceve `document_create` nella lista mandata al modello, e riceve `research_deposit`', async (t) => {
  const cartella = cartellaVuota(t);
  const rete = reteDiRisposte(CONCLUSO);
  await talosLavora({
    cartella, task: TASK_RICERCA, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, livelloAccesso: 'ricerca',
    strumentiEstesi: ['web_search', 'document_create', 'research_deposit', 'tool_create'],
  });
  const offerti = rete.chiamate[0].corpo.tools.map((a) => a.function.name);
  assert.equal(offerti.includes('document_create'), false, 'un attrezzo mai offerto non si chiama mai');
  assert.equal(offerti.includes('tool_create'), false);
  assert.equal(offerti.includes('scrivi'), false);
  assert.equal(offerti.includes('shell'), false);
  assert.equal(offerti.includes('research_deposit'), true);
  assert.equal(offerti.includes('web_search'), true, 'una ricerca senza ricerca web non è una ricerca');
  assert.equal(offerti.includes('naviga'), true);
});

/* ───────────────── L2a — la forma minima del rapporto ───────────────── */

test('⭐⭐⭐ rileggiRapportoMinimo: un rapporto con titolo, affermazioni e fonti PASSA', () => {
  const letto = rileggiRapportoMinimo(RAPPORTO_VERO);
  assert.equal(letto.ok, true);
  assert.equal(letto.intestazione, 'Titolo del rapporto');
  assert.equal(letto.affermazioni, 1);
  assert.deepEqual(letto.fonti, ['https://arxiv.org/abs/2606.20023']);
  assert.equal(letto.motivo, null);
});

test('⛔⛔⛔ VERSO CONTRARIO — LA SCUSA DEL 11/09, VERBATIM: 290 byte, nessun titolo, nessuna fonte ⇒ RESPINTA', () => {
  const scusa = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
    + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a '
    + 'scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';
  const letto = rileggiRapportoMinimo(scusa);
  assert.equal(letto.ok, false);
  assert.equal(letto.intestazione, null);
  assert.deepEqual(letto.fonti, []);
  assert.match(letto.motivo, /intestazione/);
});

test('⛔ VERSO CONTRARIO — un rapporto ben scritto ma SENZA FONTI è respinto, e il motivo lo nomina', () => {
  const letto = rileggiRapportoMinimo('# Un titolo\n\nDue affermazioni.\nAnche una terza.\n');
  assert.equal(letto.ok, false);
  assert.equal(letto.affermazioni, 2);
  assert.equal(letto.motivo, 'il rapporto non elenca nessuna fonte');
});

test('⛔ VERSO CONTRARIO — solo titolo e fonti, nessuna affermazione: respinto. Un elenco di link non è un rapporto', () => {
  const letto = rileggiRapportoMinimo('# Titolo\n\n## Fonti\n- https://esempio.it/a\n');
  assert.equal(letto.ok, false);
  assert.equal(letto.motivo, 'il rapporto non contiene nessuna affermazione');
  assert.equal(letto.fonti.length, 1, 'le fonti le ha viste: manca il resto');
});

test('⛔ VERSO CONTRARIO — vuoto, spazi, o non una stringa: respinti senza eccezioni', () => {
  for (const valore of ['', '   \n  ', null, undefined, 42, {}]) {
    assert.equal(rileggiRapportoMinimo(valore).ok, false, `${String(valore)} non è un rapporto`);
  }
});

test('⛔ un URL citato IN MEZZO alla prosa non conta come fonte: la bibliografia si dichiara, non si indovina', () => {
  const letto = rileggiRapportoMinimo('# Titolo\n\nCome dice https://esempio.it/a, le cose stanno così.\n');
  assert.equal(letto.ok, false);
  assert.equal(letto.motivo, 'il rapporto non elenca nessuna fonte');
});

test('le intestazioni delle fonti sono riconosciute in italiano e in inglese', () => {
  for (const titoloSezione of ['## Fonti', '## Sources', '### Riferimenti', '## References', '## Bibliografia']) {
    const letto = rileggiRapportoMinimo(`# T\n\nUna affermazione.\n\n${titoloSezione}\n- https://esempio.it/a\n`);
    assert.equal(letto.ok, true, `${titoloSezione} deve aprire la sezione fonti`);
  }
});

/* ───────────────── L2b — id, radice, scrittura del rapporto ───────────────── */

test('⛔⛔⛔ VERSO CONTRARIO — idRicercaValido respinge tutto ciò che può attraversare una cartella', () => {
  assert.equal(idRicercaValido('d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35'), true, 'un UUID vero passa');
  for (const ostile of ['..', '.', '../x', 'a/b', 'a\\b', 'C:\\Windows', '', ' ', 'x'.repeat(65), null, undefined, 42, 'a.b']) {
    assert.equal(idRicercaValido(ostile), false, `${String(ostile)} non deve essere accettato come id`);
  }
});

test('dentroLaRadice: `resolve` + `startsWith(radice + sep)`, e una radice assente NON è un «vince tutto»', () => {
  const radice = join(tmpdir(), 'radice');
  assert.equal(dentroLaRadice(radice, join(radice, 'rapporto.md')), true);
  assert.equal(dentroLaRadice(radice, radice), true);
  assert.equal(dentroLaRadice(radice, join(radice, '..', 'fuori.md')), false);
  assert.equal(dentroLaRadice(`${radice}-gemello`, join(radice, 'x.md')), false, 'un prefisso di STRINGA non basta: serve il separatore');
  assert.equal(dentroLaRadice(null, join(radice, 'x.md')), false);
  assert.equal(dentroLaRadice(radice, ''), false);
});

test('scriviRapporto/leggiRapporto: andata e ritorno dentro la cartella della ricerca', async (t) => {
  const cartella = cartellaVuota(t);
  const esito = await scriviRapporto({ cartella, id: 'ric-1', testo: RAPPORTO_VERO });
  assert.equal(esito.percorso, percorsoRapporto(cartella, 'ric-1'));
  assert.equal(esito.byte, Buffer.byteLength(RAPPORTO_VERO, 'utf8'));
  assert.equal(await leggiRapporto({ cartella, id: 'ric-1' }), RAPPORTO_VERO);
  assert.ok(esito.percorso.startsWith(cartellaDellaRicerca(cartella, 'ric-1')));
});

test('⛔ VERSO CONTRARIO — scriviRapporto con un id ostile o un testo vuoto LANCIA, e leggiRapporto su un id ostile torna null (mai un\'eccezione per un\'assenza)', async (t) => {
  const cartella = cartellaVuota(t);
  await assert.rejects(() => scriviRapporto({ cartella, id: '../fuori', testo: RAPPORTO_VERO }), /id di ricerca non valido/);
  await assert.rejects(() => scriviRapporto({ cartella, id: 'ric-1', testo: '  ' }), /vuole del testo/);
  assert.equal(await leggiRapporto({ cartella, id: '../fuori' }), null);
  assert.equal(await leggiRapporto({ cartella, id: 'mai-esistita' }), null);
});

test('STATI_TERMINATI: i sei valori del contratto, in un posto solo', () => {
  assert.deepEqual([...STATI_TERMINATI].sort(), ['bloccata-dal-permesso', 'cancelled', 'done', 'failed', 'giri-esauriti', 'senza-rapporto']);
});
