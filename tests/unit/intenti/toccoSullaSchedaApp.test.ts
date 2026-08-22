import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Il Kotlin senza i commenti: su questo progetto tre asserzioni sono già passate
 * contro le mie stesse spiegazioni invece che contro il codice.
 */
function codiceKotlin(percorso: string): string {
    return readFileSync(resolve(__dirname, '../../..', percorso), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * ⭐⭐⭐ IL TOCCO SULLA SCHEDA «QUALE APP» — la seconda metà della stessa azione.
 *
 * ## Perché questa scheda esiste
 *
 * MISURATO sul Pad il 2026-08-13. Chiesto «manda un messaggio», TALOS ha
 * interrogato il telefono (`queryIntentActivities`) e ha consegnato al modello
 * l'elenco vero delle app che sanno farlo. Il modello ha risposto alla persona:
 *
 * > «WhatsApp, Telegram, Signal, Messenger, ChatGPT»
 *
 * **Tre non sono installate su quel telefono e una se l'è inventata.** Aveva la
 * verità in mano e ci ha scritto sopra.
 *
 * La prima cura fu l'etichetta (`ok: true`) e un divieto nella riga. Funziona,
 * ma dipende ancora dal fatto che il modello **ricopi bene**. La scheda salta
 * quel passaggio: l'elenco va dal telefono allo schermo, e si tocca.
 *
 * ## ⛔ Cosa provano questi test
 *
 * Non che «si apre». Provano che il tocco **arriva al telefono con la roba
 * giusta** e che **non parte al buio**:
 *
 * | difetto possibile | il test che lo becca |
 * |---|---|
 * | apre l'app senza il testo dentro | «i valori raccolti viaggiano fino al telefono» |
 * | apre un'app qualunque fra quelle che sanno farlo | «il PACCHETTO viaggia fino al telefono» |
 * | apre qualcosa con un id inventato | «una capacità che non esiste non apre niente» |
 * | apre l'app vuota perché un valore si è perso | «un valore mancante non apre niente» |
 * | dice di sì mentre l'app ha rifiutato | «se il telefono dice di no, rende false» |
 */

const apri = {
    azioni: [] as Array<Record<string, unknown>>,
    esiti: [] as boolean[],
    candidate: [] as Array<{ pacchetto: string, nome: string, attivita: string }>,
}

vi.mock('@/lib/device/devicePlugin', () => ({
    TalosDeviceBridge: {
        apriUri: async () => ({ done: apri.esiti.shift() ?? true }),
        apriAzione: async (o: Record<string, unknown>) => {
            apri.azioni.push(o)
            return { done: apri.esiti.shift() ?? true }
        },
        chiAccetta: async () => ({ app: apri.candidate }),
        rigaDiContatto: async () => ({ uri: null, motivo: 'riga-assente' }),
        appInstallata: async () => ({ presente: true }),
    },
}))

vi.mock('@/lib/intenti/rubrica', () => ({
    talosRisolviContatto: async () => ({ stato: 'nessuno' as const }),
}))

/*
 * ⛔ L'OCCHIO SI FINGE, e di base dice «è arrivata l'app che abbiamo aperto»:
 * è il caso normale. Da quando «Aperta» si dice solo dopo aver guardato lo
 * schermo, senza questo mock ogni prova aspetterebbe i tredici giri per una
 * risposta che non arriva — e proverebbe l'attesa, non il codice.
 */
const schermo = { davanti: null as string | null, sipuoSapere: true }

vi.mock('@/lib/device/ponteSchermo', () => ({
    TalosSchermoBridge: {
        chiEDavanti: async () => ({
            pacchetto: schermo.davanti ?? (apri.azioni.at(-1)?.pacchetto as string | undefined) ?? '',
            sipuoSapere: schermo.sipuoSapere,
        }),
        premiPulsante: async () => ({ fatto: true, sparito: true }),
        confermaDialogo: async () => ({ fatto: true, sparito: true }),
    },
}))

import { talosApriConApp, talosIntentiTools } from '@/lib/tools/intentiTools'

const strumento = talosIntentiTools()[0]!

async function chiedi(input: Record<string, unknown>) {
    return await (strumento.run as (i: unknown, c: unknown) => Promise<{
        ok: boolean
        content: string
        code?: string
        scheda?: { app?: ReadonlyArray<{ nome: string, pacchetto: string }> }
    }>)(input, {})
}

beforeEach(() => {
    apri.azioni = []
    apri.esiti = []
    apri.candidate = []
})

describe('⭐⭐⭐ toccare un\'app della scheda fa partire QUELLA', () => {
    /*
     * ⛔⛔ IL TEST CHE MORDE DI PIÙ, ed è lo stesso difetto dell'ultimo
     * centimetro visto da un'altra parte: aprire l'app giusta ma **vuota**. La
     * persona si ritrova WhatsApp davanti e il messaggio da riscrivere — cioè
     * esattamente il lavoro che l'intent doveva togliere di mezzo.
     */
    it('⛔ i VALORI RACCOLTI viaggiano fino al telefono', async () => {
        await talosApriConApp('manda_testo_a_app', { testo: 'arrivo alle 8' }, 'com.whatsapp')
        expect(apri.azioni).toHaveLength(1)
        expect(apri.azioni[0]!.extra).toMatchObject({
            'android.intent.extra.TEXT': 'arrivo alle 8',
        })
    })

    /*
     * ⛔ Senza il pacchetto Android mostrerebbe il suo foglio «apri con», cioè
     * rifarebbe la domanda a cui la persona ha appena risposto col dito.
     */
    it('⛔ il PACCHETTO viaggia fino al telefono', async () => {
        await talosApriConApp('manda_testo_a_app', { testo: 'ciao' }, 'org.telegram.messenger')
        expect(apri.azioni[0]!.pacchetto).toBe('org.telegram.messenger')
        expect(apri.azioni[0]!.azione).toBe('android.intent.action.SEND')
        expect(apri.azioni[0]!.tipo).toBe('text/plain')
    })

    /*
     * ⛔ I valori hanno fatto un giro dentro i metadati di un messaggio, cioè
     * FUORI da qui: un backup vecchio, una scheda modificata a mano, un campo
     * perso per strada. Una capacità aperta con un buco porta l'app in primo
     * piano senza niente dentro, e sembra un successo.
     */
    it('⛔ un valore MANCANTE non apre niente', async () => {
        expect(await talosApriConApp('manda_testo_a_app', {}, 'com.whatsapp')).toBe(false)
        expect(await talosApriConApp('manda_testo_a_app', { testo: '   ' }, 'com.whatsapp')).toBe(false)
        expect(apri.azioni).toHaveLength(0)
    })

    it('⛔ una capacità che non esiste non apre niente', async () => {
        expect(await talosApriConApp('manda_soldi_a_tutti', { testo: 'ciao' }, 'com.whatsapp')).toBe(false)
        expect(apri.azioni).toHaveLength(0)
    })

    /*
     * ⛔ Solo le GENERICHE: `whatsapp_messaggio` sa già in che app va, e non
     * passa mai dalla scheda «quale app». Accettarla qui vorrebbe dire aprire
     * una capacità precisa dentro un pacchetto scelto da fuori.
     */
    it('⛔ una capacità PRECISA non si apre da questa strada', async () => {
        expect(await talosApriConApp(
            'whatsapp_messaggio',
            { numero: '393331112222', testo: 'ciao' },
            'org.telegram.messenger',
        )).toBe(false)
        expect(apri.azioni).toHaveLength(0)
    })

    it('⛔ senza pacchetto non apre niente', async () => {
        expect(await talosApriConApp('manda_testo_a_app', { testo: 'ciao' }, '  ')).toBe(false)
        expect(apri.azioni).toHaveLength(0)
    })

    /*
     * ⛔ Il telefono aveva risposto che quell'app sa fare questa cosa, poi l'app
     * ha rifiutato di aprirsi. Rendere `true` lo stesso farebbe scrivere
     * «Aperta» sulla scheda mentre lo schermo resta fermo: il segno «Fatto» su
     * una cosa non fatta, con un dito sopra.
     */
    it('⛔ se il telefono dice di NO, rende false', async () => {
        apri.esiti = [false]
        expect(await talosApriConApp('manda_testo_a_app', { testo: 'ciao' }, 'com.whatsapp')).toBe(false)
    })

    it('quando parte, lo dice', async () => {
        expect(await talosApriConApp('manda_testo_a_app', { testo: 'ciao' }, 'com.whatsapp')).toBe(true)
    })
})

/**
 * ⭐⭐⭐ SENZA UN NOME UMANO NON SI OFFRE A UN UMANO.
 *
 * MISURATO sul Pad il 2026-08-14, prima riga della scheda «quale app» appena
 * nata, sopra Play Store e Messaggi:
 *
 *     com.android.cts.priv.ctsshim.InstallPriority   ›
 *
 * Un nome interno sullo schermo di una persona — la regola che questo progetto
 * ripete ovunque, rotta proprio dalla scheda che serviva a non far inventare i
 * nomi. Ed è anche uno stub di collaudo che Android si porta dietro: non fa
 * niente, e toccarlo non fa niente.
 *
 * ⛔ La cura NON è un elenco di pacchetti da escludere — «niente righe
 * predeterminate: si chiede al TELEFONO». Il fatto si misura: `loadLabel()` di
 * Android, quando un'app non dichiara `android:label`, **ripiega sul nome del
 * pacchetto**. «Etichetta uguale al pacchetto» vuol dire, letteralmente, *il
 * telefono non ha un nome umano per questa cosa*.
 */
describe('⛔ l\'elenco delle app non contiene cose senza nome', () => {
    const VERE = [
        { pacchetto: 'com.android.vending', nome: 'Play Store', attivita: 'a' },
        { pacchetto: 'com.google.android.apps.messaging', nome: 'Messaggi', attivita: 'b' },
    ]
    /*
     * ⛔ QUESTA è la forma VERA, misurata sul Pad: l'etichetta non è il
     * pacchetto, è il nome della **classe**. Il primo filtro confrontava solo
     * col pacchetto e questo stub è passato lo stesso — sullo schermo, di nuovo.
     */
    const SENZA_NOME = {
        pacchetto: 'com.android.cts.ctsshim',
        nome: 'com.android.cts.ctsshim.InstallPriority',
        attivita: 'com.android.cts.ctsshim.InstallPriority',
    }

    it('⛔ lo stub con l\'identificatore al posto del nome non arriva né alla scheda né al modello', async () => {
        apri.candidate = [SENZA_NOME, ...VERE]
        const esito = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })

        expect(esito.ok).toBe(true)
        expect(esito.scheda?.app?.map((a) => a.nome)).toEqual(['Play Store', 'Messaggi'])
        // ⛔ E nemmeno nella riga che legge il modello: i due lettori devono
        // vedere la stessa cosa, se no uno dei due un giorno diverge.
        expect(esito.content).not.toContain('ctsshim')
        expect(esito.content).toContain('These 2 apps')
    })

    it('⛔ etichetta VUOTA o uguale al PACCHETTO spariscono allo stesso modo', async () => {
        apri.candidate = [
            { pacchetto: 'com.boh', nome: '', attivita: 'd' },
            { pacchetto: 'com.altro', nome: 'com.altro', attivita: 'e' },
            ...VERE,
        ]
        const esito = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })
        const pacchetti = esito.scheda?.app?.map((a) => a.pacchetto) ?? []
        expect(pacchetti).not.toContain('com.boh')
        expect(pacchetti).not.toContain('com.altro')
        expect(pacchetti).toHaveLength(2)
    })

    /*
     * ⛔ E un'app VERA non deve sparire: il filtro guarda l'uguaglianza esatta,
     * non «somiglia a un identificatore». Un nome con un punto dentro — e ce ne
     * sono — resta.
     */
    it('⛔ un\'app vera col punto nel nome RESTA', async () => {
        apri.candidate = [
            { pacchetto: 'com.tizio.app', nome: 'Tizio.io', attivita: 'com.tizio.app.Main' },
            ...VERE,
        ]
        const esito = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })
        expect(esito.scheda?.app?.map((a) => a.nome)).toContain('Tizio.io')
    })

    /*
     * ⛔ Gli stati sono TRE, non due: «nessuno lo sa fare» e «lo sanno fare solo
     * cose senza nome» sono fatti diversi, e dirli con la stessa frase è la
     * scorciatoia che su questo progetto ha già fatto inventare al modello.
     */
    it('⛔ se restano SOLO cose senza nome, lo dice in modo diverso da «nessuno»', async () => {
        apri.candidate = [SENZA_NOME]
        const soloStub = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })
        expect(soloStub.ok).toBe(false)
        expect(soloStub.content).toContain('system stubs')

        apri.candidate = []
        const nessuno = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })
        expect(nessuno.ok).toBe(false)
        expect(nessuno.content).not.toContain('system stubs')
        expect(nessuno.content).toContain('No app on this device')
    })

    /*
     * ⛔ E la scheda porta il PACCHETTO di ogni riga: è ciò che il tocco
     * consegna al telefono. Senza, l'elenco si può solo leggere.
     */
    it('la scheda porta capacità, valori e pacchetti, pronti per il tocco', async () => {
        apri.candidate = VERE
        const esito = await chiedi({ capacita: 'cerca_dentro_app', valori: { cosa: 'gatti' } })
        expect(esito.scheda).toMatchObject({
            tipo: 'quale-app',
            capacita: 'cerca_dentro_app',
            valori: { cosa: 'gatti' },
        })
        expect(esito.scheda?.app?.map((a) => a.pacchetto)).toEqual([
            'com.android.vending',
            'com.google.android.apps.messaging',
        ])
    })
})

/**
 * ⭐⭐⭐ CIÒ CHE L'ELENCO PROMETTE, IL TOCCO LO FA.
 *
 * MISURATO sul Pad il 2026-08-14: la scheda «quale app» elencava Chrome fra chi
 * sa cercare, e toccandolo compariva **«Non si è aperta»**. Due domande diverse
 * allo stesso telefono:
 *
 * | chi chiede | come chiede | cosa risponde |
 * |---|---|---|
 * | `chiAccetta` (l'elenco) | `queryIntentActivities` | «Chrome sa farlo» |
 * | `apriAzione` (il tocco) | `resolveActivity` | «nessuno lo fa» |
 *
 * `resolveActivity` guarda solo le attività con `CATEGORY_DEFAULT`, perché è
 * così che Android sceglie da solo su un intent implicito. Per
 * `ACTION_SEARCH` quasi nessuno la dichiara: quelle attività si aprono per
 * **componente esplicito**, come fa il motore di ricerca di sistema.
 *
 * ⛔ Il controllo è sul SORGENTE perché la cura è in Kotlin e vive in
 * `startActivity`: una prova vera si fa col telefono in mano — ed è stata fatta.
 * Questo cancello impedisce che qualcuno rimetta la domanda sbagliata.
 */
describe('⛔ l\'elenco e il tocco fanno la STESSA domanda al telefono', () => {
    const PLUGIN = 'android/app/src/main/java/ai/talos/agent/TalosDevicePlugin.kt'

    it('⛔ quando la strada implicita non c\'è, si apre per COMPONENTE', () => {
        const sorgente = codiceKotlin(PLUGIN)
        // Si chiede al telefono quale attività di QUEL pacchetto sa farlo...
        expect(sorgente).toMatch(
            /queryIntentActivities\(intent, 0\)[\s\S]{0,200}?activityInfo\?\.packageName == pacchetto/,
        )
        // ...e la si apre per nome.
        expect(sorgente).toContain('intent.component = android.content.ComponentName(')
    })

    /*
     * ⛔ Solo DENTRO il pacchetto chiesto: senza quel vincolo la riga diventa
     * «apri qualcosa che somigli», cioè aprire un'app a caso al posto di quella
     * che la persona ha toccato.
     */
    it('⛔ senza un pacchetto non si ripiega su niente', () => {
        expect(codiceKotlin(PLUGIN)).toMatch(/if \(pacchetto\.isNullOrEmpty\(\)\)[\s\S]{0,40}?null/)
    })

    /*
     * ⛔ E con un componente in mano la guardia di `avvia` si toglie: è un'altra
     * `resolveActivity`, cioè di nuovo la domanda sbagliata. L'unico giudice
     * onesto, lì, è provare e guardare l'eccezione.
     */
    it('⛔ col componente esplicito non si richiede il permesso a `resolveActivity`', () => {
        expect(codiceKotlin(PLUGIN)).toContain('chiedendoPrima = intent.component == null')
    })
})

/**
 * ⭐⭐⭐ L'APP PRIMA DEL BROWSER — owner: «NON SPOSTARE MAI LA PERSONA».
 *
 * MISURATO sul Pad il 2026-08-14, «metti su Pink Floyd su Spotify», con Spotify
 * installato:
 *
 *     START act=VIEW dat=https://open.spotify.com/…
 *           cmp=com.android.chrome/…IntentDispatcher      ⇐ il BROWSER
 *
 * `talosPercorri` passava il pacchetto alle due strade «azione» e
 * «riga-contatto», e lo **buttava via** su quella degli URI — cioè quella che
 * usano quasi tutte le capacità del registro. Un vincolo dichiarato dal
 * chiamante e ignorato da un ramo su tre è peggio di un vincolo che non c'è:
 * sembra che esista.
 */
describe('⛔ un URI di capacità va all\'APP dichiarata, non al browser', () => {
    it('⛔ il PACCHETTO viaggia anche sulla strada degli URI', async () => {
        await talosApriConApp('manda_testo_a_app', { testo: 'ciao' }, 'com.whatsapp')
        // (questa è una via «azione»: il pacchetto ci arrivava già)
        expect(apri.azioni[0]!.pacchetto).toBe('com.whatsapp')

        // ⛔ E la via URI: si guarda il sorgente, perché il mock del ponte non
        // può provare che il campo esca da qui con il nome giusto.
        const sorgente = readFileSync(
            resolve(__dirname, '../../..', 'src/lib/tools/intentiTools.ts'),
            'utf8',
        ).replace(/\/\*[\s\S]*?\*\//g, '')
        expect(sorgente).toMatch(
            /apriUri\(\{[\s\S]{0,200}?pacchetto \? \{ pacchetto \} : \{\}/,
        )
    })

    /*
     * ⛔ E il ripiego RESTA: «se l'app manca, apre il web invece di fallire».
     * Restringere senza ripiegare trasformerebbe una regola di cortesia in un
     * fallimento nuovo — su ogni capacità del registro, tutte insieme.
     */
    it('⛔ se quell\'app non sa aprirlo, si TOGLIE il vincolo e si riprova', () => {
        const plugin = codiceKotlin('android/app/src/main/java/ai/talos/agent/TalosDevicePlugin.kt')
        expect(plugin).toMatch(
            /intent\.setPackage\(pacchetto\)[\s\S]{0,200}?resolveActivity[\s\S]{0,80}?intent\.setPackage\(null\)/,
        )
    })
})

/**
 * ⭐⭐ LE ICONE — owner 2026-08-14: «icone pulite e coerenti nelle schede per
 * ogni app prevista».
 *
 * MISURATO sul Pad, prima versione: Spotify e Google Play Services riempivano
 * il quadrato mentre Gmail, Contatti e Chrome stavano dentro un cerchio. Non è
 * colpa delle app: `getApplicationIcon` restituisce l'icona **adattiva non
 * ritagliata**, e il ritaglio lo fa il launcher.
 */
describe('⛔ le icone delle app: dal telefono, e con la maschera del SISTEMA', () => {
    const PLUGIN = 'android/app/src/main/java/ai/talos/agent/TalosDevicePlugin.kt'

    it('⛔ vengono da `getApplicationIcon`, non da un file nostro', () => {
        const sorgente = codiceKotlin(PLUGIN)
        expect(sorgente).toContain('fun iconeApp(call: PluginCall)')
        expect(sorgente).toContain('pm.getApplicationIcon(pacchetto)')
    })

    /*
     * ⛔ La forma la decide il SISTEMA, non TALOS: `getIconMask()` è la stessa
     * maschera che il launcher applica, quindi l'elenco esce con la forma che
     * quella persona vede sul suo telefono.
     */
    it('⭐ la maschera è quella del sistema, applicata alle adattive', () => {
        const sorgente = codiceKotlin(PLUGIN)
        expect(sorgente).toMatch(
            /is android\.graphics\.drawable\.AdaptiveIconDrawable[\s\S]{0,400}?iconMask/,
        )
        expect(sorgente).toContain('pennello.clipPath(maschera)')
    })

    /*
     * ⛔ Un pacchetto sparito fra l'elenco e il disegno non deve lasciare la
     * scheda senza NESSUNA icona: ogni icona ha il suo `runCatching`.
     */
    it('⛔ un\'icona che non si può leggere non porta giù le altre', () => {
        const sorgente = codiceKotlin(PLUGIN)
        expect(sorgente).toMatch(/for \(indice in 0 until chiesti\.length\(\)\)[\s\S]{0,600}?runCatching \{/)
    })
})
