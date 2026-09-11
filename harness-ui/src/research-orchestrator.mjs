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
  accodaEvento, elencaFonti, leggiGiornale, leggiIstantaneaCache, leggiPiano, leggiRapporto,
  rileggiRapportoMinimo, scriviIstantaneaCache, statRapporto,
} from './research-store.mjs';
import { talosResearchFetchCache } from './research/fetch-cache.mjs';
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
import { talosResearchParseReport, talosResearchSupportLabel } from './research/report.mjs';
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
import { talosResearchVerifiedStanding } from './research/verification.mjs';

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

function promptRicerca(question, depth) {
  const guida = depth === 'quick'
    ? 'Keep this brief: a couple of searches are enough — do not over-investigate.'
    : depth === 'exhaustive'
      ? 'Be exhaustive: search from many different angles, cross-check the claims that matter, and go deep before writing.'
      : 'Do a thorough pass: search from a few different angles before writing the report.';
  return [
    `Research this question thoroughly using web_search and naviga: "${question}"`,
    guida,
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
    'When you are done investigating, call the tool `research_deposit` with the complete report in `testo`: a Markdown document with a "# " title, your findings as prose, and a "## Sources" section listing the full http(s) URLs you actually opened.',
    /*
     * ⭐⭐⭐ L4 — LA CONSEGNA CHIEDE IL RECORD, perché il cancello adesso lo pretende.
     *
     * ⛔ Se il cancello chiede una forma e la consegna non la dichiara, il cancello è una
     *   trappola, non una difesa — è scritto così in L2 e vale ancora. Quindi qui c'è la forma
     *   ESATTA, campo per campo, con un esempio che si può copiare.
     *
     * ⛔⛔ E `claimSupported` è `"unchecked"`, `judge` è `null`, **per ordine**: il record porta
     *   verdetti solo quando a darli è stato un giudice INDIPENDENTE (`report.mjs`: «Verifica
     *   eseguita da: … — mai dal modello che ha scritto il rapporto»). Un modello che si
     *   timbra da solo «sostenuta dalla fonte» produrrebbe esattamente il segno di verifica
     *   falso che tutto questo disegno esiste per togliere. Il bilancio dirà «N non
     *   verificate», che è la verità di oggi; i verdetti veri arrivano con la ri-verifica.
     */
    'The document MUST end with a machine-readable record, fenced exactly like this, on its own lines: ```talos-research-report then one line of JSON then ```.',
    'That JSON is: {"version":1,"question":"<the question>","summary":"<2-4 sentences>","judge":null,"claims":[{"text":"<one claim>","sourceIndex":1,"passage":"<the exact sentence you read in that source, copied verbatim, or \\"\\" if you could not find it>","checks":{"claimSupported":"unchecked"}}],"sources":[{"url":"<full http(s) url>","title":"<page title>","publishedAt":null,"obtained":"page"}]}.',
    '`sourceIndex` is 1-based into `sources`. Use "obtained":"snippet" when you only saw a search-result snippet instead of the page. Never invent a passage: an empty string is the honest answer, and it is counted as such.',
    'Do NOT set `judge` or change `claimSupported`: you are not allowed to mark your own claims as verified — an independent check happens later.',
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
  if (fonti.length > 0) righe.push(`${fonti.length} source page(s) were already fetched and kept on disk; their text is available without paying for them again.`);
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
function motivoDelloStato(stato, dettaglio = null) {
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
    const comune = { conclusaAlle: clock().toISOString(), ultimoMessaggio };
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
          reportLibraryId = await salvaVoceLibreriaFn({ cartella, nome: nomeRapporto(letto.intestazione || domanda), mediaType: 'text/markdown', origine: 'generated', testo: testoRapporto });
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
    await aggiornaRicercaFn({ cartella, id, terminata: 'failed', ...comune });
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
  async function avvia({ cartella, question, depth, padreId = null }) {
    const id = randomUUIDFn();
    const nome = nomeDallaDomanda(question);
    await creaRicercaFn({ cartella, id, domanda: question, profondita: depth || 'deep', padreId, nome });
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
    cacheDelleRicerche.set(id, creaCacheFetchFn());
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
      task: { consegna: promptRicerca(question, depth), ricercaId: id },
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
      esito: `Started the research «${question}» (id ${id}). It runs in the background and keeps going even if the app is closed.`,
      id,
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
  async function riprendi({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    const cartella = voce.cartella;

    if (voce.messaggiFinali) {
      await registra(cartella, id, { kind: 'run_resumed' });
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
    if (!inPausa && !voce.interrotta) return { ok: false, esito: 'That research is still running: nothing to resume.' };

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

    await registra(cartella, id, { kind: 'run_resumed' });
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
      motivo: stato === 'done' ? null : motivoDelloStato(stato, r.motivoDettaglio ?? null),
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
      giornale: giro ? { eventi: eventi.length, righeSaltate, stato: giro.status } : null,
    };
  }

  return Object.freeze({ avvia, mettiInPausa, annulla, riprendi, rinomina, elimina, elenca, leggi, riverifica });
}
