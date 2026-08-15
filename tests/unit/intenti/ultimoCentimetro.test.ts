import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ L'ULTIMO CENTIMETRO — e le tre guardie che gli impediscono di mentire.
 *
 * ## Cosa si sta provando davvero
 *
 * Fino al 13 agosto TALOS apriva WhatsApp con il testo dentro e **si fermava
 * lì**: l'owner l'ha detto in tre parole — «TALOS NON HA INVIATO IL MESSAGGIO».
 * Adesso preme lui. E il momento in cui preme è anche il momento in cui può
 * fare il danno peggiore di tutto il progetto: mandare la cosa sbagliata a una
 * persona vera, o dire «inviato» quando non è vero.
 *
 * ⇒ Questi test non provano che «funziona». Provano che **non mente** e che
 * **non tocca al buio**:
 *
 * | difetto possibile | il test che lo becca |
 * |---|---|
 * | preme senza controllare cosa c'è nel campo | «il testo atteso viaggia fino alla guardia» |
 * | preme in un'app qualsiasi | «il pacchetto viaggia fino alla guardia» |
 * | dice «inviato» perché il click è riuscito | «premuto ma non confermato NON è inviato» |
 * | riprova un invio che forse è partito | «il dubbio non si risolve rifacendo» |
 * | manda quando gli era stato chiesto di preparare | «invia:false non preme niente» |
 * | promette un invio in un'app mai misurata | «senza `invio` non si preme» |
 */

const ponte = {
    chiamate: [] as Array<Record<string, unknown>>,
    conferme: [] as Array<Record<string, unknown>>,
    esito: {} as Record<string, unknown>,
    esitoConferma: {} as Record<string, unknown>,
    esplode: false,
}

/**
 * `davanti: null` = «è arrivata l'app che abbiamo aperto», cioè il caso normale.
 * Un test che vuole il FALSO SUCCESSO (Spotify che si schianta) mette qui il
 * pacchetto sbagliato, e allora la differenza la fa il codice, non il mock.
 */
const schermo: { davanti: string | null, sipuoSapere: boolean } = {
    davanti: null,
    sipuoSapere: true,
}

vi.mock('@/lib/device/ponteSchermo', () => ({
    TalosSchermoBridge: {
        premiPulsante: async (opzioni: Record<string, unknown>) => {
            ponte.chiamate.push(opzioni)
            if (ponte.esplode) throw new Error('ponte assente')
            return ponte.esito
        },
        confermaDialogo: async (o: Record<string, unknown>) => {
            ponte.conferme.push(o)
            return ponte.esitoConferma
        },
        chiEDavanti: async () => ({
            pacchetto: schermo.davanti
                ?? (apri.azioni.at(-1)?.pacchetto as string | undefined) ?? '',
            sipuoSapere: schermo.sipuoSapere,
        }),
    },
}))

const apri = {
    esiti: [] as boolean[],
    azioni: [] as Array<Record<string, unknown>>,
    candidate: [] as Array<{ pacchetto: string, nome: string, attivita: string }>,
    riga: { uri: null as string | null, motivo: 'riga-assente' },
}

vi.mock('@/lib/device/devicePlugin', () => ({
    TalosDeviceBridge: {
        apriUri: async () => ({ done: apri.esiti.shift() ?? true }),
        apriAzione: async (o: Record<string, unknown>) => {
            apri.azioni.push(o)
            return { done: apri.esiti.shift() ?? true }
        },
        chiAccetta: async () => ({ app: apri.candidate }),
        /*
         * ⛔ Di base la riga NON c'è, come sul Pad: nella rubrica di sistema
         * non esiste nessun account `com.whatsapp`. Un test che la desse per
         * presente proverebbe la strada che su questo dispositivo non si
         * percorre mai — e lascerebbe il ponte senza copertura.
         */
        rigaDiContatto: async () => apri.riga,
        appInstallata: async () => ({ presente: true }),
    },
}))

vi.mock('@/lib/intenti/rubrica', () => ({
    talosRisolviContatto: async () => ({ stato: 'nessuno' as const }),
}))

import { TALOS_CAPACITA_INTENT } from '@/lib/intenti/registro'
import { talosIntentiTools } from '@/lib/tools/intentiTools'

const strumento = talosIntentiTools()[0]

async function chiedi(input: Record<string, unknown>) {
    return await (strumento.run as (i: unknown, c: unknown) => Promise<{
        ok: boolean
        content: string
        code?: string
    }>)(input, {})
}

beforeEach(() => {
    ponte.chiamate = []
    ponte.conferme = []
    ponte.esito = { fatto: true, sparito: true }
    ponte.esitoConferma = { fatto: true, sparito: true, domanda: 'Avviare una chiamata vocale?' }
    ponte.esplode = false
    apri.esiti = []
    apri.azioni = []
    apri.candidate = [
        { pacchetto: 'com.google.android.keep', nome: 'Keep Notes', attivita: 'a' },
        { pacchetto: 'com.google.android.apps.translate', nome: 'Traduttore', attivita: 'b' },
    ]
    apri.riga = { uri: null, motivo: 'riga-assente' }
    schermo.davanti = null
    schermo.sipuoSapere = true
})

const CIAO = { capacita: 'whatsapp_messaggio', valori: { numero: '393331112222', testo: 'ciao' } }

describe('⭐⭐⭐ l\'ultimo centimetro non tocca al buio', () => {
    /*
     * ⛔⛔ IL TEST CHE MORDE DI PIÙ.
     *
     * WhatsApp CONSERVA la bozza. Se la chat era già aperta con dentro un altro
     * testo, il pulsante «invia» c'è **prima** che arrivi il nostro — e senza
     * questa guardia partirebbe la bozza vecchia, verso la persona giusta, con
     * le parole sbagliate. Un difetto che si presenta come un successo.
     *
     * Togliendo `testoAtteso` dalla chiamata questo test diventa rosso.
     */
    it('⛔ il TESTO ATTESO viaggia fino alla guardia', async () => {
        await chiedi(CIAO)
        expect(ponte.chiamate).toHaveLength(1)
        expect(ponte.chiamate[0].testoAtteso).toBe('ciao')
    })

    /*
     * ⛔ Il ripiego cerca «Invia»/«Send». Quelle parole esistono anche DENTRO
     * TALOS: se l'intent non ha aperto niente, senza questa guardia si
     * premerebbe un nostro pulsante credendo di aver spedito.
     */
    it('⛔ il PACCHETTO viaggia fino alla guardia', async () => {
        await chiedi(CIAO)
        expect(ponte.chiamate[0].pacchetto).toBe('com.whatsapp')
        expect(ponte.chiamate[0].viewId).toBe('com.whatsapp:id/send')
    })

    /*
     * ⭐⭐⭐ 2026-08-15: le prove diventano TRE, e questo test cambia con loro.
     *
     * Owner: «"invio un messaggio a Shadina" non significa che l'abbia inviato
     * veramente». `sparito` da solo era UNA euristica — un pulsante può sparire
     * perché la schermata è cambiata per altro. Adesso il nativo conta anche il
     * campo svuotato e il testo MIGRATO in un nodo non modificabile, cioè
     * diventato un pezzo di conversazione, e serve che due prove concordino.
     */
    it('«inviato» si dice SOLO se il controllo d\'invio è sparito', async () => {
        ponte.esito = { fatto: true, sparito: true, obiettivo: 'PARTITO', campoSvuotato: true, testoMigrato: true, prove: 3 }
        const esito = await chiedi(CIAO)
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('Sent')
    })

    /*
     * ⛔⛔ `performAction` che risponde `true` vuol dire «click consegnato»,
     * non «messaggio partito». Chiamarlo «inviato» sarebbe rifare lo stesso
     * difetto di prima, stavolta con sicurezza.
     */
    it('⛔ PREMUTO ma non confermato NON è «inviato»', async () => {
        ponte.esito = {
            fatto: true, sparito: false, obiettivo: 'NON_CONFERMATO',
            campoSvuotato: true, testoMigrato: false, prove: 1,
        }
        const esito = await chiedi(CIAO)
        expect(esito.content).not.toMatch(/^Sent/)
        expect(esito.content).toMatch(/of 3 checks confirm/i)
    })

    /*
     * ⛔⛔ E QUI STA IL DANNO IRREVERSIBILE.
     *
     * Se questo ramo tornasse `ok: false`, il modello leggerebbe «non fatto» e
     * richiamerebbe il tool: se il primo invio era andato, la persona riceve il
     * messaggio **due volte**. Un dubbio si dice; non si risolve rifacendo una
     * cosa che non si annulla.
     */
    it('⛔ il DUBBIO non si risolve rifacendo: niente ok:false, e lo dice', async () => {
        ponte.esito = {
            fatto: true, sparito: false, obiettivo: 'NON_CONFERMATO',
            campoSvuotato: true, testoMigrato: false, prove: 1,
        }
        const esito = await chiedi(CIAO)
        expect(esito.ok).toBe(true)
        expect(esito.code).toBeUndefined()
        expect(esito.content).toMatch(/twice/i)
        expect(esito.content).toMatch(/Do NOT press send again/i)
    })

    /*
     * ⛔ «Non lo so» non è «no»: quattro motivi diversi portano a quattro cose
     * diverse da dire alla persona, e appiattirli in «non riuscito» è la
     * famiglia di difetti più frequente di questo progetto.
     */
    it.each([
        ['occhio-chiuso', 'TALOS_INVIO_OCCHIO_CHIUSO', /screen-reading permission/i],
        ['app-non-in-primo-piano', 'TALOS_INVIO_APP_NON_IN_PRIMO_PIANO', /not the app on screen/i],
        ['testo-non-arrivato', 'TALOS_INVIO_TESTO_NON_ARRIVATO', /never appeared/i],
        ['non-trovato', 'TALOS_INVIO_NON_TROVATO', /could not find the send button/i],
    ])('il motivo «%s» diventa un codice e una frase sue', async (motivo, codice, frase) => {
        ponte.esito = { fatto: false, motivo }
        const esito = await chiedi(CIAO)
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe(codice)
        expect(esito.content).toMatch(frase)
        // ⛔ In tutti e quattro NON è partito niente, e va detto: è la sola
        // informazione che decide cosa fa la persona dopo.
        expect(esito.content).toMatch(/[Nn]othing was sent/)
    })

    /** ⛔ Un ponte che non risponde è un ESITO, non un'eccezione da ingoiare. */
    it('il ponte che esplode non diventa «inviato»', async () => {
        ponte.esplode = true
        const esito = await chiedi(CIAO)
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_INVIO_PONTE_CHIUSO')
        expect(esito.content).toMatch(/[Nn]othing was sent/)
    })
})

/**
 * ⭐⭐⭐ LA CONFERMA DELL'APP — owner 2026-08-13: «non possiamo andare per
 * ciascuna app esistente possibile e immaginabile e prevedere in ogni caso per
 * ogni funzionalità, sarebbe da pazzi».
 *
 * MISURATO sul Pad: dopo «Chiamata vocale», WhatsApp apre «Avviare una chiamata
 * vocale?» con `android:id/message`, `android:id/button1` e `android:id/button2`
 * — **id del framework, uguali per ogni app e non tradotti**. ⇒ Il registro dice
 * solo SE può succedere; il COME è una regola sola.
 */
describe('⭐⭐⭐ la conferma dell\'app: una regola, non una tabella', () => {
    const CHIAMA = { capacita: 'whatsapp_chiama', valori: { numero: '393331112222' } }

    it('⛔ il registro NON contiene etichette di pulsanti da confermare', () => {
        const wa = TALOS_CAPACITA_INTENT.find((c) => c.id === 'whatsapp_chiama')!
        // Se un giorno qualcuno rimettesse `['Chiama','Call']`, questo diventa
        // rosso — ed è esattamente la tabella che l'owner ha vietato.
        expect(wa.invio?.confermaApp).toBe(true)
        // ⛔ Nessun oggetto con dentro le etichette del pulsante di conferma:
        // era esattamente la tabella per app/funzione/lingua che l'owner ha
        // vietato. Il registro dice SE, mai COME.
        expect((wa.invio as Record<string, unknown>).conferma).toBeUndefined()
    })

    it('dopo il primo tocco chiede la conferma generica, non un pulsante nominato', async () => {
        const esito = await chiedi(CHIAMA)
        expect(ponte.conferme).toHaveLength(1)
        expect(ponte.conferme[0].pacchetto).toBe('com.whatsapp')
        // ⛔ Nessuna descrizione: il COME non passa da qui.
        expect(ponte.conferme[0].descrizioni).toBeUndefined()
        expect(esito.ok).toBe(true)
    })

    /*
     * ⭐ La domanda letta dal dialogo viaggia nell'esito: è l'unica cosa che
     * rende onesto il «confermato». Senza, TALOS direbbe «fatto» senza sapere
     * cosa ha accettato.
     */
    it('⛔ riporta la DOMANDA che ha confermato', async () => {
        const esito = await chiedi(CHIAMA)
        expect(esito.content).toContain('Avviare una chiamata vocale?')
    })

    /*
     * ⛔⛔ LA SICUREZZA DI QUESTA REGOLA STA TUTTA QUI.
     *
     * `android:id/button1` è il positivo di QUALUNQUE `AlertDialog` di sistema,
     * compreso quello dei permessi, dove dice «Consenti». MISURATO oggi:
     * chiedendo un percorso a piedi è comparso
     * `com.google.android.permissioncontroller/…GrantPermissionsActivity`.
     *
     * L'unica difesa è confermare **solo dentro l'app in cui si stava agendo**,
     * e funziona solo se il pacchetto viaggia fin laggiù. Se questa asserzione
     * cade, `confermaDialogo` diventa «premi il primo sì che vedi».
     */
    it('⛔ il PACCHETTO viaggia sempre: senza, si confermerebbe un dialogo di permessi', async () => {
        await chiedi(CHIAMA)
        expect(ponte.conferme[0].pacchetto).toBeTruthy()
        expect(ponte.conferme[0].pacchetto).toBe('com.whatsapp')
    })

    it('se il dialogo non c\'è, NON dice fatto', async () => {
        ponte.esitoConferma = { fatto: false, motivo: 'nessun-dialogo' }
        const esito = await chiedi(CHIAMA)
        expect(esito.content).toMatch(/NOT done/)
    })

    it('confermato ma non richiuso ⇒ non si rifà', async () => {
        ponte.esitoConferma = { fatto: true, sparito: false, domanda: 'Avviare?' }
        const esito = await chiedi(CHIAMA)
        expect(esito.content).toMatch(/Do NOT do it again/)
    })
})

describe('⛔ quando NON si deve premere, non si preme', () => {
    it('«invia: false» non tocca il pulsante', async () => {
        const esito = await chiedi({ ...CIAO, invia: false })
        expect(ponte.chiamate).toHaveLength(0)
        expect(esito.ok).toBe(true)
        expect(esito.content).toMatch(/Nothing has been sent|Nothing was sent/)
    })

    /*
     * ⛔ Telegram ESCE dal dispositivo ma non ha un `invio` misurato: promettere
     * di premere un pulsante mai visto vuol dire far credere alla persona di
     * aver mandato. Meglio dire la verità — è aperto, manca un tocco.
     */
    it('una capacità senza «invio» misurato non preme niente', async () => {
        const esito = await chiedi({
            capacita: 'telegram_messaggio',
            valori: { utente: 'qualcuno', testo: 'ciao' },
        })
        expect(ponte.chiamate).toHaveLength(0)
        expect(esito.content).toMatch(/NOT sent/)
    })

    /*
     * ⛔ L'asserzione era `/^Opened/`, cioè la PAROLA invece del comportamento.
     * Dal 2026-08-14 «aperta» si dice solo dopo aver guardato lo schermo — con
     * l'occhio che non vede Maps arrivare, la frase onesta è un'altra — e la
     * cosa che questo test difende non è mai stata quella parola: è che per
     * una capacità che non ESCE non si tocca nessun pulsante.
     */
    it('cercare o navigare non ha nessun ultimo centimetro', async () => {
        schermo.davanti = 'com.google.android.apps.maps'
        const esito = await chiedi({
            capacita: 'mappe_naviga',
            valori: { destinazione: 'Catania' },
        })
        expect(ponte.chiamate).toHaveLength(0)
        expect(esito.ok).toBe(true)
        // ⛔ E non si promette un invio che non c'è stato. Con i confini di
        // parola: senza, «una frase sola» — `sentence` — faceva passare il test
        // per la ragione sbagliata, che è il difetto di asserzione già pagato
        // tre volte su questo progetto.
        expect(esito.content).not.toMatch(/\bsent\b/i)
    })

    /*
     * ⛔⛔ E L'ALTRO VERSO, che è il difetto misurato: intent accettato, app che
     * si chiude da sola, TALOS che dice «fatto». MISURATO sul Pad il
     * 2026-08-14 con Spotify — `isExiting` un secondo dopo la partenza, e in
     * chat «Ho cercato i Pink Floyd su Spotify».
     */
    it('⛔ se l\'app NON arriva davanti, non si dice che è aperta', async () => {
        schermo.davanti = 'com.android.launcher'
        const esito = await chiedi({
            capacita: 'mappe_naviga',
            valori: { destinazione: 'Catania' },
        })
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_INTENTO_NON_ARRIVATA')
    })

    /*
     * ⛔ «Non lo so» non è «no»: senza occhio non si accusa un'app di non essere
     * arrivata. È la stessa regola già scritta per le capacità generiche.
     */
    /*
     * ⛔⛔ E DIRE **PERCHÉ** NON HA POTUTO GUARDARE — 2026-08-15.
     *
     * MISURATO sul Pad, chiesto «farmacie vicino a me»: Maps si è aperta con le
     * farmacie (visto sullo schermo) e TALOS ha risposto «ho inviato la
     * richiesta a Google Maps, ma **non sono riuscito a confermare l'apertura a
     * schermo**». Chi legge conclude che è fallito, mentre dietro c'era la
     * risposta giusta.
     *
     * Non era la finestra d'attesa: MISURATO, Maps va davanti in **311 ms**
     * contro i 4,2 s che qui si aspettano. Era che TALOS non poteva guardare —
     * `sipuoSapere:false`, ponte spento — e quel caso usciva con la stessa
     * frase di «ho guardato e non c'era».
     *
     * ⇒ Sono due cose diverse per chi ascolta: una si risolve riaccendendo il
     * ponte, l'altra no. La riga adesso porta la causa E la mossa.
     */
    it('⛔ CIECO: dice che non può guardare, perché, e cosa si può fare', async () => {
        schermo.sipuoSapere = false
        const esito = await chiedi({
            capacita: 'mappe_naviga',
            valori: { destinazione: 'Catania' },
        })
        expect(esito.ok).toBe(true)
        // ⛔ Non basta chiedere prudenza: la riga deve TOGLIERE al modello i
        // verbi del successo. MISURATO: con «senza dire di averlo verificato»
        // ha risposto «Ho cercato i Queen su Spotify», a schermo fermo.
        expect(esito.content).toMatch(/Do NOT say you searched, played or opened/)
        // ⛔ E deve togliere anche il verbo del FALLIMENTO: l'app può essersi
        // aperta benissimo, ed è quello che era successo davvero.
        expect(esito.content).toMatch(/do NOT say it did not work/)
        // La causa, con parole che portano a una mossa.
        expect(esito.content).toMatch(/privileged access is not connected/)
        expect(esito.content).toContain('android.settings.APPLICATION_DEVELOPMENT_SETTINGS')
    })

    /** Se nessuna via si apre, non c'è niente da premere: non si tocca lo schermo. */
    it('se l\'app non si apre, il pulsante non si cerca nemmeno', async () => {
        apri.esiti = [false, false]
        const esito = await chiedi(CIAO)
        expect(ponte.chiamate).toHaveLength(0)
        expect(esito.ok).toBe(false)
    })
})

/**
 * ⭐⭐⭐ LE CAPACITÀ SENZA APP — owner 2026-08-13: «non puoi mettere delle righe
 * predeterminate… la chat ha già una lista delle applicazioni esistenti,
 * dobbiamo fare in modo che chiami in quelle».
 *
 * Qui si prova che l'elenco NON è nostro: arriva dal dispositivo, e quando la
 * risposta è «non si può» porta con sé **chi invece potrebbe**.
 */
describe('⭐⭐⭐ le capacità che l\'app se la fanno dire dal telefono', () => {
    const MANDA = { capacita: 'manda_testo_a_app', valori: { testo: 'appunto' } }

    /*
     * ⛔⛔ IL TEST NATO DA UN DIFETTO VISTO A SCHERMO — Pad, 2026-08-13.
     *
     * Con `ok: false` questo elenco veniva letto come un fallimento: Haiku 4.5
     * l'ha scartato e ha risposto alla persona «WhatsApp, Telegram, Signal,
     * Messenger, ChatGPT», di cui **tre non erano installate**. Aveva la verità
     * e ci ha scritto sopra, perché gliel'avevamo data come errore.
     */
    it('⛔ l\'elenco del telefono è una RISPOSTA (ok:true), non un fallimento', async () => {
        const esito = await chiedi(MANDA)
        expect(esito.ok).toBe(true)
        expect(esito.code).toBeUndefined()
        expect(esito.content).toContain('Keep Notes')
        expect(esito.content).toContain('Traduttore')
        // ⛔ E vieta esplicitamente di aggiungerne altre a memoria.
        expect(esito.content).toMatch(/ONLY these/)
        expect(esito.content).toMatch(/Do NOT name any other app/)
        // ⛔ E non ha toccato niente: chiedere non è agire.
        expect(apri.azioni).toHaveLength(0)
    })

    it('l\'app si riconosce dal NOME che dice la persona, non dall\'id', async () => {
        const esito = await chiedi({ ...MANDA, app: 'traduttore' })
        expect(esito.ok).toBe(true)
        expect(apri.azioni).toHaveLength(1)
        expect(apri.azioni[0].pacchetto).toBe('com.google.android.apps.translate')
        expect(apri.azioni[0].azione).toBe('android.intent.action.SEND')
        expect(apri.azioni[0].tipo).toBe('text/plain')
    })

    /*
     * ⛔ Il testo viaggia negli EXTRA, e NON codificato: un `%20` a schermo è il
     * messaggio della persona rovinato. Il verso opposto (URI) è provato in
     * `registro.test.ts`, e le due prove insieme sono la guardia vera.
     */
    it('⛔ il testo arriva negli extra, non codificato', async () => {
        await chiedi({ capacita: 'manda_testo_a_app', app: 'keep', valori: { testo: 'a & b' } })
        expect((apri.azioni[0].extra as Record<string, string>)['android.intent.extra.TEXT'])
            .toBe('a & b')
    })

    it('un\'app che non c\'è non diventa un «non si può»: dice quali ci sono', async () => {
        const esito = await chiedi({ ...MANDA, app: 'Telegram' })
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_INTENTO_APP_NON_ADATTA')
        expect(esito.content).toContain('Keep Notes')
    })

    it('nessuna app sul dispositivo ⇒ non si inventa niente', async () => {
        apri.candidate = []
        const esito = await chiedi({ ...MANDA, app: 'Keep' })
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_INTENTO_NESSUNA_APP')
    })

    /*
     * ⛔⛔ IL FALSO SUCCESSO CHE SPOTIFY CI HA INSEGNATO — 2026-08-13.
     * Spotify DICHIARA `ACTION_SEARCH`, il sistema ACCETTA l'intent, e poi
     * l'app muore con `Fatal signal 11 (SIGSEGV)`. Chi si fermasse a
     * «accettato» direbbe «fatto» davanti a un launcher vuoto.
     */
    it('⛔ intent accettato ma davanti c\'è il LAUNCHER ⇒ non è «fatto»', async () => {
        schermo.davanti = 'com.android.launcher'
        const esito = await chiedi({ ...MANDA, app: 'Keep' })
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_INTENTO_NON_ARRIVATA')
        expect(esito.content).toContain('com.android.launcher')
    })

    /*
     * ⛔⛔ IL FALSO NEGATIVO CHE IL DISPOSITIVO MI HA SMENTITO — Pad, 14:25.
     *
     * Chiesto «manda "appunto di prova" a Keep»: Keep si è aperta come finestra
     * SOPRA TALOS, col testo dentro e il pulsante Salva —
     * `mCurrentFocus=com.google.android.keep/.ShareReceiverActivity` — e
     * l'occhio vedeva ancora `ai.talos.dev`. La guardia, troppo severa, ha
     * fatto dire a TALOS «Keep non è riuscita a ricevere il testo»: falso,
     * detto con sicurezza, con la prova del contrario a schermo.
     *
     * ⇒ Restare noi in primo piano è «non lo so», e «non lo so» non è «no».
     */
    it('⛔ se davanti restiamo NOI non si accusa l\'app: è «non lo so»', async () => {
        schermo.davanti = 'ai.talos.dev'
        const esito = await chiedi({ ...MANDA, app: 'Keep' })
        expect(esito.ok).toBe(true)
        expect(esito.code).toBeUndefined()
    })

    /** ⛔ «Non lo so» (occhio chiuso) non è «non è arrivata». */
    it('senza occhio non si accusa l\'app di non essere arrivata', async () => {
        schermo.sipuoSapere = false
        schermo.davanti = ''
        const esito = await chiedi({ ...MANDA, app: 'Keep' })
        expect(esito.ok).toBe(true)
    })

    /*
     * ⛔ `esce: null` = non si sa. Un testo mandato a Keep resta nel telefono,
     * a Gmail no: dire «inviato» sarebbe una bugia una volta su due.
     */
    it('⛔ non dice mai «inviato» per una generica', async () => {
        const esito = await chiedi({ ...MANDA, app: 'Keep' })
        expect(esito.content).toMatch(/NOT sent/)
        expect(esito.content).not.toMatch(/^Sent/)
    })
})
