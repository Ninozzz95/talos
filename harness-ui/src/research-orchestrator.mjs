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
import { leggiRapporto, rileggiRapportoMinimo } from './research-store.mjs';

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
  rileggiRapportoFn = rileggiRapportoMinimo,
  clock = () => new Date(),
}) {
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
    if (richiesta === 'paused') return; // terminata resta null: resumable, il bucket "paused" lo deriva statoVivo() dal vivo.
    if (richiesta === 'cancelled') {
      await aggiornaRicercaFn({ cartella, id, terminata: 'cancelled', conclusaAlle: clock().toISOString() });
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

    const testoRapporto = await leggiRapportoFn({ cartella, id });
    if (testoRapporto !== null && testoRapporto !== undefined) {
      const letto = rileggiRapportoFn(testoRapporto);
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
          return;
        }
        await aggiornaRicercaFn({ cartella, id, terminata: 'done', reportLibraryId, ...comune });
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
    return { ok: true, esito: 'That research is paused. Everything it collected is kept, and it can be resumed.' };
  }

  function annulla({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (voce.conclusa) {
      // ⭐ una ricerca già ferma (in pausa, o già conclusa) si annulla lo stesso: cambia solo la metadata (terminata:'cancelled'), nessun abort da fare — mai un rifiuto per un caso che mobile stesso permette (research_cancel su una "paused"/"unfinished").
      return aggiornaRicercaFn({ cartella: voce.cartella, id, terminata: 'cancelled' })
        .then(() => ({ ok: true, esito: 'That research is stopped for good. What it collected is still readable.' }));
    }
    voce._ricercaTerminataRichiesta = 'cancelled';
    voce.controller.abort();
    return { ok: true, esito: 'That research is stopped for good. What it collected is still readable.' };
  }

  async function riprendi({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (!voce.messaggiFinali) {
      return {
        ok: false,
        esito: voce.interrotta
          ? 'That research was interrupted by a server restart and cannot be resumed: start a new one.'
          : 'That research is still running: nothing to resume.',
      };
    }
    avviaESeguiFn({
      sessionId: id, taskId: voce.taskId, cartella: voce.cartella, task: voce.task, comandoProva: voce.comandoProva,
      messaggiIniziali: [...voce.messaggiFinali, { role: 'user', content: PROMPT_RIPRESA }],
      forkDa: voce.forkDa, voceEsistente: voce,
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella: voce.cartella, id, risultato }),
    });
    return { ok: true, esito: 'That research is running again, from where it had stopped.' };
  }

  async function rinomina({ cartella, id, title }) {
    const aggiornata = await aggiornaRicercaFn({ cartella, id, titolo: title });
    if (!aggiornata) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
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
  function voceEsposta(r, stato) {
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
    };
  }

  async function elenca({ cartella, status, page_size: pageSize, offset }) {
    const record = await elencaRicercheFn({ cartella });
    const conStato = record.map((r) => voceEsposta(r, statoVivo(r, sessioni.get(r.id))));
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
    let motivoDettaglio = record.motivoDettaglio ?? null;
    if (stato === 'done') {
      /*
       * ⛔⛔⛔ §6.5, LA COMPATIBILITÀ ALL'INDIETRO — CALCOLATA AL VOLO, SENZA RISCRIVERE.
       *
       * Ogni ricerca fatta prima dell'11/09 ha `terminata:'done'` e un `reportLibraryId` che
       * può puntare a qualunque cosa: sulla `d2a453a8` punta a 290 byte di scusa. Qui il
       * rapporto si RILEGGE davvero: prima il file depositato (la via nuova), poi la voce di
       * Libreria (la via vecchia, l'unica che le ricerche già su disco hanno). Se nessuna
       * delle due supera la forma minima, lo stato MOSTRATO diventa `'senza-rapporto'`.
       *
       * ⛔ Il file su disco non si tocca. Mai riscrivere in silenzio un record già pagato: la
       *   correzione vive nella LETTURA, come per «TRE RIPETIZIONI PAGATE, UNA USATA» (22/8),
       *   dove la cura stava nel lettore e non nelle righe.
       */
      const depositato = await leggiRapportoFn({ cartella, id });
      let testo = depositato ?? null;
      if (testo === null && record.reportLibraryId && leggiVoceLibreriaFn) {
        try {
          const voce = await leggiVoceLibreriaFn({ cartella, id: record.reportLibraryId });
          testo = voce?.testo ?? null;
        } catch {
          testo = null; // il rapporto è dichiarato pronto ma illeggibile ORA — onesto, mai un crash.
        }
      }
      const letto = testo === null ? null : rileggiRapportoFn(testo);
      if (letto?.ok) contenutoRapporto = testo;
      else {
        stato = 'senza-rapporto';
        motivoDettaglio = letto?.motivo ?? (testo === null ? 'non c\'è nessun file di rapporto' : null);
      }
    }
    return {
      trovata: true,
      ...voceEsposta({ ...record, motivoDettaglio }, stato),
      contenutoRapporto,
    };
  }

  return Object.freeze({ avvia, mettiInPausa, annulla, riprendi, rinomina, elimina, elenca, leggi });
}
