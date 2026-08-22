import type { TalosToolAuditRow } from '@/lib/tools/executor'

/**
 * ⭐⭐ COSA HA FATTO TALOS, scritto da TALOS — non dal modello.
 *
 * ## ⛔ Il difetto, misurato sul Pad il 2026-08-10
 *
 * Con Qwen3-1.7B, chat nuova, torcia accesa, «Spegni la torcia»:
 *
 * ```
 *   dumpsys   07:26:12 : Torch … turned off for client PID 1246   ✅ SPENTA
 *   in chat   «The tool_results do not contain what the user asked for.»
 * ```
 *
 * L'azione riesce e il racconto la nega. Con la chiave lo stesso turno dice
 * «Fatto, torcia spenta! 🔦». ⇒ Finché l'unico narratore è il modello, ciò che
 * la persona legge dipende da quanto è bravo il modello — e il motore locale è
 * piccolo per scelta, quindi il difetto non è un incidente: è strutturale.
 *
 * ## Cosa NON risolve, e perché va detto
 *
 * Questa riga non corregge il modello. Lo affianca: la frase resta quella che
 * il modello ha scritto, e sotto compare **cosa è successo davvero**. È la
 * stessa forma delle fonti e delle memorie usate — una dichiarazione della
 * macchina accanto a una frase del modello.
 *
 * ## ⛔ Solo ciò che AGISCE, e solo se è RIUSCITO
 *
 * Un `read` non si annuncia: una conversazione ne esegue anche dieci, e dieci
 * righe sarebbero il muro che rende invisibile l'unica che conta. Un fallito
 * nemmeno: quello ha già la sua strada — l'errore lo dice il modello, e la
 * notifica lo registra col peso giusto.
 *
 * ⇒ Restano le azioni riuscite, che sono esattamente quelle che una persona ha
 * il diritto di vedere elencate anche quando il modello le racconta male.
 */

/** Una riga di traccia: il tool che ha agito, con la sua etichetta. */
export interface TalosAzioneEseguita {
    /** Il nome interno, per ritrovare l'etichetta tradotta. */
    tool: string
}

/**
 * Le azioni riuscite di un turno, senza doppioni e nell'ordine in cui sono
 * successe.
 *
 * ⛔ Senza doppioni perché un modello che chiama due volte lo stesso strumento
 * — e i piccoli lo fanno — riempirebbe la traccia di ripetizioni che non
 * aggiungono niente a chi legge.
 */
export function talosAzioniEseguite(
    righe: readonly TalosToolAuditRow[],
): TalosAzioneEseguita[] {
    const visti = new Set<string>()
    const fuori: TalosAzioneEseguita[] = []
    for (const riga of righe) {
        if (riga.action !== 'write') continue
        if (riga.status !== 'succeeded') continue
        /*
         * ⛔ Riuscito NON basta: `invia_file` che chiede quale dei due file
         * mandare è riuscito, e non ha mandato niente. Senza questa riga sotto
         * la risposta compariva «✓ Fatto: Invio di un file» — misurato sul Pad
         * il 2026-08-13.
         */
        if (riga.senzaEffetto) continue
        if (visti.has(riga.tool)) continue
        visti.add(riga.tool)
        fuori.push({ tool: riga.tool })
    }
    return fuori
}

/**
 * ⛔ La traccia si scrive nei metadati del messaggio, come le fonti e le
 * memorie: è una dichiarazione verificabile, non testo generato.
 *
 * Chiave `actions_done`, e non `tools`: quello che conta per chi legge non è
 * che uno strumento sia stato *chiamato*, ma che una cosa sia stata *fatta*.
 */
export const TALOS_METADATA_AZIONI = 'actions_done'

/**
 * ⛔⛔⛔ LE CHIAMATE DEL TURNO, per la STORIA — non per lo schermo.
 *
 * `actions_done` sopra serve alla persona: deduplicato, solo le riuscite, solo
 * `write`, e senza argomenti. Perfetto per un chip, **inservibile** per
 * ricostruire la storia che il modello rilegge — ed è lì che stava il difetto
 * misurato il 2026-08-13, per cui TALOS diceva «Messaggio inviato ad Antonino
 * Rizzo» senza aver chiamato niente (vedi `chat/storiaConLeChiamate.ts`).
 *
 * ⛔ E non basta `tool_calls`, che esisteva già: quello è l'ULTIMA risposta del
 * modello, e dopo un giro dell'agente **riuscito** è vuota — la chiamata è
 * avvenuta in un giro precedente. Cioè proprio i turni che agiscono sono quelli
 * che non lasciavano traccia.
 *
 * Qui invece: ogni chiamata che il modello ha davvero emesso, in ordine, con i
 * suoi argomenti. Senza id — l'id si conia alla rilettura, dall'id del
 * messaggio, perché deve essere unico dentro UNA richiesta e non fra due.
 */
export const TALOS_METADATA_CHIAMATE = 'tool_calls_done'

/** Una chiamata avvenuta, come si conserva sul disco. */
export interface TalosChiamataAvvenuta {
    readonly name: string
    /** Gli argomenti, codificati come li ha emessi il modello. */
    readonly arguments: string
}

/**
 * Le chiamate di un turno, nell'ordine in cui il modello le ha emesse.
 *
 * ⛔ NON deduplicate e NON filtrate per esito, al contrario di
 * `talosAzioniEseguite`: qui si conserva **ciò che il modello ha fatto**, e una
 * chiamata negata o fallita è comunque una chiamata che ha fatto. Toglierla
 * insegnerebbe di nuovo che a volte si risponde senza chiamare.
 *
 * ⛔ `JSON.stringify` senza rete di sicurezza, e non per distrazione: `input` è
 * ciò che il modello ha emesso, cioè il risultato di un `JSON.parse` — non può
 * avere cicli. Il `?? '{}'` copre l'unico caso vero, `undefined`. Un try/catch
 * qui costava 90 byte al grafo d'avvio, che ha un tetto di 602.000 e non ha
 * quei byte da dare a un caso che non può accadere.
 */
export function talosChiamateDelTurno(
    righe: readonly { tool: string, input: unknown }[],
): TalosChiamataAvvenuta[] {
    return righe.map((riga) => ({
        name: riga.tool,
        arguments: JSON.stringify(riga.input) ?? '{}',
    }))
}

/**
 * ⭐⭐⭐ LA SCHEDA — decisione dell'owner del 2026-08-13, dopo il testa a testa.
 *
 * > «Scheda sempre. L'app si apre SOLO quando non c'è altro modo.»
 *
 * ## La misura che l'ha decisa
 *
 * Cinque righe contro Gemini sul Pad. Loro **non spostano mai la persona**:
 * «accendi la torcia» → «Torcia accesa» **più l'interruttore acceso dentro la
 * chat**, che si può ribaltare lì. Noi dicevamo «fatto» e chiudevamo il
 * discorso.
 *
 * ⇒ *Noi consegnavamo un ESITO, loro consegnano uno STATO con cui si può ancora
 * interagire.*
 *
 * ## Perché il TOOL dichiara la sua scheda, e non una tabella nel disegno
 *
 * È lo schema che la letteratura chiama **generative UI**: il risultato dello
 * strumento porta un descrittore, e la vista lo disegna. L'alternativa —
 * una mappa `nome del tool → componente` dentro la schermata — sarebbe un
 * secondo posto da tenere allineato, e il primo che invecchia.
 *
 * ⛔ E i TIPI sono pochi e generici di proposito. Una scheda per capacità
 * sarebbe la «riga predeterminata» che l'owner ha vietato: `interruttore` vale
 * per la torcia, l'aereo, il risparmio energetico e per ogni cosa a due stati
 * che verrà.
 */
export type TalosScheda =
    /** Una cosa a due stati, col comando vivo: torcia, aereo, non disturbare. */
    | {
        readonly tipo: 'interruttore'
        /** Il tool da richiamare, che è anche l'etichetta da tradurre. */
        readonly tool: string
        readonly acceso: boolean
    }
    /**
     * ⭐⭐⭐ GLI IMPEGNI DI UN GIORNO — 2026-08-14, misurata contro Gemini.
     *
     * Alla stessa domanda lui risponde col testo **e due schede**: nome
     * dell'evento, giorno e intervallo orario. Noi rispondevamo con del testo e
     * basta. È la differenza che l'owner ha chiamato «SCHEDA SEMPRE».
     *
     * ⛔ Porta il testo GIÀ FORMATTATO, non i millisecondi: la conversione di un
     * evento «tutto il giorno» va fatta in UTC — sbagliarla sposta il giorno —
     * e quel sapere sta in un posto solo, `calendarioTools`. Una seconda
     * conversione nel componente sarebbe una seconda verità sullo stesso
     * evento, che un giorno diverge.
     */
    | {
        readonly tipo: 'agenda'
        readonly voci: ReadonlyArray<{
            readonly titolo: string
            /** Già leggibile: «2026-08-15 17:00–18:00» oppure «… (all day)». */
            readonly quando: string
            readonly luogo?: string
            readonly calendario?: string
        }>
    }
    /**
     * ⭐⭐ LA SVEGLIA — e questa scheda serve a far vedere **l'ORA**.
     *
     * Owner 2026-08-14, lista delle schede: sveglia, invio file, chiamata,
     * `app_azione`, ricerca web. La sveglia viene prima perché il suo dato è
     * quello che sbaglia: lo stesso giorno stesso, «metti in agenda domani»
     * è finito due giorni più in là e nessuno se n'è accorto finché non ho
     * interrogato il provider. Un'ora scritta grande si controlla in un colpo
     * d'occhio, e una sveglia alle 7 invece che alle 19 costa una giornata.
     *
     * ⛔ E NON porta un comando «annulla», che sarebbe la cosa naturale da
     * mettere. `ACTION_DISMISS_ALARM` su questa ColorOS **non cancella niente**
     * — provato per orario, per «la prossima» e per «tutte», con e senza
     * `SKIP_UI`. Una levetta che non spegne è la stessa bugia del segno
     * «Fatto» su una cosa non fatta, con un dito sopra.
     *
     * ⇒ Mostra lo stato e tace sui comandi che non ha. Quando la ROM ci
     * lascerà spegnere, il comando arriva qui.
     */
    | {
        readonly tipo: 'sveglia'
        /** Già leggibile: «07:30», oppure «fra 10 min» per un timer. */
        readonly quando: string
        readonly etichetta?: string
    }
    /**
     * ⭐⭐⭐ È PARTITO, O NO — la scheda che il modello non può contraddire.
     *
     * MISURATO sul Pad il 2026-08-17, con la lettura dello schermo spenta:
     *
     *     TALOS: «Il messaggio "prova cinque" è stato inviato ✓
     *             Il messaggio non è stato inviato, manca il permesso…»
     *
     * L'invio dichiarato E il fallimento nella stessa risposta, in
     * quest'ordine. Verificato che non fosse partito: il testo era ancora nel
     * campo di WhatsApp, e in chat quel messaggio non c'è.
     *
     * ## ⛔ E le difese di parole erano GIÀ tutte in piedi
     *
     *   - il prompt dice «Never state an outcome before the tool that produces
     *     it has returned» — c'era, ed è stata ignorata;
     *   - l'esito dello strumento dice «Nothing was sent» ed è `ok: false`;
     *   - il 2026-08-17 ci ho aggiunto anche «⛔ Do NOT open with "sent"».
     *
     * Tre divieti scritti, e il modello ha aperto lo stesso con «inviato ✓».
     *
     * ⇒ È la stessa lezione di `quale-app`: finché la verità passa dalle
     * PAROLE del modello, dipende dal fatto che le ricopi bene. La scheda la
     * disegna l'app, e non può mentire — chi guarda lo schermo vede «NON
     * INVIATO» sotto una frase che dice il contrario, e crede alla scheda.
     *
     * ⛔ `partito` è un booleano e non tre stati: qui si sa. Il caso «non lo so»
     * — una prova su tre — NON produce questa scheda, perché una scheda che
     * dicesse «forse» insegnerebbe a non fidarsi anche delle altre.
     */
    | {
        readonly tipo: 'invio'
        /** L'app che avrebbe dovuto mandarlo: «WhatsApp», «Telegram». */
        readonly app: string
        readonly partito: boolean
        /**
         * Solo quando NON è partito: il MOTIVO, come chiave da tradurre.
         *
         * ⛔ Una chiave e non una frase, e l'ho scoperto guardando lo schermo:
         * la prima versione portava il testo inglese pronto, e sul Pad in
         * italiano la scheda diceva «NON inviato · screen reading is off».
         * Metà riga tradotta e metà no, dentro il riquadro che deve essere il
         * più credibile della schermata.
         *
         * ⇒ Le schede sorelle fanno già così: `quale-app` porta i nomi delle
         * app (che sono nomi propri) e le sue parole vengono da `t()`.
         */
        readonly perche?: 'occhio' | 'altra-app' | 'testo' | 'pulsante' | 'ponte'
    }
/*
 * ⛔ Qui c'era un tipo `fonti`, aggiunto e tolto il 2026-08-14: le fonti hanno
 * già la loro casa in `TalosMobileSourcesChip`, che le mostra meglio (favicon
 * lette da disco, browser interno). Il buco vero era che quel chip vive solo
 * nella lista dei messaggi ⇒ si monta quello nell'assistente, non se ne fa un
 * secondo. La spiegazione per esteso sta in `webTools.ts`.
 */
    /**
     * ⭐⭐⭐ QUALE APP — l'elenco che il modello NON deve ripetere.
     *
     * MISURATO sul Pad il 2026-08-13, e sta scritto in `intentiTools`: dato
     * l'elenco vero delle app che sanno fare una cosa, il modello ha risposto
     * «WhatsApp, Telegram, Signal, Messenger, ChatGPT» — di cui **tre non
     * installate e una inventata**. Aveva la verità in mano e ci ha scritto
     * sopra.
     *
     * Quella volta la cura fu l'etichetta (`ok: true` invece di `ok: false`) e
     * un divieto esplicito nella riga. Funziona, ma dipende ancora dal fatto
     * che il modello **ricopi bene** — cioè da un passaggio che non serve.
     *
     * ⇒ La scheda porta l'elenco **così com'è**, dal telefono allo schermo,
     * senza passare dalle parole. È la stessa forma della domanda «quale
     * calendario»: non un errore, una scelta.
     *
     * ⛔ Le voci sono TOCCABILI: `pacchetto` è ciò che serve per richiamare la
     * capacità sull'app scelta. Un elenco che si può solo leggere lascia alla
     * persona il compito di ridire un nome che TALOS ha già.
     */
    /**
     * ⭐⭐⭐ QUALCOSA CHE ORA ESISTE — e prima non lasciava traccia.
     *
     * Censimento 2026-08-16: sette capacità creano qualcosa che **resta** —
     * note, attività, documenti, immagini, ricerche, memorie, file esportati —
     * e nessuna lasciava una scheda. È la stessa famiglia dell'evento in
     * agenda, curata il giorno prima per la stessa ragione:
     *
     *   **una nota creata ha la stessa faccia di una nota detta e mai creata.**
     *
     * E come l'evento non si vede: a differenza della torcia, non c'è niente
     * nel mondo che ti dica se è successo. Te ne accorgi il giorno dopo,
     * quando cerchi la nota e non c'è.
     *
     * ⛔ E porta la STRADA per aprirla, non solo il nome. Un elenco che si può
     * solo leggere lascia alla persona il compito di ritrovare da sé una cosa
     * che TALOS ha appena messo da qualche parte — è lo stesso difetto per cui
     * `quale-app` porta i pacchetti invece dei nomi.
     *
     * ⛔ Il `dove` è la rotta interna già esistente (`/library/…`,
     * `/notes/…`): non si inventa una navigazione nuova per una scheda.
     */
    | {
        readonly tipo: 'creato'
        /** Il nome della cosa, come la persona la cercherà. */
        readonly titolo: string
        /**
         * Che cosa è, in una parola già tradotta: «Nota», «Documento».
         * ⛔ Non l'id del tool: quella è una parola per noi, non per chi legge.
         */
        readonly genere: string
        /** Una riga di contorno, se c'è: «340 parole», «2,1 MB». */
        readonly dettaglio?: string
        /** La rotta interna che la apre. Senza, la scheda mostra e basta. */
        readonly dove?: string
        /**
         * ⭐⭐⭐ Il percorso di un PDF, che si APRE invece di navigare.
         *
         * Owner 2026-08-17: «il PDF bisogna poterlo visualizzare dentro la
         * app». Misurato sul Pad: la scheda mostrava «TALOS in tre righe.pdf ·
         * Documento · 10 KB» e toccandola non succedeva niente.
         *
         * ⛔ NON e' un `dove` travestito. `dove` e' una rotta interna e porta
         * altrove; questo apre un visualizzatore sopra la chat e la
         * conversazione resta dov'e'. Confonderli vorrebbe dire far sparire la
         * chat per guardare una pagina.
         */
        readonly pdf?: string
        /**
         * ⭐⭐ L'id in Libreria di un file Markdown, che si APRE FORMATTATO
         * invece di navigare — stessa famiglia di `pdf`, non di `dove`.
         *
         * Rilievo owner 22/8: «non è possibile cliccare sul file MD appena
         * creato dalla scheda chat» — la scheda mostrava nome e peso, il
         * tocco non succedeva niente, per lo stesso motivo del PDF prima
         * della cura: nessun `dove` esiste per un singolo file, e senza
         * questo campo `eCreato(s) && (s.dove || s.pdf)` restava falso.
         *
         * ⛔ Un ID di Libreria, non un percorso di file: il visualizzatore
         * legge il testo con `hydrateText(id)`, la stessa via già in uso
         * per gli allegati già attaccati — non un secondo modo di leggere
         * un file.
         */
        readonly mdFileId?: string
    }
    | {
        readonly tipo: 'quale-app'
        /** La capacità da richiamare con l'app scelta. */
        readonly capacita: string
        /** I valori già raccolti, da ripassare identici alla seconda chiamata. */
        readonly valori: Readonly<Record<string, string>>
        readonly app: ReadonlyArray<{
            readonly nome: string
            readonly pacchetto: string
        }>
    }
    /**
     * ⭐⭐⭐ QUALE FILE — la sorella di `quale-app`, e nasce da un LOOP.
     *
     * MISURATO sul Pad il 2026-08-17. Due `nota-talos.txt` nella Libreria.
     * TALOS chiede quale, l'esito dello strumento porta i numeri E gli id e dice
     * a lettere «call this tool again with "file" set to that entry's id». La
     * persona risponde «1», e il modello **rifà la stessa domanda**: richiama col
     * NOME, riottiene l'ambiguità, riscrive l'elenco. Un giro chiuso.
     *
     * ⛔ È la lezione già scritta due volte in `intentiTools`: un'istruzione
     * scritta NON vincola il modello. Se una cosa deve succedere, la fa il
     * codice.
     *
     * ⇒ L'elenco va dallo strumento allo schermo e si TOCCA, come per le app: il
     * dito porta l'id, e l'id è l'unica cosa che distingue due omonimi.
     */
    | {
        readonly tipo: 'quale-file'
        /** L'app di destinazione già scelta, da ripassare identica. */
        readonly app?: string
        /** Il destinatario già raccolto, da ripassare identico. */
        readonly contatto?: string
        /** Il messaggio che accompagna il file, se c'era. */
        readonly testo?: string
        readonly file: ReadonlyArray<{
            readonly nome: string
            readonly id: string
        }>
    }

export const TALOS_METADATA_SCHEDE = 'cards'

/**
 * ⛔ Qui restano SOLO il tipo e la chiave, e c'è un numero dietro: i controlli
 * (`eUnaScheda`, la deduplica, la lettura dai metadati) costavano al grafo
 * d'avvio, che ha un tetto di 602.200 byte. Vivono nel componente della scheda,
 * che è pigro — arriva col primo messaggio che ne porta una.
 */

/** Vero quando c'è qualcosa da mostrare — usato dalla vista per non disegnare il vuoto. */
export function talosHaAzioniDaMostrare(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== 'object') return false
    const valore = (metadata as Record<string, unknown>)[TALOS_METADATA_AZIONI]
    return Array.isArray(valore) && valore.length > 0
}

/**
 * ⭐⭐ IL MICROFONO SIGNIFICA UNA COSA SOLA: «qui c'è di mezzo la tua voce».
 *
 * Owner 2026-08-11: «quando premo il pulsante sound spunta l'icona microfono
 * accanto al testo. Questo non deve succedere. L'icona microfono deve spuntare
 * solo quando uso il microfono per parlare io con la voce».
 *
 * La riga era `message.role === 'assistant' && parla.lette.has(message.id)`:
 * il microfono marcava «TALOS ha LETTO questo» — il momento esatto in cui TALOS
 * **parla** e nessuno sta ascoltando al microfono. Il marcatore non si sposta,
 * **cambia proprietario**: va sul messaggio che la persona ha DETTATO.
 *
 * ⛔ Quello vecchio era un `Set` di id in memoria, vivo finché la schermata era
 * aperta. Per «l'ho appena letta» poteva bastare; per «questo l'hai dettato tu»
 * no — è un fatto sul messaggio, e un segno che sparisce quando riapri mente.
 * Quindi metadati, come la traccia delle azioni qui sopra: `metadata_json`
 * esiste già sulla riga, e `send()` accetta già un sacchetto.
 *
 * ⛔ E la provenienza NON si indovina: la decide `talosProvenienzaVoce`, che
 * tiene il PEZZO dettato e lo cerca nella bozza — regge «detta e corregge»,
 * «detta e riscrive a mano», «detta e annulla» senza nessuna euristica.
 *
 * ⛔ STA QUI e non in un file suo perché questo modulo è già la casa delle
 * chiavi dei metadati di un messaggio, ed è già importato dai due lati che
 * servono. Un modulo nuovo costava 58 byte del grafo d'avvio, che è a meno di
 * cento dal tetto: un file in più per due righe non vale un tetto sforato.
 */
export const TALOS_METADATA_DETTATO = 'dictated'

/**
 * ⛔⛔ LO SCHERMO VIAGGIA QUI, e NON dentro il messaggio della persona.
 *
 * ## Il difetto, visto dall'owner l'11 agosto 2026
 *
 * Nella chat compariva **tutto il prompt**: «Qui sotto c'è il testo che compare
 * adesso sullo schermo della persona…» seguito da centinaia di parole di
 * interfaccia — Gmail, Deezer, WhatsApp, i nomi di ogni icona — stampati come
 * se li avesse scritti lui.
 *
 * La causa era una riga sola: il contesto veniva CONCATENATO al testo prima di
 * `chat.send`, quindi finiva nel messaggio dell'utente — mostrato a schermo,
 * scritto su disco, e ripetuto in ogni turno successivo della conversazione.
 *
 * ⇒ È la stessa lezione di `righe-per-il-modello-sullo-schermo`: ciò che è
 * scritto PER IL MODELLO non si mostra ALLA PERSONA. Il testo dello schermo ha
 * un solo destinatario, e ora ha un canale che lo porta solo a lui.
 *
 * ## Le tre proprietà che questo canale garantisce
 *
 * 1. **Non si vede**: il messaggio salvato resta quello che la persona ha detto.
 * 2. **Non si conserva**: `send` toglie la chiave prima di scrivere su disco —
 *    lo schermo di un'altra app non deve restare in un database per sempre.
 * 3. **Non si ripete**: vale solo per il turno che lo porta. Il turno dopo
 *    riguarda un altro momento, e uno schermo vecchio sarebbe una bugia.
 */
export const TALOS_METADATA_SCHERMO = 'screen_context'

/**
 * ⛔⛔ LA RISPOSTA SI È FERMATA A METÀ — e la persona non poteva saperlo.
 *
 * Rilievo #16b dell'owner, dagli screenshot del 12 agosto: una risposta appariva
 * **troncata a metà frase** («nessuna app può») «senza che si capisca se sia
 * finita, interrotta o tagliata dal rendering».
 *
 * Tre cause con lo stesso aspetto:
 *
 * | com'è finita | chi lo sa |
 * |---|---|
 * | il modello ha finito di parlare | `finishReason: 'stop'` |
 * | ha esaurito la lunghezza | `finishReason: 'length'` ← questo |
 * | il rendering l'ha tagliata | `messageMarkdown.truncated`, che già si vede |
 *
 * Il secondo era l'unico senza voce: `finishReason` arrivava al controller e
 * moriva lì, perché nessuno lo scriveva accanto alla risposta. L'unico caso
 * trattato era quello con `length` **e testo vuoto** — cioè proprio quello in
 * cui non c'è niente da leggere a metà.
 *
 * ⇒ Vale `true` SOLO per `length`. Una risposta finita non porta la chiave, e
 * un avviso su ogni risposta insegnerebbe a dubitare anche di quelle intere.
 */
export const TALOS_METADATA_TRONCATA = 'stopped_at_limit'
