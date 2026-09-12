/**
 * research-orchestrator.mjs — FASE N, ottavo sistema (30/8): Deep
 * Research, "fetta onesta" (owner, AskUserQuestion: "Fetta onesta
 * (consigliato)"). Mirror ARCHITETTURALE di `subagent-orchestrator.mjs`
 * (FASE C): istanziato UNA volta dentro `session-registry.mjs`, dove
 * `avviaESegui`/`sessioni` sono in scope — gli 8 callback `onRicerca*`
 * che `avviaESegui` costruisce sono thin delegate verso i metodi qui,
 * stesso principio di `onDelega` verso `delegaSottoTask`.
 *
 * ⭐⭐⭐ La FORMA che serve è DIVERSA da `delegaSottoTask`: quella BLOCCA
 * (una Promise risolta solo alla conclusione del figlio, per il
 * dispatcher del kernel del PADRE che aspetta un riassunto SINCRONO
 * dentro lo stesso giro). `research_start` deve tornare SUBITO con un
 * id (mobile, `researchTools.ts`: "avvia e torna SUBITO... una
 * ricerca dura minuti, e un tool che aspetta terrebbe occupato il giro
 * di conversazione per tutto quel tempo") — qui `onConclusioneFn` si
 * PASSA e basta, mai atteso: esattamente come `avviaESegui` stesso fa
 * per OGNI sessione (avvia, ritorna `{sessionId}`, il `.then()` gira
 * in background).
 *
 * L'id di una ricerca È il sessionId della sessione che la esegue — un
 * solo spazio di identità, mai una mappatura a parte, mai
 * disallineabile per costruzione.
 *
 * ⭐⭐⭐ Deep Research è PER-PROGETTO (vedi la doc di testa di
 * `research-store.mjs`): la ricerca gira nella STESSA cartella della
 * sessione che l'ha avviata (mai un workspace dedicato) — il suo
 * rapporto finale, salvato in Libreria via `salvaVoceLibreriaFn`,
 * finisce quindi nella Libreria di QUEL progetto, raggiungibile dalle
 * sessioni future sullo stesso progetto (mobile: "i rapporti di
 * ricerca SONO file di Libreria"). `permessi:'Read only'` — la ricerca
 * non deve MAI scrivere/eseguire nel progetto ospite, solo cercare/
 * leggere/sintetizzare: difesa in profondità, il prompt lo dice E il
 * permesso lo garantisce, mai uno solo dei due.
 *
 * ⛔⛔⛔ Pausa/ripresa RIUSANO la macchina già costruita per il bottone
 * Stop (`voce.controller.abort()`) e per `resume()` — non un secondo
 * meccanismo. L'AMBIGUITÀ che questo risolve, trovata leggendo
 * `talosHarness.mjs` (comeSonoFinitiIGiri) prima di scrivere una riga:
 * `comeFinita.esito==='fermato'` copre SIA "ho chiamato io l'abort per
 * una pausa" SIA "il modello ha semplicemente smesso di generare senza
 * rispondere senza che nessuno l'abbia fermato" — indistinguibili dal
 * SOLO esito del kernel. Cura: un flag sulla VOCE stessa (proprietà
 * dinamica, mai nello schema condiviso di `avviaESegui`), scritto
 * PRIMA di abortire, letto e SEMPRE azzerato dentro
 * `onConclusioneRicerca` — mai lasciato sporco per il giro successivo
 * (altrimenti una ripresa che poi conclude DAVVERO verrebbe scambiata
 * per un'altra pausa, silenziosamente: il bug esatto che un test
 * dedicato sotto verifica AL CONTRARIO).
 *
 * ⛔ Nessuno stato "sta girando ORA" è mai scritto su disco (vedi
 * `research-store.mjs`): `statoVivo()` lo deriva SEMPRE dal vivo,
 * confrontando `terminata` (research-store) con lo stato REALE della
 * sessione in `sessioni` — per costruzione non può disallinearsi.
 */

/*
 * ⛔ L2 (11/09) — i DUE default del lettore di rapporti. Importati e non ri-scritti: il posto
 * del rapporto e la sua forma minima vivono in `research-store.mjs`, insieme a chi lo scrive.
 * Restano entrambi iniettabili (vedi `creaResearchOrchestrator`), quindi i test non toccano
 * mai un filesystem — stessa disciplina di tutte le altre `*Fn` di questo modulo.
 */
import {
  accodaEvento, elencaFonti, leggiFonte, leggiGiornale, leggiIndiceFonti, leggiIstantaneaCache,
  leggiPiano, leggiRapporto, rileggiRapportoMinimo, scriviFonte, scriviIndiceFonti,
  scriviIstantaneaCache, scriviPiano, statRapporto,
} from './research-store.mjs';
import { talosResearchFetchCache } from './research/fetch-cache.mjs';
/*
 * ⭐⭐⭐⭐ L9 (12/09/2026) — IL MOTORE PORTATO COMINCIA A LAVORARE DENTRO LA CORSA.
 *
 * L4 aveva agganciato tre file su venti (`report`, `run`, `verification` per il solo bilancio),
 * L5 un quarto (`recheck`). Il resto — il piano, il collettore, il giudizio vero, la contraria,
 * l'indipendenza, la fedeltà — restava «portato e provato, mai chiamato»: giornale con tre
 * eventi, `Piano` e `Speso` vuoti, e 38 affermazioni su 38 marcate «non verificate» sul giro
 * vero del 12/09 (`CODA-UNICA-DEBITI`, voce «L8 #2 ✅ CHIUDE»).
 *
 *   `plan.mjs`         i rami per profondità (2/4/6) e il COSTO ATTESO, detto PRIMA di partire;
 *   `raccolta-viva.mjs` il ponte per cui `web_search`/`naviga` della figlia diventano passi del
 *                      giornale, spesa contata, cache che prende e fonti tenute su disco;
 *   `verification.mjs` i tre livelli veri, col giudice che NON è l'autore;
 *   `opposing.mjs`     la contraria cercata apposta;
 *   `independence.mjs` le prove distinte, contate a gruppi e non a URL;
 *   `fidelity.mjs`     il punteggio, con la data — «un punteggio senza data è una promessa che
 *                      scade in silenzio».
 *
 * ⛔ Nessuno di questi entra nel kernel, oggi come ieri: il kernel riceve UNA porta
 *   (`cacheWeb`, la stessa firma di `fetch-cache.around`) e una funzione (`onPaginaLetta`), e
 *   non importa una sola riga di `src/research/`.
 */
import { talosResearchFidelity } from './research/fidelity.mjs';
import { talosResearchIndependentSources } from './research/independence.mjs';
import { talosResearchOpposingPrompt } from './research/opposing.mjs';
import {
  TALOS_RESEARCH_DEPTHS, talosResearchPlanCost, talosResearchPlanFor, talosResearchPlanTotals,
} from './research/plan.mjs';
import { creaRaccoltaViva } from './research/raccolta-viva.mjs';
/*
 * ⭐⭐⭐ L4 (11/09/2026) — IL MOTORE PORTATO DAL MOBILE ENTRA IN SCENA.
 *
 * Fino a ieri `src/research/` era un albero nuovo che **nessuno chiamava** (L3a/L3b lo dicono
 * entrambi, nel loro «cosa NON ho verificato»): venti file, 275 test verdi, zero chiamanti.
 * Queste tre righe sono il primo aggancio, e agganciano esattamente due cose:
 *
 *   `report.mjs`       il record recintato ```talos-research-report — il cancello di consegna
 *                      smette di giudicare la PROSA e comincia a giudicare il RECORD;
 *   `run.mjs`          il replay del giornale — la ripresa smette di dipendere da
 *                      `voce.messaggiFinali` (che un riavvio cancella) e riparte dal disco;
 *   `verification.mjs` il bilancio delle affermazioni, che è ciò con cui la riga in elenco
 *                      guida (§6.7: mai col conteggio delle fonti).
 *
 * ⛔ Nessuno di questi import entra nel kernel: `talosHarness.mjs` importa TRE costanti da
 *   `research-store.mjs` e niente altro, e `research-store.mjs` continua a non importare nulla
 *   da `src/research/`. Il motore vive qui, nel direttore — non nel cancello di sicurezza.
 */
import { talosResearchParseReport, talosResearchReportDocument, talosResearchSupportLabel } from './research/report.mjs';
/*
 * ⭐⭐⭐ L5 (12/09/2026) — IL MOTORE DELLA RI-VERIFICA NEL TEMPO, agganciato per la prima volta.
 *
 * `recheck.mjs` era, come tutto `src/research/`, un albero senza chiamanti. Lo chiama la rotta
 * `POST …/research/:id/riverifica`, ed è il «+1.1» del disegno (§6.8): la riga della tabella
 * dove OGNI concorrente ispezionato ha ❌, perché per farla serve aver tenuto il TESTO, non
 * l'URL.
 *
 * ⛔⛔ E QUI VA DETTO SUBITO COSA OGGI NON SI PUÒ MISURARE, perché il modulo, se lo si chiama
 *   senza saperlo, risponde una bugia educata. `talosResearchRecheckReport` vuole
 *   `keptByUrl`: il testo tenuto, **per url**. Sul disco di oggi quel testo non è
 *   ricostruibile — `fonti/<sha256>.txt` è indirizzato dal CONTENUTO (nessun url nel nome), e
 *   il giornale porta `resultRef` ma non l'indirizzo da cui quel testo viene. ⇒ la mappa è
 *   vuota, e con una mappa vuota `talosResearchSurvival` torna **1** («niente di ciò su cui ci
 *   appoggiavamo è sparito») e la fonte esce **`intact`**. Sarebbe un timbro «intatta» su una
 *   pagina che nessuno ha mai confrontato: esattamente il segno di verifica falso che tutto
 *   questo disegno esiste per togliere.
 * ⇒ Il lettore qui sotto NON pubblica `intact` quando il testo tenuto manca: pubblica
 *   `non-misurabile`, e dice perché. La metà che invece è vera **senza** testo tenuto — «il
 *   passaggio citato è ancora ritrovabile in quella pagina?» — si misura eccome, perché il
 *   passaggio sta nel record del rapporto, non nel testo tenuto: ed è la metà che `recheck.mjs`
 *   stesso dichiara essere «nessuna euristica, nessuna soglia, nessuna opinione».
 */
import { talosResearchRecheckReport } from './research/recheck.mjs';
import {
  talosResearchIsTerminal, talosResearchNextStep, talosResearchRecover,
  talosResearchReplay, talosResearchSpent, talosResearchWorkLeft,
} from './research/run.mjs';
import {
  talosResearchJudgePrompt, talosResearchPickJudge, talosResearchVerifiedStanding,
  talosResearchVerify,
} from './research/verification.mjs';

/**
 * ⭐⭐⭐ L4 §6.5 — IL CANCELLO DI CONSEGNA, SUL RECORD VERO.
 *
 * L2 controllava la PROSA: un titolo, una riga di testo, un URL sotto «## Fonti». Bastava a
 * respingere la scusa da 290 byte dell'11/09 — ed era dichiaratamente un ripiego, perché il
 * record recintato non esisteva ancora nel repo. Adesso esiste (`src/research/report.mjs`,
 * portato dal mobile), e il cancello guarda quello.
 *
 * ⛔ La differenza non è di severità, è di NATURA. La prosa dice «qui c'è un URL»; il record
 *   dice **quale affermazione** poggia su **quale fonte**, con quale passaggio e — quando un
 *   giudice c'è stato — con quale verdetto. Solo la seconda si può rileggere un mese dopo e
 *   ricontrollare. `report.mjs` lo scrive nella sua testa: «un prodotto che conserva gli URL
 *   non può farlo a nessun prezzo, perché la prova che ha controllato non c'è più».
 *
 * ⛔ `talosResearchParseReport` torna `null` e non un recupero parziale — è il contratto del
 *   mobile, conservato byte per byte dal porto: «un rapporto letto a metà mostrerebbe verdetti
 *   accanto ad affermazioni a cui non appartengono, e un segno di verifica sbagliato è peggio
 *   di nessuno». Qui `null` diventa «non rilegge», mai «va bene lo stesso».
 *
 * ⛔⛔ IL RIPIEGO, e perché è STRETTO. Le ricerche nate prima dell'11/09 non possono avere il
 *   record: quando sono state fatte non esisteva. Respingerle adesso vorrebbe dire timbrare
 *   «senza rapporto» su lavoro vero già pagato, cioè l'errore opposto e speculare a quello che
 *   L2 ha tolto. ⇒ per quelle, e SOLO per quelle (`ripiegoConsentito`, che il chiamante ricava
 *   dal campo `formato` della voce), vale ancora la forma minima — e l'esito lo **dichiara**
 *   con `ripiego:true`, invece di far passare due controlli diversi sotto lo stesso `ok`.
 *
 * @param {string} testo
 * @param {{ripiegoConsentito?: boolean}} [opzioni]
 */
export function rileggiRapportoRecintato(testo, { ripiegoConsentito = false } = {}) {
  const vuoto = { ok: false, intestazione: null, affermazioni: 0, fonti: [], motivo: null, bilancio: null, proveDistinte: 0, ripiego: false, record: null };
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    return { ...vuoto, motivo: 'il rapporto è vuoto' };
  }
  const record = talosResearchParseReport(testo);
  if (record) {
    const fonti = record.sources.map((f) => f?.url).filter((u) => typeof u === 'string' && u.trim().length > 0);
    const comune = {
      intestazione: typeof record.question === 'string' && record.question.trim() ? record.question.trim() : null,
      affermazioni: record.claims.length,
      fonti,
      bilancio: bilancioDelRecord(record),
      proveDistinte: proveDistinteDelRecord(record),
      ripiego: false,
      record,
    };
    if (record.claims.length === 0) return { ...comune, ok: false, motivo: 'il record del rapporto non porta nessuna affermazione' };
    if (fonti.length === 0) return { ...comune, ok: false, motivo: 'il record del rapporto non elenca nessuna fonte' };
    return { ...comune, ok: true, motivo: null };
  }
  if (!ripiegoConsentito) {
    return { ...vuoto, motivo: 'il rapporto non porta il record verificabile (blocco ```talos-research-report)' };
  }
  const minimo = rileggiRapportoMinimo(testo);
  return { ...minimo, bilancio: null, proveDistinte: 0, ripiego: true, record: null };
}

/**
 * ⭐ §6.7 — IL BILANCIO, che è ciò con cui la riga in elenco guida. Mai il conteggio delle fonti.
 *
 * ⛔ Il motivo è misurato, non estetico: «Sci-MMR» (arXiv:2609.11243, 10/09/2026) trova che
 *   l'accuratezza della risposta supera di oltre venti punti il recupero delle prove — cioè un
 *   rapporto sembra buono anche quando le prove non ci sono. Un numero di fonti conferma quella
 *   impressione; un bilancio la smentisce quando è il caso.
 * ⛔ `nonSostenute` e `nonVerificate` restano SEPARATE, e `contese` sta fuori da tutte:
 *   `verification.mjs` lo dice alla riga del conteggio — «"non abbiamo potuto controllarlo" e
 *   "abbiamo controllato, e la fonte non lo dice" sono due ammissioni diverse, e fonderle
 *   lusingherebbe la seconda». I nomi qui sono in italiano perché in italiano è tutto il
 *   contratto verso il frontend (`stato`, `motivo`, `domanda`): due lingue nello stesso oggetto
 *   sono due contratti che divergono.
 */
function bilancioDelRecord(record) {
  const s = talosResearchVerifiedStanding(record.claims);
  return {
    totali: s.total,
    sostenute: s.supported,
    inParte: s.partial,
    nonSostenute: s.unsupported,
    contese: s.contested,
    nonVerificate: s.unchecked,
  };
}

/**
 * ⭐ Quante fonti DIVERSE portano almeno un passaggio davvero ritrovato nel loro testo.
 *
 * ⛔ Non è `sources.length`, ed è tutta la differenza: la bibliografia dice cosa è stato
 *   citato, questo dice su quante fonti distinte poggia davvero qualcosa. Un rapporto con dodici
 *   fonti in fondo e un solo passaggio trovato ha `proveDistinte: 1`, e quel numero è l'unico dei
 *   due che non si può gonfiare allungando l'elenco dei link.
 * ⛔ Un `passage` vuoto è, nel contratto di `report.mjs`, esattamente «non ci è mai stato
 *   trovato» — quindi non conta, e il rapporto in prosa lo scrive pure: «(il passaggio citato
 *   non è nel testo della fonte…)».
 */
function proveDistinteDelRecord(record) {
  const distinte = new Set();
  for (const c of record.claims) {
    if (typeof c?.passage === 'string' && c.passage.trim().length > 0) distinte.add(c.sourceIndex);
  }
  return distinte.size;
}

/**
 * ⭐⭐⭐⭐ L8 (12/09/2026) — IL RECORD LO SCRIVE IL SERVER, E IL MODELLO PORTA I PEZZI.
 *
 * ⛔ Il guasto, dal giro vero del 12/09 (ricerca `3029dea2`, 18 giri, 5 minuti, 265.670 token
 *   di ingresso): la consegna chiedeva al modello di chiudere il rapporto con un blocco
 *   recintato ```talos-research-report contenente una riga di JSON. `glm-4.7-flash` ha scritto
 *   un rapporto in prosa da 8.953 byte — buono, con numeri e sedici URL — e ha ignorato il
 *   recinto. Il cancello di consegna, giustamente, ha risposto `senza-rapporto` («il rapporto
 *   non porta il record verificabile», `meta.json:motivoDettaglio`): motivo onesto, ma il
 *   lavoro pagato è perso lo stesso.
 *
 * ⛔ Perché la cura NON è insistere nella consegna. Ricerca del 12/09/2026, fonti primarie:
 *   - «When Lower Privileges Suffice» (arXiv:2606.20023, 18/06/2026, già citata in L1):
 *     «prompt-level controls provide only **limited mitigation**». Una forma che vive solo
 *     nella consegna è un controllo a livello di prompt, e il 12/09 non ha retto.
 *   - «The Constraint Tax: Measuring Validity-Correctness Tradeoffs in Structured Outputs for
 *     Small Language Models» (arXiv:2605.26128v1, 20/05/2026): «hard answer-only schema
 *     decoding raises schema validity from 61.5% to 100.0%, **but lowers answer accuracy from
 *     19.7% to 11.0%**». ⇒ ⛔ IL VINCOLO CHE NON CONOSCEVO: costringere un modello piccolo a
 *     produrre tutto dentro una forma rigida NON è gratis — si paga in qualità della risposta.
 *     Per questo `testo` resta PROSA LIBERA e non viene mai riscritto da noi: la forma rigida
 *     si applica allo SCHELETRO (chi afferma cosa, su quale fonte, con quale passaggio), mai
 *     al ragionamento.
 *   - «Constraint Tax in Open-Weight LLMs: An Empirical Study of Tool Calling Suppression Under
 *     Structured Output Constraints» (arXiv:2606.25605v1, 24/06/2026): «when Tool Calling and
 *     JSON Schema constraints are simultaneously enabled, multiple open-weight models cease
 *     invoking tools despite maintaining high schema compliance». ⇒ niente `response_format`
 *     imposto sopra agli attrezzi: la struttura vive negli ARGOMENTI dell'attrezzo — il canale
 *     che il modello usa già — e non in un secondo vincolo sopra la generazione.
 *   - «PHREEQC-MCQ-200» (arXiv:2607.00436v1, 01/07/2026): «the gains are not monotonic:
 *     tool-augmented agents also lose items they answered correctly without tools». ⇒ ogni
 *     tolleranza qui sotto (un elenco arrivato come stringa JSON, una fonte indicata per numero
 *     invece che per URL, un passaggio mancante) esiste perché la strada nuova non deve poter
 *     perdere un deposito che la vecchia avrebbe accettato.
 *
 * ⇒ La forma di oggi: il modello passa `testo` (la prosa), `affermazioni` e `fonti`; QUESTA
 *   funzione costruisce il documento con `talosResearchReportDocument` — lo stesso scrittore
 *   che il cancello rilegge, mai un secondo che possa divergere («scritti entrambi da un
 *   oggetto solo così che non possano divergere», testa di `report.mjs`).
 *
 * ⛔ `judge: null` e `claimSupported: 'unchecked'` NON sono argomenti: li mette il server, e il
 *   modello non ha modo di toccarli. È la stessa regola di prima («un modello non timbra sé
 *   stesso») resa IMPOSSIBILE da violare invece che raccomandata.
 *
 * ⛔ Il `summary` del record è il `testo` del modello VERBATIM. Conseguenza dichiarata: il
 *   documento finale può portare due elenchi di fonti, quello scritto dal modello dentro la sua
 *   prosa e quello generato sotto. Preferito a riscrivere la prosa: ciò che il modello ha
 *   scritto non si tocca, e un elenco in più si legge — una prosa riscritta no.
 *
 * ⭐⭐⭐⭐ L9 (12/09/2026) — DUE AGGIUNTE, ENTRAMBE ADDITIVE.
 *
 * 1. `testiPerUrl` — il testo TENUTO delle pagine, per indirizzo. Serve a riempire
 *    `source.text`, che è l'unica cosa contro cui `talosResearchLocate` può dire se un
 *    passaggio citato esiste davvero. Senza (ogni chiamante di ieri, il banco, i test del
 *    kernel) il comportamento è **identico byte per byte**: `text: ''`, nessuna verifica
 *    possibile, `unchecked` dichiarato — che è quello che succedeva prima di oggi.
 *    ⛔ Non cambia il DOCUMENTO: `report.mjs` scrive di una fonte solo url, titolo, data e
 *      `obtained`. Il testo serve a chi verifica, non a chi legge.
 * 2. Il ritorno porta anche `intestazione`, `claims` e `sources` — i pezzi già costruiti qui.
 *    ⛔ Perché: la verifica ha bisogno esattamente di quelli, e ricostruirli fuori vorrebbe dire
 *      un SECONDO interprete degli argomenti del modello (la tolleranza sugli elenchi
 *      stringhificati, la fonte indicata per URL o per numero, il passaggio assente contato e
 *      non rifiutato). Due interpreti dello stesso argomento divergono al primo caso limite;
 *      questo repo l'ha già pagato («due lettori sono due verità»).
 *
 * @param {{domanda?: string|null, testo: unknown, affermazioni: unknown, fonti: unknown, testiPerUrl?: Map<string,string>|null}} input
 * @returns {{ok: true, documento: string, affermazioni: number, fonti: number, senzaPassaggio: number,
 *            intestazione: string, claims: object[], sources: object[]}
 *          |{ok: false, motivo: string}}
 */
export function componiRapportoRicerca({ domanda = null, testo, affermazioni, fonti, testiPerUrl = null }) {
  if (typeof testo !== 'string' || testo.trim().length === 0) {
    return { ok: false, motivo: '`testo` is missing: it must carry the full report as Markdown prose.' };
  }
  const elencoAffermazioni = comeElenco(affermazioni);
  const elencoFonti = comeElenco(fonti);
  if (elencoAffermazioni === null) return { ok: false, motivo: '`affermazioni` must be an array of {testo, fonte, passaggio} objects.' };
  if (elencoFonti === null) return { ok: false, motivo: '`fonti` must be an array of {url, titolo} objects.' };
  if (elencoAffermazioni.length === 0) return { ok: false, motivo: '`affermazioni` is empty: a report with no claims cannot be verified, and is rejected.' };
  if (elencoFonti.length === 0) return { ok: false, motivo: '`fonti` is empty: list every http(s) URL you actually used, with its title.' };

  const sources = [];
  for (let i = 0; i < elencoFonti.length; i += 1) {
    const f = elencoFonti[i];
    const url = typeof f?.url === 'string' ? f.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, motivo: `\`fonti[${i}].url\` is not a full http(s) URL${url ? ` (got "${url}")` : ' — it is missing'}. Every source needs the address you actually opened.` };
    }
    const titolo = typeof f?.titolo === 'string' && f.titolo.trim()
      ? f.titolo.trim()
      : typeof f?.title === 'string' && f.title.trim() ? f.title.trim() : url;
    const data = typeof f?.dataDichiarata === 'string' && f.dataDichiarata.trim() ? f.dataDichiarata.trim() : null;
    /*
     * ⛔ `obtained` NON si indovina. `report.mjs` lo stampa come «pagina letta» / «solo estratto
     *   dal motore di ricerca», e `ledger.mjs:154` ci conta sopra le pagine davvero aperte:
     *   metterlo a `'page'` per default dichiarerebbe letta ogni pagina che nessuno ha aperto.
     *   Lo dichiara il modello con `letta`, che è l'unico che lo sa; assente ⇒ `'snippet'`, cioè
     *   l'ipotesi che promette MENO.
     */
    /*
     * ⛔ L9 — il testo si cerca con l'indirizzo COM'È e senza barra finale, le stesse due forme
     *   con cui `indicePerUrl` qui sotto risolve le citazioni: un url che combacia per le
     *   affermazioni e non per il testo produrrebbe «il passaggio non è nel testo della fonte»
     *   su una pagina che abbiamo in mano — il motivo giusto per il fatto sbagliato.
     */
    const tenuto = testiPerUrl
      ? (testiPerUrl.get(url) ?? testiPerUrl.get(url.replace(/\/+$/, '')) ?? '')
      : '';
    sources.push({ url, title: titolo, publishedAt: data, obtained: f?.letta === true ? 'page' : 'snippet', text: tenuto });
  }

  const indicePerUrl = new Map();
  sources.forEach((s, i) => {
    indicePerUrl.set(s.url, i + 1);
    indicePerUrl.set(s.url.replace(/\/+$/, ''), i + 1);
  });

  const claims = [];
  let senzaPassaggio = 0;
  for (let i = 0; i < elencoAffermazioni.length; i += 1) {
    const a = elencoAffermazioni[i];
    const testoAffermazione = typeof a?.testo === 'string' ? a.testo.trim()
      : typeof a?.text === 'string' ? a.text.trim() : '';
    if (!testoAffermazione) {
      return { ok: false, motivo: `\`affermazioni[${i}].testo\` is missing: every claim needs the sentence it asserts.` };
    }
    const fonteGrezza = a?.fonte ?? a?.source ?? a?.sourceIndex;
    let indice = null;
    if (typeof fonteGrezza === 'number' && Number.isInteger(fonteGrezza)) indice = fonteGrezza;
    else if (typeof fonteGrezza === 'string' && fonteGrezza.trim()) {
      const pulita = fonteGrezza.trim();
      indice = indicePerUrl.get(pulita) ?? indicePerUrl.get(pulita.replace(/\/+$/, '')) ?? null;
      if (indice === null && /^\d+$/.test(pulita)) indice = Number(pulita);
    }
    if (indice === null) {
      return {
        ok: false,
        motivo: `\`affermazioni[${i}].fonte\` is missing or matches no URL in \`fonti\`${typeof fonteGrezza === 'string' ? ` (got "${fonteGrezza.trim()}")` : ''}. Use the exact URL, spelled the same way as in \`fonti\`.`,
      };
    }
    if (indice < 1 || indice > sources.length) {
      return { ok: false, motivo: `\`affermazioni[${i}].fonte\` points to source ${indice}, but \`fonti\` lists ${sources.length}. Sources are numbered from 1.` };
    }
    /*
     * ⛔ Un passaggio mancante NON fa cadere il deposito, e si conta. `report.mjs` tratta un
     *   `passage` vuoto come «non ci è mai stato trovato» e lo scrive in chiaro nella prosa;
     *   `proveDistinte` non lo conta. Rifiutare qui butterebbe un rapporto intero per una
     *   citazione — l'errore che «PHREEQC-MCQ-200» chiama «perdere item che si sarebbero presi
     *   senza l'attrezzo». Il numero torna al modello nella risposta, così lo sa.
     */
    const passaggio = typeof a?.passaggio === 'string' ? a.passaggio.trim()
      : typeof a?.passage === 'string' ? a.passage.trim() : '';
    if (!passaggio) senzaPassaggio += 1;
    claims.push({
      claim: { text: testoAffermazione, sourceIndex: indice, quote: passaggio, quotePresent: 'unchecked' },
      passage: passaggio,
      checks: {
        resolved: sources[indice - 1].obtained,
        /*
         * ⛔ `false`, non `true`: nessuno ha confrontato questo passaggio col testo della
         *   pagina. `fidelity.mjs:96` conta le affermazioni con `resolved === 'page' &&
         *   quotePresent` — un `true` qui sarebbe una verifica mai avvenuta.
         */
        quotePresent: false,
        quoteSpan: null,
        claimSupported: 'unchecked',
        /*
         * ⛔ IN ITALIANO, e non è un dettaglio: `report.mjs` stampa questa frase nella PROSA
         *   («Esito: non verificata — …»), cioè la legge una persona, e tutto il resto di quel
         *   documento è italiano. Trovato guardando l'artefatto vero prodotto dalla cura, non
         *   da un test: nessuna asserzione poteva vederlo.
         */
        supportReason: 'depositata dal modello che ha scritto il rapporto: nessun giudice indipendente l\'ha ancora controllata.',
        judge: null,
        judgedAt: null,
      },
    });
  }

  const intestazione = typeof domanda === 'string' && domanda.trim() ? domanda.trim() : intestazioneDalTesto(testo);
  const documento = talosResearchReportDocument({
    question: intestazione,
    summary: testo.trim(),
    judge: null,
    claims,
    sources,
  });
  return {
    ok: true, documento, affermazioni: claims.length, fonti: sources.length, senzaPassaggio,
    // ⭐ L9 — i pezzi, per chi deve verificarli. Vedi la doc sopra: un solo interprete.
    intestazione, claims, sources,
  };
}

/**
 * Un elenco, anche quando arriva come stringa JSON. `null` = non è un elenco e non lo diventa.
 *
 * ⛔ La tolleranza è misurata, non generosa: un modello che stringhifica un array è un caso
 *   visto in natura, e rifiutarlo costerebbe un rapporto intero. Tutto il resto (un oggetto
 *   solo, un numero, `undefined`) resta un errore che si dice a parole.
 */
function comeElenco(valore) {
  if (Array.isArray(valore)) return valore;
  if (typeof valore === 'string' && valore.trim().startsWith('[')) {
    try {
      const letto = JSON.parse(valore);
      return Array.isArray(letto) ? letto : null;
    } catch { return null; }
  }
  return null;
}

/** Il titolo del rapporto quando il server non conosce la domanda (ricerche vecchie, riprese). */
function intestazioneDalTesto(testo) {
  const righe = String(testo).split('\n').map((r) => r.trim());
  const titolo = righe.find((r) => r.startsWith('# '));
  if (titolo) return titolo.slice(2).trim();
  return righe.find((r) => r.length > 0) ?? '';
}

/**
 * ⭐⭐⭐⭐ L9 — LA CONSEGNA PORTA IL PIANO, e questo è ciò che rende il piano una cosa vera.
 *
 * ⛔ Prima di oggi il piano non esisteva affatto nella corsa: `plan.mjs` era portato, provato e
 *   mai chiamato, e la figlia riceveva una guida generica («search from a few different
 *   angles»). Un piano che nessuno legge non è un piano: è una decorazione nella scheda.
 *
 * ⛔ Le linee si NUMERANO nella consegna, e l'ordine non è estetico: il giornale attribuisce la
 *   k-esima ricerca al k-esimo ramo (`raccolta-viva.mjs`, «l'attribuzione al ramo»). Dire alla
 *   figlia di seguirle in ordine è ciò che rende quell'attribuzione onesta invece che casuale.
 *   ⇒ Se un giorno qualcuno toglie l'elenco da qui, deve togliere anche quella convenzione là.
 *
 * ⛔ Restano DEFAULT, non gabbie: la consegna dice esplicitamente che una linea può essere
 *   saltata o allargata se ciò che si trova lo chiede. Il motore del mobile dice la stessa cosa
 *   («Default, non gabbie: il piano resta modificabile»), e un piano che il modello non può
 *   disobbedire trasformerebbe una ricerca in uno scraper.
 */
function promptRicerca(question, depth, piano = []) {
  const guida = depth === 'quick'
    ? 'Keep this brief: a couple of searches are enough — do not over-investigate.'
    : depth === 'exhaustive'
      ? 'Be exhaustive: search from many different angles, cross-check the claims that matter, and go deep before writing.'
      : 'Do a thorough pass: search from a few different angles before writing the report.';
  /*
   * ⛔ Un blocco con gli a-capo VERI, non righe fuse dal `join(' ')` finale: un elenco numerato
   *   schiacciato su una riga sola è esattamente la forma che un modello legge come prosa e non
   *   come lista di compiti. È l'unico pezzo multilinea di questa consegna, ed è voluto.
   */
  const linee = Array.isArray(piano) && piano.length > 0
    ? [[
      `Your plan has ${piano.length} lines of inquiry. Work through them IN THIS ORDER, one web_search each, then open the pages that matter:`,
      ...piano.map((ramo, i) => `  ${i + 1}. ${ramo.question}`),
      'Skip or widen a line if what you find asks for it — this is a default, not a cage — but do not reorder it: the journal tracks your progress by that order.',
    ].join('\n')]
    : [];
  return [
    `Research this question thoroughly using web_search and naviga: "${question}"`,
    guida,
    ...linee,
    /*
     * ⛔⛔⛔ L2 (11/09/2026) — QUESTA FRASE È CAMBIATA, ed è il cuore della cura.
     *
     * Prima diceva: «write your findings as a complete final response (not a tool call) — this
     * text becomes the permanent research report». Cioè il rapporto ERA l'ultimo messaggio. Il
     * 11/09, sulla ricerca `d2a453a8`, l'ultimo messaggio con del testo erano 290 byte di scusa
     * («La sessione è in sola lettura, quindi non posso creare documenti direttamente…»), e
     * sono finiti in Libreria come il rapporto permanente, con `terminata:'done'`.
     *
     * ⇒ Adesso il rapporto è un DEPOSITO esplicito, e la consegna lo dice due volte: come si
     *   fa (`research_deposit`) e che l'ultimo messaggio NON è il rapporto. La forma richiesta
     *   è dichiarata qui e controllata da `rileggiRapportoMinimo` — mai un cancello che chiede
     *   una forma che nessuno ha detto.
     */
    'When you are done investigating, call the tool `research_deposit` ONCE, with three arguments.',
    /*
     * ⭐⭐⭐⭐ L8 (12/09/2026) — LA CONSEGNA NON CHIEDE PIÙ UN RECINTO, CHIEDE TRE ARGOMENTI.
     *
     * ⛔ Cosa c'era prima, e perché è caduto: le tre righe qui sopra dettavano il blocco
     *   ```talos-research-report campo per campo, con un esempio copiabile. Il 12/09
     *   `glm-4.7-flash` ha letto quella consegna, ha scritto un rapporto in prosa da 8.953 byte
     *   e non ha messo il recinto: il cancello ha risposto `senza-rapporto` e cinque minuti di
     *   ricerca sono rimasti senza consegna. Non era una consegna poco chiara — era una forma
     *   affidata alla prosa, cioè un controllo a livello di prompt («limited mitigation»,
     *   arXiv:2606.20023).
     *
     * ⇒ Adesso la forma sta negli ARGOMENTI dell'attrezzo, dove uno schema la dichiara e il
     *   server la costruisce. Qui resta il PERCHÉ, che uno schema non può dire: ogni
     *   affermazione porta la sua fonte e il passaggio verbatim, e i verdetti non li dà chi
     *   scrive. ⛔ `judge` e `claimSupported` non sono nemmeno più argomenti: non c'è più nulla
     *   da raccomandare, perché non c'è più nulla che il modello possa timbrare.
     */
    '`testo`: the full report as Markdown prose — a "# " title, your findings, and a "## Sources" section. This is what the person reads, and it is never rewritten.',
    '`affermazioni`: one entry per factual claim that matters, each with `testo` (the claim), `fonte` (the exact http(s) URL it rests on, spelled as in `fonti`) and `passaggio` (the sentence you actually read in that source, copied VERBATIM — never reworded, never invented; "" is the honest answer if you cannot find it, and it is counted as such).',
    '`fonti`: one entry per source, with `url` (full http(s)), `titolo`, `dataDichiarata` (the date the source itself declares, or omit it) and `letta`: true only if you opened the page, false if you only saw a search-result snippet.',
    'The server builds the verifiable record from those three and saves it with your text: you do not have to write any JSON, and you cannot mark your own claims as verified — an independent check happens later.',
    'That deposited document IS the permanent report. Your chat message is not the report and is never saved as one — after depositing, just tell the user in one or two lines that the report is ready.',
    'Note any real uncertainty instead of guessing, and never deposit a report without sources.',
    'You cannot write files, run shell commands or create documents in this project: `research_deposit` is the one and only thing you are allowed to write, and it is all you need.',
  ].join(' ');
}

/**
 * ⭐ §6.6 (11/09) — il nome della ricerca: la domanda, troncata a 80 caratteri.
 * ⛔ 80 e non un altro numero: è il tetto che `registro.rinomina()` impone a un nome di sessione
 * (`session-registry.mjs`, «Nome non valido: serve 1-80 caratteri»). Un nome più lungo sarebbe
 * rifiutato da quella porta, e due limiti diversi per la stessa cosa divergono al primo caso
 * limite. Il troncamento taglia sull'ultimo spazio quando può: «Come stanno evolvendo gli…» è
 * leggibile, «Come stanno evolvendo gli harness agen» no.
 */
function nomeDallaDomanda(domanda) {
  const pulita = String(domanda ?? '').trim().replace(/\s+/g, ' ');
  if (pulita.length <= 80) return pulita;
  const tagliato = pulita.slice(0, 79);
  const spazio = tagliato.lastIndexOf(' ');
  return `${(spazio > 40 ? tagliato.slice(0, spazio) : tagliato).trimEnd()}…`;
}

/**
 * ⭐⭐⭐ BC-44 — quanto si aspetta prima di riprendere da soli, UNA volta.
 *
 * ⛔ Non è «un backoff» con l'articolo indeterminativo: il backoff a più tentativi esiste già, e
 *   sta dentro `chiamaConRitenta` (500·2^n + jitter, quattro tentativi). Quello copre la singola
 *   chiamata; questo copre la CORSA, e di tentativi ne ha uno solo — quindi non c'è niente da
 *   raddoppiare, c'è da scegliere UN'attesa.
 * ⛔ Venti secondi, e il numero ha una ragione misurabile: l'ultimo tentativo del backoff del
 *   kernel cade intorno ai 4 s dal primo (0,5+1+2 più jitter), quindi un'attesa più corta
 *   ripartirebbe dentro la stessa finestra che ha appena fallito quattro volte. Venti la
 *   scavalca con margine e resta sotto la soglia in cui una persona davanti allo schermo
 *   comincia a chiedersi se sia morto tutto.
 * ⛔ Non è misurata su un guasto vero del fornitore: è aritmetica sul backoff che abbiamo. Se
 *   un giorno la si vorrà tarare, il dato da raccogliere è la durata dei guasti veri, non
 *   l'opinione di chi scrive questa riga.
 */
export const ATTESA_RIPRESA_AUTOMATICA_MS = 20_000;

const PROMPT_RIPRESA = 'Continue the research from where you left off, using web_search and naviga as needed, then write the final report as your last message.';

/**
 * ⭐⭐⭐ L4 §6.6 — LA CONSEGNA DI UNA RIPRESA DAL GIORNALE.
 *
 * Quando il server è stato riavviato la conversazione non c'è più: al modello non si può
 * ridare il suo contesto, e fingere di averlo sarebbe la bugia. Gli si dà invece quello che il
 * giornale sa davvero — la domanda, quanto è già stato speso, quali linee sono ancora aperte,
 * quale passo era in volo, e dove sta il testo già tenuto.
 *
 * ⛔ Nessuna di queste righe è inventata: ognuna esce dal replay o dal disco. Se una lista è
 *   vuota non si scrive («0 rami rimasti» su un giro che non ha mai avuto un piano direbbe che
 *   non c'è più niente da fare, che è il contrario del vero) — la riga semplicemente non c'è.
 * ⛔ E la consegna ORIGINALE viene riproposta per intera, perché contiene le istruzioni sul
 *   deposito e sulla forma del record: senza, una ricerca ripresa consegnerebbe qualcosa che il
 *   cancello respinge — un guasto introdotto dalla cura, cioè il peggiore.
 */
function consegnaDiRipresa({ giro, prossimo, rimasti, speso, fonti, task }) {
  const righe = [
    'This research was interrupted (the app or the server restarted). Its conversation is gone, but its journal is not — here is exactly where it stood.',
    `Question: "${giro.question}"`,
    `Already spent before the interruption: ${speso.tokens} tokens, ${speso.searches} searches, ${speso.pages} pages opened. Do not redo work that is listed as done below.`,
  ];
  const fatti = giro.steps.filter((p) => p.state === 'done');
  if (fatti.length > 0) righe.push(`Steps already completed: ${fatti.map((p) => p.id).join(', ')}.`);
  if (prossimo) righe.push(`Resume from this step: ${prossimo.id} (${prossimo.kind}), which was ${prossimo.state === 'interrupted' ? 'in flight when the process died' : 'never started'}.`);
  if (rimasti.length > 0) righe.push(`Lines of inquiry still open: ${rimasti.map((r) => `«${r.question}»`).join(' · ')}.`);
  /*
   * ⛔ L9 — «source text(s)» e non «source page(s)», ed è una parola cambiata su una misura:
   *   da oggi in `fonti/` finiscono anche gli ESTRATTI dei risultati di ricerca (una fonte vista
   *   ma non aperta è comunque una prova, e senza di lei la verifica direbbe «la fonte citata non
   *   esiste fra quelle raccolte»). Il conteggio è quindi di testi tenuti, non di pagine aperte —
   *   e chiamarli «pagine» sarebbe un numero gonfiato detto a un modello che ci conta sopra.
   */
  if (fonti.length > 0) righe.push(`${fonti.length} source text(s) were already fetched and kept on disk; they are available without paying for them again.`);
  if (!prossimo && rimasti.length === 0 && fatti.length === 0) {
    /*
     * ⛔ Il caso di oggi, e si dichiara invece di nasconderlo: il giornale registra il ciclo di
     *   vita del giro (avvio, pausa, ripresa, fine) ma non ancora i singoli passi di raccolta,
     *   perché il collettore non è agganciato (vedi la testa di questo file). Il modello deve
     *   sapere che riparte dall'indagine, non da un passo preciso — non che «non c'è niente da
     *   fare».
     */
    righe.push('The journal records the run itself but not individual collection steps, so restart the investigation for this question from the beginning of the evidence you can still see, and do not assume anything was already concluded.');
  }
  righe.push(typeof task?.consegna === 'string' && task.consegna.trim() ? task.consegna.trim() : PROMPT_RIPRESA);
  return righe.join('\n');
}

/**
 * ⛔⛔⛔ L2 (11/09/2026) — QUESTA FUNZIONE HA CAMBIATO NOME, E IL NOME È LA CURA.
 *
 * Si chiamava `estraiTestoRapporto` e la sua doc diceva «quello che diventa il rapporto». Non
 * lo è, e non lo è mai stato: è l'ultima cosa che il modello ha detto. Il 11/09 quella cosa
 * erano 290 byte di scusa, e il solo controllo era «esiste del testo?» — una scusa è testo.
 *
 * ⇒ Adesso si chiama `ultimoMessaggioDelModello` e vale quello che vale: un ALLEGATO, mostrato
 *   come «ciò che il modello ha detto alla fine», mai come rapporto. Il rapporto è
 *   `.harness-ui-research/<id>/rapporto.md`, depositato con `research_deposit`.
 */
function ultimoMessaggioDelModello(messaggiFinali) {
  if (!Array.isArray(messaggiFinali)) return null;
  for (let i = messaggiFinali.length - 1; i >= 0; i -= 1) {
    const m = messaggiFinali[i];
    if (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0) return m.content.trim();
  }
  return null;
}

/**
 * ⭐⭐⭐ L2 §6.5 — «fra i risultati degli attrezzi c'è un REFUSED di permesso».
 *
 * ⛔ Cerca la firma ESATTA che il kernel emette (`REFUSED. ` in testa al risultato di un
 * attrezzo, `talosHarness.mjs`), non la parola «permission» né una frase italiana: il motivo
 * del rifiuto è prosa e cambia, il prefisso è un contratto. È la lezione «un filtro che
 * riconosce la MENZIONE invece della cosa» (23/8, il guardiano che accusava la sessione
 * dell'owner) applicata qui: un rapporto che PARLA di un rifiuto non è un rifiuto.
 *
 * ⛔ E guarda i messaggi `role:'tool'`, mai quelli dell'assistente: la scusa del modello cita
 * il rifiuto parola per parola, e prenderla per la prova del rifiuto sarebbe credere al
 * racconto invece che al registro.
 */
function trovaRifiutoDiPermesso(messaggiFinali) {
  if (!Array.isArray(messaggiFinali)) return null;
  for (const m of messaggiFinali) {
    if (m?.role !== 'tool') continue;
    const testo = typeof m.content === 'string' ? m.content.trim() : '';
    if (!testo.startsWith('REFUSED. ')) continue;
    /*
     * ⛔ Le uniche altre due frasi che cominciano con `REFUSED. ` nel kernel sono gli input
     * vuoti (`REFUSED. Empty html`, `REFUSED. Empty report`): non sono rifiuti di permesso, e
     * chiamarli così manderebbe l'owner a cambiare un permesso che non c'entra.
     * ⛔ Resta fuori anche la premessa negata di `scrivi` (`REFUSED. <perché> Nothing was
     *   written.`) — e non serve escluderla a mano: a livello `'ricerca'` `scrivi` non passa
     *   mai il cancello, quindi quel ramo non può essere raggiunto qui. Se un giorno una
     *   ricerca girasse a un livello più largo, questa riga andrà rivista: è scritto qui
     *   perché l'assunzione sia visibile, non nascosta.
     */
    if (testo.startsWith('REFUSED. Empty ')) continue;
    return testo;
  }
  return null;
}

function nomeRapporto(domanda) {
  const troncato = String(domanda ?? '').trim().slice(0, 100);
  return `Research - ${troncato || 'untitled'}.md`;
}

/**
 * Il bucket "vivo" — mai duplicato su disco (vedi la doc di testa).
 * `voceSessione` assente O `interrotta` (il processo che la eseguiva
 * non esiste più, e non aveva mai finito da sola — stesso stato che
 * `resume()` rifiuta onestamente) ⇒ 'failed': mai "running" per un
 * processo che non c'è, mai "paused" per un run che non era mai stato
 * fermato apposta.
 */
function statoVivo(voceRicerca, voceSessione) {
  if (voceRicerca.terminata) return voceRicerca.terminata;
  if (!voceSessione || voceSessione.interrotta) return 'failed';
  return voceSessione.conclusa ? 'paused' : 'running';
}

/* ══════════════ BC-44 (12/09/2026) — TRANSITORIO NON È FALLITO ══════════════
 *
 * Il fatto che l'ha fatta nascere, misurato e non dedotto: la ricerca `dec896c0` del 12/09 ha
 * lavorato **16 giri, 32 attrezzi, 67 testi tenuti, 134.464 token dalla cache**, ha scritto
 * «Poi deposito.» — e a quel punto il fornitore ha chiuso:
 *
 *     {"type":"RunError","message":"Upstream idle timeout exceeded","code":"internal-error"}
 *
 * ⇒ `terminata:'failed'`, e `POST …/research/:id/ripresa` rispondeva **409**: venti minuti
 *   pagati che il giornale conserva per intero e che nessuno poteva riprendere.
 *
 * ## Le fonti, lette il 12/09/2026 (ricerca PRIMA di scrivere, obbligo owner)
 *
 * ⛔ **OpenRouter, «Errors»** — il vincolo che non conoscevo, e che decide tutto:
 *     «If an attempt fails before any tokens reach you, OpenRouter automatically tries a backup
 *      provider. The `200 OK` has already been sent by then, so the status stays `200` even when
 *      every provider fails.»
 *     «a `200 OK` whose JSON body holds only an `error` object and no `choices`; check the body
 *      for an `error` field even on a `200`.»
 *   ⇒ Il ritentativo del kernel (`chiamaConRitenta`, `siRitenta(stato)`) **non può** coprire
 *     questa classe: decide sullo STATO HTTP, e qui lo stato è 200. Non è una dimenticanza del
 *     kernel — è una cura che sta a valle del punto in cui l'errore nasce. Per questo la ripresa
 *     va messa al livello della RICERCA, dove c'è il giornale, e non al livello della chiamata.
 *
 * ⛔ **Hermes Agent v0.21 (Nous Research)**, letto nel suo codice — `agent/error_classifier.py`
 *   e `docs/session-lifecycle.md`. Due cose, entrambe copiate qui nella forma, non nel testo:
 *     1. un classificatore CENTRALE con un campo `retryable` esplicito, che «replaces scattered
 *        inline string-matching», e un ordine di precedenza dichiarato (billing prima di
 *        rate-limit, SSL prima di disconnect, disconnect prima del catch-all);
 *     2. `resume_pending` (recupero MORBIDO: «preserves the existing session_id — the user
 *        continues on the same transcript») tenuto separato da `suspended` («hard force-wipe
 *        signal»), con un `resume_reason` che dice PERCHÉ la ripresa è stata segnata.
 *        ⇒ Qui: un `failed` transitorio è `resume_pending`, un `failed` non transitorio resta
 *        quello che era. E il perché si scrive: `motivoErrore.classe`.
 *   ⛔ Hermes annota anche il nostro caso alla lettera: un disconnect su un modello che ragiona è
 *     «the upstream proxy idle-killing a long thinking stream», non un contesto pieno — e la cura
 *     sbagliata (comprimere) «silently delete[s] conversation history on a phantom
 *     context-length error». Per questo `contesto` qui NON è transitorio.
 *
 * ⛔ **Anthropic, «How we built our multi-agent research system»**: «When errors occur, we can't
 *   just restart from the beginning: restarts are expensive and frustrating for users. Instead,
 *   we built systems that can resume from where the agent was when the errors occurred», e
 *   «deterministic safeguards like retry logic and regular checkpoints». Il nostro checkpoint
 *   esiste già ed è il giornale: mancava solo il permesso di rientrarci.
 *
 * ## ⛔ DOVE DIVERGO DA HERMES, e perché
 *
 * Hermes manda `unknown` a `retryable=True`. Qui `ignoto` è **NON transitorio**, e non è una
 * svista: là si ritenta LA STESSA CHIAMATA (costo: una chiamata), qui si riapre UNA RICERCA che
 * può spendere venti minuti e centinaia di migliaia di token. Costi diversi ⇒ default diversi.
 * Un guasto deterministico dichiarato «riprendibile» farebbe ripagare un fallimento garantito.
 * ⇒ Si riprende solo ciò che si è RICONOSCIUTO. Quello che non si riconosce si comporta
 *   esattamente come ieri: nessuna regressione possibile da questa riga.
 *
 * ⛔ E il `code` da solo NON basta: `agent-service.mjs` marca `internal-error` OGNI guasto del
 *   servizio — il nostro caso incluso. Il codice si guarda per primo quando dice qualcosa
 *   (`CTX_*`, gli esiti del task), e per il resto si legge il MESSAGGIO, che è l'unica cosa che
 *   il fornitore ha davvero detto.
 */

/** Le classi che si riprendono. ⛔ Elenco chiuso: chi non è qui dentro NON è transitorio. */
const CLASSI_TRANSITORIE = new Set(['rete', 'timeout-fornitore', 'traffico', 'guasto-fornitore', 'flusso-interrotto']);

/** La mezza frase italiana di ogni classe — il pezzo variabile di `motivoDelloStato`. */
const CLAUSOLA_DI_CLASSE = new Map([
  ['rete', 'la connessione con il fornitore del modello è caduta'],
  ['timeout-fornitore', 'il fornitore del modello ha chiuso la connessione mentre lavorava'],
  ['traffico', 'il fornitore del modello ha rifiutato per troppo traffico'],
  ['guasto-fornitore', 'il fornitore del modello ha risposto con un guasto suo'],
  ['flusso-interrotto', 'la risposta del modello si è interrotta a metà'],
]);

/* Gli esiti del TASK: non sono guasti, e hanno già il loro stato. */
const CODICI_ESITO_DEL_TASK = new Map([['fermato', 'fermato'], ['giri-esauriti', 'giri-esauriti'], ['premesse-negate', 'premesse-negate']]);

/*
 * ⛔ L'ORDINE È LA CURA, non l'elenco. Le prime due famiglie sono NON transitorie e vanno
 *   guardate PRIMA delle transitorie, perché le loro frasi contengono le parole delle altre:
 *   «you have exceeded your current quota» porta dentro «exceeded», «insufficient credits …
 *   rate limit» porta dentro «rate limit». Chi legge per primo vince, quindi legge per primo
 *   chi non si deve ritentare. (È la stessa precedenza di Hermes: billing prima di rate_limit.)
 */
const SEGNI_CREDITO = ['insufficient credit', 'insufficient_quota', 'insufficient balance', 'credit balance', 'payment required', 'exceeded your current quota', 'out of funds', 'billing'];
const SEGNI_CREDENZIALE = ['unauthorized', 'invalid api key', 'no auth credentials', 'authentication', 'forbidden', 'http 401', 'http 403'];
const SEGNI_CONTESTO = ['context length', 'context_length', 'maximum context', 'too many tokens', 'prompt is too long', 'reduce the length'];
const SEGNI_RICHIESTA = ['invalid request', 'bad request', 'model not found', 'is not a valid model', 'no endpoints found', 'http 400', 'http 404'];
const SEGNI_TRAFFICO = ['rate limit', 'rate-limit', 'too many requests', 'http 429', 'temporarily rate-limited'];
const SEGNI_TIMEOUT = ['idle timeout', 'timeout', 'timed out', 'deadline exceeded', 'http 408', 'http 504', 'http 524'];
const SEGNI_GUASTO = ['bad gateway', 'service unavailable', 'gateway timeout', 'overloaded', 'at capacity', 'over capacity', 'internal server error', 'upstream error', 'provider returned error', 'http 500', 'http 502', 'http 503'];
const SEGNI_RETE = ['econnreset', 'econnrefused', 'etimedout', 'enotfound', 'eai_again', 'epipe', 'fetch failed', 'socket hang up', 'connection reset', 'connection refused', 'network', 'terminated'];
const SEGNI_FLUSSO = ['flusso sse', 'unexpected eof', 'premature close', 'stream ended', 'incomplete chunked'];

/**
 * ⭐⭐⭐ BC-44 — LA TABELLA, in una funzione pura che un test può mordere da sola.
 *
 * @param {{codice?: string|null, messaggio?: string|null}} errore
 * @returns {{classe: string, transitorio: boolean}}
 */
export function classificaErroreDiCorsa({ codice = null, messaggio = null } = {}) {
  const c = typeof codice === 'string' ? codice.trim() : '';
  const m = typeof messaggio === 'string' ? messaggio.toLowerCase() : '';
  const dentro = (segni) => segni.some((s) => m.includes(s));
  const esito = (classe) => ({ classe, transitorio: CLASSI_TRANSITORIE.has(classe) });

  // 1. Il codice, quando dice davvero qualcosa. `internal-error` NON dice niente: è il default.
  if (CODICI_ESITO_DEL_TASK.has(c)) return esito(CODICI_ESITO_DEL_TASK.get(c));
  if (c.startsWith('CTX_')) return esito('contesto');
  /*
   * ⛔ `fermatoSuRichiesta` arriva come messaggio, non come codice: il kernel lancia «⛔ fermato
   *   su richiesta …» e `agent-service` lo marca `internal-error` come tutto il resto. Uno stop
   *   voluto non si riprende da solo, mai — sarebbe ripartire contro chi ha premuto Ferma.
   */
  if (m.includes('fermato su richiesta')) return esito('fermato');

  // 2. Le NON transitorie che contengono le parole delle transitorie: prima loro (vedi sopra).
  if (dentro(SEGNI_CREDITO)) return esito('credito');
  if (dentro(SEGNI_CREDENZIALE)) return esito('credenziale');
  if (dentro(SEGNI_CONTESTO)) return esito('contesto');
  if (dentro(SEGNI_RICHIESTA)) return esito('richiesta-non-valida');

  // 3. Le transitorie.
  if (dentro(SEGNI_TRAFFICO)) return esito('traffico');
  if (dentro(SEGNI_TIMEOUT)) return esito('timeout-fornitore');
  if (dentro(SEGNI_GUASTO)) return esito('guasto-fornitore');
  if (dentro(SEGNI_RETE)) return esito('rete');
  if (dentro(SEGNI_FLUSSO)) return esito('flusso-interrotto');

  // 4. Non riconosciuto ⇒ si comporta come ieri. Vedi «DOVE DIVERGO DA HERMES».
  return esito('ignoto');
}

/**
 * ⭐⭐⭐⭐ BC-44 — LA PROVA C'ERA GIÀ, E NESSUNO LA LEGGEVA.
 *
 * ⛔ Il difetto che questa funzione chiude è più grande di quello che sembra. La cura scritta in
 *   `onConclusioneRicerca` vale **da oggi in avanti**: ogni ricerca caduta PRIMA — compresa
 *   `dec896c0`, quella che ha fatto nascere BC-44, coi suoi venti minuti pagati — avrebbe avuto
 *   `motivoErrore: null` per sempre, e sarebbe rimasta non riprendibile. Una cura che non cura
 *   il caso che l'ha fatta scrivere.
 *
 * ⇒ Ma il fatto è registrato lo stesso, e lo era da sempre: nel `.jsonl` della SESSIONE c'è
 *     {"type":"RunError","message":"Upstream idle timeout exceeded","code":"internal-error"}
 *   e `ripristina()` rimette quegli eventi in `voce.eventi` a ogni avvio del server. Non serve
 *   leggere un altro file: basta guardare quello che il registro ha già in mano.
 *
 * ⛔ Si scandisce ALL'INDIETRO e ci si ferma al primo `RunStarted`: gli eventi di una sessione
 *   sono la storia di TUTTI i suoi giri, e un `RunError` di tre giri fa non dice niente sul giro
 *   che è appena caduto. Senza questa fermata, una ricerca ripresa e poi conclusa bene si
 *   porterebbe dietro il motivo della sua prima caduta.
 * ⛔ E non si scrive niente sul disco: la deduzione vive nella LETTURA, come la correzione degli
 *   stati di `elenca()`. Ciò che è costato denaro non si riscrive per far quadrare un campo.
 *
 * @returns {{codice: string|null, messaggio: string|null}|null}
 */
function ultimaCadutaDegliEventi(eventi) {
  if (!Array.isArray(eventi)) return null;
  for (let i = eventi.length - 1; i >= 0; i -= 1) {
    const e = eventi[i];
    if (e?.type === 'RunStarted') return null;
    if (e?.type === 'RunFinished') return null;
    if (e?.type === 'RunError') {
      return {
        codice: typeof e.code === 'string' ? e.code : null,
        messaggio: typeof e.message === 'string' ? e.message : null,
      };
    }
  }
  return null;
}

/**
 * La causa della caduta di una ricerca `failed`: quella REGISTRATA se c'è, altrimenti quella
 * DEDOTTA dagli eventi della sessione. `null` quando non c'è né l'una né l'altra.
 *
 * ⛔ `registrata` prima di `dedotta`, sempre: la prima l'ha scritta chi era presente alla
 *   conclusione, la seconda è una rilettura. Quando ci sono entrambe non possono che coincidere
 *   — ma l'ordine va comunque dichiarato, perché il giorno in cui divergessero vince il testimone.
 */
function causaDellaCaduta(record, voceSessione) {
  if (record?.motivoErrore) return record.motivoErrore;
  const grezza = ultimaCadutaDegliEventi(voceSessione?.eventi);
  if (!grezza) return null;
  return { ...classificaErroreDiCorsa(grezza), codice: grezza.codice, messaggio: grezza.messaggio, dedotta: true };
}

/**
 * ⭐⭐⭐ L2 §6.5 — LA FRASE UMANA. Non un codice tradotto dal frontend: il motivo lo dice il
 * server, in una frase sola, e in italiano.
 *
 * ⛔ `null` quando lo stato è `done` o quando la ricerca sta ancora girando: un «motivo» su
 *   una cosa riuscita è rumore, e su una in corso è una previsione.
 * ⛔ Le frasi NOMINANO IL COLPEVOLE quando il colpevole siamo noi. «La sessione era in sola
 *   lettura e non ha potuto depositare il rapporto» è il prodotto che ammette il proprio
 *   errore; «ricerca fallita» sarebbe farlo pagare all'owner.
 */
function motivoDelloStato(stato, dettaglio = null, motivoErrore = null) {
  /*
   * ⭐⭐⭐ BC-44 — quando la caduta è transitoria la frase cambia, e cambia in due punti: dice
   *   CHI è caduto (mai «la ricerca non ce l'ha fatta»: non è stata lei) e dice che si riprende.
   *   ⛔ La frase NON nomina il codice né il messaggio del fornitore: «Upstream idle timeout
   *     exceeded» a schermo sarebbe un nome tecnico, e quelli non entrano nella UI.
   */
  if (stato === 'failed' && motivoErrore?.transitorio === true && CLAUSOLA_DI_CLASSE.has(motivoErrore.classe)) {
    return `La ricerca si è interrotta a metà: ${CLAUSOLA_DI_CLASSE.get(motivoErrore.classe)}. Il lavoro già fatto è conservato e può riprendere da lì.`;
  }
  switch (stato) {
    case 'bloccata-dal-permesso':
      return 'La sessione era in sola lettura e non ha potuto depositare il rapporto: il lavoro è stato fatto, la consegna no.';
    case 'senza-rapporto':
      return dettaglio
        ? `La ricerca è finita ma il rapporto non è leggibile: ${dettaglio}.`
        : 'La ricerca è finita senza depositare un rapporto leggibile.';
    case 'giri-esauriti':
      return 'La ricerca ha esaurito i giri a disposizione prima di depositare il rapporto.';
    case 'cancelled':
      return 'La ricerca è stata fermata per sempre: quello che aveva raccolto resta leggibile.';
    case 'paused':
      return 'La ricerca è in pausa: può riprendere da dove si era fermata.';
    case 'failed':
      return dettaglio ? `La ricerca non è arrivata in fondo: ${dettaglio}.` : 'La ricerca non è arrivata in fondo.';
    default:
      return null;
  }
}

function clampNumero(valore, min, max, difetto) {
  const numero = Number(valore);
  return Number.isFinite(numero) ? Math.min(Math.max(numero, min), max) : difetto;
}

export function creaResearchOrchestrator({
  sessioni, avviaESeguiFn,
  creaRicercaFn, leggiRicercaFn, aggiornaRicercaFn, eliminaRicercaFn, elencaRicercheFn,
  salvaVoceLibreriaFn, leggiVoceLibreriaFn, eliminaVoceLibreriaFn,
  randomUUIDFn,
  /*
   * ⭐⭐⭐ L2 §6.5 (11/09) — IL PUNTO DI INNESTO DEL LETTORE DI RAPPORTI.
   *
   * `leggiRapportoFn({cartella, id}) => Promise<string|null>` legge il file depositato;
   * `rileggiRapportoFn(testo) => {ok, intestazione, affermazioni, fonti, motivo}` lo giudica.
   *
   * ⛔ Sono DUE e non uno per la stessa ragione per cui `salvaVoceLibreriaFn` è iniettata: il
   *   default legge il disco vero (`research-store.mjs`), i test non toccano un filesystem.
   * ⛔ E `rileggiRapportoFn` è iniettabile perché il record recintato vero
   *   (`src/research/report.mjs`, portato dal mobile da un altro agente in parallelo) non
   *   esiste ancora in questo repo: il giorno in cui esiste si cambia QUESTA riga, non la
   *   macchina degli stati qui sotto. La forma minima di oggi è dichiarata, non implicita —
   *   vedi `rileggiRapportoMinimo`.
   */
  leggiRapportoFn = leggiRapporto,
  /*
   * ⭐⭐⭐ L4 — IL PUNTO DI INNESTO È STATO USATO. L2 aveva lasciato qui `rileggiRapportoMinimo`
   * scrivendo «il giorno in cui il record recintato esiste si cambia QUESTA riga, non la
   * macchina degli stati». Quel giorno è oggi: il default è il lettore del record vero, e la
   * forma minima resta dietro, come ripiego dichiarato per le ricerche vecchie.
   * ⛔ La firma è cresciuta di un argomento (`{ripiegoConsentito}`): un lettore iniettato che lo
   *   ignora continua a funzionare — è il motivo per cui è un oggetto di opzioni e non un
   *   secondo parametro posizionale obbligatorio.
   */
  rileggiRapportoFn = rileggiRapportoRecintato,
  /*
   * ⭐⭐⭐ L4 — LE QUATTRO PORTE NUOVE SUL DISCO DELLA RICERCA, tutte iniettabili come le altre.
   *
   * `accodaEventoFn`  scrive UNA riga nel giornale (solo append);
   * `leggiGiornaleFn` lo rilegge tollerando le righe mozzate — è ciò da cui `riprendi()` rigioca;
   * `leggiPianoFn`    il piano approvato, quando c'è;
   * `statRapportoFn`  `mtimeMs`+`size` del rapporto: la chiave della cache di `elenca()`.
   *
   * ⛔ Iniettabili per la ragione di sempre, e stavolta con un caso già visto: senza queste
   *   porte un test dell'orchestratore andrebbe a scrivere sul filesystem VERO della macchina
   *   che lo esegue — cioè misurerebbe l'ambiente invece dell'oggetto (lezione 10/09).
   */
  accodaEventoFn = accodaEvento,
  leggiGiornaleFn = leggiGiornale,
  leggiPianoFn = leggiPiano,
  statRapportoFn = statRapporto,
  elencaFontiFn = elencaFonti,
  /*
   * ⭐ L4+L6 — la cache del fetch, persistita accanto al giornale (`<id>/cache.json`).
   * `creaCacheFetchFn` è la fabbrica, iniettabile come tutto il resto: i test non devono
   * dipendere dall'orologio vero né dai tetti di default.
   */
  leggiIstantaneaCacheFn = leggiIstantaneaCache,
  scriviIstantaneaCacheFn = scriviIstantaneaCache,
  creaCacheFetchFn = talosResearchFetchCache,
  /*
   * ⭐⭐⭐⭐ L9 (12/09/2026) — LE PORTE NUOVE, e perché sono tutte iniettabili come le altre.
   *
   * Le quattro del DISCO (`scriviPianoFn`, `scriviFonteFn`, `leggiFonteFn`, e le due
   * dell'indice) per la ragione di sempre, già pagata: senza, un test di questo modulo
   * scriverebbe nel filesystem VERO della macchina che lo esegue — «misuravo l'ambiente invece
   * dell'oggetto», lezione del 10/09, trovata dal vivo proprio in L4.
   *
   * ⛔⛔ Le due del MODELLO (`pianificaFn`, `chiediAlModelloFn`) sono `null` per default, e il
   *   `null` è un comportamento dichiarato, non un buco:
   *     - senza `pianificaFn` il piano è quello DETERMINISTICO di `plan.mjs` (rami per
   *       profondità, facce ordinate). È già un piano vero e non costa un token;
   *     - senza `chiediAlModelloFn` NON C'È GIUDICE: le affermazioni escono `unchecked` col
   *       motivo scritto («nessun giudice indipendente disponibile: l'autore non può verificare
   *       sé stesso») e il rapporto porta `judge: null`. ⛔ Mai il ripiego opposto — far
   *       timbrare al modello le proprie affermazioni — che è il guasto misurato da
   *       Panickssery/Bowman/Feng (arXiv:2404.13076): «a linear correlation between
   *       self-recognition capability and the strength of self-preference bias».
   *   ⇒ i test di questo file girano con modello e rete FINTI, sempre, e il giro vero lo lancia
   *     l'owner sul 4174.
   */
  scriviPianoFn = scriviPiano,
  scriviFonteFn = scriviFonte,
  leggiFonteFn = leggiFonte,
  scriviIndiceFontiFn = scriviIndiceFonti,
  leggiIndiceFontiFn = leggiIndiceFonti,
  pianificaFn = null,
  chiediAlModelloFn = null,
  /*
   * I modelli che potrebbero fare da giudice, nell'ordine in cui vale la pena interpellarli.
   * ⛔ La scelta NON si fa qui: la fa `talosResearchPickJudge`, che è «chiunque tranne
   *   l'autore» e ha i suoi test. Questa funzione dice solo CHI c'è.
   */
  modelliGiudiceFn = () => [],
  /*
   * Il prezzo pubblicato del modello, quando lo si è ottenuto. ⛔ `null` = non lo sappiamo, e
   * allora il costo si dice in LAVORO (ricerche, pagine, token) e mai in denaro: «denaro solo se
   * un prezzo pubblicato è stato ottenuto» (§6.8, +1.5).
   */
  prezzoFn = () => null,
  /*
   * ⭐⭐⭐ L5 (12/09/2026) — LA LETTURA DI UNA PAGINA, per la ri-verifica nel tempo.
   *
   * `leggiPaginaFn(url) => Promise<{url, stato, corpo}>`. Il default è **null**, e non è
   * pigrizia: qui dentro non si costruisce un secondo lettore del web. Quello vero esiste già
   * (`agent-service.leggiPaginaPerLaVista` → `leggiPaginaSicura` del kernel) e porta con sé la
   * validazione contro gli indirizzi interni che l'attrezzo `naviga` usa da mesi — allowlist di
   * schema, nessun indirizzo privato, catena di redirect limitata (OWASP «Server Side Request
   * Forgery Prevention Cheat Sheet», letta il 12/09/2026: «verify the value against an allowed
   * list of protocols (HTTP or HTTPS)», «Disable the support for the following of the
   * redirection … to prevent the bypass of the input validation»). Scriverne un secondo qui
   * vorrebbe dire due validazioni che divergono.
   * ⛔ Lo inietta `session-registry.mjs`, che è dove vive il cablaggio. Se resta `null` la
   *   ri-verifica **lo dice** invece di provarci: una rotta che finge di aver guardato è peggio
   *   di una che ammette di non poter guardare.
   */
  leggiPaginaFn = null,
  /*
   * ⭐⭐⭐⭐ BC-44 (12/09/2026) — le due porte della ripresa automatica, iniettabili come tutto
   * il resto e per una ragione precisa, non per abitudine:
   *
   * `dormiFn`           l'attesa fra la caduta e il secondo tentativo. ⛔ Iniettabile perché un
   *                     test che aspettasse davvero venti secondi non è un test: misurerebbe
   *                     l'orologio. Il default non trattiene il processo (`unref`): una ricerca
   *                     caduta non deve tenere in piedi un server che sta chiudendo.
   * `ripresaAutomatica` l'interruttore. `true` di serie; a `false` il comportamento è quello di
   *                     ieri byte per byte — la classificazione e la ripresa A MANO restano,
   *                     perché quelle non spendono niente da sole.
   */
  dormiFn = (ms) => new Promise((risolvi) => { const t = setTimeout(risolvi, ms); t.unref?.(); }),
  ripresaAutomatica = true,
  clock = () => new Date(),
}) {
  /*
   * ⭐⭐⭐ L4 — LA CACHE DEL GIUDIZIO SUL RAPPORTO, e perché `elenca()` adesso rilegge.
   *
   * ⛔ Il difetto che chiude, visto dall'owner: `elenca()` NON rileggeva i rapporti e `leggi()`
   *   sì, quindi la ricerca `d2a453a8` compariva **«Conclusa» in lista** e
   *   **«bloccata dal permesso» quando la si apriva**. Due viste sullo stesso fatto che si
   *   contraddicono: la lista mentiva e il dettaglio la smentiva. L2 aveva chiamato quella
   *   divergenza «voluta» per non pagare venti letture a ogni apertura della sezione — il costo
   *   era vero, la conclusione no: si paga una volta e si mette in cache.
   *
   * ⛔ La chiave NON è l'id: è l'id PIÙ l'impronta del file (`mtimeMs`+`size`). Una cache a
   *   chiave-id sola servirebbe un giudizio vecchio su un rapporto ri-depositato — cioè
   *   riprodurrebbe in memoria la stessa bugia che sta togliendo dal disco. `null` (nessun
   *   rapporto) è anch'esso un'impronta valida e si mette in cache come le altre: appena il file
   *   nasce, l'impronta cambia e il giudizio si rifà.
   *
   * ⛔ E la mappa non cresce per sempre: oltre 200 voci si svuota tutta. Una LRU vera qui
   *   sarebbe codice in più per un limite che nessun progetto reale tocca (20 ricerche per
   *   cartella è già il tetto della pagina); quello che NON si può fare è lasciarla illimitata
   *   dentro un processo che vive per giorni.
   */
  const giudiziRapporto = new Map();
  const TETTO_CACHE_GIUDIZI = 200;
  /*
   * ⛔ L5 — QUANTE PAGINE una sola ri-verifica ha il diritto di andare a riaprire. Non è
   * burocrazia: `talosResearchRecheckReport` gira **in sequenza** (lo dichiara: «una dozzina di
   * richieste simultanee è il modo in cui una connessione domestica e un sito di notizie
   * decidono entrambi che sei uno scraper»), quindi un rapporto con cinquanta fonti terrebbe
   * aperta una richiesta HTTP per minuti. Si guardano le prime venti e la risposta dice
   * `troncata: true` con quante erano in tutto — mai un silenzio che somigli a «erano venti».
   */
  const TETTO_FONTI_RIVERIFICA = 20;
  /**
   * ⭐ L4 — UN EVENTO NEL GIORNALE, e un guasto del giornale NON ferma la ricerca.
   *
   * ⛔ La scelta è deliberata e va detta: il giornale è la prova di ciò che è stato speso, non
   *   la condizione perché si possa spendere. Se il disco è pieno, la ricerca deve continuare a
   *   girare e a consegnare — perderemmo la ripresa, non il lavoro. L'errore si inghiotte **qui
   *   e solo qui**, e questo è l'unico `catch` muto di questo file.
   */
  /*
   * ⭐⭐⭐ L4+L6 — LA CACHE DEL FETCH DI UNA CORSA, che sopravvive al riavvio.
   *
   * Una ricerca ripresa non deve ripagare le pagine che aveva già aperto: `fetch-cache.mjs`
   * (L6) sa tenerle e sa serializzarsi (`snapshot()`/`restore()`), ma dichiara di non scrivere
   * niente su disco — la persistenza è di chi orchestra, cioè di qui. La mappa tiene
   * l'istanza VIVA di una corsa; `cache.json` la tiene fra una vita e l'altra.
   *
   * ⛔⛔ DICHIARATO, non lasciato credere: **oggi nessuno riempie questa cache**. Il collettore
   *   (`collector.mjs`) non è agganciato, e le pagine le apre il kernel con `naviga`, che non
   *   passa di qui. ⇒ il giro completo salva-e-ripristina è provato nei due versi, ma sui dati
   *   VERI l'istantanea di oggi è vuota. È il punto di innesto pronto, non un risparmio già
   *   misurato: dire il contrario sarebbe vendere un numero che non esiste.
   */
  const cacheDelleRicerche = new Map();

  /** @returns {number} quante voci sono rientrate dall'istantanea su disco (0 se non ce n'era una valida). */
  async function ripristinaCacheFetch({ cartella, id }) {
    const cache = creaCacheFetchFn();
    cacheDelleRicerche.set(id, cache);
    let rientrate = 0;
    try {
      /*
       * ⛔ Il VERSO CONTRARIO è già garantito dal modulo che possiede il formato: `restore()`
       *   torna 0 su un'istantanea assente, di versione sconosciuta o malformata — «un formato
       *   più nuovo non deve impedire a una ricerca di RIPARTIRE, al massimo la fa ripagare».
       *   Qui NON si ricontrolla la versione: duplicarla creerebbe due numeri che divergono.
       */
      rientrate = cache.restore(await leggiIstantaneaCacheFn({ cartella, id })) ?? 0;
    } catch {
      rientrate = 0; // un'istantanea illeggibile costa una ri-lettura delle pagine, mai la ripresa.
    }
    /*
     * ⭐⭐⭐⭐ L9 — LA RACCOLTA SI RIMONTA QUI, e con lei il piano e l'indice delle fonti.
     *
     * ⛔ Senza queste tre righe una ricerca RIPRESA tornerebbe esattamente allo stato di ieri:
     *   nessun passo nel giornale, nessuna spesa contata, nessun testo ritrovabile per la
     *   verifica. Cioè la cura funzionerebbe solo finché il server non si riavvia — e una
     *   ricerca lunga è proprio quella che il server riavviato interrompe.
     * ⛔ Il piano si rilegge dal DISCO (`piano.json`), non si ricalcola: ricalcolarlo darebbe
     *   rami con lo stesso id ma, se un giorno il pianificatore col modello sarà acceso, con
     *   domande diverse — e i passi già a registro punterebbero a linee che non esistono più.
     */
    const pianoSuDisco = await leggiPianoFn({ cartella, id });
    if (Array.isArray(pianoSuDisco) && pianoSuDisco.length > 0) pianiDelleRicerche.set(id, pianoSuDisco);
    const indice = await leggiIndiceFontiFn({ cartella, id });
    const mappa = new Map();
    for (const voce of Array.isArray(indice) ? indice : []) {
      if (typeof voce?.url === 'string') mappa.set(voce.url, voce);
    }
    indiciDelleFonti.set(id, mappa);
    montaRaccolta({ cartella, id, cache });
    return rientrate;
  }

  /** Salva l'istantanea a un punto sicuro (pausa, conclusione). Un guasto qui non ferma niente. */
  async function salvaIstantaneaCache({ cartella, id }) {
    const cache = cacheDelleRicerche.get(id);
    if (!cache) return;
    try {
      await scriviIstantaneaCacheFn({ cartella, id, istantanea: cache.snapshot() });
    } catch { /* come il giornale: la cache è un risparmio, non una condizione per lavorare. */ }
  }

  async function registra(cartella, id, evento) {
    try {
      await accodaEventoFn({ cartella, id, evento: { at: clock().toISOString(), ...evento } });
    } catch { /* vedi sopra: un giornale che non si scrive non deve fermare una corsa già pagata. */ }
  }

  /*
   * ⭐⭐⭐⭐ L9 — LA RACCOLTA DI UNA CORSA, e le due mappe che la tengono in piedi.
   *
   * `raccolteDelleRicerche` è l'oggetto che il kernel riceve come `cacheWeb`: tutto ciò che la
   * figlia cerca e apre passa di lì, e diventa un passo del giornale (vedi
   * `src/research/raccolta-viva.mjs`). Vive quanto la corsa, esattamente come
   * `cacheDelleRicerche`.
   *
   * `pianiDelleRicerche` tiene il piano APPROVATO in memoria, per l'attribuzione dei passi ai
   * rami. ⛔ Non è la fonte della verità: quella è `piano.json` su disco, ed è da lì che
   * `leggi()` e una ripresa lo rileggono. La copia in memoria esiste perché la raccolta deve
   * poterlo consultare a ogni ricerca senza una lettura di file per chiamata.
   *
   * `indiciDelleFonti` accumula l'indice url → `fonti/<sha256>.txt` e lo riscrive intero a ogni
   * fonte nuova. ⛔ Riscrittura atomica di tutta la mappa e non append: è una mappa, non un
   * registro, e due voci contraddittorie per lo stesso indirizzo sarebbero peggio di nessuna.
   */
  const raccolteDelleRicerche = new Map();
  const pianiDelleRicerche = new Map();
  const indiciDelleFonti = new Map();

  /**
   * @param {{cartella: string, id: string, cache: object}} input
   * @returns {object} la raccolta viva di quella corsa
   */
  function montaRaccolta({ cartella, id, cache }) {
    const raccolta = creaRaccoltaViva({
      cache,
      registra: (evento) => registra(cartella, id, evento),
      tieniFonte: (testo) => scriviFonteFn({ cartella, id, testo }),
      annotaFonte: async (voce) => {
        const indice = indiciDelleFonti.get(id) ?? new Map();
        const gia = indice.get(voce.url);
        // ⛔ Una pagina APERTA non si lascia sostituire dal suo estratto: una prova più debole
        //   non deve poter cancellare una più forte (stessa regola, in memoria, in raccolta-viva).
        if (gia?.ottenuta === 'page' && voce.ottenuta !== 'page') return;
        indice.set(voce.url, voce);
        indiciDelleFonti.set(id, indice);
        await scriviIndiceFontiFn({ cartella, id, voci: [...indice.values()] });
      },
      piano: () => pianiDelleRicerche.get(id) ?? [],
    });
    raccolteDelleRicerche.set(id, raccolta);
    return raccolta;
  }

  /**
   * ⭐ La porta che `session-registry.mjs` passa al kernel. `null` per ogni sessione che NON è
   * una ricerca — e allora il kernel si comporta bit-per-bit come ieri: nessuna cache, nessun
   * budget, nessun passo nel giornale. È la garanzia che TALOS-BANCO non veda cambiare un byte.
   */
  function raccoltaDellaRicerca(id) {
    return raccolteDelleRicerche.get(id) ?? null;
  }

  /**
   * ⭐⭐⭐⭐ L9 §6.8 (+1.5) — IL PIANO, E IL COSTO DETTO PRIMA.
   *
   * Tre passi, in quest'ordine, e ognuno ha una ragione che non è l'ordine alfabetico:
   *   1. `talosResearchPlanFor` dà i rami per PROFONDITÀ — 2 per «rapida», 4 per «approfondita»,
   *      6 per «esaustiva» — ognuno la stessa domanda vista da una faccia diversa, con la sua
   *      stima di ricerche/pagine/token. ⛔ Deterministico: non costa un token, e un piano che
   *      costa prima ancora di aver cercato qualcosa è il primo posto dove una corsa si allunga.
   *   2. `pianificaFn`, SE c'è, può riformulare le domande dei rami col modello. ⛔ Può cambiare
   *      solo il TESTO: il numero dei rami resta quello della profondità (la persona ha scelto
   *      quello) e le stime restano quelle calcolate — un modello che si stima da solo il costo
   *      è un modello che dichiara quello che gli conviene. Un guasto qui NON ferma la corsa: si
   *      tiene il piano deterministico e si va avanti.
   *   3. Il giornale registra `plan_proposed` e poi `plan_approved`, e il piano approvato va su
   *      disco. ⛔⛔ L'approvazione oggi è AUTOMATICA e lo dice (`auto: true` nell'evento): il
   *      pulsante con cui una persona toglie, aggiunge o riformula un ramo prima che parta è un
   *      lotto di UI a parte, e non è questo. Scriverlo qui come se ci fosse sarebbe la bugia
   *      che §6.5 esiste per togliere — due eventi distinti, invece, lasciano il posto già
   *      pronto: quando il pulsante ci sarà, `plan_approved` arriverà da lui e `auto` sparirà.
   *
   * @returns {Promise<readonly object[]>}
   */
  async function costruisciPiano({ question, depth }) {
    /*
     * ⛔ La profondità si normalizza QUI e contro la tabella vera: `talosResearchPlanFor` legge
     *   `TALOS_RESEARCH_DEPTHS[depth]` e su una parola sconosciuta esploderebbe DENTRO `avvia`,
     *   cioè farebbe fallire l'avvio di una ricerca per una stringa arrivata da una rotta. Il
     *   ripiego è `deep`, che è anche il default del prodotto.
     */
    const profondita = Object.hasOwn(TALOS_RESEARCH_DEPTHS, depth) ? depth : 'deep';
    const base = talosResearchPlanFor(question, profondita);
    if (typeof pianificaFn !== 'function') return base;
    try {
      const proposto = await pianificaFn({ question, depth: profondita, piano: base });
      if (!Array.isArray(proposto) || proposto.length === 0) return base;
      return base.map((ramo, i) => {
        const testo = typeof proposto[i] === 'string' ? proposto[i].trim()
          : typeof proposto[i]?.question === 'string' ? proposto[i].question.trim() : '';
        return testo ? { ...ramo, question: testo } : ramo;
      });
    } catch {
      /*
       * ⛔ Il piano deterministico è un ripiego COMPLETO, non degradato: è quello che il mobile
       *   usa da sempre. Un pianificatore che cade costa una riformulazione, mai una corsa.
       */
      return base;
    }
  }

  /**
   * Il costo ATTESO, in parole, prima di partire.
   *
   * ⛔ Lavoro sempre, denaro SOLO se un prezzo pubblicato è stato ottenuto (§6.8, +1.5). Un
   *   «≈ 0,02 $» stampato su un prezzo indovinato è peggio di nessuna cifra: chi lo legge
   *   decide con quello.
   * ⛔ E si dice che è una STIMA, con la parola. La spesa vera si conta dai passi e si mostra
   *   accanto — «il divario stimato/speso è esso stesso una misura».
   */
  function costoDetto(piano) {
    const totali = talosResearchPlanTotals(piano);
    let prezzo = null;
    try { prezzo = prezzoFn(); } catch { prezzo = null; }
    const costo = talosResearchPlanCost(totali, prezzo);
    const denaro = costo?.known
      ? ` ≈ ${costo.amount.toFixed(4)} ${costo.currency} at the published price`
      : '';
    return {
      totali,
      costo,
      frase: `Planned: ${piano.length} lines of inquiry, an estimated ${totali.searches} search(es), `
        + `${totali.pages} page(s) and ~${totali.tokens} tokens${denaro}. `
        + 'Those are estimates made before starting; what is actually spent is counted step by step and shown next to them.',
    };
  }

  /**
   * ⭐⭐⭐ L9 — IL TESTO TENUTO, PER INDIRIZZO, anche dopo un riavvio.
   *
   * Prima la memoria della corsa (gratis, e più fresca); poi il disco, via
   * `indice-fonti.json` + `fonti/<sha256>.txt`. ⛔ L'ordine conta: una corsa viva ha in memoria
   * anche le fonti che l'indice non ha ancora ricevuto (una scrittura fallita, un disco pieno),
   * e chiedere prima al disco le perderebbe.
   * ⛔ Se non c'è niente da nessuna parte la mappa è VUOTA, e la verifica lo dirà con il motivo
   *   giusto («il passaggio non è nel testo della fonte») invece di inventare un verdetto.
   */
  async function testiTenutiPerUrl({ cartella, id }) {
    const mappa = new Map();
    const indice = await leggiIndiceFontiFn({ cartella, id });
    for (const voce of Array.isArray(indice) ? indice : []) {
      if (typeof voce?.url !== 'string' || typeof voce?.ref !== 'string') continue;
      const testo = await leggiFonteFn({ cartella, id, ref: voce.ref });
      if (typeof testo === 'string' && testo.length > 0) mappa.set(voce.url, testo);
    }
    const viva = raccolteDelleRicerche.get(id);
    if (viva) for (const [url, testo] of viva.testiPerUrl()) mappa.set(url, testo);
    return mappa;
  }

  /**
   * ⭐⭐⭐ L4 — IL GIUDIZIO SUL RAPPORTO, **UNA SOLA VOLTA E IN UN SOLO POSTO**.
   *
   * La chiamano `elenca()` e `leggi()`, e questo è il punto: prima ce n'erano due di fatto —
   * l'elenco che non guardava niente e il dettaglio che guardava — e le due viste si
   * contraddicevano a schermo. Una funzione sola non può contraddirsi.
   *
   * Ordine di lettura, e il perché di ognuno:
   *   1. il file depositato (`.harness-ui-research/<id>/rapporto.md`) — la via di oggi;
   *   2. la voce di Libreria, **solo** se il file non c'è — la via di ieri, l'unica che hanno
   *      le ricerche già su disco. Costa una lettura in più ed è per questo che è seconda.
   *
   * ⛔ `ripiegoConsentito` si ricava dal campo `formato` della voce, non da un'euristica: una
   *   ricerca nata oggi (`formato: 2`) DEVE portare il record; una nata prima non può, e non le
   *   si chiede l'impossibile.
   * ⛔ E il file su disco **non si riscrive mai**: la correzione vive nella lettura. È la stessa
   *   forma di «TRE RIPETIZIONI PAGATE, UNA USATA» (22/8), dove la cura stava nel lettore.
   *
   * @returns {Promise<{stato:'done'|'senza-rapporto', motivoDettaglio:string|null, contenutoRapporto:string|null, letto:object|null}>}
   */
  /**
   * ⭐⭐⭐⭐ L9 §6.8 (+1.2 · +1.3) — LA VERIFICA VERA, PRIMA DEL DEPOSITO.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * Che cosa cambia rispetto a ieri, in una riga
   * ═══════════════════════════════════════════════════════════════════════════
   * L8 aveva tolto al modello la possibilità di timbrare sé stesso: `judge: null` e
   * `claimSupported: 'unchecked'` non erano più argomenti dell'attrezzo, li metteva il server.
   * Giusto, e a metà: il risultato era che **nessuno** timbrava, e il giro vero del 12/09 è
   * uscito con 38 affermazioni su 38 «non verificate». `unchecked` onesto è meglio di un
   * verdetto falso, ma non è il prodotto — il prodotto è il verdetto VERO.
   *
   * ⇒ Qui, fra il «il modello ha chiamato `research_deposit`» e il «il file è sul disco», i tre
   *   livelli girano davvero:
   *     L1  la fonte citata esiste fra quelle raccolte, e com'è stata ottenuta (pagina/estratto);
   *     L2  il passaggio citato si RITROVA nel testo tenuto della pagina — `talosResearchLocate`,
   *         nessuna frase simile, nessuna approssimazione gentile: «un verificatore che
   *         gentilmente trova un'approssimazione è un verificatore che fabbrica attribuzioni»;
   *     L3  un GIUDICE, che non è l'autore, dice se quel passaggio da solo sostiene
   *         l'affermazione; e se ha detto sì o in parte, si va a CERCARE la contraria.
   *
   * ⛔⛔ IL GIUDICE NON È L'AUTORE, ed è la ragione per cui un `modelloGiudice` sta sulla
   *   metadata fin dalla nascita della ricerca. Misura, non opinione: Panickssery, Bowman e
   *   Feng, «LLM Evaluators Recognize and Favor Their Own Generations» (arXiv:2404.13076,
   *   15/04/2024, letta il 12/09/2026) — gli LLM riconoscono i propri testi, e «a linear
   *   correlation between self-recognition capability and the strength of self-preference bias».
   *   ⛔ Se non c'è nessun altro modello, `judge: null` e **lo dice**: `talosResearchVerify`
   *     scrive il motivo per esteso, e il bilancio conta quelle affermazioni fra le «non
   *     verificate» — mai fra le sostenute.
   *
   * ⛔ E il passaggio dichiarato NON è una prova finché non lo si ritrova: «even the best models
   *   lack complete citation support 50% of the time» (Gao et al., arXiv:2305.14627, benchmark
   *   ALCE, letta il 12/09/2026). È metà delle citazioni: esattamente il motivo per cui il testo
   *   delle pagine si TIENE, e per cui questo controllo non è un lusso.
   *
   * ⛔ Un guasto della verifica NON butta il deposito. Se il giudice non risponde, se il disco
   *   non dà il testo, se qualsiasi cosa cade: si torna al documento **senza verdetti**, che è
   *   ciò che sarebbe stato depositato ieri. Perdere il rapporto pagato per far fallire il suo
   *   controllo sarebbe il guasto introdotto dalla cura, cioè il peggiore.
   *
   * @returns {Promise<object>} lo stesso contratto di `componiRapportoRicerca`, più `bilancio`,
   *   `giudice`, `proveDistinte` e `fedelta` quando la verifica è girata.
   */
  async function componiRapporto({ cartella, id, domanda, testo, affermazioni, fonti }) {
    /*
     * ⛔ Il testo tenuto si cerca solo se abbiamo un id di ricerca: `research_deposit` fuori da
     *   una ricerca non esiste (il kernel lo rifiuta a monte), ma questa funzione è anche il
     *   `componiRapportoRicercaFn` di una sessione qualunque — e un id assente deve dare
     *   esattamente il comportamento di ieri, non un errore.
     */
    let testiPerUrl = null;
    if (typeof id === 'string' && id.length > 0 && typeof cartella === 'string' && cartella.length > 0) {
      try { testiPerUrl = await testiTenutiPerUrl({ cartella, id }); } catch { testiPerUrl = null; }
    }
    const composto = componiRapportoRicerca({ domanda, testo, affermazioni, fonti, testiPerUrl });
    if (!composto.ok) return composto;
    if (!testiPerUrl) return composto;

    let record = null;
    try { record = await leggiRicercaFn({ cartella, id }); } catch { record = null; }
    const modelloGiudice = typeof record?.modelloGiudice === 'string' && record.modelloGiudice.trim()
      ? record.modelloGiudice.trim() : null;
    /*
     * ⛔ La DOPPIA condizione, e nessuna delle due è ridondante: serve un modello giudice
     *   scelto alla nascita (che è già «diverso dall'autore» per costruzione, via
     *   `talosResearchPickJudge`) E una porta per parlargli. Senza la seconda il giudice
     *   esisterebbe sulla carta e ogni chiamata cadrebbe, cioè `unchecked` con un motivo
     *   sbagliato («il giudice non ha risposto» invece di «non ce n'era uno»).
     */
    const giudice = modelloGiudice && typeof chiediAlModelloFn === 'function'
      ? { id: modelloGiudice, provider: 'openrouter', model: modelloGiudice }
      : null;

    const passo = 'verifica:verify';
    await registra(cartella, id, { kind: 'step_started', stepId: passo, branchId: 'verifica', stepKind: 'verify' });
    let caratteri = 0;
    /** @param {string} prompt */
    const chiedi = async (prompt) => {
      caratteri += prompt.length;
      const risposta = await chiediAlModelloFn({ modello: modelloGiudice, prompt, scopo: 'giudice-ricerca' });
      const detto = typeof risposta === 'string' ? risposta : String(risposta ?? '');
      caratteri += detto.length;
      return detto;
    };

    let verificati = null;
    try {
      verificati = await talosResearchVerify({
        judge: giudice,
        ask: (claim, passaggio) => chiedi(talosResearchJudgePrompt(claim, passaggio)),
        /*
         * ⭐ §6.8 (+1.3) — LA CONTRARIA SI CERCA APPOSTA, e solo dove ha senso cercarla:
         * `talosResearchVerify` la chiede soltanto dopo un «sì» o un «in parte», perché
         * «la contesa è disaccordo: senza un accordo prima non c'è niente con cui essere in
         * disaccordo». ⛔ Senza giudice non si chiede: `askOpposing` resta `undefined`, e il
         * modulo salta il giro invece di pagarlo per niente.
         */
        ...(giudice ? { askOpposing: (claim, passaggio) => chiedi(talosResearchOpposingPrompt(claim, passaggio)) } : {}),
        at: () => clock().toISOString(),
      }, composto.claims.map((c) => c.claim), composto.sources);
    } catch {
      verificati = null;
    }

    if (!verificati) {
      await registra(cartella, id, {
        kind: 'step_failed', stepId: passo, error: 'la verifica non è girata: il rapporto è stato depositato senza verdetti',
      });
      return composto;
    }

    /*
     * ⭐ §6.8 (+1.2) — LE PROVE SI CONTANO A GRUPPI, NON A URL. «7 prove distinte su 14
     * indirizzi» dice una cosa che «14 fonti» non dice, e la regola sta in un posto solo
     * (`independence.mjs`), pubblicata e verificabile.
     */
    const origini = composto.sources.map((s) => ({ url: s.url }));
    const indipendenza = talosResearchIndependentSources(origini);
    const fedelta = talosResearchFidelity({ claims: verificati, sources: origini });
    const bilancio = talosResearchVerifiedStanding(verificati);

    const documento = talosResearchReportDocument({
      question: composto.intestazione,
      summary: String(testo).trim(),
      // ⛔ Il nome del giudice nel rapporto, così il lettore lo possa PESARE: un giudice su un
      //   fornitore diverso e uno sullo stesso fornitore non valgono uguale, e il rapporto deve
      //   dire quale dei due è stato.
      judge: giudice?.id ?? null,
      claims: verificati,
      sources: composto.sources,
    });

    await registra(cartella, id, {
      kind: 'step_finished', stepId: passo,
      // ⛔ La spesa della verifica è VERA e va contata: è la parte del costo che nessun
      //   concorrente ha, e nasconderla farebbe sembrare gratis la cosa che ci distingue.
      spend: { searches: 0, pages: 0, tokens: Math.ceil(caratteri / 4) },
      resultRef: null,
    });

    return {
      ...composto,
      documento,
      bilancio,
      giudice: giudice?.id ?? null,
      proveDistinte: indipendenza.independent,
      fedelta,
      verificate: verificati.filter((v) => v.checks.judge !== null).length,
    };
  }

  async function giudicaRapporto({ cartella, record }) {
    const id = record.id;
    const chiave = `${cartella}::${id}`;
    const impronta = await statRapportoFn({ cartella, id });
    const inCache = giudiziRapporto.get(chiave);
    const stessaImpronta = inCache
      && ((inCache.impronta === null && impronta === null)
        || (inCache.impronta && impronta && inCache.impronta.mtimeMs === impronta.mtimeMs && inCache.impronta.size === impronta.size));
    if (stessaImpronta) return inCache.esito;

    const ripiegoConsentito = !(Number(record.formato) >= 2);
    let testo = await leggiRapportoFn({ cartella, id });
    /*
     * ⛔ `daDeposito` distingue «il modello ha consegnato» da «esiste una copia in Libreria da
     *   una vita precedente», e serve a una cosa sola ma importante: al momento della
     *   conclusione, «non ha depositato» ha tre diagnosi diverse (permesso, giri, altro) e non
     *   deve essere confuso con «ha depositato una cosa che non passa». Senza questo campo una
     *   ricerca vecchia ripresa avrebbe perso la diagnosi `bloccata-dal-permesso`.
     */
    const daDeposito = testo !== null && testo !== undefined;
    if (!daDeposito && record.reportLibraryId && leggiVoceLibreriaFn) {
      try {
        const voce = await leggiVoceLibreriaFn({ cartella, id: record.reportLibraryId });
        testo = voce?.testo ?? null;
      } catch {
        testo = null; // il rapporto è dichiarato pronto ma illeggibile ORA — onesto, mai un crash.
      }
    }
    const letto = (testo === null || testo === undefined) ? null : rileggiRapportoFn(testo, { ripiegoConsentito });
    const esito = letto?.ok
      ? { stato: 'done', motivoDettaglio: null, contenutoRapporto: testo, contenutoRespinto: null, letto, daDeposito }
      : {
        stato: 'senza-rapporto',
        daDeposito,
        motivoDettaglio: letto?.motivo ?? 'non c\'è nessun file di rapporto',
        /*
         * ⛔⛔ `contenutoRapporto` resta NULL quando il cancello dice di no — e il testo respinto
         *   esce da un'altra porta, `contenutoRespinto`. Due nomi perché sono due cose: se la
         *   scusa da 290 byte uscisse dal campo che si chiama «il rapporto», il frontend la
         *   disegnerebbe come tale e avremmo rifatto il guasto dell'11/09 dentro la sua cura.
         * ⛔ Ma non si butta: un rapporto che non porta il record è comunque il prodotto di una
         *   corsa pagata, e nasconderlo perderebbe 484.171 token di lavoro per una forma
         *   mancante. Il cancello decide lo STATO; non decide cosa si può leggere.
         */
        contenutoRapporto: null,
        contenutoRespinto: (testo === null || testo === undefined) ? null : testo,
        letto,
      };
    if (giudiziRapporto.size >= TETTO_CACHE_GIUDIZI) giudiziRapporto.clear();
    giudiziRapporto.set(chiave, { impronta, esito });
    return esito;
  }

  /**
   * ⭐⭐⭐ L2 §6.5 — IL CANCELLO DI CONSEGNA.
   *
   * Prima d'oggi questa funzione faceva due cose: prendeva l'ultimo messaggio con del testo e,
   * se `comeFinita === 'concluso'`, scriveva `terminata:'done'`. Cioè decideva sul PROCESSO
   * («la corsa è finita da sola») e raccontava il PRODOTTO («c'è un rapporto»). L'11/09 le due
   * cose divergevano e la sezione mostrava «Conclusa» su 290 byte di scusa.
   *
   * Adesso l'ordine è questo, e ogni ramo ha un nome suo:
   *   pausa/annullamento → invariato (una pausa non finalizza niente)
   *   rapporto depositato e RILEGGIBILE            → 'done'
   *   rapporto depositato ma non rileggibile/vuoto → 'senza-rapporto'
   *   niente rapporto + un REFUSED di permesso     → 'bloccata-dal-permesso'
   *   niente rapporto + giri finiti                → 'giri-esauriti'
   *   niente rapporto, nient'altro                 → 'failed'
   *
   * ⛔ `'done'` non si può più ottenere con una scusa: serve un artefatto che si rilegga.
   * ⛔ L'ordine NON è arbitrario: il rapporto si guarda PER PRIMO, prima di `comeFinita`. Una
   *   ricerca che deposita un rapporto valido e poi esaurisce i giri ha consegnato — e dirle
   *   «giri esauriti» butterebbe via una consegna vera. È l'errore opposto di quello di
   *   stasera, e va evitato con la stessa cura.
   */
  async function onConclusioneRicerca({ cartella, id, risultato }) {
    const voceSessione = sessioni.get(id);
    const richiesta = voceSessione?._ricercaTerminataRichiesta ?? null;
    // ⛔ SEMPRE azzerato qui, su OGNI conclusione — mai lasciato sporco per il giro successivo (vedi la doc di testa: pausa→ripresa→conclusione naturale non deve essere scambiata per una seconda pausa).
    if (voceSessione) voceSessione._ricercaTerminataRichiesta = null;
    if (richiesta === 'paused') {
      /*
       * ⭐ L4 — «fermo» si registra, e non è la stessa riga di «chiesto di fermarsi» (quella
       * l'ha scritta `mettiInPausa`). `run.mjs` tiene separati `pause_requested` e `paused`
       * «perché in mezzo c'è del denaro»: il passo in volo viene drenato prima del punto sicuro.
       * Senza questa riga, un giornale rigiocato direbbe che la ricerca stava ancora fermandosi.
       */
      await registra(cartella, id, { kind: 'run_paused' });
      // ⭐ L6 — il punto sicuro è ANCHE il punto in cui si salva ciò che è già stato scaricato.
      await salvaIstantaneaCache({ cartella, id });
      return; // terminata resta null: resumable, il bucket "paused" lo deriva statoVivo() dal vivo.
    }
    if (richiesta === 'cancelled') {
      await aggiornaRicercaFn({ cartella, id, terminata: 'cancelled', conclusaAlle: clock().toISOString() });
      await registra(cartella, id, { kind: 'run_cancelled' });
      // ⛔ Nessuna istantanea su un annullamento: `cancelled` è terminale e non si riprende mai
      //   (`run.mjs`), quindi scrivere un file che nessuno rileggerà sarebbe solo disco sporcato.
      cacheDelleRicerche.delete(id);
      return;
    }
    const record = await leggiRicercaFn({ cartella, id });
    const domanda = record?.domanda ?? 'research';
    const messaggi = risultato?.esito?.messaggiFinali;
    /*
     * ⛔ L'ultimo messaggio si conserva SEMPRE, anche quando è una scusa — ma come ALLEGATO,
     * in un campo che si chiama `ultimoMessaggio`. Buttarlo sarebbe perdere la diagnosi (la
     * scusa del 11/09 dice esattamente cosa è andato storto); chiamarlo «rapporto» era la
     * bugia. Troncato: è una frase da mostrare, non un documento da custodire.
     */
    const ultimoMessaggio = (ultimoMessaggioDelModello(messaggi) ?? '').slice(0, 2_000) || null;
    /*
     * ⭐⭐⭐ BC-44 — `motivoErrore: null` sta in `comune`, cioè si AZZERA su ogni conclusione che
     *   non sia un `failed`. Senza, una ricerca caduta per un timeout e poi ripresa fino a
     *   `done` si porterebbe dietro per sempre il motivo di una caduta che è già stata curata —
     *   e la sezione mostrerebbe «riprendibile» su un rapporto consegnato.
     */
    const comune = { conclusaAlle: clock().toISOString(), ultimoMessaggio, motivoErrore: null };
    /*
     * ⭐ L6 — una conclusione è un punto sicuro come la pausa, e vale ANCHE per i guasti:
     * `bloccata-dal-permesso` e `giri-esauriti` sono proprio i casi che si riprendono, e chi
     * riprende non deve ripagare le pagine. L'istantanea si salva PRIMA di decidere lo stato,
     * così nessun ramo di ritorno anticipato può saltarla.
     */
    await salvaIstantaneaCache({ cartella, id });
    cacheDelleRicerche.delete(id);

    /*
     * ⭐⭐⭐ L4 — LO STESSO CANCELLO DI `elenca()` E `leggi()`, non una terza copia.
     * ⛔ La cache si invalida da sola: `giudicaRapporto` chiave sull'impronta del file, e qui il
     *   file è appena stato depositato ⇒ impronta nuova ⇒ giudizio rifatto. Nessuna riga di
     *   invalidazione a mano, cioè nessuna riga da ricordarsi di scrivere la prossima volta.
     */
    const giudizio = record ? await giudicaRapporto({ cartella, record }) : null;
    /*
     * ⛔ Alla CONCLUSIONE conta il deposito, non una copia di Libreria ereditata: se il modello
     *   non ha depositato, la domanda giusta è «perché» (permesso? giri?) e le tre diagnosi
     *   sotto sono l'unica risposta utile. Un rapporto che passa il cancello vale comunque —
     *   anche se arriva dalla Libreria di una vita precedente — perché consegnare è consegnare.
     */
    const testoRapporto = (giudizio?.daDeposito || giudizio?.letto?.ok) ? (giudizio.contenutoRapporto ?? giudizio.contenutoRespinto ?? null) : null;
    if (testoRapporto !== null && testoRapporto !== undefined) {
      const letto = giudizio.letto;
      if (letto?.ok) {
        /*
         * ⛔ La voce di Libreria si scrive DAL RAPPORTO VERO, non dall'ultimo messaggio: è la
         * stessa Libreria di prima (i rapporti di ricerca SONO file di Libreria, vedi la doc
         * di testa di research-store.mjs), ma adesso il contenuto è l'artefatto depositato.
         */
        let reportLibraryId;
        try {
          /*
           * ⭐ BC-38 (12/09/2026) — da QUALE sessione nasce questo rapporto. `id` È il sessionId
           *   della sessione che esegue la ricerca (doc di testa di questo file, riga 21): non c'è
           *   niente da dedurre, si passa quello che già si ha. Senza, il dettaglio della Libreria
           *   direbbe «sessione non registrata» sul file che più di tutti ha una sessione sua.
           * ⛔ Solo l'id: il NOME leggibile della sessione lo risolve chi disegna, con l'elenco
           *   vivo delle sessioni — una ricerca rinominata domani deve leggersi col nome di domani.
           */
          reportLibraryId = await salvaVoceLibreriaFn({ cartella, sessionId: id, nome: nomeRapporto(letto.intestazione || domanda), mediaType: 'text/markdown', origine: 'generated', testo: testoRapporto });
        } catch {
          /*
           * ⛔ Il rapporto ESISTE su disco: non è «senza rapporto». È solo la copia di Libreria
           * che non si è potuta scrivere — e il posto vero del rapporto è la sua cartella, non
           * la Libreria. Quindi `'done'` con `reportLibraryId: null`, non un falso fallimento:
           * ciò che è costato denaro non si dichiara perso perché una copia non è riuscita.
           */
          await aggiornaRicercaFn({ cartella, id, terminata: 'done', reportLibraryId: null, ...comune });
          await registra(cartella, id, { kind: 'run_finished' });
          return;
        }
        await aggiornaRicercaFn({ cartella, id, terminata: 'done', reportLibraryId, ...comune });
        await registra(cartella, id, { kind: 'run_finished' });
        return;
      }
      await aggiornaRicercaFn({ cartella, id, terminata: 'senza-rapporto', motivoDettaglio: letto?.motivo ?? null, ...comune });
      return;
    }

    // Nessun rapporto depositato: si dice PERCHÉ, e i tre perché si curano in modo diverso.
    if (trovaRifiutoDiPermesso(messaggi)) {
      await aggiornaRicercaFn({ cartella, id, terminata: 'bloccata-dal-permesso', ...comune });
      return;
    }
    if (risultato?.esito?.comeFinita === 'giri-esauriti') {
      await aggiornaRicercaFn({ cartella, id, terminata: 'giri-esauriti', ...comune });
      return;
    }
    /*
     * ⭐⭐⭐⭐ BC-44 (12/09/2026) — L'ULTIMO RAMO SMETTE DI ESSERE MUTO.
     *
     * Fino a ieri qui si scriveva `failed` e basta, e da lì in poi nessuno poteva più sapere se
     * quella corsa fosse caduta per un guasto di rete di dieci secondi o per un guasto vero. La
     * riga `{"type":"RunError","message":"Upstream idle timeout exceeded","code":"internal-error"}`
     * era già sul disco della SESSIONE, e la ricerca non la leggeva: due file, nessun ponte.
     *
     * ⛔ Il codice si legge PRIMA del messaggio solo quando dice davvero qualcosa: `internal-error`
     *   è il default di `agent-service.mjs` per ogni guasto del servizio, quindi lì decide la
     *   frase del fornitore. `comeFinita` entra al suo posto quando la corsa è tornata con un
     *   esito invece che con un'eccezione (`fermato`), perché quello È il codice di quel caso.
     */
    const caduta = classificaErroreDiCorsa({
      codice: typeof risultato?.codiceErrore === 'string' && risultato.codiceErrore
        ? risultato.codiceErrore
        : (risultato?.esito?.comeFinita ?? null),
      messaggio: typeof risultato?.erroreInterno === 'string' ? risultato.erroreInterno : null,
    });
    const motivoErrore = {
      classe: caduta.classe,
      transitorio: caduta.transitorio,
      codice: typeof risultato?.codiceErrore === 'string' ? risultato.codiceErrore : null,
      // ⛔ Troncato: è una diagnosi da rileggere, non un documento da custodire — e un fornitore può rispondere con una pagina HTML intera.
      messaggio: typeof risultato?.erroreInterno === 'string' ? risultato.erroreInterno.slice(0, 500) : null,
    };
    await aggiornaRicercaFn({ cartella, id, terminata: 'failed', ...comune, motivoErrore });
    /*
     * ⛔⛔ L'ORDINE NON È DI COMODO: lo stato onesto si scrive PRIMA di aspettare. Se il processo
     *   muore durante l'attesa, sul disco resta un `failed` con la sua causa — cioè una ricerca
     *   che una persona può riprendere a mano. Se aspettassimo prima di scrivere, un crash nel
     *   mezzo lascerebbe una ricerca senza stato e senza motivo.
     */
    if (caduta.transitorio) await riprendiDaSolaUnaVolta({ cartella, id, caduta });
  }

  /*
   * ⭐⭐⭐⭐ BC-44 — LA RIPRESA AUTOMATICA, e i quattro cancelli che la tengono onesta.
   *
   * Perché esiste: Anthropic, «How we built our multi-agent research system» (letta 12/09/2026)
   * — «we can't just restart from the beginning: restarts are expensive and frustrating for
   * users … we built systems that can resume from where the agent was when the errors occurred»,
   * con «deterministic safeguards like retry logic and regular checkpoints». Il checkpoint qui è
   * il giornale; questa funzione è il «retry logic» che finora mancava del tutto.
   *
   * ⛔ E perché è così stretta: riprendere COSTA. Non è ritentare una chiamata — è riaprire una
   *   corsa che può spendere venti minuti. Quindi quattro cancelli, e ognuno toglie un caso in
   *   cui la ripresa sarebbe uno spreco o una prepotenza:
   *     1. **transitoria** (deciso da chi chiama): un guasto deterministico si ripeterebbe uguale;
   *     2. **c'è lavoro da salvare** — almeno un `step_finished` nel giornale. Una corsa caduta
   *        al primo respiro non ha niente da riprendere: ripartire non salverebbe nulla e
   *        spenderebbe il doppio;
   *     3. **UNA SOLA VOLTA** — e il tetto è per RICERCA, non per giro: si guarda tutto il
   *        giornale, non solo dopo l'ultimo `run_started`. È il più stretto dei due letture
   *        possibili, scelto apposta: se due riprese automatiche non bastano, la terza è una
   *        decisione di una persona, non di un timer;
   *     4. **lo stato si rilegge DOPO l'attesa**: in quei secondi qualcuno può aver annullato,
   *        eliminato o ripreso a mano quella ricerca, e ripartirci sopra sarebbe scrivere
   *        addosso a una scelta appena presa.
   *
   * ⛔ La riga nel giornale la scrive `riprendi()` e porta `auto:true` e la `causa`: senza, un
   *   giornale rigiocato direbbe che a riprendere è stata una persona — e il cancello (3), che
   *   quella riga la legge, non avrebbe più nessun tetto da far rispettare.
   */
  async function riprendiDaSolaUnaVolta({ cartella, id, caduta }) {
    if (!ripresaAutomatica) return false;
    let eventi = [];
    try { ({ eventi } = await leggiGiornaleFn({ cartella, id })); } catch { return false; }
    if (!eventi.some((e) => e?.kind === 'step_finished')) return false;
    if (eventi.some((e) => e?.kind === 'run_resumed' && e.auto === true)) return false;
    try { await dormiFn(ATTESA_RIPRESA_AUTOMATICA_MS); } catch { return false; }
    const adesso = await leggiRicercaFn({ cartella, id });
    if (!adesso || adesso.terminata !== 'failed') return false;
    const esito = await riprendi({ id, automatica: caduta.classe });
    return Boolean(esito?.ok);
  }

  /*
   * ⛔⛔ NESSUN `run_finished` sui tre rami di guasto, ed è una scelta, non una dimenticanza.
   *   `talosResearchApply` porta `run_finished` a `status:'done'`, cioè a uno stato TERMINALE
   *   da cui `talosResearchNextStep` non restituisce più niente: scriverlo su una ricerca
   *   bloccata dal permesso o rimasta senza giri la renderebbe **non riprendibile** nel giornale,
   *   pur essendo esattamente il caso che deve potersi riprendere. La metadata dice com'è finita;
   *   il giornale dice che il lavoro è ancora dovuto. Le due cose non si contraddicono: rispondono
   *   a due domande diverse (`run.mjs`, `talosResearchWorkLeft`: «i due rispondono a domande
   *   diverse e servono entrambi»).
   */

  /**
   * Avvia — torna `{ok, esito, id}` SUBITO, mai atteso il .then() (vedi
   * la doc di testa). L'id è generato QUI, PRIMA di chiamare
   * avviaESeguiFn, e la riga di metadata è scritta PRIMA che la sessione
   * parta: elimina per costruzione la race in cui una conclusione
   * fulminea (un mock nei test, o un modello istantaneo) potrebbe far
   * scattare onConclusioneRicerca prima che il file esista.
   *
   * ⛔⛔⛔ Trovato dal vivo (30/8), non da lettura: le prime versioni di
   * questa funzione tornavano solo `{id}` — il DISPATCH del kernel per
   * `research_start` (talosHarness.mjs) si aspetta lo STESSO contratto
   * `{ok,esito}` degli altri 5 mutanti (`String(risultato?.esito ??
   * (risultato?.ok ? 'started' : 'failed'))`): senza `ok`/`esito`,
   * `risultato?.ok` era `undefined` (falsy) e il messaggio mostrato al
   * modello era SEMPRE "failed" — anche quando la ricerca era
   * DAVVERO partita (confermato dal `research_list` immediatamente
   * successivo, nello stesso giro, che la mostrava "running"). Un
   * bug che NESSUN test a unità poteva vedere: i test del kernel
   * mockano `onRicercaAvvia` con la forma già corretta, i test di
   * `session-registry.mjs` verificano il wiring ma non il messaggio
   * finale — solo una sessione VERA, con un modello VERO, l'ha
   * mostrato.
   */
  /*
   * ⭐⭐⭐⭐ L8 (12/09/2026) — LA FIGLIA EREDITA IL MODELLO DELLA MADRE.
   *
   * Il guasto, misurato sul giro vero e non dedotto: la chat `c8e9b07b` girava con
   * `z-ai/glm-5.3-flash`, ha chiamato `research_start`, e la figlia `3029dea2` è partita con
   * `z-ai/glm-4.7-flash` — il modello di serie del server (`config.mjs:25`,
   * `MODELLI_AMMESSI[0]`). Le due intestazioni nello store lo dicono alla lettera
   * (`.sessions-store/<id>.jsonl`, riga 1, campo `modello`). `avvia()` non passava nessun
   * modello, quindi `avviaESegui` ricadeva sul default: `modelloEffettivo = modelIdEffettivo ||
   * modelloRichiesta || voceEsistente?.modello || modello` (`session-registry.mjs`), e i primi
   * tre erano tutti assenti.
   *
   * ⛔ Tre conseguenze, tutte e tre vere insieme:
   *   1. la regola dell'owner «giri reali SOLO con glm-5.3-flash» era violata DAL PRODOTTO, non
   *      da chi lo usa: nessuna schermata permetteva di scegliere il modello della ricerca;
   *   2. la cache non poteva prendere. OpenRouter, «Prompt Caching» (letto 12/09/2026):
   *      «Sticky routing is tracked at the account level, **per model**, and per conversation» —
   *      un modello diverso è un'altra chiave di cache, e infatti il giro ha misurato
   *      **265.670 token dentro con `cached_tokens: 0`**;
   *   3. il rapporto lo scriveva un modello che la persona non ha scelto — cioè la ricerca
   *      approfondita, la parte più cara del prodotto, girava sul modello più economico
   *      proprio dove la qualità conta di più.
   *
   * ⛔ La cura è UN PASSAGGIO DI PARAMETRO, ed è per questo che nessun test la vedeva: non
   *   c'era nessun ramo sbagliato da far scattare, c'era un argomento assente. Un test che
   *   monta l'orchestratore e guarda cosa arriva ad `avviaESeguiFn` è l'unico che morde.
   *
   * ⛔⛔ E il modello NON si eredita quando la madre gira su un runtime LOCALE: lì
   *   `voce.modello` è l'id di un GGUF sul disco (`modelId`), non un modello di OpenRouter, e
   *   la figlia parte comunque `provider:'cloud'` (questa funzione non passa né `provider` né
   *   `runtimeId`). Passarglielo trasformerebbe l'eredità in un guasto garantito alla prima
   *   chiamata. Il filtro sta in `session-registry.mjs`, dove il provider si conosce.
   */
  async function avvia({ cartella, question, depth, padreId = null, modello = null, reasoning = null }) {
    const id = randomUUIDFn();
    const nome = nomeDallaDomanda(question);
    /*
     * ⭐⭐⭐⭐ L9 — IL GIUDICE SI SCEGLIE ADESSO, prima ancora che la corsa parta.
     *
     * ⛔ «Chiunque tranne l'autore», e l'autore è il modello di QUESTA corsa: la scelta è di
     *   `talosResearchPickJudge`, qui si dice solo chi era disponibile. Il perché è misurato e
     *   vecchio: Panickssery, Bowman e Feng, «LLM Evaluators Recognize and Favor Their Own
     *   Generations» (arXiv:2404.13076, 15/04/2024, letta il 12/09/2026) — gli LLM riconoscono
     *   i propri testi e li premiano, con «a linear correlation between self-recognition
     *   capability and the strength of self-preference bias».
     * ⛔ `null` è una risposta vera e va scritta come tale: nessun altro modello ammesso ⇒
     *   nessun giudizio, e il rapporto lo dichiara. Mai l'autore che timbra sé stesso.
     */
    const autore = { id: modello ?? 'autore', provider: 'openrouter', model: modello ?? '' };
    let candidati = [];
    try { candidati = modelliGiudiceFn({ autore }) ?? []; } catch { candidati = []; }
    const giudiceScelto = talosResearchPickJudge(autore, candidati);
    await creaRicercaFn({
      cartella, id, domanda: question, profondita: depth || 'deep', padreId, nome, modello,
      modelloGiudice: giudiceScelto?.model ?? giudiceScelto?.id ?? null,
    });
    /*
     * ⭐⭐⭐ L4 — LA PRIMA RIGA DEL GIORNALE, e l'ordine conta.
     *
     * Scritta PRIMA di `avviaESeguiFn`, per la stessa ragione per cui la metadata lo è: una
     * conclusione fulminea (un mock, o un modello istantaneo) non deve poter scrivere
     * `run_finished` su un giornale che non ha ancora il suo `run_started`. `talosResearchApply`
     * su un giornale che comincia senza `run_started` torna `null` a ogni evento — cioè un
     * giro che non si può rigiocare, che è esattamente il guasto da cui tutto questo nasce.
     *
     * ⛔ `engine: 'device'` non è una bugia sul desktop: è il valore che `run.mjs` usa per «gira
     *   qui, in locale» contro `'cloud'` (R1b, la migrazione su server). Qui gira in locale.
     */
    await registra(cartella, id, {
      kind: 'run_started', id, sessionId: id, question, depth: depth || 'deep', engine: 'device',
    });
    // ⭐ L6 — la cache di QUESTA corsa nasce qui e vive finché la corsa vive (vedi `cacheDelleRicerche`).
    const cache = creaCacheFetchFn();
    cacheDelleRicerche.set(id, cache);
    /*
     * ⭐⭐⭐⭐ L9 — IL PIANO, PRIMA CHE LA FIGLIA PARLI.
     *
     * ⛔ L'ordine è quello e non un altro: piano → `plan_proposed` → `piano.json` →
     *   `plan_approved` → consegna → `avviaESegui`. La consegna PORTA le linee d'indagine
     *   (vedi `promptRicerca`), quindi il piano dev'essere pronto prima che la sessione
     *   esista; e il giornale deve avere i due eventi prima che un passo possa arrivarci,
     *   altrimenti il replay vedrebbe un `step_started` su un giro ancora in `planning`.
     * ⛔ `plan_approved` porta `auto: true` — il campo non esiste in `run.mjs` e non gli serve
     *   (l'`apply` ignora ciò che non conosce, per costruzione), ma chi rilegge il giornale
     *   deve poter distinguere «approvato da una persona» da «approvato perché il pulsante non
     *   c'è ancora». È un DEBITO DICHIARATO, non un silenzio.
     */
    const piano = await costruisciPiano({ question, depth });
    pianiDelleRicerche.set(id, piano);
    montaRaccolta({ cartella, id, cache });
    await registra(cartella, id, { kind: 'plan_proposed', branches: piano });
    try { await scriviPianoFn({ cartella, id, piano }); } catch { /* come il giornale: il piano su disco è una prova, non una condizione per lavorare. */ }
    await registra(cartella, id, { kind: 'plan_approved', branches: piano, auto: true });
    const costo = costoDetto(piano);
    avviaESeguiFn({
      sessionId: id, cartella, taskId: 'ricerca',
      /*
       * ⛔⛔⛔ L1 — `ricercaId` VIAGGIA DENTRO IL TASK, e questa è la riga che rende sicuro
       * `research_deposit`. Il kernel costruisce il percorso del rapporto da qui
       * (`.harness-ui-research/<ricercaId>/rapporto.md`), non da un argomento del modello: il
       * modello non vede mai questo valore e non può quindi scegliere DOVE depositare.
       * ⛔ Dentro `task` e non in un parametro nuovo di `avviaESegui` per una ragione precisa:
       *   `task` è persistito nell'intestazione della sessione (`session-registry.mjs`), quindi
       *   sopravvive a un riavvio del server e a un resume. Un parametro in più si sarebbe
       *   perso alla prima ripresa, e il deposito avrebbe smesso di funzionare proprio nel caso
       *   in cui la ricerca è più lunga.
       */
      /*
       * ⭐ L8 — `ricercaDomanda` viaggia accanto a `ricercaId`, e per la stessa ragione: il
       *   kernel deve poter mettere la DOMANDA dentro il record del rapporto
       *   (`record.question`, il campo che il cancello legge come `intestazione`) senza
       *   chiederla al modello, che potrebbe riscriverla. Dentro `task` perché `task` è
       *   persistito nell'intestazione della sessione e sopravvive a un riavvio e a un resume.
       */
      task: { consegna: promptRicerca(question, depth, piano), ricercaId: id, ricercaDomanda: question },
      /*
       * ⭐⭐⭐ L8 — il modello e il reasoning della MADRE. `null` = «non passato», e
       * `avviaESegui` ricade sul default esattamente come prima: l'eredità è additiva, non
       * cambia il comportamento di chi non la usa (TALOS-BANCO, i test, le riprese).
       */
      modelloRichiesta: modello ?? null,
      reasoningRichiesto: reasoning ?? null,
      /*
       * ⛔⛔⛔ L1 §6.3 — `'Research'`, non più `'Read only'` scritto a mano.
       *
       * La riga di prima era giusta nell'intenzione («la ricerca non deve MAI scrivere nel
       * progetto ospite») e sbagliata nella conseguenza, che nessuno aveva visto: una sessione
       * che non può scrivere NON PUÒ CONSEGNARE. L'11/09 la ricerca `d2a453a8` ha speso
       * 484.171 token, aperto 14 pagine, e ha salvato come rapporto la frase con cui si
       * scusava di non poterlo scrivere.
       *
       * `'Research'` nega tutto esattamente come `'Read only'` — tranne il deposito del
       * proprio rapporto, dentro la propria cartella. L'intenzione originale resta intatta;
       * quello che cambia è che adesso esiste una via per consegnare.
       */
      permessiRichiesti: 'Research',
      /*
       * ⭐ §6.6 — la ricerca è FIGLIA della chat che l'ha ordinata. Prima `padreId` era `null`
       * e nell'albero sessione la ricerca non compariva sotto nessuno: all'owner è sembrata
       * «una sessione nuova», e lo era davvero anche nel registro.
       * ⛔ `profonditaDelega` resta 0 (il default): una ricerca non è una delega, e contarla
       *   come tale consumerebbe il tetto di profondità dei sotto-agenti.
       */
      padreId,
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella, id, risultato }),
    });
    /*
     * ⭐ §6.6 — il nome, sulla voce di sessione appena creata. `avviaESegui` non ha un
     * parametro `nome` e non glielo aggiungo da qui: la voce esiste già al ritorno (è creata
     * in modo sincrono, prima del primo `await`), quindi si scrive direttamente.
     * ⛔ DEBITO DICHIARATO, non nascosto: questo nome vive in memoria e non passa da
     *   `registro.rinomina()`, quindi NON sopravvive a un riavvio del server. Il nome che
     *   sopravvive è quello sulla metadata della ricerca (`creaRicercaFn`, campo `nome`), che
     *   è quello che la sezione legge. Chiuderlo del tutto vuole una riga `nome-sessione` nel
     *   registro, cioè toccare `session-registry.mjs` fuori dal perimetro di questo lotto.
     */
    const voceSessione = sessioni.get(id);
    if (voceSessione && !voceSessione.nome) voceSessione.nome = nome;
    return {
      ok: true,
      /*
       * ⭐⭐⭐⭐ L9 §6.8 (+1.5) — IL COSTO SI DICE PRIMA, a chi ha chiesto la ricerca.
       *
       * ⛔ Non è cortesia: una corsa multi-agente costa «about 15× more tokens than chats»
       *   (Anthropic, «How we built our multi-agent research system», letta il 12/09/2026), e
       *   un ordine di grandezza scoperto dopo non è una misura — è un conto. La frase dice
       *   LAVORO (ricerche, pagine, token) e dice denaro **solo** se un prezzo pubblicato è
       *   stato ottenuto; e dice, con la parola, che sono stime.
       */
      esito: `Started the research «${question}» (id ${id}). It runs in the background and keeps going even if the app is closed. ${costo.frase}`,
      id,
      piano,
      costoAtteso: costo.totali,
    };
  }

  function mettiInPausa({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (voce.conclusa) {
      return { ok: false, esito: 'That research is not running: it may already be paused, cancelled or done. Call research_list to see how it stands.' };
    }
    voce._ricercaTerminataRichiesta = 'paused';
    voce.controller.abort();
    /*
     * ⭐ L4 — `run_pause_requested`: l'INTENZIONE, registrata adesso. Il `run_paused` lo scrive
     * `onConclusioneRicerca` quando il punto sicuro è raggiunto. ⛔ Non atteso (`mettiInPausa` è
     * sincrona per contratto col kernel): se la riga non arriva, la pausa resta comunque vera
     * nella metadata — il giornale è la prova, non la condizione.
     */
    registra(voce.cartella, id, { kind: 'run_pause_requested' });
    return { ok: true, esito: 'That research is paused. Everything it collected is kept, and it can be resumed.' };
  }

  function annulla({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (voce.conclusa) {
      // ⭐ una ricerca già ferma (in pausa, o già conclusa) si annulla lo stesso: cambia solo la metadata (terminata:'cancelled'), nessun abort da fare — mai un rifiuto per un caso che mobile stesso permette (research_cancel su una "paused"/"unfinished").
      return aggiornaRicercaFn({ cartella: voce.cartella, id, terminata: 'cancelled' })
        .then(() => registra(voce.cartella, id, { kind: 'run_cancelled' }))
        .then(() => ({ ok: true, esito: 'That research is stopped for good. What it collected is still readable.' }));
    }
    voce._ricercaTerminataRichiesta = 'cancelled';
    voce.controller.abort();
    return { ok: true, esito: 'That research is stopped for good. What it collected is still readable.' };
  }

  /**
   * ⭐⭐⭐ L4 §6.6 — LA RIPRESA VERA, DAL GIORNALE E NON DALLA MEMORIA.
   *
   * ⛔ Cosa faceva prima, e perché era poco: riprendeva la CONVERSAZIONE (`voce.messaggiFinali`)
   *   e rifiutava quando quella mancava — cioè **dopo ogni riavvio del server**, con un messaggio
   *   che diceva «start a new one». Rifarla da capo costa di nuovo tutto: sulla ricerca
   *   dell'11/09 sarebbero stati 484.171 token di ingresso, 9 ricerche e 14 pagine, ripagati per
   *   un processo morto.
   *
   * Adesso ci sono DUE vie, in quest'ordine, e la prima è la migliore quando c'è:
   *
   *   A. **la conversazione è ancora in memoria** ⇒ si riprende quella, com'è sempre stato.
   *      È superiore perché il modello ritrova il proprio contesto esatto, non un riassunto.
   *   B. **la conversazione non c'è più (riavvio), ma il giornale sì** ⇒ si rigioca
   *      `giornale.jsonl` con `talosResearchReplay`, si deducono i passi rimasti in volo con
   *      `talosResearchRecover` («un evento che nessuno è vivo per aggiungere è una bugia nel
   *      giornale»), e si riparte **dal passo dopo l'ultimo committato** con una consegna che
   *      dice al modello dove eravamo e cosa manca.
   *
   * ⛔ Una ricerca il cui giornale è già TERMINALE non si riprende, e non è un dettaglio:
   *   `run.mjs` rifiuta `run_resumed` da uno stato terminale «perché cancellato vuol dire
   *   cancellato, e una ripresa che lo riaprisse spenderebbe denaro su un giro che la persona ha
   *   chiuso». Qui la stessa regola si fa rispettare **prima** di spendere, non dentro il replay.
   *
   * ⛔⛔ E la GUARDIA fra le due vie legge il GIORNALE, non il registro vivo (cura del 12/09,
   *   dettaglio per esteso accanto alla riga): una ricerca in pausa sopravvissuta a un riavvio
   *   torna `conclusa: true` ⇒ `interrotta: false`, e la vecchia guardia la rifiutava con
   *   «still running» — cioè negava la ripresa proprio a chi la pausa l'aveva chiesta.
   *
   * ⛔ Niente `cartella` fra gli argomenti: arriva da `voce.cartella`, che dopo un riavvio
   *   `ripristina()` rimette a posto dall'intestazione della sessione. Un parametro nuovo
   *   avrebbe voluto una riga in `session-registry.mjs` fuori dal perimetro di questo lotto.
   */
  /*
   * ⭐⭐⭐⭐ BC-44 — le due righe che riaprono una corsa, e perché sono DUE.
   *
   * `terminata: null` rimette la ricerca fra le vive: `statoVivo()` legge PRIMA `terminata`, e
   * senza questa riga una ricerca ripresa continuerebbe a mostrarsi `failed` mentre gira davvero
   * — lo schermo direbbe il contrario del disco.
   * ⛔ `motivoErrore: null` insieme, e non dopo: il motivo di una caduta superata è una frase che
   *   non descrive più niente. Se la corsa ricadrà, `onConclusioneRicerca` ne scriverà una nuova.
   * ⛔ Vale per ENTRAMBE le vie (conversazione in memoria e giornale): la via A non ci passava, e
   *   una ripresa dalla memoria dopo un errore transitorio avrebbe lasciato `failed` per sempre.
   */
  async function riapriLaMetadata(cartella, id) {
    try { await aggiornaRicercaFn({ cartella, id, terminata: null, motivoErrore: null }); }
    catch { /* la metadata potrebbe essere stata eliminata mentre riprendevamo: la corsa riparte comunque, ed è il giornale la prova di ciò che è stato fatto. */ }
  }

  async function riprendi({ id, automatica = null }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    const cartella = voce.cartella;
    /* ⛔ `auto` e `causa` solo quando la ripresa è davvero automatica: una riga che dicesse `auto:false` su ogni ripresa a mano sarebbe rumore, e il cancello della ripresa automatica legge proprio `auto === true`. */
    const rigaDiRipresa = automatica ? { kind: 'run_resumed', auto: true, causa: automatica } : { kind: 'run_resumed' };

    /*
     * ⭐⭐⭐⭐ BC-44 — IL CANCELLO NUOVO, e sta PRIMA dei due vecchi perché risponde a una domanda
     * che quelli non sanno nemmeno porsi: «questa corsa è finita, e come?».
     *
     * Il caso vero (ricerca `dec896c0`, 12/09): `terminata:'failed'`, la sessione in memoria c'è
     * ancora ed è `conclusa` ma NON `interrotta` (quel campo lo scrive solo `ripristina()`, cioè
     * solo dopo un riavvio) ⇒ la guardia «né in pausa né interrotta» concludeva **«That research
     * is still running: nothing to resume»**. Falsa due volte: non stava girando, ed era caduta
     * un minuto prima. Da lì il 409 della rotta.
     *
     * ⛔ Si legge il DISCO e non il registro vivo, per la stessa ragione già imparata sulla
     *   pausa: `conclusa` dice «quel GIRO è finito», non «quella RICERCA è finita». La seconda ha
     *   una risposta sola, e sta in `meta.json`.
     * ⛔ Questo cancello AGGIUNGE un permesso, non ne toglie nessuno, ed è scritto in due pezzi
     *   apposta per garantirlo:
     *     · `done`/`cancelled` diventano un NO esplicito. Non è una restrizione nuova: il
     *       giornale li rifiutava già da terminale (`run_finished`/`run_cancelled`) sulla via B.
     *       Quello che cambia è che adesso il no vale anche sulla **via A** — dove non c'era
     *       nessun controllo e una ricerca già consegnata poteva ripartire. Buco preesistente,
     *       chiuso qui perché è la stessa domanda.
     *     · gli altri (`senza-rapporto`, `bloccata-dal-permesso`, `giri-esauriti`) NON si
     *       toccano: restano esattamente com'erano, e la guardia più sotto decide per loro.
     * ⛔ Un `failed` SENZA causa registrata — cioè ogni ricerca caduta prima di oggi — si
     *   comporta come ieri: `motivoErrore` assente ⇒ nessun permesso nuovo.
     */
    const record = await leggiRicercaFn({ cartella, id });
    /* ⛔ La causa REGISTRATA se c'è, altrimenti quella DEDOTTA dal `RunError` che la sessione ha già in `voce.eventi`: senza la seconda, la cura non curerebbe nessuna delle ricerche già cadute — compresa quella che l'ha fatta scrivere. */
    const cadutaRiprendibile = record?.terminata === 'failed' && causaDellaCaduta(record, voce)?.transitorio === true;
    if (record?.terminata === 'done' || record?.terminata === 'cancelled') {
      return { ok: false, esito: `That research is ${record.terminata} and will not be resumed: start a new one if you need more.` };
    }

    if (voce.messaggiFinali) {
      await riapriLaMetadata(cartella, id);
      await registra(cartella, id, rigaDiRipresa);
      avviaESeguiFn({
        sessionId: id, taskId: voce.taskId, cartella, task: voce.task, comandoProva: voce.comandoProva,
        messaggiIniziali: [...voce.messaggiFinali, { role: 'user', content: PROMPT_RIPRESA }],
        forkDa: voce.forkDa, voceEsistente: voce,
        onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella, id, risultato }),
      });
      return { ok: true, esito: 'That research is running again, from where it had stopped.' };
    }

    /*
     * ⛔⛔⛔⭐⭐⭐ 12/09/2026 — IL GIORNALE SI LEGGE **PRIMA** DELLA GUARDIA, e non è un riordino
     * di comodo: è la cura di un difetto che rifiutava esattamente il caso per cui la pausa
     * esiste.
     *
     * Com'era, e cosa faceva. La guardia chiedeva `voce.interrotta`, cioè un campo del registro
     * VIVO, e `ripristina()` lo calcola così: `interrotta: !conclusa`. Una ricerca messa in
     * PAUSA conclude il suo giro (il punto sicuro emette `RunFinished`), quindi dopo un riavvio
     * torna `conclusa: true` ⇒ `interrotta: false` ⇒ questa riga rispondeva
     * **«That research is still running: nothing to resume»**. Falsa due volte: non stava
     * girando — era ferma perché qualcuno l'aveva fermata — e il rifiuto colpiva **l'unico caso
     * che la pausa serve a creare**.
     *
     * ⛔ Perché il registro vivo non può saperlo, per costruzione: `conclusa` dice «quel GIRO è
     *   finito», non «quella RICERCA è finita». Sono due domande diverse, e la seconda ha una
     *   risposta sola sul disco — `run_paused` nel giornale, che un riavvio non cancella. In
     *   produzione il difetto era **mascherato**: dopo un riavvio `messaggiFinali` viene
     *   ripristinato dal JSONL e la via A prende il comando; si vede solo quando quella manca,
     *   cioè quando il processo è morto prima di persistere la conversazione — che è, di nuovo,
     *   proprio il caso disperato.
     *
     * ⇒ Adesso lo stato lo dice il GIORNALE. Tre risposte, in quest'ordine, e ognuna per una
     *   ragione sua:
     *     1. giornale TERMINALE (`done`/`cancelled`/`failed`) → mai: «cancellato vuol dire
     *        cancellato» (`run.mjs`), e riaprirlo spenderebbe denaro su un giro chiuso;
     *     2. né in pausa secondo il giornale, né interrotta secondo il registro → sta davvero
     *        girando, e non c'è niente da riprendere. ⛔ La seconda metà della condizione RESTA,
     *        e deve: un processo morto a metà giro non lascia nessun evento («un evento che
     *        nessuno è vivo per aggiungere è una bugia nel giornale»), quindi lì l'unico a
     *        saperlo è il registro. Le due fonti non si sostituiscono, si sommano;
     *     3. nessun giornale → la verità di prima, e nessun `run_started` inventato adesso.
     *
     * ⛔ `pause_requested` conta come «in pausa» quanto `paused`: se il processo è morto fra la
     *   richiesta e il punto sicuro, la persona aveva comunque premuto Pausa — e rifiutarle la
     *   ripresa perché il giro non ha fatto in tempo a scrivere la seconda riga sarebbe punirla
     *   per un crash.
     */
    const { eventi, righeSaltate } = await leggiGiornaleFn({ cartella, id });
    const giro = talosResearchReplay(eventi);
    const inPausa = Boolean(giro) && (giro.status === 'paused' || giro.status === 'pause_requested');
    if (giro && talosResearchIsTerminal(giro.status)) {
      return { ok: false, esito: `That research is ${giro.status} and will not be resumed: start a new one if you need more.` };
    }
    /*
     * ⭐⭐⭐⭐ BC-44 — la TERZA fonte, e si SOMMA alle due, non le sostituisce.
     *   · il giornale sa che era in pausa;
     *   · il registro vivo sa che il processo è morto a metà giro (nessun evento da scrivere);
     *   · la METADATA sa che la corsa è finita con un guasto, e con quale — è l'unica delle tre
     *     che poteva rispondere per la ricerca `dec896c0`, dove il giro era finito in modo
     *     ordinato (RunError ⇒ `conclusa:true`) e nessuna delle altre due vedeva niente.
     */
    if (!inPausa && !voce.interrotta && !cadutaRiprendibile) return { ok: false, esito: 'That research is still running: nothing to resume.' };

    // Via B — dal giornale. Da qui in poi la conversazione non esiste più: esiste il registro.
    if (!giro) {
      /*
       * ⛔ Nessun giornale (una ricerca nata prima dell'11/09) o un giornale che non comincia con
       *   `run_started`: non c'è niente da cui ripartire, e si dice la verità di prima. ⛔ Non si
       *   inventa un `run_started` adesso per «sistemare» il file: sarebbe scrivere nel registro
       *   un fatto che nessuno ha osservato.
       */
      return { ok: false, esito: 'That research was interrupted by a server restart and has no journal to resume from: start a new one.' };
    }
    const recuperato = talosResearchRecover(giro, clock().toISOString());
    const prossimo = talosResearchNextStep(recuperato);
    const rimasti = talosResearchWorkLeft(recuperato);
    const speso = talosResearchSpent(recuperato);
    const fonti = await elencaFontiFn({ cartella, id });
    const ripristinateDallaCache = await ripristinaCacheFetch({ cartella, id });

    await riapriLaMetadata(cartella, id);
    await registra(cartella, id, rigaDiRipresa);
    if (prossimo) {
      /*
       * ⛔ Il passo che era IN VOLO quando il processo è morto viene ri-annunciato come iniziato:
       *   `talosResearchApply` su `step_started` di un passo già `done` non fa niente («già
       *   pagato: ricominciarlo è l'errore che tutto questo file esiste per rendere
       *   impossibile»), quindi questa riga non può far ripagare un passo concluso.
       */
      await registra(cartella, id, { kind: 'step_started', stepId: prossimo.id, branchId: prossimo.branchId, stepKind: prossimo.kind });
    }
    avviaESeguiFn({
      sessionId: id, taskId: voce.taskId, cartella, task: voce.task, comandoProva: voce.comandoProva,
      messaggiIniziali: [{ role: 'user', content: consegnaDiRipresa({ giro: recuperato, prossimo, rimasti, speso, fonti, task: voce.task }) }],
      forkDa: voce.forkDa, voceEsistente: voce,
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella, id, risultato }),
    });
    return {
      ok: true,
      esito: `That research is running again from its journal (${eventi.length} recorded events${righeSaltate ? `, ${righeSaltate} unreadable lines skipped` : ''}${ripristinateDallaCache ? `, ${ripristinateDallaCache} cached pages restored` : ''}). It restarts from the step after the last committed one.`,
    };
  }

  async function rinomina({ cartella, id, title }) {
    const aggiornata = await aggiornaRicercaFn({ cartella, id, titolo: title });
    if (!aggiornata) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    // ⭐ L4 — `run_renamed` è uno degli undici eventi: un giro rigiocato deve riprendere anche il suo nome, non solo il suo stato.
    await registra(cartella, id, { kind: 'run_renamed', title: title ?? null });
    return {
      ok: true,
      esito: title === null ? 'That research shows its question again.' : `Renamed that research to «${title}».`,
    };
  }

  async function elimina({ cartella, id }) {
    const record = await leggiRicercaFn({ cartella, id });
    if (!record) return { ok: true, esito: 'There was no research with that id — nothing to delete.' };
    if (record.reportLibraryId && eliminaVoceLibreriaFn) {
      try { await eliminaVoceLibreriaFn({ cartella, id: record.reportLibraryId }); } catch { /* il rapporto potrebbe già essere sparito dalla Libreria per un'altra via (library_delete diretto) — non blocca l'eliminazione della ricerca. */ }
    }
    await eliminaRicercaFn({ cartella, id });
    return { ok: true, esito: 'That research and its report have been deleted.' };
  }

  /**
   * ⭐⭐⭐⭐ L5 §6.8 «+1.1» — «DICE ANCORA QUESTO?»
   *
   * La domanda non è «il link risponde»: un soft 404 e una pagina riscritta in silenzio
   * rispondono **200**. La domanda è *quello che abbiamo letto è ancora lì*, e si può porre solo
   * perché il record del rapporto tiene il **passaggio** citato, non solo l'URL.
   *
   * Tre cancelli prima di spendere una sola richiesta HTTP, e ognuno risponde una cosa diversa:
   *   1. la ricerca non esiste                  → `{trovata:false}`  (la rotta fa 404)
   *   2. non c'è un record verificabile         → `{ok:false, motivo}` (409, e il motivo lo dice)
   *   3. non c'è niente di misurabile           → `{ok:false, motivo}` (409)
   *
   * ⛔ Il caso (2) comprende le ricerche VECCHIE, quelle passate col ripiego in prosa: hanno un
   *   rapporto vero e pagato, ma non hanno i passaggi, quindi non c'è niente da ri-trovare. Dire
   *   «ricontrollate, tutto a posto» su quelle sarebbe la bugia più facile di tutta la funzione.
   * ⛔ Nessun evento nel giornale. Il giornale è la prova di ciò che la CORSA ha speso
   *   (`run.mjs` conosce undici `kind` e li elenca nel suo typedef): una ri-verifica fatta
   *   settimane dopo non è un passo di quella corsa, e infilarcela dentro cambierebbe il
   *   significato del file — oltre a scrivere un dodicesimo `kind` in un modulo che non è mio.
   *   ⇒ l'esito NON è persistito, e §6.7 («l'esito dell'ultima ri-verifica, con la data») resta
   *   aperto: va un magazzino suo, dichiarato nel rapporto di questo lotto.
   *
   * @returns {Promise<{trovata:false}|{trovata:true, ok:false, motivo:string}|{trovata:true, ok:true, riverifica:object}>}
   */
  async function riverifica({ cartella, id }) {
    const record = await leggiRicercaFn({ cartella, id });
    if (!record) return { trovata: false };

    const giudizio = await giudicaRapporto({ cartella, record });
    const recintato = giudizio.letto?.record ?? null;
    if (!recintato) {
      const coda = giudizio.letto?.ripiego
        ? 'il suo rapporto è in forma vecchia, senza il record verificabile: non porta i passaggi citati, e senza quelli non c\'è niente da ri-trovare'
        : (giudizio.motivoDettaglio ?? 'non c\'è nessun file di rapporto');
      return { trovata: true, ok: false, motivo: `questa ricerca non si può ricontrollare: ${coda}` };
    }
    if (typeof leggiPaginaFn !== 'function') {
      return { trovata: true, ok: false, motivo: 'la lettura delle pagine non è disponibile su questo TALOS: senza di quella non si può andare a vedere se le fonti dicono ancora questo' };
    }

    /*
     * ⛔⛔ IL TESTO TENUTO, e perché oggi la mappa esce VUOTA (vedi la testa del file). Le fonti
     *   su disco si contano — `testiTenuti` è un numero vero e va nella risposta — ma non si
     *   possono attribuire a un url: `fonti/<sha256>.txt` prende il nome dal proprio contenuto.
     *   Il giorno in cui il collettore scriverà un indice url→ref, questa è l'unica riga da
     *   cambiare, e il resto della funzione comincerà a dire `intatta`/`cambiata` da solo.
     */
    const refs = await elencaFontiFn({ cartella, id });
    const testoTenutoPerUrl = new Map();

    const passaggiCitati = recintato.claims.filter((c) => typeof c?.passage === 'string' && c.passage.trim().length > 0).length;
    if (passaggiCitati === 0 && testoTenutoPerUrl.size === 0) {
      return {
        trovata: true,
        ok: false,
        motivo: 'non c\'è ancora niente da ricontrollare: il rapporto non porta nessun passaggio citato e il testo delle fonti non è stato tenuto',
      };
    }

    const fontiDaGuardare = recintato.sources.slice(0, TETTO_FONTI_RIVERIFICA);
    const deps = {
      /*
       * ⛔ `read` torna `null` quando la pagina non si è potuta LEGGERE, ed è una risposta
       *   diversa da un lancio: `recheck.mjs` le tratta uguali («unreachable») ma il motivo che
       *   riportiamo cambia. Uno stato ≥ 400 e un corpo vuoto sono entrambi «non l'ho vista»:
       *   confrontare il nulla con il testo tenuto direbbe «cambiata» su una pagina che magari
       *   è intatta e ha solo rifiutato questa richiesta.
       */
      read: async (indirizzo) => {
        const pagina = await leggiPaginaFn(indirizzo);
        const corpo = typeof pagina?.corpo === 'string' ? pagina.corpo : '';
        if (!pagina || Number(pagina.stato) >= 400 || corpo.trim().length === 0) return null;
        return { text: corpo };
      },
      at: () => clock().toISOString(),
    };
    const esito = await talosResearchRecheckReport(deps, { ...recintato, sources: fontiDaGuardare }, testoTenutoPerUrl);

    const fonti = esito.sources.map((f) => {
      const tenuto = testoTenutoPerUrl.has(f.url);
      const stato = f.state === 'unreachable'
        ? 'irraggiungibile'
        : (tenuto ? (f.state === 'intact' ? 'intatta' : 'cambiata') : 'non-misurabile');
      return {
        url: f.url,
        titolo: f.title,
        stato,
        // ⛔ `null`, mai `1`, quando non c'era testo da confrontare: uno e «non misurato» non sono lo stesso numero.
        sopravvissuto: tenuto && f.state !== 'unreachable' ? f.survived : null,
        motivoLettura: f.reason ? String(f.reason).slice(0, 200) : null,
        passaggiRitrovati: f.passagesStanding,
        passaggiPersi: f.passagesLost,
      };
    });
    /*
     * ⛔ `talosResearchRecheckStanding` NON è il lettore giusto oggi, e va detto invece di
     *   lasciarlo credere: conta gli stati del modulo, dove ogni fonte senza testo tenuto è
     *   `intact` — cioè conterebbe come «intatte» proprio quelle che non abbiamo potuto
     *   misurare. Il bilancio qui si fa sugli stati NORMALIZZATI, che sono quelli pubblicati.
     */
    const conta = (valore) => fonti.filter((f) => f.stato === valore).length;
    return {
      trovata: true,
      ok: true,
      riverifica: {
        id,
        fattaAlle: esito.at,
        misurabile: testoTenutoPerUrl.size > 0,
        avvertenza: testoTenutoPerUrl.size > 0
          ? null
          : 'Il testo delle pagine non era stato tenuto per questa ricerca: «intatta» o «cambiata» non si possono dire. Ciò che si misura è se i passaggi citati sono ancora nella pagina di oggi.',
        fonti,
        bilancio: {
          fonti: fonti.length,
          intatte: conta('intatta'),
          cambiate: conta('cambiata'),
          irraggiungibili: conta('irraggiungibile'),
          nonMisurabili: conta('non-misurabile'),
          passaggiCitati,
          passaggiRitrovati: fonti.reduce((t, f) => t + f.passaggiRitrovati, 0),
          passaggiPersi: fonti.reduce((t, f) => t + f.passaggiPersi, 0),
        },
        troncata: recintato.sources.length > fontiDaGuardare.length,
        fontiTotali: recintato.sources.length,
        testiTenuti: refs.length,
      },
    };
  }

  /**
   * ⭐⭐⭐ L2 §6.4 (contratto) — LA VOCE CHE LA SEZIONE LEGGE, campo per campo.
   *
   * Prima d'oggi erano QUATTRO campi (`id`, `titolo`, `stato`, `avviataAlle`) e la sezione non
   * poteva fare altro che scrivere a mano, sotto l'elenco: «La consultazione del rapporto e
   * delle fonti non è ancora disponibile qui» (`public/index.html:1011`). Non era pigrizia del
   * frontend: `reportLibraryId` non usciva da questa funzione, quindi la sezione non aveva
   * letteralmente il modo di sapere dove fosse il rapporto.
   *
   *   id                 — l'id della ricerca (= il sessionId che la esegue).
   *   domanda / question — la domanda originale. Due nomi lo STESSO valore: `question` è il
   *                        nome del contratto verso il frontend, `domanda` quello interno già
   *                        in uso. Meglio un alias esplicito che una traduzione muta a metà
   *                        strada, dove si perde.
   *   titolo             — l'etichetta scelta con `research_rename`, o la domanda. Resta:
   *                        `formattaListaRicerche` (kernel) la legge per nome.
   *   nome               — la domanda troncata a 80 caratteri, l'etichetta umana della riga.
   *   stato              — running|paused|done|cancelled|failed|senza-rapporto|
   *                        bloccata-dal-permesso|giri-esauriti.
   *   avviataAlle        — ISO.
   *   conclusaAlle       — ISO, `null` se sta ancora girando (o se è una voce nata prima che
   *                        questo campo esistesse: `null` onesto, mai una data inventata).
   *   reportLibraryId    — `null` se non c'è un rapporto in Libreria.
   *   motivo             — la frase umana, SOLO quando lo stato non è `done`.
   *   padreId            — la sessione che l'ha ordinata, `null` per le vecchie.
   *   ultimoMessaggio    — l'ultima frase del modello. ALLEGATO, mai il rapporto.
   *
   * ⛔⛔ LA COMPATIBILITÀ ALL'INDIETRO, §6.5 — una ricerca già su disco può avere
   *   `terminata:'done'` e un `reportLibraryId` che punta a una scusa: quelle di prima di oggi
   *   sono TUTTE così. Il loro stato si corregge al volo in `leggi()`, rileggendo il rapporto,
   *   e il file su disco NON si riscrive mai. Ciò che è costato denaro non si sovrascrive —
   *   lezione già pagata in questo repo (il rilancio che cancellava $2,64 di lavoro).
   *   ⇒ `elenca()` non rilegge (sono fino a 20 righe: 20 letture di file per disegnare una
   *   lista sarebbero un costo per ogni apertura della sezione); `leggi()` sì, sulla singola.
   *   È una divergenza VOLUTA fra le due viste, e sta scritta qui perché si veda.
   */
  function voceEsposta(r, stato, letto = null) {
    const domanda = r.domanda ?? null;
    /* ⭐ BC-44 — la causa registrata, o quella dedotta dagli eventi della sessione (vedi `causaDellaCaduta`). */
    const caduta = stato === 'failed' ? causaDellaCaduta(r, sessioni.get(r.id)) : null;
    return {
      id: r.id,
      domanda,
      question: domanda,
      titolo: r.titolo || domanda,
      nome: r.nome || nomeDallaDomanda(domanda),
      stato,
      avviataAlle: r.avviataAlle ?? null,
      conclusaAlle: r.conclusaAlle ?? null,
      reportLibraryId: r.reportLibraryId ?? null,
      motivo: stato === 'done' ? null : motivoDelloStato(stato, r.motivoDettaglio ?? null, caduta),
      padreId: r.padreId ?? null,
      ultimoMessaggio: r.ultimoMessaggio ?? null,
      /*
       * ⭐⭐⭐ L4 — I DUE CAMPI NUOVI, e sono ADDITIVI: nessuno dei dodici di L2 cambia nome,
       * tipo o significato. Il test `CONTRATTO §6.4` asserisce le chiavi con `deepEqual`
       * proprio perché una crescita si veda invece di scivolare dentro in silenzio.
       *
       * `bilancio`      — sostenute / in parte / non sostenute / contese / non verificate.
       *                   `null` quando il record recintato non c'è: ⛔ `null` e «tutto a zero»
       *                   NON sono la stessa cosa, e mostrare zeri su una ricerca che non è mai
       *                   stata misurata sarebbe un verdetto inventato. È la riga con cui §6.7
       *                   vuole che la scheda guidi — mai col conteggio delle fonti.
       * `proveDistinte` — su quante fonti diverse poggia almeno un passaggio davvero ritrovato.
       */
      bilancio: letto?.bilancio ?? null,
      proveDistinte: letto?.proveDistinte ?? 0,
      /*
       * ⭐⭐⭐ L8 (12/09/2026) — CON CHE COSA È STATA FATTA. Tredicesimo campo, additivo.
       *
       * `null` per ogni ricerca nata prima di oggi — e `null` è la risposta giusta: quelle
       * corse un modello ce l'hanno avuto, ma nessuno l'ha registrato, e scrivere qui quello
       * di oggi sarebbe attribuire a ieri una scelta di adesso. Il campo esiste perché il
       * 12/09 una ricerca è girata su un modello diverso da quello della chat che l'aveva
       * ordinata e dalla sezione non si poteva vedere: due ricerche fatte con due modelli
       * diversi non sono confrontabili, e la riga deve dirlo.
       */
      modello: r.modello ?? null,
      /*
       * ⭐⭐⭐⭐ L9 (12/09/2026) — SEDICESIMO CAMPO: `modelloGiudice`. Additivo come gli altri tre.
       *
       * ⛔ Perché una riga in elenco deve dirlo, e non basta il `giudice` che esce da `leggi()`:
       *   sono due fatti DIVERSI. `giudice` (nel record del rapporto) è chi ha giudicato DAVVERO
       *   quella corsa; questo è chi era stato SCELTO alla partenza. Coincidono quando tutto va
       *   bene, e quando divergono è esattamente il caso che si vuole vedere — un giudice
       *   designato che non ha mai risposto lascia `giudice: null` e affermazioni non
       *   verificate, e senza questo campo la sezione non potrebbe distinguerlo da «non c'era
       *   nessun altro modello».
       * ⛔ `null` per ogni ricerca nata prima di oggi, e `null` è la risposta giusta: quelle
       *   corse non hanno mai avuto un giudice designato, e attribuirgliene uno adesso sarebbe
       *   raccontare una scelta che nessuno ha fatto.
       */
      modelloGiudice: r.modelloGiudice ?? null,
      /*
       * ⭐⭐⭐⭐ BC-44 (12/09/2026) — DICIASSETTESIMO e DICIOTTESIMO campo, additivi come tutti gli
       * altri: nessuno dei sedici cambia nome, tipo o significato.
       *
       * `riprendibile`  — «se premo Riprendi adesso, il server accetta?». È una domanda sola, e
       *                   la risposta la dà QUI il server, non il frontend indovinandola dallo
       *                   stato: fino a ieri la sezione offriva «Riprendi» su OGNI `failed` e il
       *                   server rispondeva 409 con «non è nello stato giusto» — un pulsante che
       *                   promette ciò che nessuna rotta può mantenere.
       * `motivoErrore`  — `{classe, transitorio}`, o `null`. ⛔ Il `messaggio` grezzo del
       *                   fornitore e il suo `codice` restano sul DISCO (`meta.json`) e NON
       *                   escono di qui: sono diagnosi, e a schermo sarebbero nomi tecnici. La
       *                   frase per una persona è già in `motivo`, composta in un posto solo.
       *
       * ⛔ I DUE `failed` NON SONO LO STESSO STATO, e la distinzione è tutta in `r.terminata`:
       *     · `terminata` assente e stato `failed` ⇒ è `statoVivo` che l'ha DEDOTTO da una
       *       sessione che non c'è più (riavvio del server). Quella si riprende dal giornale, e
       *       si riprendeva già prima di BC-44 (L4 §6.6, via B);
       *     · `terminata === 'failed'` ⇒ la corsa è finita davvero, e allora decide la causa.
       *   Confondere i due avrebbe tolto la ripresa proprio al caso per cui il giornale esiste.
       * ⛔ `bloccata-dal-permesso` e `giri-esauriti` NON sono qui dentro: il giornale li tiene
       *   riprendibili apposta (vedi la nota sui tre rami di guasto in `onConclusioneRicerca`),
       *   ma `riprendi()` oggi non li accetta e aprirli è una riga a parte, con la sua verifica.
       *   Dichiarato, non dimenticato.
       */
      riprendibile: stato === 'paused'
        || (stato === 'failed' && (r.terminata !== 'failed' || caduta?.transitorio === true)),
      motivoErrore: caduta
        ? { classe: caduta.classe ?? 'ignoto', transitorio: caduta.transitorio === true }
        : null,
    };
  }

  /**
   * ⛔⛔⛔ L4 — L'ELENCO ADESSO RILEGGE, e questa è una correzione a una scelta di L2.
   *
   * Il difetto, visto dall'owner: la ricerca `d2a453a8` compariva **«Conclusa» in lista** e
   * **«bloccata dal permesso» quando la si apriva**. L2 aveva chiamato quella divergenza
   * «voluta» — venti letture di file per disegnare una lista sembravano un costo per niente. Il
   * costo era vero; la conclusione no: **una lista che mente costa di più**, e il costo si paga
   * una volta sola grazie alla cache su `mtime`+`size` (vedi `giudiziRapporto`).
   *
   * ⛔ Rilegge SOLO le voci che si dichiarano `done`: sono le uniche che possono mentire. Una
   *   `running`, una `failed` o una `cancelled` non hanno un rapporto da smentire, e leggerle
   *   sarebbe costo puro.
   * ⛔ E il file su disco **non si riscrive**, nemmeno adesso che la bugia si vede in due posti:
   *   la correzione vive nella lettura.
   */
  async function elenca({ cartella, status, page_size: pageSize, offset }) {
    const record = await elencaRicercheFn({ cartella });
    const conStato = [];
    for (const r of record) {
      const stato = statoVivo(r, sessioni.get(r.id));
      // ⛔ Gli stessi DUE stati di `leggi()`: sono i soli che parlano del rapporto, e sono i soli
      //   che possono mentire. Una `running`/`failed`/`cancelled` non ha un rapporto da smentire.
      if (stato !== 'done' && stato !== 'senza-rapporto') { conStato.push(voceEsposta(r, stato)); continue; }
      const giudizio = await giudicaRapporto({ cartella, record: r });
      conStato.push(voceEsposta({ ...r, motivoDettaglio: giudizio.motivoDettaglio ?? r.motivoDettaglio ?? null }, giudizio.stato, giudizio.letto));
    }
    const filtrate = !status || status === 'all' ? conStato : conStato.filter((r) => r.stato === status);
    const dimensionePagina = clampNumero(pageSize, 1, 20, 10);
    const salto = clampNumero(offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const pagina = filtrate.slice(salto, salto + dimensionePagina);
    return { ricerche: pagina, totale: filtrate.length };
  }

  async function leggi({ cartella, id }) {
    const record = await leggiRicercaFn({ cartella, id });
    if (!record) return { trovata: false };
    let stato = statoVivo(record, sessioni.get(id));
    let contenutoRapporto = null;
    let contenutoRespinto = null;
    let motivoDettaglio = record.motivoDettaglio ?? null;
    let letto = null;
    /*
     * ⛔ DUE stati, non uno: `done` e `senza-rapporto` sono i due esiti che PARLANO del rapporto,
     *   e vanno riletti entrambi. Guardare solo `done` (come faceva L2) lasciava fuori proprio il
     *   caso in cui l'owner ha più bisogno di vedere: una ricerca che ha depositato qualcosa che
     *   il cancello respinge. La rilettura può anche PROMUOVERE: se nel frattempo è stato
     *   depositato un rapporto valido, `senza-rapporto` torna `done` — sempre nel lettore, mai
     *   riscrivendo il file.
     */
    if (stato === 'done' || stato === 'senza-rapporto') {
      /*
       * ⛔⛔⛔ §6.5, LA COMPATIBILITÀ ALL'INDIETRO — CALCOLATA AL VOLO, SENZA RISCRIVERE.
       *
       * Ogni ricerca fatta prima dell'11/09 ha `terminata:'done'` e un `reportLibraryId` che
       * può puntare a qualunque cosa: sulla `d2a453a8` punta a 290 byte di scusa. Il giudizio
       * lo dà `giudicaRapporto`, la STESSA funzione che usa `elenca()` — mai due lettori dello
       * stesso file, perché due lettori sono due verità e a schermo si contraddicono.
       *
       * ⛔ Il file su disco non si tocca. Mai riscrivere in silenzio un record già pagato: la
       *   correzione vive nella LETTURA, come per «TRE RIPETIZIONI PAGATE, UNA USATA» (22/8),
       *   dove la cura stava nel lettore e non nelle righe.
       */
      const giudizio = await giudicaRapporto({ cartella, record });
      stato = giudizio.stato;
      motivoDettaglio = giudizio.motivoDettaglio ?? motivoDettaglio;
      contenutoRapporto = giudizio.contenutoRapporto;
      contenutoRespinto = giudizio.contenutoRespinto ?? null;
      letto = giudizio.letto;
    }
    /*
     * ⭐⭐⭐ L4 — IL GIORNALE ESPOSTO: `piano`, `passi`, `spesa`, `giornale`.
     *
     * ⛔ Tutti e quattro ADDITIVI e tutti e quattro DERIVATI: `piano` e `passi` escono dal
     *   replay degli eventi veri, non da un campo salvato che potrebbe divergere. Un giro senza
     *   giornale (una ricerca vecchia) dà `piano: []`, `passi: []` e `giornale: null` — e
     *   `null` sul giornale è la differenza fra «non ne ha uno» e «ne ha uno vuoto».
     * ⛔ `righeSaltate` esce allo scoperto: se una riga del registro è illeggibile, la sezione
     *   deve poterlo dire. «Si è caricato» e «si è caricato per intero» non sono la stessa frase.
     */
    const { eventi, righeSaltate } = await leggiGiornaleFn({ cartella, id });
    const giro = talosResearchReplay(eventi);
    const pianoSuDisco = await leggiPianoFn({ cartella, id });
    return {
      trovata: true,
      ...voceEsposta({ ...record, motivoDettaglio }, stato, letto),
      contenutoRapporto,
      /*
       * ⛔ Il testo che il cancello ha RESPINTO, in un campo che dice di esserlo. La sezione può
       *   mostrarlo come «ciò che la ricerca ha depositato, e che non passa il controllo»: si
       *   vede tutto il lavoro pagato, e nessuno lo scambia per un rapporto.
       */
      contenutoRespinto,
      /*
       * ⭐⭐⭐⭐ L5 §6.7 — LE AFFERMAZIONI E LE FONTI, STRUTTURATE.
       *
       * Fino a ieri di qui usciva `contenutoRapporto`: il markdown intero, col record recintato
       * dentro un blocco ```talos-research-report. La sezione avrebbe dovuto **ri-parsare** quel
       * blocco nel browser per disegnare le due viste che §6.7 chiede (Affermazioni e Fonti) —
       * cioè scrivere un secondo lettore del record, in un altro linguaggio, che diverge dal
       * primo alla prima modifica del formato. Il lettore è UNO, sta in `report.mjs`, e gira
       * qui: alla sezione arriva il risultato.
       *
       * ⛔ `null` — MAI `[]` — quando il record non c'è (ricerca vecchia, o rapporto respinto):
       *   una lista vuota si disegna come «nessuna affermazione», che è un fatto; `null` è «non
       *   lo sappiamo», che è la verità. Sono le stesse due parole che `bilancio` distingue.
       * ⛔ `verdettoUmano` esce da `talosResearchSupportLabel`, cioè dalla STESSA funzione che
       *   scrive la prosa del rapporto: due frasari per lo stesso verdetto sono due verdetti.
       * ⛔ `contrarie` (CONTESA-01) è `null` quando `opposing` è assente, e `[]` quando è stato
       *   guardato e non si è trovato niente: «non guardato» e «guardato, nessuna» si leggono
       *   uguali solo se non importa sbagliare.
       * ⛔ Costo per il MODELLO: zero. `formattaLetturaRicerca` (kernel) legge solo `trovata`,
       *   `contenutoRapporto` e `stato` — questi campi non entrano mai in un prompt.
       */
      affermazioni: letto?.record
        ? letto.record.claims.map((c, i) => ({
          numero: i + 1,
          testo: c?.text ?? '',
          fonte: c?.sourceIndex ?? null,
          passaggio: typeof c?.passage === 'string' ? c.passage : '',
          ritrovato: c?.checks?.quotePresent === true,
          tratto: c?.checks?.quoteSpan ?? null,
          verdetto: c?.checks?.claimSupported ?? 'unchecked',
          verdettoUmano: talosResearchSupportLabel(c?.checks ?? {}),
          motivoVerdetto: c?.checks?.supportReason ?? null,
          giudice: c?.checks?.judge ?? null,
          giudicataAlle: c?.checks?.judgedAt ?? null,
          contrarie: Array.isArray(c?.checks?.opposing) ? c.checks.opposing : null,
        }))
        : null,
      fonti: letto?.record
        ? letto.record.sources.map((f, i) => ({
          numero: i + 1,
          url: f?.url ?? '',
          titolo: f?.title ?? '',
          pubblicataAlle: f?.publishedAt ?? null,
          // 'page' = la pagina è stata aperta e letta; 'snippet' = se n'è visto solo l'estratto della ricerca.
          ottenuta: f?.obtained ?? null,
        }))
        : null,
      sintesi: letto?.record?.summary ?? null,
      /* ⛔ Chi era disponibile a giudicare la CORSA — un fatto suo, mai dedotto dalle affermazioni (`report.mjs` lo spiega: dedurlo mente su una corsa con un giudice buono e citazioni tutte fallite). */
      giudice: letto?.record?.judge ?? null,
      piano: Array.isArray(pianoSuDisco) ? pianoSuDisco : (giro?.plan ?? []),
      passi: giro?.steps ?? [],
      spesa: giro ? talosResearchSpent(giro) : null,
      /*
       * ⭐⭐⭐⭐ L9 §6.8 (+1.5) — LO STIMATO, ACCANTO ALLO SPESO.
       *
       * ⛔ `null` — mai zeri — quando non c'è un piano: una ricerca vecchia non ha mai avuto
       *   una stima, e «0 ricerche attese» direbbe che era gratis. Il divario fra questi due
       *   numeri È una misura («il divario stimato/speso è esso stesso una misura», §6.8), e
       *   una misura fatta contro uno zero inventato non misura niente.
       * ⛔ Si ricalcola dal piano invece di salvarlo: il piano su disco è il fatto, la somma è
       *   aritmetica su di lui — un totale salvato a parte è un secondo numero che può
       *   divergere dal primo.
       */
      costoAtteso: Array.isArray(pianoSuDisco) && pianoSuDisco.length > 0
        ? talosResearchPlanTotals(pianoSuDisco)
        : (giro?.plan?.length ? talosResearchPlanTotals(giro.plan) : null),
      giornale: giro ? { eventi: eventi.length, righeSaltate, stato: giro.status } : null,
    };
  }

  /*
   * ⭐⭐⭐⭐ L9 — DUE METODI NUOVI, e nessuno dei nove di prima cambia.
   *
   * `componiRapporto`      — quello che il kernel chiama da `research_deposit`: compone il
   *                          record E lo verifica, prima che il file esista. Sostituisce
   *                          l'uso diretto della funzione pura `componiRapportoRicerca`, che
   *                          resta esportata e invariata per chi non ha una ricerca intorno
   *                          (il banco, i test del kernel).
   * `raccoltaDellaRicerca` — la porta `cacheWeb` di quella corsa, o `null`. `session-registry`
   *                          la chiede per la sessione che sta per partire e la passa al
   *                          kernel; per ogni altra sessione è `null`, cioè il kernel di ieri.
   */
  return Object.freeze({
    avvia, mettiInPausa, annulla, riprendi, rinomina, elimina, elenca, leggi, riverifica,
    componiRapporto, raccoltaDellaRicerca,
  });
}
