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
import { talosRisolviContatto } from '@/lib/intenti/rubrica'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import { TalosSchermoBridge, type TalosEsitoInvio } from '@/lib/device/ponteSchermo'
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
    return await TalosDeviceBridge
        .apriUri({ uri: talosConSchema(via, talosComponiUri(via, valori)) })
        .then((r) => r.done, () => false)
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
    const candidate = await TalosDeviceBridge.chiAccetta({
        azione: generica.via.azione,
        ...(generica.via.mime ? { tipo: generica.via.mime } : {}),
    }).then((r) => r.app, () => [])
    const elenco = candidate.map((a) => a.nome || a.pacchetto).join(', ')
    if (candidate.length === 0) {
        return {
            ok: false,
            content: 'No app on this device can do that. Tell the user; do not invent one.',
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
            content: `These ${candidate.length} apps — and ONLY these — can do that on this device: ${elenco}. This list comes from the phone itself, so it is the truth. ⛔ Do NOT name any other app, do not add apps you know from elsewhere, and do not guess: an app you name that is not in this list is not installed. Show the user this list and ask which one, then call again with "app".`,
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
    const davanti = await talosDavantiFinche(scelta.pacchetto)
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
    return {
        ok: true,
        content: generica.esce === false
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
async function talosDavantiFinche(atteso: string): Promise<string | null> {
    let visto: string | null = null
    for (let giro = 0; giro < 4; giro++) {
        visto = await talosChiEDavanti()
        if (visto === atteso) return visto
        await new Promise((r) => setTimeout(r, 350))
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
    if (esito.fatto && esito.sparito) {
        return {
            ok: true,
            content: `Sent. TALOS pressed send in ${capacita.app} and verified it left the input field. Tell the user it is sent, in one short sentence.`,
        }
    }
    if (esito.fatto) {
        return {
            ok: true,
            content: `TALOS pressed send in ${capacita.app}, but could not confirm the message left the input field. Tell the user exactly that and ask them to check the chat. ⛔ Do NOT press send again and do NOT call this tool again for this message: it may already have gone through, and a retry would send it twice.`,
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

export function talosIntentiTools(): readonly TalosToolDefinition<never>[] {
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
                            return { ok: true, content: `Opened ${capacita.app} via ${via.tipo}.` }
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
    ]
}
