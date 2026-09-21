import assert from 'node:assert/strict';
import test from 'node:test';

import { creaResearchOrchestrator } from '../src/research-orchestrator.mjs';
import { talosResearchReportDocument } from '../src/research/report.mjs';
import { leggiRapporto, statRapporto, percorsoRapporto } from '../src/research-store.mjs';

/*
 * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, piano
 * elegant-spinning-dongarra.md. `sessioni` è una Map finta, stesso
 * schema minimo di quella vera (session-registry.mjs) — questo modulo
 * opera SOLO su ciò che gli viene iniettato, mai un registro nascosto
 * (stesso principio di subagent-orchestrator.test.mjs).
 */
function vocePadre({ cartella = '/progetto', conclusa = false, controller = { abort() { this.abortato = true; } } } = {}) {
  return { cartella, conclusa, controller, messaggiFinali: null };
}

/*
 * ⭐⭐⭐ L2 (11/09/2026) — LA FIXTURE DEL RAPPORTO VERO, quella che oggi manca a una scusa.
 * Un rapporto minimo valido: intestazione + almeno un'affermazione + almeno una fonte con URL.
 * È esattamente ciò che `rileggiRapportoMinimo` (research-store.mjs) chiede, e ciò che la
 * consegna promette al modello — un cancello che chiede una forma mai dichiarata è una
 * trappola, non una difesa.
 */
const RAPPORTO_VERO = [
  '# Come stanno evolvendo gli harness agentici desktop',
  '',
  'Gli harness desktop nel 2026 convergono su tre capacità: controllo del computer, permessi per attrezzo e memoria persistente.',
  '',
  '## Fonti',
  '- https://arxiv.org/abs/2606.20023',
  '- https://www.anthropic.com/engineering/multi-agent-research-system',
].join('\n');

/*
 * ⭐⭐⭐ L4 (11/09/2026) — IL RAPPORTO CHE IL CANCELLO ACCETTA DA OGGI, e non è più prosa.
 *
 * ⛔ Non è scritto a mano: lo produce `talosResearchReportDocument`, cioè **lo stesso
 *   scrittore** che il mobile usa, portato in L3a e provato carattere per carattere contro il
 *   TypeScript originale. Una fixture scritta a mano proverebbe che il mio parser legge la mia
 *   stringa; questa prova che il cancello legge ciò che il motore SCRIVE.
 * ⛔ `judge: null` e `claimSupported: 'unchecked'` sono la verità di oggi: nessun giudice
 *   indipendente ha ancora controllato niente, e il bilancio deve dirlo («2 non verificate»)
 *   invece di mostrare due spunte verdi che nessuno ha guadagnato.
 */
const RAPPORTO_RECINTATO = talosResearchReportDocument({
  question: 'Come stanno evolvendo gli harness agentici desktop',
  summary: 'Convergono su tre capacità: controllo del computer, permessi per attrezzo e memoria persistente.',
  judge: null,
  claims: [
    {
      claim: { text: 'I permessi per attrezzo sono lo standard di fatto nel 2026.', sourceIndex: 1, quote: 'per-tool permissions' },
      passage: 'per-tool permissions are becoming the default posture',
      checks: { claimSupported: 'unchecked' },
    },
    {
      claim: { text: 'Il privilegio minimo va imposto al confine dell\'azione.', sourceIndex: 2, quote: 'action boundary' },
      passage: 'least privilege enforced outside the model at the action boundary',
      checks: { claimSupported: 'unchecked' },
    },
  ],
  sources: [
    { url: 'https://arxiv.org/abs/2606.20023', title: 'When Lower Privileges Suffice', publishedAt: '2026-06-18', obtained: 'page' },
    { url: 'https://arxiv.org/abs/2606.28739', title: 'Agent Safety Is Action Alignment', publishedAt: '2026-06-27', obtained: 'page' },
  ],
});

/*
 * ⛔⛔⛔ LA SCUSA VERBATIM della sessione `d2a453a8-67e3-4c7a-85a0-c3e1dbe10b35`, 11/09/2026,
 * ore 19:00: 290 byte, salvati in Libreria come «Research - …md» e timbrati `terminata:'done'`
 * dopo 9 `web_search`, 14 `naviga` e 484.171 token di ingresso pagati. Sta qui parola per
 * parola perché è il caso che il cancello di consegna deve respingere — e perché un giorno in
 * cui lo respingesse per un motivo DIVERSO da quello per cui fallì allora, il test lo direbbe.
 */
const SCUSA_DEL_11_SETTEMBRE = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
  + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a '
  + 'scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';

/** Il REFUSED verbatim che il kernel ha scritto quel giorno, come risultato di `document_create`. */
const REFUSED_VERBATIM = 'REFUSED. la sessione è in sola lettura: nessuna scrittura, comando o documento è permesso in questo momento. Nothing was created.';

function storeFinto() {
  const record = new Map(); // chiave: `${cartella}::${id}`
  const libreria = new Map(); // chiave: `${cartella}::${id}` -> {testo}
  const rapporti = new Map(); // chiave: `${cartella}::${id}` -> testo del rapporto DEPOSITATO
  /*
   * ⭐⭐⭐ L4 (11/09) — IL GIORNALE FINTO, e perché non poteva restare fuori.
   *
   * ⛔ Trovato dal vivo mentre scrivevo L4, non previsto: lasciando i default reali, questi
   *   test hanno creato `C:\p\.harness-ui-research\` e `C:\progetto\.harness-ui-research\` sul
   *   disco della macchina — le cartelle finte `/p` e `/progetto` risolte davvero — e il primo
   *   effetto è stato un test di `riprendi` che passava/falliva a seconda di cosa avevano
   *   scritto i test PRECEDENTI. È la lezione del 10/09 alla lettera: misuravo l'ambiente
   *   invece dell'oggetto. Da qui in giù, zero filesystem.
   * ⛔ E `mtime` è un contatore, non `Date.now()`: due scritture nello stesso millisecondo
   *   devono dare due impronte diverse, altrimenti la cache di `elenca()` servirebbe un
   *   giudizio vecchio e il test non se ne accorgerebbe mai.
   */
  const giornali = new Map(); // chiave: `${cartella}::${id}` -> evento[]
  const piani = new Map();
  const fonti = new Map(); // chiave: `${cartella}::${id}` -> ref[]
  const istantanee = new Map();
  let orologioRapporti = 0;
  const mtime = new Map(); // chiave: `${cartella}::${id}` -> mtimeMs finto
  const segnaRapporto = (chiave) => { orologioRapporti += 1; mtime.set(chiave, orologioRapporti); };
  let prossimoIdLibreria = 1;
  return {
    record, libreria, rapporti, giornali, piani, fonti, istantanee, segnaRapporto,
    /** Deposita un rapporto come farebbe `research_deposit`: il testo E la sua impronta nuova. */
    deposita(cartella, id, testo) {
      rapporti.set(`${cartella}::${id}`, testo);
      segnaRapporto(`${cartella}::${id}`);
    },
    /* ⛔ Il lettore del rapporto è iniettato: nessun test di questo file tocca un filesystem vero. */
    leggiRapportoFn: async ({ cartella, id }) => rapporti.get(`${cartella}::${id}`) ?? null,
    statRapportoFn: async ({ cartella, id }) => {
      const chiave = `${cartella}::${id}`;
      if (!rapporti.has(chiave)) return null;
      return { mtimeMs: mtime.get(chiave) ?? 0, size: rapporti.get(chiave).length };
    },
    accodaEventoFn: async ({ cartella, id, evento }) => {
      const chiave = `${cartella}::${id}`;
      giornali.set(chiave, [...(giornali.get(chiave) ?? []), evento]);
    },
    leggiGiornaleFn: async ({ cartella, id }) => ({ eventi: giornali.get(`${cartella}::${id}`) ?? [], righeSaltate: 0, byte: 0 }),
    leggiPianoFn: async ({ cartella, id }) => piani.get(`${cartella}::${id}`) ?? null,
    /*
     * ⛔ (16/09/2026, review) — le tre porte di SCRITTURA disco dovevano stare qui dal 12/09,
     *   come in session-registry.test.mjs: senza, ogni `avvia` di questi test scriveva DAVVERO
     *   `piano.json` — qui in `C:\p\.harness-ui-research\` e in `C:\progetto\.harness-ui-research\`
     *   (le cartelle finte risolte alla radice del disco) — e la scrittura gira in try/catch
     *   silente (research-orchestrator.mjs: «il piano su disco è una prova, non una condizione»),
     *   quindi nessun test si accorgeva di nulla. Contate sul disco, mtimes freschi a ogni run.
     */
    scriviPianoFn: async () => {},
    scriviFonteFn: async () => {},
    scriviIndiceFontiFn: async () => {},
    elencaFontiFn: async ({ cartella, id }) => fonti.get(`${cartella}::${id}`) ?? [],
    leggiIstantaneaCacheFn: async ({ cartella, id }) => istantanee.get(`${cartella}::${id}`) ?? null,
    scriviIstantaneaCacheFn: async ({ cartella, id, istantanea }) => { istantanee.set(`${cartella}::${id}`, istantanea); },
    creaRicercaFn: async ({ cartella, id, domanda, profondita, padreId = null, nome = null, modello = null }) => {
      const voce = {
        id, domanda, profondita, titolo: null, terminata: null, reportLibraryId: null,
        // ⭐ L8 — come lo store VERO: il modello con cui la ricerca è stata fatta sta sulla
        //   metadata, perché la voce di sessione vive in memoria e non sopravvive a un riavvio.
        modello,
        avviataAlle: '2026-08-30T10:00:00.000Z', conclusaAlle: null,
        // ⛔ `formato: 2` come lo store VERO: senza, ogni ricerca nata nei test sembrerebbe
        //   vecchia e il cancello accetterebbe il ripiego sulla prosa — cioè proverei il ramo
        //   sbagliato credendo di provare quello nuovo.
        formato: 2,
        padreId, nome, ultimoMessaggio: null, motivoDettaglio: null,
      };
      record.set(`${cartella}::${id}`, voce);
      return voce;
    },
    leggiRicercaFn: async ({ cartella, id }) => record.get(`${cartella}::${id}`) ?? null,
    aggiornaRicercaFn: async ({ cartella, id, titolo, terminata, reportLibraryId, conclusaAlle, ultimoMessaggio, motivoDettaglio }) => {
      const voce = record.get(`${cartella}::${id}`);
      if (!voce) return null;
      if (titolo !== undefined) voce.titolo = titolo;
      if (terminata !== undefined) voce.terminata = terminata;
      if (reportLibraryId !== undefined) voce.reportLibraryId = reportLibraryId;
      if (conclusaAlle !== undefined) voce.conclusaAlle = conclusaAlle;
      if (ultimoMessaggio !== undefined) voce.ultimoMessaggio = ultimoMessaggio;
      if (motivoDettaglio !== undefined) voce.motivoDettaglio = motivoDettaglio;
      return voce;
    },
    eliminaRicercaFn: async ({ cartella, id }) => {
      const chiave = `${cartella}::${id}`;
      if (!record.has(chiave)) return null;
      record.delete(chiave);
      return { id };
    },
    elencaRicercheFn: async ({ cartella }) => [...record.values()].filter((_v, i) => [...record.keys()][i].startsWith(`${cartella}::`)),
    salvaVoceLibreriaFn: async ({ cartella, testo }) => {
      const id = `lib-${prossimoIdLibreria}`;
      prossimoIdLibreria += 1;
      libreria.set(`${cartella}::${id}`, { testo });
      return id;
    },
    leggiVoceLibreriaFn: async ({ cartella, id }) => libreria.get(`${cartella}::${id}`) ?? null,
    eliminaVoceLibreriaFn: async ({ cartella, id }) => { libreria.delete(`${cartella}::${id}`); },
  };
}

function orchestratoreDiProva(sessioni, extra = {}) {
  const store = storeFinto();
  let contatoreId = 0;
  const orch = creaResearchOrchestrator({
    sessioni,
    avviaESeguiFn: () => ({ sessionId: 'mai-usato' }),
    randomUUIDFn: () => `sess-${(contatoreId += 1)}`,
    ...store,
    ...extra,
  });
  return { orch, store };
}

// BC-51: veri lettori dello store e vero parser, filesystem iniettato e contato.
function bancoProiezioneGiudice(testoIniziale, formato = 2) {
  const cartella = '/bc51';
  const id = '0925407d-1111-4111-8111-111111111111';
  const store = storeFinto();
  store.record.set(`${cartella}::${id}`, { id, domanda: 'Prova della proiezione', formato,
    terminata: 'done', modelloGiudice: 'giudice-designato-diverso', reportLibraryId: null });
  let testo = testoIniziale;
  let revisione = 1;
  const letture = [];
  const fs = {
    async readFile(file, codifica) {
      assert.equal(file, percorsoRapporto(cartella, id));
      assert.equal(codifica, 'utf8');
      letture.push(file);
      if (testo === null) throw Object.assign(new Error('File assente'), { code: 'ENOENT' });
      return testo;
    },
    async stat(file) {
      assert.equal(file, percorsoRapporto(cartella, id));
      if (testo === null) throw Object.assign(new Error('File assente'), { code: 'ENOENT' });
      return { mtimeMs: revisione, size: Buffer.byteLength(testo) };
    },
  };
  const orch = creaResearchOrchestrator({ sessioni: new Map(), ...store,
    avviaESeguiFn: () => { throw new Error('Il banco non deve avviare modelli'); },
    leggiRapportoFn: input => leggiRapporto(input, { readFileFn: fs.readFile }),
    statRapportoFn: input => statRapporto(input, { statFn: fs.stat }),
  });
  return { orch, cartella, id, letture, sostituisci: nuovo => { testo = nuovo; revisione += 1; } };
}

const rapportoConGiudiceBC51 = giudice => talosResearchReportDocument({
  question: 'Prova della proiezione', summary: 'Rapporto di prova', judge: giudice,
  claims: [{ claim: { text: 'Affermazione di prova', sourceIndex: 1, quote: 'prova' }, passage: 'prova', checks: { claimSupported: 'supported' } }],
  sources: [{ url: 'https://esempio.invalid/prova', title: 'Fonte di prova', obtained: 'page' }],
});

test('BC51-01 — done: giudice effettivo uguale in elenco e dettaglio, una lettura condivisa nei due ordini', async () => {
  for (const prima of ['elenco', 'dettaglio']) {
    const b = bancoProiezioneGiudice(rapportoConGiudiceBC51('glm-4.7-flash'));
    const elenco = async () => (await b.orch.elenca({ cartella: b.cartella })).ricerche[0];
    const dettaglio = () => b.orch.leggi({ cartella: b.cartella, id: b.id });
    const a = await (prima === 'elenco' ? elenco() : dettaglio());
    assert.equal(b.letture.length, 1, 'bilancio e giudice devono usare la stessa readFile');
    const z = await (prima === 'elenco' ? dettaglio() : elenco());
    assert.equal(b.letture.length, 1, 'l’altra vista riusa la cache del record');
    assert.equal(a.stato, 'done');
    assert.equal(z.stato, 'done');
    assert.equal(a.giudice, 'glm-4.7-flash');
    assert.equal(z.giudice, a.giudice);
    assert.deepEqual(z.bilancio, a.bilancio);
    assert.equal(a.bilancio.totali, 1);
    assert.equal(a.modelloGiudice, 'giudice-designato-diverso');
  }
});

test('BC51-02 — file assente, prosa legacy e record senza giudice: null nelle due viste', async () => {
  for (const [testo, formato] of [[null, 2], [RAPPORTO_VERO, 1], [rapportoConGiudiceBC51(null), 2]]) {
    const b = bancoProiezioneGiudice(testo, formato);
    const elenco = (await b.orch.elenca({ cartella: b.cartella })).ricerche[0];
    const dettaglio = await b.orch.leggi({ cartella: b.cartella, id: b.id });
    assert.equal(elenco.giudice, null, 'il designato non sostituisce il giudice effettivo assente');
    assert.equal(dettaglio.giudice, null);
    assert.equal(elenco.stato, dettaglio.stato);
    assert.equal(b.letture.length, 1, 'anche assenza e ripiego condividono la lettura');
  }
});

test('BC51-03 — record cambiato o rimosso: giudice e bilancio si aggiornano con una sola nuova lettura', async () => {
  const b = bancoProiezioneGiudice(rapportoConGiudiceBC51('glm-4.7-flash'));
  await b.orch.elenca({ cartella: b.cartella });
  for (const [testo, giudice, letture] of [[rapportoConGiudiceBC51('secondo-giudice'), 'secondo-giudice', 2], [null, null, 3]]) {
    b.sostituisci(testo);
    const elenco = (await b.orch.elenca({ cartella: b.cartella })).ricerche[0];
    const dettaglio = await b.orch.leggi({ cartella: b.cartella, id: b.id });
    assert.equal(elenco.giudice, giudice);
    assert.equal(dettaglio.giudice, giudice);
    assert.deepEqual(elenco.bilancio, dettaglio.bilancio);
    assert.equal(b.letture.length, letture);
  }
});

test('avvia: crea la metadata PRIMA di chiamare avviaESeguiFn (ordine verificato, non presunto)', async () => {
  const sessioni = new Map();
  const ordine = [];
  const store = storeFinto();
  const orch = creaResearchOrchestrator({
    sessioni,
    ...store,
    randomUUIDFn: () => 'sess-x',
    creaRicercaFn: async (spec) => { ordine.push('crea'); return store.creaRicercaFn(spec); },
    avviaESeguiFn: (spec) => { ordine.push('avvia'); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'Come funziona X?', depth: 'deep' });
  assert.equal(id, 'sess-x');
  assert.deepEqual(ordine, ['crea', 'avvia'], 'la metadata esiste PRIMA che la sessione parta — elimina la race con una conclusione fulminea');
});

test('⛔⛔⛔ AL CONTRARIO — avvia: torna {ok,esito,id}, MAI solo {id} — trovato dal vivo 30/8: il dispatch del kernel per research_start si aspetta lo STESSO contratto {ok,esito} degli altri 5 mutanti, e senza questo la ricerca partiva DAVVERO ma il modello leggeva "failed"', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.avvia({ cartella: '/p', question: 'Qual è la capitale della Francia?', depth: 'deep' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /Started the research «Qual è la capitale della Francia\?» \(id sess-1\)\./);
  assert.equal(esito.id, 'sess-1');
});

test('⛔⛔⛔ L1 — avvia: permessiRichiesti "Research" (MAI più "Read only"), ricercaId nel task, padreId agganciato, nome troncato', async () => {
  const sessioni = new Map();
  let ricevuto = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/progetto', question: 'Quanto costa il caching OpenRouter?', depth: 'quick', padreId: 'madre-1' });
  assert.equal(ricevuto.cartella, '/progetto');
  /*
   * ⛔ La riga per cui esiste tutto L1: con 'Read only' la ricerca non poteva consegnare, e
   * l'11/09 ha salvato come rapporto la scusa con cui si giustificava di non poterlo fare.
   */
  assert.equal(ricevuto.permessiRichiesti, 'Research');
  assert.notEqual(ricevuto.permessiRichiesti, 'Read only');
  // ⛔ Il percorso del deposito si costruisce da QUI, non da un argomento del modello.
  assert.equal(ricevuto.task.ricercaId, id, 'l\'id della ricerca viaggia dentro il task, che è persistito e sopravvive a un resume');
  assert.equal(ricevuto.padreId, 'madre-1', '§6.6: la ricerca è figlia della chat che l\'ha ordinata, non una sessione orfana');
  assert.match(ricevuto.task.consegna, /Quanto costa il caching OpenRouter\?/);
  assert.match(ricevuto.task.consegna, /couple of searches/, 'depth:quick porta la guida "breve"');
  assert.match(ricevuto.task.consegna, /research_deposit/, 'la consegna dice COME si consegna');
  assert.match(ricevuto.task.consegna, /is not the report/, 'e dice che l\'ultimo messaggio NON è il rapporto');
  assert.equal(typeof ricevuto.onConclusioneFn, 'function');
  const salvata = store.record.get(`/progetto::${id}`);
  assert.equal(salvata.padreId, 'madre-1', 'il legame è anche sulla metadata: sopravvive al riavvio, quando la voce di sessione non c\'è più');
  assert.equal(salvata.nome, 'Quanto costa il caching OpenRouter?');
});

test('§6.6 — nome: una domanda lunga è troncata a 80 caratteri, sull\'ultimo spazio', async () => {
  const sessioni = new Map();
  const lunga = 'Come stanno evolvendo gli harness agentici desktop nel 2026 e quali capacità di controllo computer offrono';
  const { orch, store } = orchestratoreDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: lunga, depth: 'deep' });
  const nome = store.record.get(`/p::${id}`).nome;
  assert.ok(nome.length <= 81, `il nome sta nel tetto di 80+ellissi imposto da registro.rinomina(), è ${nome.length}`);
  assert.ok(nome.endsWith('…'), 'un nome troncato lo dichiara');
  assert.ok(!nome.includes('capacit…'), 'taglia su uno spazio, non a metà parola');
});

test('mettiInPausa: id inesistente — rifiutato onestamente', () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = orch.mettiInPausa({ id: 'fantasma' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /no research with that id/);
});

test('mettiInPausa: sessione VIVA — abort chiamato, flag scritto, esito onesto', () => {
  const voce = vocePadre({ conclusa: false });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.mettiInPausa({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, true);
  assert.equal(voce._ricercaTerminataRichiesta, 'paused');
});

test('AL CONTRARIO — mettiInPausa: sessione già conclusa — rifiutato, NESSUN abort chiamato', () => {
  const voce = vocePadre({ conclusa: true });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.mettiInPausa({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.equal(voce.controller.abortato, undefined, 'una sessione già ferma non va abortita una seconda volta');
});

test('annulla: sessione VIVA — abort chiamato, flag "cancelled"', () => {
  const voce = vocePadre({ conclusa: false });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch } = orchestratoreDiProva(sessioni);
  const esito = orch.annulla({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, true);
  assert.equal(voce._ricercaTerminataRichiesta, 'cancelled');
});

test('⭐ annulla: sessione GIÀ ferma (in pausa) — nessun abort, solo la metadata passa a cancelled', async () => {
  const voce = vocePadre({ cartella: '/p', conclusa: true });
  const sessioni = new Map([['sess-1', voce]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.annulla({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(voce.controller.abortato, undefined);
  assert.equal(store.record.get('/p::sess-1').terminata, 'cancelled');
});

test('riprendi: id inesistente — rifiutato onestamente', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.riprendi({ id: 'fantasma' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /no research with that id/);
});

test('riprendi: senza messaggiFinali e NON interrotta — "still running", nessun avviaESegui chiamato', async () => {
  const voce = { ...vocePadre(), messaggiFinali: null, interrotta: false };
  const sessioni = new Map([['sess-1', voce]]);
  let chiamata = false;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /still running/);
  assert.equal(chiamata, false);
});

test('riprendi: senza messaggiFinali e INTERROTTA (riavvio server) — messaggio dedicato, nessun avviaESegui chiamato', async () => {
  const voce = { ...vocePadre(), messaggiFinali: null, interrotta: true };
  const sessioni = new Map([['sess-1', voce]]);
  let chiamata = false;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: () => { chiamata = true; return { sessionId: 'mai' }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /interrupted by a server restart/);
  assert.equal(chiamata, false);
});

test('riprendi: CON messaggiFinali — avviaESeguiFn riceve voceEsistente + un messaggio di continuazione in coda', async () => {
  const voce = {
    ...vocePadre({ cartella: '/p' }), messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'trovato A' }],
    taskId: 'ricerca', task: { consegna: 'x' }, forkDa: null, interrotta: false,
  };
  const sessioni = new Map([['sess-1', voce]]);
  let ricevuto = null;
  const { orch } = orchestratoreDiProva(sessioni, { avviaESeguiFn: (spec) => { ricevuto = spec; return { sessionId: spec.sessionId }; } });
  const esito = await orch.riprendi({ id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(ricevuto.sessionId, 'sess-1');
  assert.equal(ricevuto.voceEsistente, voce);
  assert.equal(ricevuto.messaggiIniziali.length, 3, 'i 2 messaggi finali + 1 di continuazione');
  assert.equal(ricevuto.messaggiIniziali.at(-1).role, 'user');
  assert.match(ricevuto.messaggiIniziali.at(-1).content, /Continue the research/);
});

test('rinomina: id inesistente — rifiutato onestamente', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.rinomina({ cartella: '/p', id: 'fantasma', title: 'x' });
  assert.equal(esito.ok, false);
});

test('rinomina: title esplicito — messaggio con il nuovo titolo, la metadata è aggiornata davvero', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.rinomina({ cartella: '/p', id: 'sess-1', title: 'Il mio titolo' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /Renamed that research to «Il mio titolo»/);
  assert.equal(store.record.get('/p::sess-1').titolo, 'Il mio titolo');
});

test('AL CONTRARIO — rinomina: title:null resetta a "mostra di nuovo la domanda", messaggio diverso', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.rinomina({ cartella: '/p', id: 'sess-1', title: null });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /shows its question again/);
  assert.equal(store.record.get('/p::sess-1').titolo, null);
});

test('elimina: id inesistente — idempotente, ok:true, "nothing to delete"', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.elimina({ cartella: '/p', id: 'fantasma' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /nothing to delete/);
});

test('elimina: con reportLibraryId — cancella ANCHE la voce di Libreria, non solo la metadata', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: 'rapporto' });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-1', terminata: 'done', reportLibraryId: libId });
  const esito = await orch.elimina({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.ok, true);
  assert.equal(store.record.has('/p::sess-1'), false);
  assert.equal(store.libreria.has(`/p::${libId}`), false, 'il rapporto in Libreria è sparito anche lui');
});

test('elenca: filtra per status, deriva il bucket dal vivo (non dalla sola metadata)', async () => {
  const sessioni = new Map([
    ['sess-running', vocePadre({ cartella: '/p', conclusa: false })],
    ['sess-paused', vocePadre({ cartella: '/p', conclusa: true })],
  ]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-running', domanda: 'A' });
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-paused', domanda: 'B' });
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-done', domanda: 'C' });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-done', terminata: 'done' });
  // ⭐ L4 — «done» in metadata non basta più NEMMENO IN ELENCO: senza un rapporto rileggibile
  //   la riga dice `senza-rapporto`. Qui il rapporto c'è, quindi `done` è meritato.
  store.deposita('/p', 'sess-done', RAPPORTO_RECINTATO);

  const tutte = await orch.elenca({ cartella: '/p' });
  assert.equal(tutte.totale, 3);
  const bucketDi = (id) => tutte.ricerche.find((r) => r.id === id).stato;
  assert.equal(bucketDi('sess-running'), 'running');
  assert.equal(bucketDi('sess-paused'), 'paused');
  assert.equal(bucketDi('sess-done'), 'done');

  const soloRunning = await orch.elenca({ cartella: '/p', status: 'running' });
  assert.equal(soloRunning.totale, 1);
  assert.equal(soloRunning.ricerche[0].id, 'sess-running');
});

test('AL CONTRARIO — elenca: una sessione MAI tracciata (server riavviato, nessun voce in sessioni) è "failed", mai "running" per sempre', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-fantasma', domanda: 'x' });
  const esito = await orch.elenca({ cartella: '/p' });
  assert.equal(esito.ricerche[0].stato, 'failed');
});

test('AL CONTRARIO — elenca: una sessione INTERROTTA da un riavvio (interrotta:true) è "failed", mai "running"', async () => {
  const sessioni = new Map([['sess-1', { ...vocePadre({ cartella: '/p', conclusa: false }), interrotta: true }]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.elenca({ cartella: '/p' });
  assert.equal(esito.ricerche[0].stato, 'failed');
});

test('⛔⛔ elenca: page_size/offset NON numerici (o 0) sono clampati, mai trattati come "assenti" (stesso bug già trovato in Notes)', async () => {
  const { orch, store } = orchestratoreDiProva(new Map());
  for (let i = 1; i <= 3; i += 1) await store.creaRicercaFn({ cartella: '/p', id: `sess-${i}`, domanda: `q${i}` });
  const conZero = await orch.elenca({ cartella: '/p', page_size: 0 });
  assert.equal(conZero.ricerche.length, 1, 'page_size:0 si riporta al minimo 1, non al default 10');
});

test('leggi: id inesistente — trovata:false', async () => {
  const { orch } = orchestratoreDiProva(new Map());
  const esito = await orch.leggi({ cartella: '/p', id: 'fantasma' });
  assert.deepEqual(esito, { trovata: false });
});

test('leggi: ricerca "done" con un rapporto DEPOSITATO e valido — contenutoRapporto è il testo vero', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  store.deposita('/p', 'sess-1', RAPPORTO_RECINTATO);
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: RAPPORTO_RECINTATO });
  await store.aggiornaRicercaFn({ cartella: '/p', id: 'sess-1', terminata: 'done', reportLibraryId: libId, titolo: 'Titolo scelto' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.trovata, true);
  assert.equal(esito.stato, 'done');
  assert.equal(esito.titolo, 'Titolo scelto');
  assert.equal(esito.contenutoRapporto, RAPPORTO_RECINTATO);
  assert.equal(esito.motivo, null, 'un «motivo» su una cosa riuscita sarebbe rumore');
});

test('⛔⛔⛔ §6.5 COMPATIBILITÀ ALL\'INDIETRO — una ricerca già su disco con terminata:"done" e in Libreria la SCUSA del 11/09 si mostra "senza-rapporto", e il file NON viene riscritto', async () => {
  const sessioni = new Map([['d2a453a8', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  const libId = await store.salvaVoceLibreriaFn({ cartella: '/p', testo: SCUSA_DEL_11_SETTEMBRE });
  /*
   * ⛔ L4 — la voce si costruisce A MANO, com'era sul disco prima dell'11/09: **senza
   *   `formato`**. Passando da `creaRicercaFn` avrebbe `formato: 2` e il cancello le
   *   chiederebbe il record recintato — cioè proverei il ramo nuovo credendo di provare la
   *   compatibilità all'indietro. La forma di una fixture vecchia deve essere vecchia davvero.
   * ⛔ E nessun rapporto depositato: è una ricerca nata prima che `research_deposit` esistesse.
   */
  store.record.set('/p::d2a453a8', {
    id: 'd2a453a8', domanda: 'Come stanno evolvendo gli harness agentici desktop nel 2026',
    profondita: 'deep', titolo: null, avviataAlle: '2026-09-11T18:56:46.041Z',
    terminata: 'done', reportLibraryId: libId,
  });

  const esito = await orch.leggi({ cartella: '/p', id: 'd2a453a8' });
  assert.equal(esito.stato, 'senza-rapporto', 'il timbro verde non regge alla rilettura del contenuto');
  assert.equal(esito.contenutoRapporto, null, 'una scusa non si serve come rapporto');
  assert.equal(esito.contenutoRespinto, SCUSA_DEL_11_SETTEMBRE, 'ma il testo pagato non si butta: esce da una porta che dichiara di essere quella degli scarti');
  assert.match(esito.motivo, /non ha un'intestazione|non elenca nessuna fonte/, 'il motivo dice PERCHÉ, in italiano');
  // ⛔ Ciò che è costato denaro non si sovrascrive: la correzione vive nella LETTURA.
  assert.equal(store.record.get('/p::d2a453a8').terminata, 'done', 'il record su disco resta com\'era: nessuna riscrittura in silenzio');
  assert.equal(store.record.get('/p::d2a453a8').reportLibraryId, libId, 'e il puntatore al lavoro già pagato non si perde');
});

test('leggi: ricerca ancora "running" — contenutoRapporto è null, mai un tentativo di leggerlo', async () => {
  const sessioni = new Map([['sess-1', vocePadre({ cartella: '/p', conclusa: false })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  await store.creaRicercaFn({ cartella: '/p', id: 'sess-1', domanda: 'x' });
  const esito = await orch.leggi({ cartella: '/p', id: 'sess-1' });
  assert.equal(esito.stato, 'running');
  assert.equal(esito.contenutoRapporto, null);
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * L2 — IL CANCELLO DI CONSEGNA. I cinque esiti, uno per test, più i due versi contrari.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function conclusioneDiProva(sessioni, extra = {}) {
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => {
      onConclusioneCatturata = spec.onConclusioneFn;
      if (!sessioni.has(spec.sessionId)) sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false }));
      return { sessionId: spec.sessionId };
    },
    ...extra,
  });
  return { orch, store, conclusione: (risultato) => onConclusioneCatturata(risultato) };
}

test('L2 — rapporto DEPOSITATO e valido: terminata:"done", la Libreria porta il rapporto VERO (non l\'ultimo messaggio)', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.deposita(`/p`, id, RAPPORTO_RECINTATO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Fatto, il rapporto è pronto.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, RAPPORTO_RECINTATO, 'in Libreria finisce il DEPOSITO, non la chiacchiera finale');
  assert.equal(record.ultimoMessaggio, 'Fatto, il rapporto è pronto.', 'l\'ultimo messaggio si conserva come ALLEGATO');
  assert.ok(record.conclusaAlle, 'conclusaAlle è scritto una volta sola, alla conclusione vera');
});

test('⛔⛔⛔ L2, LA FIXTURE DEL GUASTO — la scusa verbatim del 11/09 + un REFUSED di permesso ⇒ "bloccata-dal-permesso", MAI "done"', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'Come stanno evolvendo gli harness agentici desktop nel 2026', depth: 'deep' });
  // ⛔ Nessun rapporto depositato: è esattamente lo stato in cui la corsa vera si è trovata.
  await conclusione({
    ok: true,
    esito: {
      comeFinita: 'concluso', // ⛔ il kernel diceva `outcome: success`: per lui la corsa ERA riuscita
      messaggiFinali: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'document_create' } }] },
        { role: 'tool', tool_call_id: 'c1', content: REFUSED_VERBATIM },
        { role: 'assistant', content: SCUSA_DEL_11_SETTEMBRE },
      ],
    },
  });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'bloccata-dal-permesso');
  assert.notEqual(record.terminata, 'done', 'una scusa non è più una consegna');
  assert.equal(record.reportLibraryId, null, 'e non finisce in Libreria spacciata per un rapporto');
  assert.equal(store.libreria.size, 0);
  assert.equal(record.ultimoMessaggio, SCUSA_DEL_11_SETTEMBRE, 'la scusa si conserva: è la diagnosi, non il prodotto');
  const esito = await orch.leggi({ cartella: '/p', id });
  assert.match(esito.motivo, /sola lettura/, 'il prodotto nomina il proprio errore, in italiano');
});

test('⛔ L2 AL CONTRARIO — la scusa DA SOLA, senza nessun REFUSED nei risultati degli attrezzi, non basta a dire "bloccata dal permesso"', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: SCUSA_DEL_11_SETTEMBRE }] } });
  /*
   * ⛔ È la lezione «un filtro che riconosce la MENZIONE invece della cosa»: il testo PARLA di
   * sola lettura, ma nel registro non c'è nessun rifiuto. Diagnosi sbagliata ⇒ cura sbagliata.
   */
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('⛔ L2 AL CONTRARIO — un REFUSED citato DAL MODELLO (role:"assistant") non conta: conta il registro degli attrezzi, non il racconto', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: `Mi ha risposto: «${REFUSED_VERBATIM}»` }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('L2 — nessun rapporto e giri finiti: "giri-esauriti" (non "failed": è un guasto noto e si cura in un altro modo)', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'assistant', content: 'Trovato parziale.' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'giri-esauriti');
  assert.equal(record.reportLibraryId, null, 'un parziale non depositato non diventa un rapporto');
  assert.equal(record.ultimoMessaggio, 'Trovato parziale.');
});

test('⭐ L2 — un rapporto VALIDO depositato E i giri esauriti: vince il PRODOTTO, "done". L\'errore opposto va evitato con la stessa cura', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.deposita(`/p`, id, RAPPORTO_RECINTATO);
  await conclusione({ ok: true, esito: { comeFinita: 'giri-esauriti', messaggiFinali: [{ role: 'assistant', content: 'ho finito i giri' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'done', 'chi ha consegnato ha consegnato: i giri finiti dopo non annullano la consegna');
});

test('L4 — rapporto col RECORD ma SENZA FONTI: "senza-rapporto", e il motivo nomina il record', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  // ⛔ Il recinto c'è e si rilegge: quello che manca è la sostanza, ed è per QUELLA che si respinge.
  store.deposita('/p', id, talosResearchReportDocument({
    question: 'x', summary: 'una sintesi', judge: null,
    claims: [{ claim: { text: 'Una affermazione senza prove.', sourceIndex: 1, quote: 'q' }, passage: '', checks: { claimSupported: 'unchecked' } }],
    sources: [],
  }));
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'fatto' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'senza-rapporto');
  assert.equal(record.motivoDettaglio, 'il record del rapporto non elenca nessuna fonte');
  assert.equal(store.libreria.size, 0, 'un rapporto che non passa il cancello non entra in Libreria');
});

/*
 * ⭐⭐⭐ L4 — LA PROSA DA SOLA NON BASTA PIÙ, e questo è il cambio di NATURA del cancello.
 *
 * Il testo qui sotto passava L2 in pieno: titolo, affermazioni, una sezione «## Fonti» con due
 * URL veri. È esattamente ciò che si legge bene e non si può ricontrollare — nessuna
 * affermazione è legata alla sua fonte, nessun passaggio è conservato, e fra un mese nessuno
 * potrà chiedere «come l'avete verificato». ⇒ per una ricerca nata OGGI (`formato: 2`) è
 * `senza-rapporto`, col motivo che nomina esattamente ciò che manca.
 */
test('⛔⛔⛔ L4, VERSO CONTRARIO — un rapporto in PROSA che passava L2 non passa più: manca il record, e il motivo lo dice', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.deposita('/p', id, RAPPORTO_VERO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'fatto' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'senza-rapporto');
  assert.match(record.motivoDettaglio, /record verificabile/);
  assert.equal(store.libreria.size, 0);
  // ⛔ Ma il lavoro pagato non sparisce: si legge, da una porta che dichiara di essere quella degli scarti.
  const letta = await orch.leggi({ cartella: '/p', id });
  assert.equal(letta.contenutoRapporto, null);
  assert.equal(letta.contenutoRespinto, RAPPORTO_VERO);
});

/*
 * ⭐⭐⭐ L4 — IL RIPIEGO, e che sia STRETTO si prova qui: LO STESSO testo, due esiti opposti,
 * e l'unica differenza è l'età della ricerca. Senza questo test «ripiego consentito» sarebbe
 * una parola in un commento.
 */
test('⭐⭐⭐ L4 — la STESSA prosa su una ricerca VECCHIA (senza `formato`) passa col ripiego, e lo dichiara', async () => {
  const sessioni = new Map([['vecchia', vocePadre({ cartella: '/p', conclusa: true })]]);
  const { orch, store } = orchestratoreDiProva(sessioni);
  store.record.set('/p::vecchia', {
    id: 'vecchia', domanda: 'Una domanda di ieri', avviataAlle: '2026-09-01T10:00:00.000Z',
    terminata: 'done', reportLibraryId: null,
  });
  store.deposita('/p', 'vecchia', RAPPORTO_VERO);
  const letta = await orch.leggi({ cartella: '/p', id: 'vecchia' });
  assert.equal(letta.stato, 'done', 'a chi è nato prima del record non si chiede l\'impossibile');
  assert.equal(letta.contenutoRapporto, RAPPORTO_VERO);
  assert.equal(letta.bilancio, null, 'ma un bilancio non si inventa: senza record non ce n\'è uno, e `null` non è «tutto a zero»');
  assert.equal(letta.proveDistinte, 0);
});

test('⭐ L2 — il rapporto è su disco ma la Libreria lancia: resta "done" con reportLibraryId null — il posto vero del rapporto è la sua cartella', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni, {
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  store.deposita(`/p`, id, RAPPORTO_RECINTATO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'fatto' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done', 'ciò che è costato denaro non si dichiara perso perché una COPIA non è riuscita');
  assert.equal(record.reportLibraryId, null, 'e non si inventa un id di Libreria che non esiste');
});

test('AL CONTRARIO — conclusione senza NESSUN testo assistente e senza rapporto: "failed", zero voci in Libreria', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'failed');
  assert.equal(record.reportLibraryId, null);
  assert.equal(record.ultimoMessaggio, null);
  assert.equal(store.libreria.size, 0);
});

/*
 * ⭐⭐⭐ CONTRATTO — CRESCIUTO DA DODICI A QUATTORDICI CAMPI, l'11/09 con L4, e il perché va
 * scritto qui perché è l'unico posto che qualcuno rileggerà quando cambierà di nuovo.
 *
 * I dodici di L2 restano **identici**: stesso nome, stesso tipo, stesso significato. Si
 * aggiungono `bilancio` e `proveDistinte`, e si aggiungono perché §6.7 dice che la riga in
 * elenco deve guidare **col bilancio** e mai col conteggio delle fonti — e fino a ieri l'elenco
 * non aveva il dato per farlo, quindi la sezione non poteva che mostrare un timbro.
 *
 * ⛔ La crescita è ADDITIVA per scelta: un contratto che cambia un campo esistente rompe un
 *   frontend in silenzio, uno che ne aggiunge due no. E il `deepEqual` sulle chiavi resta,
 *   proprio perché la prossima crescita debba passare da qui invece di scivolare dentro.
 */
/*
 * ⭐⭐⭐⭐ L8 (12/09/2026) — QUINDICESIMO CAMPO: `modello`.
 *
 * Perché è cresciuto ancora, e perché proprio questo: il 12/09 la ricerca `3029dea2` è girata
 * con `z-ai/glm-4.7-flash` mentre la chat che l'aveva ordinata girava con `z-ai/glm-5.3-flash`,
 * e dalla sezione non si poteva vedere. Due ricerche fatte con due modelli diversi non sono
 * confrontabili: la riga deve dire con che cosa è stata fatta, o quel confronto è cieco.
 * ⛔ Additivo come gli altri due: nessuno dei quattordici cambia nome, tipo o significato.
 */
/*
 * ⭐⭐⭐⭐ L9 (12/09/2026) — SEDICESIMO CAMPO: `modelloGiudice`.
 *
 * Perché è cresciuto di nuovo, e perché proprio questo. Da L9 la verifica gira DAVVERO prima
 * del deposito, e il verdetto lo dà un modello che non è l'autore — la misura che lo impone è
 * Panickssery, Bowman e Feng, «LLM Evaluators Recognize and Favor Their Own Generations»
 * (arXiv:2404.13076, 15/04/2024): gli LLM riconoscono i propri testi e li premiano, con «a
 * linear correlation between self-recognition capability and the strength of self-preference
 * bias».
 *
 * ⛔ Ma «chi è stato SCELTO a giudicare» e «chi ha giudicato DAVVERO» sono due fatti diversi:
 *   il secondo esce da `leggi()` come `giudice` (sta nel record del rapporto), il primo vive
 *   sulla metadata fin dalla nascita della ricerca ed è questo. Quando divergono — un giudice
 *   designato che non ha mai risposto — è esattamente il caso che la sezione deve poter
 *   mostrare, e senza questo campo sarebbe indistinguibile da «non c'era nessun altro modello».
 *
 * ⛔ Additivo come i tre prima: nessuno dei quindici cambia nome, tipo o significato. E il
 *   `deepEqual` sulle chiavi resta, perché la prossima crescita debba passare da qui invece di
 *   scivolare dentro in silenzio.
 */
test('⭐⭐⭐ CONTRATTO §6.4 — ogni voce di elenca() porta i diciannove campi della sezione, incluso il giudice effettivo BC-51', async () => {
  const sessioni = new Map();
  const { orch, store, conclusione } = conclusioneDiProva(sessioni);
  const { id } = await orch.avvia({ cartella: '/p', question: 'Quanto costa il caching?', depth: 'deep', padreId: 'madre-1', modello: 'z-ai/glm-5.3-flash' });
  store.deposita(`/p`, id, RAPPORTO_RECINTATO);
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'pronto' }] } });

  const { ricerche } = await orch.elenca({ cartella: '/p' });
  assert.equal(ricerche.length, 1);
  const v = ricerche[0];
  assert.deepEqual(Object.keys(v).sort(), [
    'avviataAlle', 'bilancio', 'conclusaAlle', 'domanda', 'giudice', 'id', 'modello', 'modelloGiudice',
    'motivo', 'motivoErrore', 'nome', 'padreId', 'proveDistinte', 'question', 'reportLibraryId',
    'riprendibile', 'stato', 'titolo', 'ultimoMessaggio',
  ], 'il contratto è esattamente questo: il frontend ci sta scrivendo sopra');
  /*
   * BC-51 (12/09/2026) — diciannove: i diciotto di BC-44, più `giudice` effettivo.
   * ⛔ L'elenco si aggiorna A MANO apposta, ed è il motivo per cui questo test esiste in questa
   *   forma: una crescita del contratto deve costare una riga a chi la fa, così si vede. I
   *   sedici di prima non cambiano nome, tipo né significato.
   */
  assert.equal(v.riprendibile, false, 'una ricerca conclusa non si riprende: il pulsante non deve nemmeno esistere');
  assert.equal(v.motivoErrore, null, '⛔ `null`, mai un oggetto vuoto: «non è caduta» e «è caduta per un motivo che non sappiamo» sono due fatti diversi');
  assert.equal(v.modello, 'z-ai/glm-5.3-flash', 'la riga dice con che cosa la ricerca è stata fatta — il 12/09 non lo diceva, e la figlia girava su un altro modello');
  assert.deepEqual(v.bilancio, { totali: 2, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 2 },
    'il bilancio dice la verità di oggi: due affermazioni, nessun giudice, due non verificate — mai due spunte verdi che nessuno ha guadagnato');
  assert.equal(v.proveDistinte, 2, 'due fonti diverse portano un passaggio davvero ritrovato');
  assert.equal(v.id, id);
  assert.equal(v.question, 'Quanto costa il caching?');
  assert.equal(v.question, v.domanda, 'due nomi, lo stesso valore: mai una traduzione muta a metà strada');
  assert.equal(v.stato, 'done');
  assert.equal(v.motivo, null, 'motivo solo quando NON è done');
  assert.equal(v.padreId, 'madre-1');
  assert.equal(v.nome, 'Quanto costa il caching?');
  assert.ok(v.conclusaAlle);
  assert.ok(v.reportLibraryId);
  assert.equal(v.ultimoMessaggio, 'pronto');
});

test('CONTRATTO — una voce vecchia (nata senza padreId/nome/conclusaAlle) non rompe il contratto: null onesti, nome ricavato dalla domanda', async () => {
  const sessioni = new Map();
  const { orch, store } = orchestratoreDiProva(sessioni);
  // Una riga come quelle già su disco prima dell'11/09: quattro campi e basta.
  store.record.set('/p::vecchia', { id: 'vecchia', domanda: 'Una domanda di ieri', avviataAlle: '2026-09-01T10:00:00.000Z', terminata: 'cancelled' });
  const { ricerche } = await orch.elenca({ cartella: '/p' });
  const v = ricerche[0];
  assert.equal(v.padreId, null);
  assert.equal(v.conclusaAlle, null, 'mai una data inventata per un campo che non esisteva');
  assert.equal(v.ultimoMessaggio, null);
  assert.equal(v.modello, null, 'L8 — `null` onesto: quella corsa un modello ce l\'ha avuto, ma nessuno l\'ha registrato, e attribuirle quello di oggi sarebbe inventare una scelta');
  assert.equal(v.modelloGiudice, null, 'L9 — stessa onestà: una ricerca di ieri non ha mai avuto un giudice designato, e dargliene uno adesso sarebbe raccontare una scelta che nessuno ha fatto');
  assert.equal(v.nome, 'Una domanda di ieri');
  assert.equal(v.stato, 'cancelled');
  assert.match(v.motivo, /fermata per sempre/);
});

test('AL CONTRARIO — salvaVoceLibreriaFn che lancia: "failed", mai un successo inventato', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; return { sessionId: spec.sessionId }; },
    salvaVoceLibreriaFn: async () => { throw new Error('disco pieno'); },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'testo' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, 'failed');
});

test('la pausa (via onConclusioneFn): terminata resta null, ZERO scritture in Libreria', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false })); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  orch.mettiInPausa({ id }); // scrive il flag SUL voce, non abortisce per davvero nel test (il controller.abort finto lo marca soltanto)
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'testo parziale mai finito' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, null, 'una pausa non finalizza mai la ricerca');
  assert.equal(record.reportLibraryId, null);
  assert.equal(store.libreria.size, 0);
});

test('⭐⭐⭐ AL CONTRARIO — il flag si azzera: pausa → ripresa → conclusione NATURALE non viene scambiata per una seconda pausa', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => {
      onConclusioneCatturata = spec.onConclusioneFn;
      if (!sessioni.has(spec.sessionId)) sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false }));
      return { sessionId: spec.sessionId };
    },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });

  // Primo giro: pausa.
  orch.mettiInPausa({ id });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'parziale' }] } });
  assert.equal(store.record.get(`/p::${id}`).terminata, null, 'dopo la pausa, ancora resumable');
  assert.equal(sessioni.get(id)._ricercaTerminataRichiesta, null, 'il flag è stato azzerato subito dopo averlo letto');

  // Secondo giro: ripresa che stavolta conclude DAVVERO da sola (nessuna pausa chiesta).
  const voce = sessioni.get(id);
  voce.messaggiFinali = [{ role: 'assistant', content: 'parziale' }];
  voce.taskId = 'ricerca'; voce.task = { consegna: 'x' }; voce.interrotta = false;
  await orch.riprendi({ id });
  // ⭐ L2: la ripresa consegna DAVVERO, cioè deposita. Prima d'oggi «consegnare» voleva dire «dire qualcosa».
  store.deposita(`/p`, id, RAPPORTO_RECINTATO);
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Depositato.' }] } });

  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'done', 'la conclusione naturale del SECONDO giro non è scambiata per un\'altra pausa');
  assert.ok(record.reportLibraryId);
  assert.equal(store.libreria.get(`/p::${record.reportLibraryId}`).testo, RAPPORTO_RECINTATO);
});

test('la cancellazione (via onConclusioneFn): terminata:"cancelled", ZERO scritture in Libreria', async () => {
  const sessioni = new Map();
  let onConclusioneCatturata = null;
  const { orch, store } = orchestratoreDiProva(sessioni, {
    avviaESeguiFn: (spec) => { onConclusioneCatturata = spec.onConclusioneFn; sessioni.set(spec.sessionId, vocePadre({ cartella: spec.cartella, conclusa: false })); return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella: '/p', question: 'x', depth: 'deep' });
  orch.annulla({ id });
  await onConclusioneCatturata({ ok: true, esito: { comeFinita: 'fermato', messaggiFinali: [{ role: 'assistant', content: 'x' }] } });
  const record = store.record.get(`/p::${id}`);
  assert.equal(record.terminata, 'cancelled');
  assert.equal(store.libreria.size, 0);
});
