import { z } from 'zod'
import {
    TALOS_CAPACITA_GENERICHE,
    TALOS_CAPACITA_INTENT,
    talosCapacita,
    talosCapacitaGenerica,
    talosComponiExtra,
    talosComponiUri,
    talosConSchema,
    talosParametriMancanti,
    type TalosCapacitaGenerica,
    type TalosCapacitaIntent,
    type TalosViaIntent,
} from '@/lib/intenti/registro'
import { talosInvioPerPacchetto } from '@/lib/intenti/registro'
import { talosRisolviContatto } from '@/lib/intenti/rubrica'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import { TalosSchermoBridge, type TalosEsitoInvio } from '@/lib/device/ponteSchermo'
import {
    talosScegliApp,
    talosScegliFile,
    type TalosFileMandabile,
} from '@/lib/tools/fileDaMandare'
import {
    defineTalosTool,
    type TalosToolDefinition,
    type TalosToolResult,
} from '@/lib/tools/registry'

/**
 * ⭐⭐⭐ UN TOOL SOLO per OTTO app — e per quelle che verranno.
 *
 * ## Perché non otto tool
 *
 * Ogni tool costa al modello token in OGNI messaggio, e costa a noi cinque
 * posti da tenere allineati (catalogo, sicurezza, etichette, permessi,
 * toolset). Otto tool per otto app sarebbero quaranta punti di divergenza, e
 * la nona app ne aggiungerebbe altri cinque.
 *
 * ⇒ Il modello sceglie una `capacita` da un elenco chiuso, e i valori stanno
 * nei dati. Aggiungere Spotify o Booking è **una riga nel registro**.
 *
 * ## La misura che ha deciso tutto questo
 *
 * Sul Pad, 2026-08-13, stesso compito: Gemini manda il WhatsApp in ~20 s senza
 * aprire l'app; TALOS lo pilotava in **20 passi, 27,8 s, senza concludere**.
 * ⇒ L'intent non è un'ottimizzazione: è la differenza fra riuscire e no.
 */
/*
 * ⛔ NIENTE FONTI DA INIETTARE, e non è pigrizia: è un byte-count.
 *
 * MISURATO oggi, quattro forme in fila — gancio nel controller con cache
 * (602.009), con `import()` pigro (601.650), con `&&`/`||` (601.704), fonti
 * dentro il ponte del telefono (601.512). Ogni forma pagava il grafo d'AVVIO
 * per una funzione che serve solo a chi chiede «manda un messaggio».
 *
 * ⇒ Questo modulo vive dietro il toolset, che è già un chunk dinamico:
 * chiamare il ponte da qui costa zero a chi apre l'app. Il tetto è una regola
 * dell'owner — «togliendo peso e non alzando il tetto» — e vale anche quando
 * il peso è mio e la funzione mi piace.
 */

/**
 * Gli id validi, presi dal registro: l'elenco non si scrive due volte.
 *
 * ⭐ Sono DUE famiglie, e servono a due domande diverse:
 * le capacità del registro sanno la cosa PRECISA (la chat giusta di WhatsApp,
 * il percorso a piedi); le **generiche** non sanno niente di nessuna app e
 * funzionano su **tutte quelle installate**, chiedendo al telefono chi sa fare
 * cosa. Un'app installata domani entra nelle seconde senza toccare una riga.
 */
const ID_CAPACITA = [
    ...TALOS_CAPACITA_INTENT.map((c) => c.id),
    ...TALOS_CAPACITA_GENERICHE.map((c) => c.id),
] as [string, ...string[]]

/**
 * ⛔ Quanto si aspetta che l'app arrivi in primo piano CON il testo dentro.
 *
 * Non è un `sleep`: è un TETTO. Su una chat già aperta si esce al primo giro,
 * cioè in millisecondi. Serve solo per l'avvio a freddo di un'app grossa —
 * MISURATO sul Pad: `wa.me` porta `com.whatsapp.Conversation` in primo piano
 * col testo già nel campo entro ~4 s da fermo.
 */
const ATTESA_APP_MS = 10_000

/**
 * Percorre UNA via: URI o azione. Torna se il sistema l'ha accettata.
 *
 * ⛔ Le due strade si assomigliano e hanno regole OPPOSTE sull'escape — nell'URI
 * si codifica, negli extra no — ed è per questo che la scelta sta qui e in un
 * posto solo: due chiamanti che decidono da soli sono due posti dove un giorno
 * uno dei due sbaglia verso.
 */
async function talosPercorri(
    via: TalosViaIntent,
    valori: Readonly<Record<string, string>>,
    pacchetto?: string,
): Promise<boolean> {
    if (via.tipo === 'riga-contatto') {
        /*
         * ⛔ Due domande, non una: prima «esiste la riga?», poi «aprila». La
         * prima può rispondere `riga-assente` o `senza-permesso`, e sono cose
         * diverse — la seconda si cura chiedendo il permesso, la prima no.
         * Qui basta sapere che non c'è: il motore passa alla via dopo.
         */
        const uri = await TalosDeviceBridge
            .rigaDiContatto({ numero: valori[via.numero] ?? '', mime: via.mime })
            .then((r) => r.uri, () => null)
        if (!uri) return false
        return await TalosDeviceBridge.apriAzione({
            azione: 'android.intent.action.VIEW',
            uri,
            tipo: via.mime,
            ...(pacchetto ? { pacchetto } : {}),
        }).then((r) => r.done, () => false)
    }
    if (via.tipo === 'azione') {
        return await TalosDeviceBridge.apriAzione({
            azione: via.azione,
            ...(via.mime ? { tipo: via.mime } : {}),
            ...(pacchetto ? { pacchetto } : {}),
            extra: talosComponiExtra(via, valori),
        }).then((r) => r.done, () => false)
    }
    /*
     * ⛔⛔ IL PACCHETTO ARRIVA ANCHE QUI, e prima non ci arrivava.
     *
     * Le due righe sopra lo passavano; questa — la strada degli URI, cioè
     * quella che usano quasi tutte le capacità del registro — lo **buttava
     * via**. MISURATO sul Pad il 2026-08-14, «metti su Pink Floyd su Spotify»:
     * si apriva `open.spotify.com` dentro **Chrome**, con Spotify installato.
     *
     * ⇒ Un parametro dichiarato dal chiamante e ignorato da un ramo su tre è
     * peggio di un parametro che non c'è: sembra che il vincolo esista.
     */
    return await TalosDeviceBridge
        .apriUri({
            uri: talosConSchema(via, talosComponiUri(via, valori)),
            ...(pacchetto ? { pacchetto } : {}),
        })
        .then((r) => r.done, () => false)
}

/**
 * ⭐⭐⭐ IL TOCCO SU «QUALE APP» — la seconda metà della stessa azione.
 *
 * La scheda mostra l'elenco vero letto dal telefono; toccare una voce fa
 * esattamente ciò che avrebbe fatto il modello scrivendo quel nome, e cioè
 * `talosPercorri` con quel pacchetto. **La stessa funzione**, non una copia: le
 * due strade (URI e azione) hanno regole opposte sull'escape, e un secondo
 * chiamante che decidesse da sé sarebbe il posto dove un giorno si sbaglia
 * verso.
 *
 * ⛔ Non passa dal cancello dei permessi, ed è la regola già scritta in
 * `schedaComandi`: la scheda nasce da un'azione **già autorizzata**, e la
 * persona sta scegliendo fra le opzioni che TALOS le ha appena messo davanti.
 * Il tocco **è** il consenso. Non apre capacità nuove — completa questa.
 *
 * ⛔ Ricontrolla i parametri invece di fidarsi: i valori hanno fatto un giro
 * dentro i metadati di un messaggio, cioè fuori da qui, e una capacità aperta
 * con un campo vuoto porta l'app in primo piano senza il testo dentro.
 */
export async function talosApriConApp(
    capacita: string,
    valori: Readonly<Record<string, string>>,
    pacchetto: string,
): Promise<boolean> {
    const generica = talosCapacitaGenerica(capacita)
    if (!generica || !pacchetto.trim()) return false
    if (generica.parametri.some((p) => !valori[p]?.trim())) return false
    if (!await talosPercorri(generica.via, valori, pacchetto)) return false
    /*
     * ⛔⛔ «APERTA» SI DICE DOPO AVER GUARDATO — la scheda scrive quella parola
     * sotto il nome dell'app, e non deve poterla scrivere a vuoto.
     *
     * MISURATO sul Pad il 2026-08-14 su un'altra strada: intent accettato, app
     * chiusa da sola un secondo dopo, TALOS che dice «fatto». `startActivity`
     * che non solleva vuol dire «il sistema ha accettato», non «l'app c'è».
     *
     * ⛔ Solo un'app DIVERSA vista davanti è una smentita. Se l'occhio non c'è
     * la risposta è «non lo so», e la si tratta come riuscita: dire «non si è
     * aperta» perché non abbiamo potuto guardare è la bugia opposta.
     */
    const davanti = await talosDavantiFinche(pacchetto, GIRI_APERTURA)
    return davanti === null || davanti === pacchetto
}

/**
 * ⭐⭐⭐ LA CAPACITÀ SENZA APP: chi la sa fare lo dice il TELEFONO.
 *
 * Owner 2026-08-13: «la chat ha già una lista delle applicazioni esistenti,
 * dobbiamo fare in modo che chiami in quelle e non usi delle righe generiche».
 *
 * ## ⛔ E quando l'app chiesta non c'è, si dice QUALI ci sono
 *
 * «Non l'ho trovata» chiude il discorso; «non c'è, ma su questo telefono lo
 * sanno fare queste» lo apre. È la stessa differenza fra «non lo so» e «no» che
 * su questo progetto è già costata quattro difetti in un giorno — e l'elenco
 * non costa niente, perché l'abbiamo già chiesto per cercare.
 */
async function talosCapacitaSulDispositivo(
    generica: TalosCapacitaGenerica,
    app: string | undefined,
    valori: Readonly<Record<string, string>>,
): Promise<TalosToolResult> {
    const mancanti = generica.parametri.filter((p) => !valori[p]?.trim())
    if (mancanti.length > 0) {
        return {
            ok: false,
            content: `Missing: ${mancanti.join(', ')}. Ask the user instead of guessing.`,
            code: 'TALOS_INTENTO_INCOMPLETO',
        }
    }
    const tutte = await TalosDeviceBridge.chiAccetta({
        azione: generica.via.azione,
        ...(generica.via.mime ? { tipo: generica.via.mime } : {}),
    }).then((r) => r.app, () => [])
    /*
     * ⛔⛔⛔ SENZA UN NOME UMANO NON SI OFFRE A UN UMANO.
     *
     * MISURATO sul Pad il 2026-08-14, prima riga della scheda «quale app»:
     *
     *     com.android.cts.priv.ctsshim.InstallPriority   ›
     *
     * Un nome interno sullo schermo di una persona — la regola che questo
     * progetto ripete ovunque, rotta proprio dalla scheda che serviva a NON far
     * inventare i nomi. Ed è anche uno stub di collaudo che Android si porta
     * dietro: non fa niente, e toccarlo non fa niente.
     *
     * ## ⛔ Perché NON è un elenco di pacchetti da escludere
     *
     * «Niente righe predeterminate: si chiede al TELEFONO» — un registro di nomi
     * cattivi scritto a mano invecchia e mente, e domani arriva un altro stub.
     * Il fatto qui si MISURA, e la misura è ESATTA — niente euristiche sui nomi.
     * `loadLabel()` di Android, quando un'app non dichiara `android:label`,
     * **ripiega sull'identificatore del componente**. Quindi «l'etichetta è
     * uguale al nome dell'attività, o al pacchetto» vuol dire, letteralmente,
     * *il telefono non ha un nome umano per questa cosa* — e ciò che non ha un
     * nome umano non si mette davanti a una persona né dentro un elenco che il
     * modello legge.
     *
     * ⛔ IL PRIMO TENTATIVO CONFRONTAVA SOLO COL PACCHETTO, ed è passato lo
     * stesso: il ripiego non era `com.android.cts.ctsshim` ma
     * `com.android.cts.ctsshim.InstallPriority`, cioè la **classe**. Il ponte
     * ci dà già `attivita`, quindi il confronto giusto c'era e non lo usavo —
     * ed è esatto invece che somigliante, che su un nome è la differenza fra una
     * regola e una scommessa.
     *
     * ⛔ Vale per TUTTI E DUE i lettori: la riga che va al modello e la scheda
     * che va alla persona nascono da qui, e devono dire la stessa cosa.
     */
    const candidate = tutte.filter((a) => {
        const nome = a.nome?.trim() ?? ''
        return nome !== '' && nome !== a.pacchetto && nome !== a.attivita
    })
    const elenco = candidate.map((a) => a.nome).join(', ')
    if (candidate.length === 0) {
        /*
         * ⛔ DUE MOTIVI DIVERSI, e si dicono diversi: «nessuno lo sa fare» e
         * «lo sanno fare solo cose senza nome» sono fatti distinti, e il secondo
         * è quasi sempre un sistema che offre uno stub. Un solo messaggio per
         * due stati è la stessa scorciatoia che è già costata qui: gli stati
         * sono tre, non due.
         */
        return {
            ok: false,
            content: tutte.length > 0
                ? 'The only things that accept this on the device have no app name — they are system stubs, not apps a person can pick. Tell the user nothing usable can do it; do not invent one.'
                : 'No app on this device can do that. Tell the user; do not invent one.',
            code: 'TALOS_INTENTO_NESSUNA_APP',
        }
    }
    if (!app?.trim()) {
        /*
         * ⛔⛔ `ok: true`, E NON È PIGNOLERIA — MISURATO sul Pad il 2026-08-13.
         *
         * Con `ok: false` questo elenco è stato letto come un FALLIMENTO: il
         * modello (Haiku 4.5) l'ha scartato, ha chiamato anche
         * `device_list_apps` tre volte, e poi ha risposto alla persona
         * «WhatsApp, Telegram, Signal, Messenger, ChatGPT» — di cui **tre non
         * sono installate su questo telefono** e una se l'è inventata.
         *
         * ⇒ Aveva la verità in mano e ci ha scritto sopra, perché gliel'avevamo
         * consegnata con l'etichetta «non ha funzionato». Un elenco richiesto e
         * ottenuto **è una risposta**, non un errore: `ok: true`.
         *
         * ⛔ E la riga che segue è un divieto esplicito. Senza, un modello che
         * conosce il mondo riempie i buchi col mondo — che è utile ovunque
         * tranne quando la domanda è «cosa c'è su QUESTO telefono».
         */
        return {
            ok: true,
            content: `These ${candidate.length} apps — and ONLY these — can do that on this device: ${elenco}. This list comes from the phone itself, so it is the truth. ⛔ Do NOT name any other app, do not add apps you know from elsewhere, and do not guess: an app you name that is not in this list is not installed. The user is ALREADY seeing this list as a card they can tap, so just ask which one in one short sentence — do not repeat the names.`,
            /*
             * ⭐⭐⭐ E LA SCHEDA PORTA L'ELENCO INTATTO.
             *
             * La riga qui sopra difende la stessa cosa con le parole, e nel
             * 2026-08-13 non era bastata: il modello aveva risposto «WhatsApp,
             * Telegram, Signal, Messenger, ChatGPT» — tre non installate e una
             * inventata — avendo l'elenco vero in mano.
             *
             * ⇒ La scheda salta il passaggio: dal telefono allo schermo, senza
             * ricopiature. Il divieto resta, perché la riga governa anche ciò
             * che il modello DICE; ma la persona non dipende più da quello.
             */
            scheda: {
                tipo: 'quale-app' as const,
                capacita: generica.id,
                valori: { ...valori },
                // ⛔ Nessun ripiego sul pacchetto: il filtro qui sopra garantisce
                // che ogni voce abbia un nome umano, e un `||` lasciato qui
                // rimetterebbe in silenzio la strada che ha fatto comparire
                // `com.android.cts.priv.ctsshim.InstallPriority` sullo schermo.
                app: candidate.map((a) => ({ nome: a.nome, pacchetto: a.pacchetto })),
            },
        }
    }
    const cercata = app.trim().toLowerCase()
    const scelta = candidate.find((a) => a.pacchetto.toLowerCase() === cercata)
        ?? candidate.find((a) => a.nome.toLowerCase() === cercata)
        ?? candidate.find((a) => a.nome.toLowerCase().includes(cercata))
    if (!scelta) {
        return {
            ok: false,
            content: `"${app}" cannot do that on this device — it is not installed, or it does not accept this. The ONLY apps that can are: ${elenco}. ⛔ Tell the user exactly that, naming only apps from this list. Never suggest an app that is not in it.`,
            code: 'TALOS_INTENTO_APP_NON_ADATTA',
        }
    }
    const aperta = await talosPercorri(generica.via, valori, scelta.pacchetto)
    if (!aperta) {
        return {
            ok: false,
            content: `${scelta.nome} said it could do that, but refused to open. Nothing happened.`,
            code: 'TALOS_INTENTO_RIFIUTATO',
        }
    }
    /*
     * ⛔ «Aperta» vuol dire «il sistema ha accettato l'intent», e non basta.
     * MISURATO sul Pad il 2026-08-13: Spotify DICHIARA `ACTION_SEARCH` e poi va
     * in `Fatal signal 11 (SIGSEGV)` — l'intent è accettato, l'app muore, e chi
     * si fidasse direbbe «fatto» davanti a un launcher vuoto.
     *
     * ⛔⛔ MA LA PRIMA VERSIONE DI QUESTA GUARDIA ERA TROPPO SEVERA, e l'ha
     * dimostrato il dispositivo un'ora dopo. Chiesto «manda "appunto di prova"
     * a Keep»: Keep si apre come **finestra sopra TALOS** — `mCurrentFocus`
     * diceva `com.google.android.keep/.ShareReceiverActivity`, il testo era
     * DENTRO, col pulsante Salva — e l'occhio vedeva ancora noi. TALOS ha
     * risposto «Keep non è riuscita a ricevere il testo»: **falso**, detto con
     * sicurezza, davanti alla prova del contrario a schermo.
     *
     * ⇒ La regola giusta separa TRE casi, non due:
     * - davanti c'è l'app → **riuscito**;
     * - davanti c'è il launcher, o un'app terza → **fallito** (è il caso Spotify);
     * - davanti ci siamo NOI, o non si può sapere → **non lo so**, e «non lo so»
     *   non è «no»: l'intent è stato accettato e non abbiamo prove contrarie.
     */
    // ⛔ I giri lunghi: quattro (1,4 s) accuserebbero di «non essersi aperta»
    // un'app che si sta aprendo — vedi `GIRI_APERTURA`.
    const davanti = await talosDavantiFinche(scelta.pacchetto, GIRI_APERTURA)
    const nostroGuscio = davanti === '' || davanti === null || davanti.startsWith('ai.talos')
    if (davanti !== scelta.pacchetto && !nostroGuscio) {
        return {
            ok: false,
            content: `${scelta.nome} accepted the request but is not on screen (${davanti} is) — it may have crashed or bounced back. Nothing was done. Tell the user what happened.`,
            code: 'TALOS_INTENTO_NON_ARRIVATA',
        }
    }
    /*
     * ⛔ `esce: null` = **non si sa**. Mandare un testo a Keep resta nel
     * telefono, mandarlo a Gmail no, e questa capacità non può distinguerli.
     * ⇒ Non si dice «inviato» — si dice dov'è arrivato, e si lascia decidere.
     */
    /*
     * ⛔⛔ E SE NON ABBIAMO POTUTO GUARDARE, non si dice «è aperta».
     *
     * `davanti === null` vuol dire `sipuoSapere:false` — col ponte spento TALOS
     * è cieco. Qui finiva nello stesso ramo di «l'ho vista davanti» e la frase
     * usciva affermativa: **«is open with the search»**, cioè un successo che
     * nessuno ha verificato. È lo stesso confine fra «premuto» e «partito» che
     * l'ultimo centimetro difende per gli invii, e che il ramo delle capacità
     * note ha imparato il 2026-08-15 — qui mancava ancora.
     */
    const cieco = davanti === null
    return {
        ok: true,
        content: cieco
            ? `TALOS handed the request to ${scelta.nome} and the device accepted it, but TALOS could NOT look at the screen to confirm — its privileged access is not connected, not because anything failed. Say you asked ${scelta.nome} to open it and that you cannot see the screen to confirm; never claim it is open or that anything was sent.`
            : generica.esce === false
                ? `${scelta.nome} is open with the search.`
                : `${scelta.nome} is open with the text already in it. It is NOT sent — TALOS cannot know whether this app sends by itself. Tell the user it is ready in ${scelta.nome} and never claim it was sent.`,
    }
}

/**
 * Chi è in primo piano adesso, o `null` se **non si può sapere**.
 *
 * ⛔ I due casi non si appiattiscono: senza l'occhio la risposta è «non lo so»,
 * e chi la leggesse come «non c'è nessuno» accuserebbe l'app di non essere
 * arrivata proprio quando non abbiamo modo di guardare.
 */
async function talosChiEDavanti(): Promise<string | null> {
    return await TalosSchermoBridge.chiEDavanti()
        .then((r) => (r.sipuoSapere ? r.pacchetto : null), () => null)
}

/**
 * Aspetta un po' che l'app ATTESA arrivi davanti, poi riferisce chi c'è.
 *
 * ⛔ Non è un `sleep`: si esce **appena** l'app è arrivata, e i tentativi
 * servono solo perché un'app fredda ci mette qualche decimo. Un controllo
 * istantaneo dopo l'intent fotografa il momento sbagliato e accusa un'app che
 * stava semplicemente aprendosi.
 */
/**
 * ⛔ Quanti giri per un'app che si sta APRENDO, contro i quattro di un'app che
 * è già a schermo.
 *
 * I quattro giri (1,4 s) bastano a chi controlla un'app **già aperta** dopo un
 * tocco. Non bastano a chi ne apre una da ferma: MISURATO, `wa.me` porta
 * WhatsApp in primo piano col testo dentro in **~4 s** da fredda, e su questo
 * Pad Spotify ci ha messo 9 s solo di `dexopt`.
 *
 * ⇒ Con quattro giri diremmo «non si è aperta» a un'app che si stava aprendo —
 * la bugia opposta, e altrettanto sicura di sé.
 *
 * ⛔ Tredici: l'ULTIMO controllo cade a **4,2 s**, cioè oltre i ~4 s misurati.
 * Il numero deve stare sopra l'avvio a freddo, se no il verdetto è sbagliato;
 * e ogni giro in più è tempo che una persona aspetta per sentirsi dire che
 * qualcosa NON è successo. Chi si apre esce al primo giro utile e non paga
 * niente.
 */
const GIRI_APERTURA = 13

async function talosDavantiFinche(atteso: string, giri = 4): Promise<string | null> {
    let visto: string | null = null
    for (let giro = 0; giro < giri; giro++) {
        visto = await talosChiEDavanti()
        if (visto === atteso) return visto
        // ⛔ Dopo l'ultimo controllo non si aspetta: quell'attesa non cambia
        // nessuna risposta, la fa solo arrivare più tardi.
        if (giro < giri - 1) await new Promise((r) => setTimeout(r, 350))
    }
    return visto
}

/**
 * ⭐⭐⭐ L'ULTIMO CENTIMETRO — e la differenza fra «premuto» e «partito».
 *
 * ## ⛔ Perché tre esiti e non due
 *
 * `performAction` che risponde `true` vuol dire «il click è stato consegnato».
 * Il messaggio può essere partito o no. Se qui si dicesse «inviato» sulla fede
 * del click, si ricadrebbe esattamente nel difetto che l'owner ha nominato il
 * 13 agosto — «TALOS NON HA INVIATO IL MESSAGGIO» — solo che stavolta TALOS lo
 * direbbe con sicurezza.
 *
 * ⇒ La prova è la SCOMPARSA del controllo d'invio, misurata nei due versi.
 *
 * ## ⛔⛔ E il caso «premuto ma non confermato» NON si riprova
 *
 * È l'unico ramo dove `ok: false` sarebbe pericoloso: il modello leggerebbe
 * «non fatto» e richiamerebbe il tool, e se il primo invio era andato a buon
 * fine la persona vera riceverebbe il messaggio **due volte**. Un dubbio si
 * dice; non si risolve rifacendo una cosa che non si annulla.
 */
async function talosUltimoCentimetro(
    capacita: TalosCapacitaIntent,
    valori: Readonly<Record<string, string>>,
): Promise<TalosToolResult> {
    const invio = capacita.invio
    if (!invio) return { ok: true, content: `${capacita.app} is open.` }
    const esito = await TalosSchermoBridge.premiPulsante({
        ...(invio.viewId ? { viewId: invio.viewId } : {}),
        ...(invio.descrizioni ? { descrizioni: invio.descrizioni } : {}),
        pacchetto: capacita.pacchetto,
        /*
         * ⛔ La guardia sul testo esiste SOLO dove c'è un testo. Una chiamata
         * non ne ha, e pretenderne uno la bloccherebbe per sempre. Ma dove il
         * testo c'è, `contenuto` è obbligatorio — `nessunInvioSenzaGuardia` in
         * `registro.test.ts` lo pretende — perché senza partirebbe la bozza
         * vecchia.
         */
        ...(invio.contenuto ? { testoAtteso: valori[invio.contenuto] ?? '' } : {}),
        attesaMs: ATTESA_APP_MS,
    // ⛔ Il ponte che non risponde è un ESITO, non un'eccezione da ingoiare: ha
    // una sua riga nella tabella qui sotto, e la persona sente cosa è successo.
    }).catch((): TalosEsitoInvio => ({ fatto: false, motivo: 'ponte-chiuso' }))

    /*
     * ⭐⭐ IL SECONDO PASSO, quando è l'APP a chiederlo.
     *
     * MISURATO sul Pad: premuto «Chiamata vocale», `click=true`, e la chiamata
     * non parte — WhatsApp apre «Avviare una chiamata vocale?» con *Annulla* e
     * *Chiama*. L'ultimo centimetro era lungo due passi.
     *
     * ⛔ Si preme SOLO se la finestra c'è davvero: `premiPulsante` non trova
     * niente e non tocca niente, come sempre. Non è «riprova a caso»: è la
     * conferma dichiarata nel registro, quindi si sa cosa si sta confermando.
     */
    if (esito.fatto && invio.confermaApp) {
        const secondo = await TalosSchermoBridge.confermaDialogo({
            pacchetto: capacita.pacchetto,
            attesaMs: 4_000,
        }).catch(() => ({ fatto: false, motivo: 'ponte-chiuso', sparito: false, domanda: '' }))
        if (!secondo.fatto) {
            return {
                ok: true,
                content: `TALOS started the action in ${capacita.app}, but could not complete a confirmation (${secondo.motivo ?? 'unknown'}). It is NOT done. Tell the user to look at the screen: if a confirmation is showing, one tap finishes it.`,
            }
        }
        /*
         * ⭐ La domanda dell'app viaggia con l'esito, e non è decorazione: è
         * l'unica cosa che rende onesto il «confermato». TALOS ha letto cosa
         * stava confermando, e chi legge può verificarlo.
         */
        const domanda = secondo.domanda ? ` It confirmed: "${secondo.domanda}".` : ''
        return {
            ok: true,
            content: secondo.sparito
                ? `Done.${domanda} The confirmation closed, so it went through. Say it is done, in one short sentence.`
                : `TALOS confirmed it in ${capacita.app}${domanda} but could not verify it closed. Tell the user exactly that and ask them to check. ⛔ Do NOT do it again: it may already have gone through.`,
        }
    }
    /*
     * ⭐⭐⭐ LA FINALIZZAZIONE DELL'OBIETTIVO — owner 2026-08-15: «"invio un
     * messaggio a Shadina" non significa che l'abbia inviato veramente».
     *
     * Il nativo adesso conta TRE prove indipendenti invece di guardarne una:
     * il campo si è svuotato, il testo è MIGRATO in un nodo non modificabile
     * (cioè è diventato un pezzo di conversazione), il pulsante è sparito. Il
     * disegno per esteso sta in `TalosObiettivoFinito.kt`.
     *
     * ⛔ Tre esiti e non due, e la differenza la legge la persona:
     *
     *   PARTITO         due prove su tre → si può dire «inviato»
     *   NON_PARTITO     il campo è ancora pieno → certezza NEGATIVA, e va detta
     *   NON_CONFERMATO  una prova sola → «guarda tu», che è una risposta vera
     *
     * ⛔ `NON_PARTITO` è l'unico caso in cui riprovare è sicuro: se il testo è
     * ancora nel campo, quel messaggio non è uscito. Negli altri due il retry
     * può mandarlo due volte, e un messaggio doppio a una persona vera non si
     * annulla.
     */
    if (esito.fatto && esito.obiettivo === 'PARTITO') {
        return {
            ok: true,
            content: `Sent — verified. TALOS pressed send in ${capacita.app} and ${esito.prove} independent checks agree: the input field is empty and the text is now part of the conversation. Tell the user it is sent, in one short sentence.`,
        }
    }
    if (esito.fatto && esito.obiettivo === 'NON_PARTITO') {
        return {
            ok: true,
            content: `NOT sent. TALOS pressed send in ${capacita.app}, but the text is STILL in the input field — so nothing left. Tell the user plainly that it did not go, and offer to try again. This is the one case where trying again is safe.`,
        }
    }
    if (esito.fatto) {
        return {
            ok: true,
            content: `TALOS pressed send in ${capacita.app}, and only ${esito.prove} of 3 checks confirm it (field empty: ${esito.campoSvuotato}, text now in the conversation: ${esito.testoMigrato}). Tell the user exactly that and ask them to check the chat. ⛔ Do NOT press send again and do NOT call this tool again for this message: it may already have gone through, and a retry would send it twice.`,
        }
    }
    // Da qui in giù NON è stato premuto niente: riprovare è sicuro.
    const spiegazione: Record<string, string> = {
        'occhio-chiuso': `${capacita.app} is open with the text already filled in, but TALOS cannot press send: the screen-reading permission is off. Nothing was sent. Offer to open its settings page with device_open_settings, then say one tap on send finishes it.`,
        'app-non-in-primo-piano': `The link opened, but ${capacita.app} is not the app on screen${esito.pacchettoVisto ? ` (it is ${esito.pacchettoVisto})` : ''} — probably an app-chooser or another app answered the link. Nothing was sent. Tell the user what is on screen and ask how to proceed.`,
        'testo-non-arrivato': `${capacita.app} opened but the text never appeared in its input field, so TALOS did not press send — pressing blind could have sent something else. Nothing was sent. Tell the user and offer to try again.`,
        'non-trovato': `${capacita.app} is open with the text ready, but TALOS could not find the send button, so it pressed nothing. Nothing was sent. Tell the user it is ready and that one tap on send finishes it.`,
        'ponte-chiuso': `${capacita.app} is open with the text ready, but TALOS could not reach the screen service to press send. Nothing was sent. Tell the user one tap finishes it.`,
    }
    return {
        ok: false,
        content: spiegazione[esito.motivo ?? ''] ?? `${capacita.app} is open with the text ready, but the send step did not run (${esito.motivo ?? 'unknown'}). Nothing was sent.`,
        code: `TALOS_INVIO_${(esito.motivo ?? 'sconosciuto').toUpperCase().replace(/-/g, '_')}`,
    }
}

/** Da dove il tool prende i file che si possono mandare. */
export interface TalosFontiFile {
    fileDellaLibreria(): Promise<readonly TalosFileMandabile[]>
    /**
     * ⭐⭐ La SECONDA sorgente — owner 2026-08-13: «inviare un file che abbiamo
     * nella memoria, salvato nel dispositivo, e inviarlo dove voglio noi».
     *
     * ⛔ Apre il selettore di SISTEMA e aspetta che la persona scelga. Non è
     * una scorciatoia: per un file dentro `MediaStore.Downloads` che l'app non
     * ha creato, Android **obbliga** a passare di lì — nessuna query lo trova.
     * E per foto e video la query esisterebbe, ma vuole `READ_MEDIA_*`, cioè
     * l'intera libreria di immagini della persona per mandarne una.
     *
     * ⇒ Il gesto della persona È il permesso, e regge per ogni tipo di file.
     * Rende `null` se ha annullato: annullare non è un errore.
     */
    fileDalTelefono?(): Promise<{ nome: string, tipo: string, uri: string } | null>
}

/**
 * ⭐⭐⭐ MANDARE UN FILE — owner 2026-08-13.
 *
 * > «si possa dire alla chat di inviare un file della libreria via social media
 * > o app di messaggistica»
 *
 * ## Le tre domande, in quest'ordine, e nessuna si indovina
 *
 * 1. **quale file** — dalla libreria vera, con tre esiti (trovato / ambiguo /
 *    nessuno), perché scegliere a caso significa mandare il file sbagliato a
 *    una persona vera;
 * 2. **chi può riceverlo** — si chiede al TELEFONO con `chiAccetta` sul MIME di
 *    QUEL file: con un'immagine l'elenco è diverso che con un testo, e una
 *    tabella scritta a mano invecchia (diceva `org.telegram.messenger` mentre
 *    sul Pad c'è Telegram X);
 * 3. **a quale app** — l'etichetta che ha detto la persona, confrontata con
 *    quell'elenco.
 *
 * ⛔ Senza `app`, l'elenco torna con `ok: true` e il divieto esplicito di
 * nominarne altre. Un elenco vero dentro un `ok:false` ha già fatto inventare
 * al modello app non installate: gli esiti sono TRE, non due.
 */
/**
 * ⭐⭐⭐ IL DESTINATARIO — owner 2026-08-13, fase 1.
 *
 * ## Il difetto che la fa nascere, misurato
 *
 * `invia_file` funzionava e non sapeva A CHI: si finiva sul selettore dei
 * contatti di WhatsApp e la persona doveva chiudere il lavoro a mano. E non
 * avendo un campo per il destinatario, il modello infilava il nome nel TESTO —
 * la scheda diceva `TESTO: Antonino Rizzo`, e il file sarebbe partito con
 * quella frase dentro.
 *
 * ## Tre esiti, come per ogni cosa che raggiunge una persona
 *
 * `talosRisolviContatto` ne ha cinque e qui contano tutti: `uno` porta il JID,
 * `molti` è una domanda legittima (due contatti che si chiamano quasi uguale
 * sono due persone vere), e gli altri tre spiegano perché non si può.
 *
 * ⛔ Senza contatto NON è un errore: si finisce sul selettore, che è la strada
 * che già funziona. Il destinatario è un miglioramento, non un requisito.
 */
async function talosDestinatario(
    nome: string | undefined,
): Promise<{ jid?: string, chiedi?: string }> {
    if (!nome?.trim()) return {}
    const esito = await talosRisolviContatto(nome)
    if (esito.stato === 'uno') {
        /*
         * ⛔ Il JID vuole il numero SENZA `+`, spazi o trattini: la rubrica lo
         * rende come lo ha scritto la persona («+39 392 725 6893»), e passarlo
         * così porterebbe a una chat che non esiste — cioè a un file consegnato
         * a nessuno, con l'aria di essere partito.
         */
        /*
         * ⛔ UN contatto può avere PIÙ NUMERI — casa, lavoro, il vecchio. Il
         * primo dell'elenco non è «quello giusto»: è solo il primo. Sceglierlo
         * in silenzio è lo stesso errore del file preso a caso, con la stessa
         * conseguenza — un file consegnato alla persona sbagliata.
         */
        const numeri = esito.contatto.numeri.filter((n) => n.replace(/\D/g, '').length >= 6)
        if (numeri.length === 0) {
            return { chiedi: `"${nome}" has no usable phone number saved. Ask the user.` }
        }
        if (numeri.length > 1) {
            return { chiedi: `"${nome}" has more than one number: ${numeri.join(', ')}. Ask which one. Nothing was sent.` }
        }
        return { jid: `${numeri[0]!.replace(/\D/g, '')}@s.whatsapp.net` }
    }
    if (esito.stato === 'molti') {
        return { chiedi: `More than one contact matches "${nome}": ${
            esito.trovati.map((c) => c.nome).join(', ')
        }. Ask which one, naming ONLY these. Nothing was sent.` }
    }
    if (esito.stato === 'nessuno') {
        return { chiedi: `No contact named "${nome}". Ask the user; do not invent a number.` }
    }
    /*
     * ⛔ Permesso mancante o ponte chiuso: NON si blocca l'invio. Si va avanti
     * senza destinatario e si finisce sul selettore — dove la persona sceglie
     * comunque, in un tocco. Rifiutare qui vorrebbe dire togliere una funzione
     * che funziona per colpa di un permesso che serviva solo a migliorarla.
     */
    return {}
}

/**
 * ⭐⭐⭐ L'ULTIMO CENTIMETRO DEL FILE — e la differenza fra preparare e fare.
 *
 * Il file e' allegato nella chat giusta e resta un tocco. Quel tocco e' tutta la
 * distanza fra «TALOS prepara» e «TALOS fa», ed e' esattamente la riga su cui il
 * confronto con Gemini si vince o si perde.
 *
 * ## ⛔ Si preme SOLO con tutte e tre
 *
 * 1. la persona non ha chiesto una bozza (`invia !== false`);
 * 2. il destinatario e' stato risolto — senza, siamo sul selettore dei contatti
 *    e premere «invia» la' significherebbe mandare a chi capita;
 * 3. l'app ha una riga MISURATA per il suo pulsante. Senza, non si tocca niente.
 *
 * ⛔ E la prova che e' partito NON e' il click: e' la SCOMPARSA del pulsante,
 * che `premiPulsante` verifica da se'. Un click riuscito su un pulsante che
 * resta li' vuol dire che non e' successo niente.
 */
async function talosPremiInvioFile(
    pacchetto: string,
    nomeApp: string,
    nomeFile: string,
    invia: boolean | undefined,
    destinatarioRisolto: boolean,
): Promise<TalosToolResult> {
    const pronto = `"${nomeFile}" is now attached in ${nomeApp}, ready to send. It has NOT been sent yet: say so, and do not claim it was sent.`
    if (invia === false || !destinatarioRisolto) return { ok: true, content: pronto, contentOrigin: 'user-direct' }
    const riga = talosInvioPerPacchetto(pacchetto)
    if (!riga?.viewId) return { ok: true, content: pronto, contentOrigin: 'user-direct' }
    const esito = await TalosSchermoBridge.premiPulsante({
        viewId: riga.viewId,
        ...(riga.descrizioni ? { descrizioni: riga.descrizioni } : {}),
        pacchetto,
        attesaMs: ATTESA_APP_MS,
    }).catch((): TalosEsitoInvio => ({ fatto: false, motivo: 'ponte-chiuso' }))
    if (esito.fatto && esito.sparito) {
        return {
            ok: true,
            content: `"${nomeFile}" was SENT in ${nomeApp}: the send button is gone, which is the proof.`,
            contentOrigin: 'user-direct',
        }
    }
    if (esito.fatto) {
        /*
         * ⛔ Premuto e il pulsante e' ancora li'. NON si ripreme: se invece era
         * partito, il secondo tocco manderebbe il file DUE volte. Il dubbio si
         * dice, non si risolve rifacendo — e' la stessa regola del messaggio.
         */
        return {
            ok: true,
            content: `TALOS pressed send for "${nomeFile}" in ${nomeApp}, but could not confirm it left. Ask the user to look; do NOT press again, it would send it twice.`,
            contentOrigin: 'user-direct',
        }
    }
    const perche: Record<string, string> = {
        'occhio-chiuso': `${nomeApp} has "${nomeFile}" attached and ready, but TALOS cannot press send: the screen-reading permission is off. Nothing was sent. Offer to open its settings page with device_open_settings.`,
        'app-non-in-primo-piano': `${nomeApp} is not in front any more, so TALOS did not press anything. The file is attached: one tap on send finishes it.`,
    }
    return {
        ok: true,
        content: perche[esito.motivo ?? ''] ?? `${pronto} (send step: ${esito.motivo ?? 'unknown'})`,
        contentOrigin: 'user-direct',
        senzaEffetto: true,
    }
}

function talosToolInviaFile(fonti: TalosFontiFile): TalosToolDefinition<never> {
    return defineTalosTool({
        name: 'invia_file',
        action: 'write',
        requiredActions: ['write', 'outbound'],
        // ⛔ Non più «Library»: da oggi manda anche i file del telefono, e un
        // titolo che nomina una sola sorgente insegna al modello che l'altra
        // non esiste.
        title: 'Send a file',
        /*
         * ⛔ CORTA di proposito. Ogni byte di schema viaggia in OGNI messaggio,
         * e il tetto complessivo è 42.000: la prima stesura ne costava 880 e
         * sfondava. Quello che resta è ciò che il modello non può dedurre.
         */
        description: [
            '"file" is matched against the real Library; if several match, ask instead of',
            'guessing. Omit "app" to list the apps that accept it.',
        ].join(' '),
        input: z.object({
            /*
             * ⛔ NON obbligatorio, e la prova sul dispositivo l'ha detto: con
             * `dal_telefono` il nome del file NON si sa — lo saprà solo dopo
             * che la persona avrà scelto nel selettore. Preteso qui, il tool
             * era inutilizzabile per la sua seconda sorgente.
             */
            file: z.string().optional().describe('As the user named it.'),
            app: z.string().optional().describe('Destination app; omit to list them.'),
            testo: z.string().optional().describe('Optional message.'),
            dal_telefono: z.boolean().optional().describe('On the phone, not the Library.'),
            contatto: z.string().optional().describe('Who to send it to.'),
            invia: z.boolean().optional().describe('False = prepare only. Omitted = send.'),
        }),
        async run(input): Promise<TalosToolResult> {
            /*
             * ⛔⛔ LA SECONDA SORGENTE, e passa PRIMA della libreria.
             *
             * Chi dice «dal telefono» ha già detto dove cercare: andare comunque
             * in libreria vorrebbe dire trovarci un omonimo e mandare quello.
             */
            if (input.dal_telefono) {
                if (!fonti.fileDalTelefono) {
                    return {
                        ok: false,
                        content: 'This build cannot open the phone file picker. Nothing was sent.',
                        code: 'TALOS_FILE_NIENTE_SELETTORE',
                    }
                }
                const scelto = await fonti.fileDalTelefono()
                if (!scelto) {
                    /*
                     * ⛔ Annullare NON è un errore, ed è la differenza che
                     * conta: un `ok:false` qui farebbe riprovare il modello,
                     * cioè riaprirebbe il selettore addosso a chi l'ha appena
                     * chiuso.
                     */
                    return {
                        ok: true,
                        content: 'The user closed the file picker without choosing. Nothing was sent. Do not open it again unless they ask.',
                        contentOrigin: 'user-direct',
                        senzaEffetto: true,
                    }
                }
                const dove = await TalosDeviceBridge.chiAccetta({
                    azione: 'android.intent.action.SEND',
                    tipo: scelto.tipo,
                }).then((r) => r.app, () => [])
                const bersaglioTel = input.app ? talosScegliApp(dove, input.app) : null
                if (!bersaglioTel) {
                    return {
                        ok: true,
                        content: dove.length === 0
                            ? `No app on this phone can receive a ${scelto.tipo} file. Nothing was sent.`
                            : `"${scelto.nome}" is ready. On THIS phone these apps can receive it: ${
                                dove.map((a) => a.nome || a.pacchetto).join(', ')
                            }. Ask the user which one, naming ONLY these. Nothing was sent yet.`,
                        contentOrigin: 'user-direct',
                        senzaEffetto: true,
                        evidence: { file: scelto.nome, tipo: scelto.tipo, app: dove.map((a) => a.pacchetto) },
                    }
                }
                const aChiTel = await talosDestinatario(input.contatto)
                if (aChiTel.chiedi) {
                    return { ok: true, content: aChiTel.chiedi, contentOrigin: 'user-direct', senzaEffetto: true }
                }
                const esitoTel = await TalosDeviceBridge.condividiUri({
                    uri: scelto.uri,
                    tipo: scelto.tipo,
                    pacchetto: bersaglioTel.pacchetto,
                    ...(input.testo ? { testo: input.testo } : {}),
                    ...(aChiTel.jid ? { destinatario: aChiTel.jid } : {}),
                })
                if (!esitoTel.done) {
                    return {
                        ok: false,
                        content: `The file could not be handed to ${bersaglioTel.nome} (${esitoTel.reason ?? 'unknown'}). Nothing was sent.`,
                        code: `TALOS_FILE_${(esitoTel.reason ?? 'sconosciuto').toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                const finaleTel = await talosPremiInvioFile(
                    bersaglioTel.pacchetto, bersaglioTel.nome, scelto.nome, input.invia, !!aChiTel.jid,
                )
                return {
                    ...finaleTel,
                    evidence: { file: scelto.nome, tipo: scelto.tipo, app: bersaglioTel.pacchetto },
                }
            }
            if (!input.file?.trim()) {
                return {
                    ok: true,
                    content: 'Which file? Say the name, or say it is on the phone and the picker opens. Nothing was sent.',
                    contentOrigin: 'user-direct',
                    senzaEffetto: true,
                }
            }
            const file = await fonti.fileDellaLibreria()
            const scelta = talosScegliFile(file, input.file)
            if (scelta.esito === 'nessuno') {
                /*
                 * ⛔ `ok: true` con l'elenco vero. Un `ok:false` che PORTA un
                 * elenco è la forma che fa inventare: il modello legge il
                 * fallimento, scarta il contenuto e si inventa i nomi.
                 */
                return {
                    ok: true,
                    content: scelta.cePero.length === 0
                        ? 'The Library is empty: there is no file to send. Tell the user, and do not invent one.'
                        : `No Library file matches that. These are the only files that exist: ${
                            scelta.cePero.map((f) => f.nome).join(', ')
                        }. Ask the user which one they meant, naming ONLY these. Do not invent a file name.`,
                    contentOrigin: 'user-direct',
                    senzaEffetto: true,
                    evidence: { cercato: input.file, presenti: scelta.cePero.map((f) => f.nome) },
                }
            }
            if (scelta.esito === 'ambiguo') {
                return {
                    ok: true,
                    content: `More than one Library file matches "${input.file}": ${
                        scelta.fra.map((f) => f.nome).join(', ')
                    }. Ask the user which one, naming ONLY these. Nothing was sent. Do NOT offer to pick one at random and do NOT pick one yourself: the files may differ and it goes to a real person.`,
                    contentOrigin: 'user-direct',
                    senzaEffetto: true,
                    evidence: { cercato: input.file, fra: scelta.fra.map((f) => f.nome) },
                }
            }
            const daMandare = scelta.file
            const accettano = await TalosDeviceBridge.chiAccetta({
                azione: 'android.intent.action.SEND',
                tipo: daMandare.tipo,
            }).then((r) => r.app, () => [])
            if (accettano.length === 0) {
                return {
                    ok: false,
                    content: `No app on this phone can receive a ${daMandare.tipo} file. Tell the user; do not invent one.`,
                    code: 'TALOS_FILE_NESSUNA_APP',
                }
            }
            const elenco = accettano.map((a) => a.nome || a.pacchetto).join(', ')
            if (!input.app) {
                return {
                    ok: true,
                    content: `"${daMandare.nome}" is ready to send. On THIS phone these apps can receive it: ${
                        elenco
                    }. Ask the user which one, naming ONLY these, then call again with "app". Nothing was sent yet.`,
                    contentOrigin: 'user-direct',
                    senzaEffetto: true,
                    evidence: { file: daMandare.nome, tipo: daMandare.tipo, app: accettano.map((a) => a.pacchetto) },
                }
            }
            const bersaglio = talosScegliApp(accettano, input.app)
            if (!bersaglio) {
                return {
                    ok: true,
                    content: `"${input.app}" is not among the apps that can receive "${daMandare.nome}". These can: ${
                        elenco
                    }. Ask the user to pick one of these. Nothing was sent.`,
                    contentOrigin: 'user-direct',
                    senzaEffetto: true,
                    evidence: { chiesta: input.app, possibili: accettano.map((a) => a.pacchetto) },
                }
            }
            const aChi = await talosDestinatario(input.contatto)
            if (aChi.chiedi) {
                return { ok: true, content: aChi.chiedi, contentOrigin: 'user-direct', senzaEffetto: true }
            }
            const esito = await TalosDeviceBridge.condividiFile({
                percorso: daMandare.percorso,
                // ⛔ Senza, il file arriva chiamandosi come l'id interno: il
                // primo invio riuscito e' comparso in WhatsApp come
                // `e2aaabf5-7e73-43df-aafb-50b9ca372bb1.md`.
                nome: daMandare.nome,
                tipo: daMandare.tipo,
                pacchetto: bersaglio.pacchetto,
                ...(input.testo ? { testo: input.testo } : {}),
                ...(aChi.jid ? { destinatario: aChi.jid } : {}),
            })
            if (!esito.done) {
                /*
                 * ⛔ Ogni motivo dice una cosa diversa, e due di questi sono
                 * difetti NOSTRI: dirli come «non riesco» li nasconderebbe.
                 */
                const spiegazione: Record<string, string> = {
                    'file-assente': `The Library lists "${daMandare.nome}" but the file is not on disk. Nothing was sent. Tell the user the file is missing.`,
                    'percorso-fuori': 'Refused: that path is outside the Library. Nothing was sent.',
                    'cartella-non-dichiarata': 'TALOS cannot hand this file over: its folder is not declared for sharing. This is a TALOS defect, not something the user can fix. Nothing was sent.',
                    'nessuno-lo-fa': `${bersaglio.nome} cannot receive this file after all. Nothing was sent.`,
                }
                return {
                    ok: false,
                    content: spiegazione[esito.reason ?? '']
                        ?? `The file could not be handed to ${bersaglio.nome} (${esito.reason ?? 'unknown'}). Nothing was sent.`,
                    code: `TALOS_FILE_${(esito.reason ?? 'sconosciuto').toUpperCase().replace(/-/g, '_')}`,
                }
            }
            /*
             * ⛔ «Consegnato» NON è «inviato», e la differenza è tutta.
             *
             * L'app di destinazione si è aperta con il file allegato: l'invio
             * vero è il tocco dopo. Dirlo qui è ciò che impedisce la bugia che
             * è costata la giornata — «Messaggio inviato» detto su un'azione
             * che non era ancora avvenuta.
             */
            const finale = await talosPremiInvioFile(
                bersaglio.pacchetto, bersaglio.nome, daMandare.nome, input.invia, !!aChi.jid,
            )
            return {
                ...finale,
                evidence: {
                    file: daMandare.nome,
                    tipo: daMandare.tipo,
                    app: bersaglio.pacchetto,
                    uri: esito.uri ?? null,
                },
            }
        },
    // `never` è il tipo dell'INPUT nell'elenco: lo stesso cast che usa il tool
    // accanto, per la stessa ragione — l'elenco è eterogeneo per costruzione.
    }) as TalosToolDefinition<never>
}

export function talosIntentiTools(
    fonti?: TalosFontiFile,
): readonly TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'app_azione',
            action: 'write',
            requiredActions: ['write', 'outbound'],
            title: 'Do something in another app, directly',
            description: [
                'Perform an action in another app WITHOUT driving the screen: messaging,',
                'calling, navigating, searching. This is the FAST and reliable path and',
                'must be preferred over device_screen_drive whenever the capability exists.',
                /*
                 * ⛔⛔ I NOMI DEI PARAMETRI SI DICHIARANO, non si fanno indovinare.
                 *
                 * MISURATO sul Pad il 2026-08-13: il modello ha chiamato
                 * `whatsapp_messaggio` con `{"messaggio": "ciao"}` mentre la
                 * capacità dichiara `testo`. Con un nome sbagliato il valore
                 * non entra nell'URI e WhatsApp si apre col campo VUOTO — un
                 * fallimento che sembra un successo, perché l'app si apre.
                 *
                 * ⇒ L'elenco esatto viene generato dal registro, così non può
                 * divergere: la descrizione dice `whatsapp_messaggio(numero,
                 * testo)`, e non c'è più niente da indovinare.
                 */
                `Capabilities and their EXACT parameter names: ${
                    TALOS_CAPACITA_INTENT.map((c) => `${c.id}(${c.parametri.join(', ')})`).join('; ')
                }.`,
                'Use those parameter names verbatim inside "valori" — a different name is dropped silently.',
                'For messaging capabilities pass either "contatto" (a person name, resolved',
                'against the phone book) or the raw recipient parameter. Never invent a',
                'phone number: if the name cannot be resolved, say so and ask.',
                /*
                 * ⛔ SI DICHIARA, non si deduce dal verbo che ha usato la
                 * persona. «Scrivi ad Antonino che arrivo» e «prepara un
                 * messaggio per Antonino» sono due intenzioni diverse, e
                 * indovinare quale sia vuol dire mandare per sbaglio un
                 * messaggio a una persona vera — che non si annulla.
                 */
                'For messaging capabilities TALOS also presses send by itself: this is what',
                'makes it as fast as Gemini. Pass "invia": false ONLY when the user asked to',
                'draft/prepare without sending. Omitting it means SEND.',
                /*
                 * ⭐⭐⭐ LE DUE GENERICHE — owner 2026-08-13: «la chat ha già
                 * una lista delle applicazioni esistenti, dobbiamo fare in modo
                 * che chiami in quelle e non usi delle righe generiche».
                 *
                 * Il modello NON deve indovinare se un'app le accetta: chiama
                 * senza "app" e riceve l'elenco vero di chi lo sa fare su
                 * QUESTO telefono. È la stessa cortesia che gli facciamo coi
                 * nomi dei parametri, e per la stessa ragione misurata.
                 */
                'Two capabilities work with ANY installed app, not from a fixed list:',
                '"manda_testo_a_app"(testo) puts a text into an app, and',
                '"cerca_dentro_app"(cosa) searches inside an app.',
                'For these pass "app" with the app name the user said. If you are not sure',
                'which apps can do it on THIS phone, call without "app": the answer lists',
                'exactly the ones that can, and you can then ask the user to pick.',
            ].join(' '),
            input: z.object({
                capacita: z.enum(ID_CAPACITA),
                app: z.string().min(2).max(60).optional(),
                contatto: z.string().min(2).max(80).optional(),
                valori: z.record(z.string(), z.string().max(2000)).optional(),
                invia: z.boolean().optional(),
            }),
            /*
             * ⛔ `always`: alcune di queste capacità mandano un messaggio a una
             * persona vera, e quello non si annulla. La scheda mostra COSA sta
             * per uscire e a CHI, com'è la scheda di Gemini — che in più lascia
             * modificare il testo, ed è il punto in cui lo superiamo.
             */
            confirmation: 'always',
            async run(input) {
                // ⭐ Prima le generiche: non hanno un'app propria, la chiedono
                // al dispositivo. Vengono prima perché non toccano la rubrica.
                const generica = talosCapacitaGenerica(input.capacita)
                if (generica) {
                    return await talosCapacitaSulDispositivo(
                        generica,
                        input.app,
                        { ...(input.valori ?? {}) },
                    )
                }
                const capacita = talosCapacita(input.capacita)
                if (!capacita) {
                    return {
                        ok: false,
                        content: `Unknown capability. Valid: ${ID_CAPACITA.join(', ')}.`,
                        code: 'TALOS_INTENTO_SCONOSCIUTO',
                    }
                }
                const valori: Record<string, string> = { ...(input.valori ?? {}) }

                /*
                 * ⛔ Il nome diventa un numero QUI, non nel modello.
                 *
                 * Un modello che «ricorda» un recapito lo sta inventando: i
                 * numeri stanno in rubrica, e chiederli al telefono è l'unico
                 * modo per non spedire a uno sconosciuto.
                 */
                if (input.contatto) {
                    const esito = await talosRisolviContatto(input.contatto)
                    if (esito.stato === 'permesso-mancante') {
                        return {
                            ok: false,
                            content: 'TALOS cannot read the phone book yet: the contacts permission is off. Offer to enable it; do not invent a number.',
                            code: 'TALOS_RUBRICA_SENZA_PERMESSO',
                        }
                    }
                    if (esito.stato === 'ponte-chiuso') {
                        return {
                            ok: false,
                            content: 'The phone book could not be read on this device.',
                            code: 'TALOS_RUBRICA_PONTE_CHIUSO',
                        }
                    }
                    if (esito.stato === 'nessuno') {
                        return {
                            ok: false,
                            content: `No contact matches "${input.contatto}". Ask the user for the exact name; do not guess a number.`,
                            code: 'TALOS_RUBRICA_NESSUNO',
                        }
                    }
                    if (esito.stato === 'molti') {
                        // ⛔ Si riportano i NOMI, mai i numeri: la scelta la fa
                        // la persona, e un recapito in un prompt è un recapito
                        // che esce dal telefono.
                        const nomi = esito.trovati.map((c) => c.nome).join(', ')
                        return {
                            ok: false,
                            content: `More than one contact matches "${input.contatto}": ${nomi}. Ask which one.`,
                            code: 'TALOS_RUBRICA_AMBIGUO',
                        }
                    }
                    // Il primo parametro della capacità è il destinatario.
                    valori[capacita.parametri[0]] = esito.contatto.numeri[0]
                }

                const mancanti = talosParametriMancanti(capacita, valori)
                if (mancanti.length > 0) {
                    return {
                        ok: false,
                        content: `Missing: ${mancanti.join(', ')}. Ask the user instead of guessing.`,
                        code: 'TALOS_INTENTO_INCOMPLETO',
                    }
                }

                /*
                 * ⛔ Si prova via per via, NELL'ORDINE DICHIARATO, e la prima
                 * che il sistema accetta vince. L'`https` è per primo apposta:
                 * se l'app manca, apre il web invece di fallire.
                 */
                const provate: string[] = []
                for (const via of capacita.vie) {
                    provate.push(via.tipo)
                    if (await talosPercorri(via, valori, capacita.pacchetto)) {
                        /*
                         * ⛔⛔ L'ULTIMO CENTIMETRO NON È COMPRESO NEL PREZZO.
                         *
                         * Owner 2026-08-13, mentre stavo per premere «invia» io
                         * via adb e chiamarlo risultato: «TALOS NON HA INVIATO
                         * IL MESSAGGIO».
                         *
                         * MISURATO sul Pad: `https://wa.me/<n>?text=<t>` apre
                         * `com.whatsapp.Conversation` sulla chat giusta col
                         * testo GIÀ SCRITTO nel campo — e si ferma lì, perché
                         * WhatsApp compila e non spedisce, per progetto. Lo
                         * stesso vale per `smsto:` e `mailto:`.
                         *
                         * ⇒ Dire «fatto» qui sarebbe la bugia peggiore di
                         * tutte: la persona crede che il messaggio sia partito
                         * e non è partito. ⭐ Quindi l'ultimo centimetro lo fa
                         * TALOS, qui, subito: **intent per arrivare, occhio per
                         * l'ultimo centimetro** — un passo solo, invece dei
                         * venti del pilota. E si riporta cosa è successo
                         * davvero, non cosa speravamo.
                         */
                        /*
                         * ⭐ La riga nativa NON ha un ultimo centimetro: l'app
                         * ha già fatto la cosa. Chiedere all'occhio di premere
                         * qualcosa dopo vorrebbe dire cercare un pulsante su
                         * una schermata che nel frattempo è diventata un'altra.
                         */
                        if (via.tipo === 'riga-contatto') {
                            return {
                                ok: true,
                                content: `${capacita.app} did it directly through its own contact entry — no screen was driven. Say it is done, in one short sentence.`,
                            }
                        }
                        if (!capacita.esce) {
                            /*
                             * ⛔⛔⛔ «APERTA» SI DICE DOPO AVER GUARDATO.
                             *
                             * MISURATO sul Pad il 2026-08-14, «metti su Pink
                             * Floyd su Spotify»: l'intent è stato accettato,
                             * TALOS ha risposto **«Ho cercato i Pink Floyd su
                             * Spotify»** — e sullo schermo non era successo
                             * niente. In logcat, un secondo dopo la partenza:
                             *
                             *     ActivityRecord{… com.spotify.music/.SpotifyMainActivity … isExiting}
                             *     Activity top resumed state loss timeout
                             *
                             * L'app si era chiusa da sola (su questo Pad
                             * Spotify non parte nemmeno dal suo lanciatore).
                             *
                             * ⇒ `startActivity` che non solleva vuol dire «il
                             * sistema ha accettato la richiesta», NON «l'app ha
                             * fatto la cosa». È lo stesso confine fra «premuto»
                             * e «partito» che l'ultimo centimetro difende già
                             * per gli invii: qui mancava per le aperture.
                             *
                             * ⛔ E gli esiti sono TRE, non due — l'occhio può
                             * anche non esserci, e allora la risposta è «non lo
                             * so», che è diversa da «non è arrivata».
                             */
                            const davanti = await talosDavantiFinche(capacita.pacchetto, GIRI_APERTURA)
                            if (davanti === capacita.pacchetto) {
                                return {
                                    ok: true,
                                    content: `${capacita.app} is open and in the foreground — TALOS checked the screen. Say it is done, in one short sentence.`,
                                }
                            }
                            /*
                             * ⛔⛔ DUE «NON LO SO» DIVERSI, e uno ha una CURA.
                             *
                             * MISURATO sul Pad il 2026-08-15, chiesto «farmacie
                             * vicino a me»: Maps si è aperta con le farmacie —
                             * l'ho vista — e TALOS ha risposto «ho inviato la
                             * richiesta a Google Maps, ma **non sono riuscito a
                             * confermare l'apertura a schermo**». Chi legge
                             * conclude che è fallito, mentre dietro c'era la
                             * risposta giusta.
                             *
                             * Non era la finestra: MISURATO, Maps va davanti in
                             * **311 ms** e qui si aspetta fino a 4,2 s. Era che
                             * TALOS **non poteva guardare**: `chiEDavanti`
                             * risponde `sipuoSapere:false` col ponte spento
                             * (`adb_wifi_enabled = 0`), e quel `null` finiva
                             * nello stesso ramo di «ho guardato e non c'era».
                             *
                             * ⇒ Sono due cose diverse per chi ascolta: una si
                             * risolve riaccendendo il ponte, l'altra no. Dirle
                             * con la stessa frase toglie alla persona l'unica
                             * mossa che aveva.
                             */
                            if (davanti === null) {
                                return {
                                    ok: true,
                                    content: `TALOS handed the request to ${capacita.app} and the device accepted it. TALOS could NOT look at the screen to confirm, because its privileged access is not connected — not because anything failed. ⛔ Do NOT say you searched, played or opened the thing, and do NOT say it did not work. Say you asked ${capacita.app} to open it, that you cannot see the screen to confirm, and offer to open android.settings.APPLICATION_DEVELOPMENT_SETTINGS so they can reconnect it.`,
                                }
                            }
                            // ⛔ E qui invece TALOS HA guardato: c'era lui davanti,
                            // o nessuno. «Non lo so» non è «no», quindi non si
                            // accusa l'app — ma non si vanta nemmeno un successo.
                            if (davanti === '' || davanti.startsWith('ai.talos')) {
                                /*
                                 * ⛔⛔ LA RIGA DEVE TOGLIERE AL MODELLO LE PAROLE
                                 * DEL SUCCESSO, non solo chiedergli prudenza.
                                 *
                                 * MISURATO sul Pad il 2026-08-14: con «say it
                                 * was opened WITHOUT claiming you verified it»,
                                 * il modello ha risposto «Ho cercato i Queen su
                                 * Spotify» — una frase di successo pieno, con
                                 * lo schermo fermo. Aveva obbedito alla lettera
                                 * e mancato la sostanza.
                                 *
                                 * ⇒ Si dice cosa È SUCCESSO — la richiesta è
                                 * stata consegnata — e si vieta il verbo che
                                 * descrive il risultato. Una regola che lascia
                                 * in mano al modello la parola più comoda è una
                                 * regola che non regge.
                                 */
                                return {
                                    ok: true,
                                    content: `TALOS handed the request to ${capacita.app} and the device accepted it, but ${capacita.app} never appeared on screen while TALOS was watching. ⛔ Do NOT say you searched, played, opened or did the thing: you do not know that it happened. Say exactly that you asked ${capacita.app} to open it and could not confirm it came up.`,
                                }
                            }
                            return {
                                ok: false,
                                content: `The device accepted the request but ${capacita.app} did not come to the foreground — "${davanti}" is there instead. ⛔ Tell the user plainly that ${capacita.app} did not open, and do NOT say you did it. Do not invent a cause: you do not know why.`,
                                code: 'TALOS_INTENTO_NON_ARRIVATA',
                            }
                        }
                        if (input.invia === false) {
                            return {
                                ok: true,
                                content: `${capacita.app} is open with the recipient and the text already filled in, ready for the user to check. Nothing was sent — that is what they asked for. Do not send it now.`,
                            }
                        }
                        if (!capacita.invio) {
                            return {
                                ok: true,
                                content: `${capacita.app} is open with the recipient and the text already filled in. It is NOT sent — a link cannot send by itself in these apps, and TALOS has no verified way to press send in ${capacita.app}. Tell the user it is ready and that one tap finishes it. Never claim it was sent.`,
                            }
                        }
                        return await talosUltimoCentimetro(capacita, valori)
                    }
                }
                const installata = await TalosDeviceBridge
                    .appInstallata({ package: capacita.pacchetto })
                    .then((r) => r.presente, () => false)
                /*
                 * ⛔⛔ E QUI SI VIETA DI INVENTARE LA CAUSA — Pad, 2026-08-13.
                 *
                 * Con questo stesso esito, TALOS ha risposto alla persona: «il
                 * browser non riesce a raggiungere il sito tramite HTTPS…
                 * verifica che la connessione sia attiva… se c'è un firewall o
                 * un proxy». Niente di tutto ciò era vero, e la colpa finiva
                 * sul telefono di chi legge. Un modello a cui si dà un esito
                 * senza causa **la causa se la inventa**, ed è una spiegazione
                 * plausibile: la più difficile da smentire.
                 */
                return {
                    ok: false,
                    content: (installata
                        ? `${capacita.app} is installed but refused every route (${provate.join(', ')}).`
                        : `${capacita.app} is not installed on this device.`)
                        + ' ⛔ Report exactly this and nothing more. Do NOT invent a cause:'
                        + ' not the network, not a firewall or proxy, not the security settings,'
                        + ' not HTTPS. You do not know why, and guessing blames the user\'s phone'
                        + ' for something it did not do.',
                    code: installata ? 'TALOS_INTENTO_RIFIUTATO' : 'TALOS_INTENTO_APP_ASSENTE',
                }
            },
        }) as TalosToolDefinition<never>,
        /*
         * ⛔ IN FONDO, e l'ordine non è estetico: la guardia AGENT-TOOLS-01
         * confronta questo elenco con quello del pannello dei permessi POSIZIONE
         * PER POSIZIONE. Messo in cima, il test falliva con due elenchi della
         * stessa lunghezza e contenuto — il genere di rosso che si scambia per
         * un difetto vero.
         */
        ...(fonti ? [talosToolInviaFile(fonti)] : []),
    ]
}
