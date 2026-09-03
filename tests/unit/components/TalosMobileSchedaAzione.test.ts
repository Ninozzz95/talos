// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

/*
 * ⛔ L'i18n si finge, e la finzione RENDE LA CHIAVE: così un test che passa
 * con una chiave inesistente si vede subito — «chat.cardSwitchOn» a schermo
 * invece di «Acceso» è più rumoroso di una stringa vuota.
 */
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        t: (chiave: string) => ({
            'chat.cardSwitchOn': 'Acceso',
            'chat.cardSwitchOff': 'Spento',
            'toolActivity.deviceTorch': 'Torcia',
            'chat.cardProofRead': 'Verificato sul telefono',
            'chat.cardWhichApp': 'Con quale app?',
            'chat.cardAppOpened': 'Aperta',
            'chat.cardAppRefused': 'Non si è aperta',
            'chat.cardOpenA11ySettings': 'Apri le impostazioni di accessibilità',
            'chat.cardWhichFile': 'Quale file?',
            'chat.cardSent': 'Inviato',
            'chat.cardNotSent': 'NON inviato',
            'chat.cardSaveToLibrary': 'Salva nella Libreria',
            'chat.cardSavedToLibrary': 'Salvato nella Libreria',
            'chat.cardSaveFailed': 'Non è stato possibile salvarlo',
        }[chiave] ?? chiave),
    }),
}))

/*
 * ⛔ Il ponte del telefono si finge: il componente chiede le icone con un
 * `import()` pigro, e senza questo mock la prova aspetterebbe un telefono che
 * qui non c'è — cioè proverebbe il ripiego, non il disegno.
 */
const ponte = {
    chiesti: [] as string[][],
    icone: {} as Record<string, string>,
}

vi.mock('@/lib/device/devicePlugin', () => ({
    TalosDeviceBridge: {
        iconeApp: async ({ pacchetti }: { pacchetti: string[] }) => {
            ponte.chiesti.push(pacchetti)
            return { icone: ponte.icone }
        },
    },
}))

/*
 * ⛔ I due ponti si fingono QUI, dal 2026-08-14: prima erano `prop` passate
 * dalle schermate, ed è stato misurato che quelle schermate vivono nel grafo
 * d'avvio — 311 byte pagati da chi apre l'app senza aver mai visto una scheda.
 * Adesso la scheda, che è pigra, chiama `schedaComandi` da sé. Le asserzioni
 * sono le stesse: cambia da dove entra la finzione.
 */
const comandi = {
    commuta: async (_tool: string, _acceso: boolean): Promise<boolean> => true,
    apri: async (_c: string, _v: Record<string, string>, _p: string): Promise<boolean> => true,
    impostazioni: async (_azione: string): Promise<boolean> => true,
    mandaFile: async (_id: string, _dove: Record<string, string>): Promise<boolean> => true,
    // ⛔ owner 2026-08-27, artefatto HTML: TalosArtifactActivity può
    // rifiutarsi di aprirsi (dispositivo senza MULTI_PROFILE/MULTI_PROCESS,
    // fail-closed) — un finto SEMPRE-vero non proverebbe mai quel ramo.
    apriArtefatto: async (_id: string): Promise<boolean> => true,
    commutati: [] as Array<[string, boolean]>,
    aperti: [] as Array<[string, Record<string, string>, string]>,
    schermate: [] as string[],
    fileMandati: [] as Array<[string, Record<string, string>]>,
    artefattiAperti: [] as string[],
}

vi.mock('@/lib/tools/schedaComandi', () => ({
    talosCommutaDaScheda: async (tool: string, acceso: boolean) => {
        comandi.commutati.push([tool, acceso])
        return comandi.commuta(tool, acceso)
    },
    talosApriDaScheda: async (c: string, v: Record<string, string>, p: string) => {
        comandi.aperti.push([c, v, p])
        return comandi.apri(c, v, p)
    },
    talosApriImpostazioniDaScheda: async (azione: string) => {
        comandi.schermate.push(azione)
        return comandi.impostazioni(azione)
    },
    talosMandaFileDaScheda: async (id: string, dove: Record<string, string>) => {
        comandi.fileMandati.push([id, dove])
        return comandi.mandaFile(id, dove)
    },
    talosApriArtefattoDaScheda: async (id: string) => {
        comandi.artefattiAperti.push(id)
        return comandi.apriArtefatto(id)
    },
}))

/*
 * ⛔ Serve solo per la scheda MD (Rilievo 6, 22/8): il visualizzatore legge
 * il testo con `hydrateText`, la stessa via che il pannello media della
 * chat già usa per gli allegati.
 */
const hydrateText = vi.hoisted(() => vi.fn())
/*
 * ⛔ owner 2026-08-27, artefatto HTML: `saveArtifactToLibrary` è la stessa
 * famiglia di `hydrateText` sopra — un finto controllabile per-test, non
 * la vera implementazione (che tocca `TalosArtifactBridge` e la Libreria
 * vera, provate sul Pad separatamente).
 */
const saveArtifactToLibrary = vi.hoisted(() => vi.fn())
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ attachments: { hydrateText }, saveArtifactToLibrary }),
}))

import TalosMobileSchedaAzione from '@/components/chat/TalosMobileSchedaAzione.vue'

/**
 * La scheda che porta lo STATO, non l'esito — owner 2026-08-13.
 *
 * MISURATO contro Gemini: a «accendi la torcia» loro lasciano l'interruttore
 * dentro la chat e per spegnerla si tocca lì; noi dicevamo «fatto» e chiudevamo
 * il discorso. Questi test custodiscono le tre cose che fanno la differenza:
 * la levetta commuta davvero, TORNA INDIETRO se il ponte dice di no, e la riga
 * tecnica non la vede chi non ha acceso la diagnostica.
 */
/**
 * ⛔ Si passano i METADATI, come fa la lista dei messaggi: il componente legge,
 * valida e disegna da sé — la validazione sta nel chunk pigro, non nell'avvio.
 */
function monta(props: Record<string, unknown> = {}, acceso = true) {
    return mount(TalosMobileSchedaAzione, {
        props: {
            metadata: { cards: [{ tipo: 'interruttore', tool: 'device_torch', acceso }] },
            ...props,
        },
    })
}

/*
 * ⛔ Un giro di macchina: i due ponti entrano con un `import()` pigro, quindi la
 * risposta arriva un microtask dopo il click. Senza questa attesa il test
 * misurerebbe il fotogramma prima — ed è il modo in cui un test verde non prova
 * niente.
 */
async function respiro(w: { vm: { $nextTick: () => Promise<unknown> } }): Promise<void> {
    await new Promise((r) => setTimeout(r, 0))
    await w.vm.$nextTick()
}

beforeEach(() => {
    comandi.commuta = async () => true
    comandi.apri = async () => true
    comandi.impostazioni = async () => true
    comandi.commutati = []
    comandi.aperti = []
    comandi.mandaFile = async () => true
    comandi.schermate = []
    comandi.fileMandati = []
    comandi.apriArtefatto = async () => true
    comandi.artefattiAperti = []
})

describe('TalosMobileSchedaAzione', () => {
    it('mostra la levetta nello stato della scheda, con aria-checked', () => {
        const w = monta({})
        expect(w.get('[data-testid="talos-scheda-levetta"]').attributes('aria-checked')).toBe('true')
    })

    /*
     * ⛔ Lo stato NON è affidato al solo colore: c'è anche la parola. È il
     * pavimento di accessibilità che le linee guida sulle chat mettono per
     * primo, e su una levetta è proprio il caso che rompe.
     */
    it('dice lo stato anche a PAROLE, non solo col colore', () => {
        expect(monta({}).text()).toContain('Acceso')
        expect(monta({}, false).text()).toContain('Spento')
    })

    it('⭐ il tocco parla col ponte, senza passare dal modello', async () => {
        const w = monta({})
        await w.get('[data-testid="talos-scheda-levetta"]').trigger('click')
        await respiro(w)
        expect(comandi.commutati).toEqual([['device_torch', false]])
        expect(w.get('[data-testid="talos-scheda-levetta"]').attributes('aria-checked')).toBe('false')
    })

    /*
     * ⛔⛔ IL TEST CHE MORDE DI PIÙ. Una levetta che resta spostata mentre la
     * torcia è ancora accesa è la stessa bugia del segno «Fatto» su una cosa
     * non fatta — quella che abbiamo curato oggi — spostata dentro un comando.
     */
    it('⛔ TORNA INDIETRO se il ponte non ce la fa', async () => {
        comandi.commuta = async () => false
        const w = monta({})
        await w.get('[data-testid="talos-scheda-levetta"]').trigger('click')
        await respiro(w)
        expect(w.get('[data-testid="talos-scheda-levetta"]').attributes('aria-checked')).toBe('true')
    })

    it('⛔ torna indietro anche se il ponte SOLLEVA', async () => {
        comandi.commuta = async () => { throw new Error('ponte chiuso') }
        const w = monta({})
        await w.get('[data-testid="talos-scheda-levetta"]').trigger('click')
        await respiro(w)
        expect(w.get('[data-testid="talos-scheda-levetta"]').attributes('aria-checked')).toBe('true')
    })

    /*
     * ⛔ `dumpsys` e i millisecondi sono la NOSTRA prova, non la lingua di chi
     * usa il telefono. È la stessa regola già in vigore per i nomi dei tool.
     */
    it('la riga tecnica NON compare senza diagnostica', () => {
        const w = monta({ dettaglio: 'dumpsys · torch on · 20:32:41' })
        expect(w.find('[data-testid="talos-scheda-dettaglio"]').exists()).toBe(false)
    })

    it('la riga tecnica compare a chi ha acceso la diagnostica', () => {
        const w = monta({ dettaglio: 'dumpsys · torch on · 20:32:41', diagnostica: true })
        expect(w.get('[data-testid="talos-scheda-dettaglio"]').text()).toContain('dumpsys')
    })

    /*
     * ⛔⛔ S-3, visto sul Pad: «Torcia / Spento» e sotto «✓ Spento» — la stessa
     * parola due volte a tre millimetri di distanza. La prova deve dire cosa è
     * stato VERIFICATO, non ripetere lo stato.
     */
    it('⛔ la prova non RIPETE lo stato: dice cosa è stato verificato', () => {
        const testo = monta({}, false).text()
        expect(testo).toContain('Verificato sul telefono')
        // «Spento» compare una volta sola: sotto il nome, non anche nella prova.
        expect(testo.match(/Spento/g)).toHaveLength(1)
    })

    /*
     * ⛔ Una scheda malformata NON rompe la chat: non si disegna e basta. I
     * metadati sono un sacco aperto che viaggia anche nei backup.
     */
    it('⛔ una scheda malformata non disegna niente', () => {
        const w = monta({ metadata: { cards: [{ tipo: 'boh', tool: '' }] } })
        expect(w.find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    it('senza metadati non disegna niente', () => {
        expect(monta({ metadata: null }).find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    /** ⛔ Il nome interno non arriva mai a una persona. */
    it('mostra l’etichetta umana, non `device_torch`', () => {
        expect(monta({}).text()).not.toContain('device_torch')
    })
})

/**
 * ⭐⭐⭐ LA SCHEDA DELL'AGENDA — misurata contro Gemini il 2026-08-14.
 *
 * Alla stessa domanda («cosa ho questo weekend?») lui risponde col testo **e due
 * schede**: nome, giorno e intervallo orario. Noi rispondevamo con del testo e
 * basta. Owner: «SCHEDA SEMPRE».
 */
describe('TalosMobileSchedaAzione — agenda', () => {
    function agenda(voci: unknown[]) {
        return mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'agenda', voci }] } },
        })
    }

    it('⭐ disegna una riga per impegno, con ora, titolo e luogo', () => {
        const w = agenda([
            { titolo: 'Dentista', quando: '2026-08-15 17:00–18:00', luogo: 'Via Roma 12' },
            { titolo: 'Cena da Mario', quando: '2026-08-15 18:00–19:30' },
        ])
        expect(w.text()).toContain('Dentista')
        expect(w.text()).toContain('17:00–18:00')
        expect(w.text()).toContain('Via Roma 12')
        expect(w.text()).toContain('Cena da Mario')
    })

    /*
     * ⛔ «Non hai niente» è una FRASE, non un riquadro con dentro il nulla. Una
     * scheda vuota è rumore che occupa spazio e non dice niente.
     */
    it('⛔ un’agenda VUOTA non disegna nessuna scheda', () => {
        expect(agenda([]).find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    /*
     * ⛔ I metadati sono un sacco aperto che viaggia anche nei backup: una voce
     * senza orario non deve rompere la chat, semplicemente non si disegna.
     */
    it('⛔ una voce malformata non disegna niente', () => {
        expect(agenda([{ titolo: 'Senza quando' }]).find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    /*
     * ⛔ E la levetta NON deve comparire su un'agenda: non c'è niente da
     * commutare, e un comando che non comanda è la stessa promessa vuota del
     * segno «Fatto» su una cosa non fatta.
     */
    it('⛔ nessuna levetta su una scheda agenda', () => {
        const w = agenda([{ titolo: 'Dentista', quando: '2026-08-15 17:00–18:00' }])
        expect(w.find('[data-testid="talos-scheda-levetta"]').exists()).toBe(false)
    })
})

/**
 * ⭐⭐⭐ QUALE APP — la scheda che esiste perché il modello ha INVENTATO.
 *
 * MISURATO sul Pad il 2026-08-13: con in mano l'elenco vero delle app che sanno
 * mandare un testo, il modello ha risposto alla persona «WhatsApp, Telegram,
 * Signal, Messenger, ChatGPT» — **tre non installate su questo telefono e una
 * inventata di sana pianta**. Aveva la verità e ci ha scritto sopra.
 *
 * ⇒ Questi test custodiscono la cura: l'elenco va dal telefono allo schermo
 * senza passare dalle parole, e si TOCCA — chi legge non deve ridire un nome
 * che TALOS ha già.
 */
describe('TalosMobileSchedaAzione — quale app', () => {
    const APP = [
        { nome: 'WhatsApp', pacchetto: 'com.whatsapp' },
        { nome: 'Gmail', pacchetto: 'com.google.android.gm' },
    ]

    function qualeApp(props: Record<string, unknown> = {}, app: unknown[] = APP) {
        return mount(TalosMobileSchedaAzione, {
            props: {
                metadata: {
                    cards: [{
                        tipo: 'quale-app',
                        capacita: 'manda_testo_a_app',
                        valori: { testo: 'arrivo alle 8' },
                        app,
                    }],
                },
                ...props,
            },
        })
    }

    it('⭐ disegna l\'elenco VERO, un pulsante per app', () => {
        const w = qualeApp()
        const righe = w.findAll('[data-testid="talos-scheda-app"]')
        expect(righe).toHaveLength(2)
        expect(w.text()).toContain('Con quale app?')
        expect(righe[0]!.text()).toContain('WhatsApp')
        expect(righe[1]!.text()).toContain('Gmail')
    })

    /*
     * ⛔ Il NOME DEL PACCHETTO non è la lingua di chi usa il telefono, ed è la
     * stessa regola già in vigore per i nomi dei tool: `com.whatsapp` sullo
     * schermo sarebbe `device_torch` con un punto in mezzo.
     */
    it('⛔ mostra il nome dell\'app, non `com.whatsapp`', () => {
        expect(qualeApp().text()).not.toContain('com.whatsapp')
    })

    /*
     * ⛔⛔ IL TEST CHE MORDE: il tocco deve consegnare al telefono il PACCHETTO
     * di quella riga insieme ai valori già raccolti. Se passasse il nome, o
     * perdesse il testo per strada, l'app si aprirebbe vuota — che è il difetto
     * che l'intent doveva togliere di mezzo.
     */
    it('⭐ il tocco apre QUELL\'app, coi valori già raccolti', async () => {
        const w = qualeApp({})
        await w.findAll('[data-testid="talos-scheda-app"]')[1]!.trigger('click')
        await respiro(w)
        expect(comandi.aperti).toEqual([[
            'manda_testo_a_app',
            { testo: 'arrivo alle 8' },
            'com.google.android.gm',
        ]])
    })

    it('⭐ dice «Aperta» solo DOPO che il telefono ha risposto di sì', async () => {
        const w = qualeApp({})
        expect(w.text()).not.toContain('Aperta')
        await w.get('[data-testid="talos-scheda-app"]').trigger('click')
        await respiro(w)
        expect(w.text()).toContain('Aperta')
    })

    /*
     * ⛔⛔ E SE NON SI APRE, LO DICE. Il telefono aveva risposto che quell'app sa
     * fare questa cosa (`queryIntentActivities`), poi l'app ha rifiutato: tacere
     * lascerebbe la persona a toccare due volte lo stesso nome aspettando che
     * succeda qualcosa. È il segno «Fatto» su una cosa non fatta, al contrario.
     */
    it('⛔ dice che NON si è aperta quando il ponte dice di no', async () => {
        comandi.apri = async () => false
        const w = qualeApp({})
        await w.get('[data-testid="talos-scheda-app"]').trigger('click')
        await respiro(w)
        expect(w.text()).toContain('Non si è aperta')
        // ⛔ Con la maiuscola: è la parola del successo, e qui non ci deve essere.
        expect(w.text()).not.toContain('Aperta')
    })

    it('⛔ lo dice anche se il ponte SOLLEVA', async () => {
        comandi.apri = async () => { throw new Error('ponte chiuso') }
        const w = qualeApp({})
        await w.get('[data-testid="talos-scheda-app"]').trigger('click')
        await respiro(w)
        expect(w.text()).toContain('Non si è aperta')
    })

    /*
     * ⛔ Un elenco VUOTO non si disegna: questa scheda esiste perché il modello
     * inventava, e un riquadro che chiede «quale app?» senza app sotto è la
     * domanda senza la risposta che la giustifica.
     */
    it('⛔ senza app non disegna niente', () => {
        expect(qualeApp({}, []).find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    /*
     * ⛔ `pacchetto` è ciò che il tocco consegna al telefono: una voce col solo
     * nome sarebbe un pulsante che non può fare niente.
     */
    it('⛔ una voce senza pacchetto non disegna niente', () => {
        expect(qualeApp({}, [{ nome: 'WhatsApp' }])
            .find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
        expect(qualeApp({}, [{ nome: 'WhatsApp', pacchetto: '' }])
            .find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })

    /*
     * ⛔ Le righe si raggiungono col TAB e si premono con INVIO: sono `<button>`,
     * non `<div>` con un `@click` sopra. Un elenco che si può usare solo col
     * dito taglia fuori chi naviga da tastiera o con un lettore di schermo.
     */
    it('⛔ sono PULSANTI, non riquadri con un click sopra', () => {
        const righe = qualeApp().findAll('[data-testid="talos-scheda-app"]')
        // ⛔ Senza questa riga `every` su un elenco vuoto rende `true`: il test
        // passerebbe proprio nel caso in cui non c'è niente da premere.
        expect(righe.length).toBe(2)
        expect(righe.every((r) => r.element.tagName === 'BUTTON')).toBe(true)
        expect(righe.every((r) => r.attributes('type') === 'button')).toBe(true)
    })

    /*
     * ⛔ Due schede senza `tool` nello stesso messaggio devono restare DUE.
     * La deduplica del controller le teneva su una chiave sola — vedi il
     * commento in `chatController` — e questo è il caso a valle: il componente
     * non deve rifonderle a sua volta con una chiave di `v-for` condivisa.
     */
    it('⛔ una sveglia e un elenco di app nello stesso messaggio restano DUE schede', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: {
                metadata: {
                    cards: [
                        { tipo: 'sveglia', quando: '07:30' },
                        {
                            tipo: 'quale-app',
                            capacita: 'manda_testo_a_app',
                            valori: { testo: 'ciao' },
                            app: APP,
                        },
                    ],
                },
            },
        })
        expect(w.findAll('[data-testid="talos-scheda-azione"]')).toHaveLength(2)
    })
})

/**
 * ⭐⭐⭐ LE ICONE — owner 2026-08-14: «icone pulite e coerenti nelle schede per
 * ogni app prevista».
 *
 * ⛔ Vengono dal TELEFONO (`getApplicationIcon`), non da un file nostro: sono
 * quelle che la persona vede sul launcher, e per l'app installata domani
 * esistono già. Un set disegnato da noi sarebbe una riga predeterminata col
 * vestito grafico.
 *
 * ⛔ E si chiedono al DISEGNO, non si salvano nei metadati: diciassette app a
 * ~6 kB l'una sono cento kilobyte nel database della chat, per sempre e in ogni
 * backup, per un dato che il telefono ha già.
 */
describe('⛔ le icone delle app: vere, e chieste solo quando si disegnano', () => {
    const APP = [
        { nome: 'WhatsApp', pacchetto: 'com.whatsapp' },
        { nome: 'Gmail', pacchetto: 'com.google.android.gm' },
    ]
    const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

    function conIcone(icone: Record<string, string>) {
        ponte.chiesti = []
        ponte.icone = icone
        return mount(TalosMobileSchedaAzione, {
            props: {
                metadata: {
                    cards: [{
                        tipo: 'quale-app',
                        capacita: 'manda_testo_a_app',
                        valori: { testo: 'ciao' },
                        app: APP,
                    }],
                },
            },
        })
    }

    it('⭐ chiede al telefono le icone delle app che sta per mostrare', async () => {
        const w = conIcone({})
        await new Promise((r) => setTimeout(r, 0))
        expect(ponte.chiesti).toEqual([['com.whatsapp', 'com.google.android.gm']])
        w.unmount()
    })

    it('⭐ disegna l\'icona vera accanto al nome', async () => {
        const w = conIcone({ 'com.whatsapp': PIXEL })
        await new Promise((r) => setTimeout(r, 0))
        await w.vm.$nextTick()
        const immagini = w.findAll('.talos-icona img')
        expect(immagini).toHaveLength(1)
        expect(immagini[0]!.attributes('src')).toBe(PIXEL)
        w.unmount()
    })

    /*
     * ⛔⛔ LA CORNICE RESTA ANCHE VUOTA, ed è il senso di «coerenti»: senza,
     * la riga con l'icona e quella senza avrebbero il testo a due rientri
     * diversi, e l'elenco ballerebbe a seconda di cosa è arrivato dal telefono.
     */
    it('⛔ la cornice c\'è per TUTTE, anche per chi non ha dato un\'icona', async () => {
        const w = conIcone({ 'com.whatsapp': PIXEL })
        await new Promise((r) => setTimeout(r, 0))
        await w.vm.$nextTick()
        expect(w.findAll('.talos-icona')).toHaveLength(2)
        expect(w.findAll('.talos-icona img')).toHaveLength(1)
        w.unmount()
    })

    /*
     * ⛔ Un'icona è un aiuto a riconoscere, non il dato: senza telefono — sul
     * web, o con l'app disinstallata fra l'elenco e il disegno — la riga si
     * disegna lo stesso e si tocca lo stesso.
     */
    it('⛔ senza NESSUNA icona le righe restano toccabili', async () => {
        const w = conIcone({})
        await new Promise((r) => setTimeout(r, 0))
        await w.vm.$nextTick()
        expect(w.findAll('[data-testid="talos-scheda-app"]')).toHaveLength(2)
        expect(w.findAll('.talos-icona img')).toHaveLength(0)
        expect(w.text()).toContain('WhatsApp')
        w.unmount()
    })

    /*
     * ⛔ L'icona NON si annuncia: il nome è già scritto accanto, e un lettore di
     * schermo che dicesse due volte «WhatsApp» allungherebbe l'elenco senza
     * aggiungere niente.
     */
    it('⛔ l\'icona è muta per un lettore di schermo', async () => {
        const w = conIcone({ 'com.whatsapp': PIXEL })
        await new Promise((r) => setTimeout(r, 0))
        await w.vm.$nextTick()
        expect(w.get('.talos-icona').attributes('aria-hidden')).toBe('true')
        expect(w.get('.talos-icona img').attributes('alt')).toBe('')
        w.unmount()
    })
})

/**
 * ⭐⭐⭐ IL COMANDO INVECE DELLA GARA — e la gara la perdevamo.
 *
 * MISURATO sul Pad il 2026-08-17, dal registro delle activity. L'invio fallisce
 * perché la lettura dello schermo è spenta, e lo strumento apriva da solo le
 * impostazioni. In 900 millesimi:
 *
 *     05:31:14.098  TALOS      apre WhatsApp  (wa.me)
 *     05:31:14.135  TALOS      apre ACCESSIBILITY_SETTINGS   ← 37 ms dopo
 *     05:31:14.155  WhatsApp   .contact.ui.picker.ContactPicker
 *     05:31:14.927  WhatsApp   .Conversation
 *     05:31:14.959  WhatsApp   .home.ui.HomeActivity
 *     05:31:14.980  WhatsApp   .Conversation
 *
 * Le impostazioni si erano aperte DAVVERO. Poi WhatsApp ha continuato a
 * lanciare finestre e le ha sepolte — e la risposta diceva «sono già aperte
 * sullo schermo» mentre a schermo c'era WhatsApp.
 *
 * ⇒ Lo schermo cambia quando lo tocca la persona.
 */
describe('⭐⭐⭐ la scheda porta il comando, non la parola «fatto»', () => {
    const INVIO_OCCHIO = {
        metadata: {
            cards: [{ tipo: 'invio', app: 'WhatsApp', partito: false, perche: 'occhio' }],
        },
    }
    const bottone = (w: ReturnType<typeof mount>) => w.find('[data-testid="talos-scheda-apri-impostazioni"]')

    it('⛔ il pulsante c\'e quando la lettura dello schermo e spenta', () => {
        const w = mount(TalosMobileSchedaAzione, { props: INVIO_OCCHIO })
        expect(bottone(w).exists()).toBe(true)
        expect(bottone(w).text()).toContain('Apri le impostazioni di accessibilità')
    })

    it('⛔ e il tocco chiede LA SCHERMATA GIUSTA', async () => {
        const w = mount(TalosMobileSchedaAzione, { props: INVIO_OCCHIO })
        await bottone(w).trigger('click')
        await respiro(w)
        expect(comandi.schermate).toEqual(['android.settings.ACCESSIBILITY_SETTINGS'])
    })

    /*
     * ⛔ Un pulsante che si spegne e basta lascia credere di aver fatto
     * qualcosa: è il segno «Fatto» su una cosa non fatta, spostato in un
     * comando.
     */
    it('⛔ se non si apre LO DICE', async () => {
        comandi.impostazioni = async () => false
        const w = mount(TalosMobileSchedaAzione, { props: INVIO_OCCHIO })
        await bottone(w).trigger('click')
        await respiro(w)
        expect(bottone(w).text()).toContain('Non si è aperta')
    })

    it('⛔ e se si apre NON dice niente', async () => {
        const w = mount(TalosMobileSchedaAzione, { props: INVIO_OCCHIO })
        await bottone(w).trigger('click')
        await respiro(w)
        expect(bottone(w).text()).not.toContain('Non si è aperta')
    })

    /*
     * ⛔ AL CONTRARIO, e sono i casi che tengono il pulsante al suo posto: per
     * gli altri motivi non sappiamo dove mandare la persona, e un comando che
     * apre a caso è peggio di nessun comando.
     */
    it.each([
        ['altra-app'],
        ['testo'],
        ['pulsante'],
        ['ponte'],
    ])('⛔ NIENTE pulsante per «%s»: non sapremmo dove mandare nessuno', (perche) => {
        const w = mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'invio', app: 'WhatsApp', partito: false, perche }] } },
        })
        expect(bottone(w).exists()).toBe(false)
    })

    it('⛔ e NIENTE pulsante senza motivo: non c\'e niente da aprire', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'invio', app: 'WhatsApp', partito: false }] } },
        })
        expect(bottone(w).exists()).toBe(false)
    })

    it('⛔⛔ e NIENTE pulsante se il messaggio E PARTITO', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'invio', app: 'WhatsApp', partito: true }] } },
        })
        expect(bottone(w).exists()).toBe(false)
    })
})


/**
 * ⭐⭐⭐ QUALE FILE — la scheda che chiude un GIRO CHIUSO.
 *
 * MISURATO sul Pad il 2026-08-17. Due `nota-talos.txt` nella Libreria. L'esito
 * dello strumento portava i numeri, gli id, e a lettere «call this tool again
 * with "file" set to that entry's id». La persona ha risposto «1», e il modello
 * ha rifatto la STESSA domanda: richiamava col nome, riotteneva l'ambiguita',
 * riscriveva l'elenco.
 *
 * ⛔ Una istruzione scritta NON vincola il modello. Se una cosa deve succedere,
 * la fa il codice — e qui la fa il dito.
 */
describe('⭐⭐⭐ due file omonimi si scelgono col DITO', () => {
    const DUE = {
        metadata: {
            cards: [{
                tipo: 'quale-file',
                app: 'WhatsApp',
                contatto: 'Antonino Rizzo',
                file: [
                    { nome: 'nota-talos.txt', id: 'a-1' },
                    { nome: 'nota-talos.txt', id: 'b-2' },
                ],
            }],
        },
    }
    const righe = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="talos-scheda-file"]')

    it('⛔ le due righe ci sono, NUMERATE', () => {
        const w = mount(TalosMobileSchedaAzione, { props: DUE })
        expect(righe(w)).toHaveLength(2)
        // ⛔ Il numero serve: due nomi identici non si distinguono a occhio.
        expect(righe(w)[0].text()).toContain('1.')
        expect(righe(w)[1].text()).toContain('2.')
    })

    it('⛔⛔ il tocco porta l ID, non il nome', async () => {
        const w = mount(TalosMobileSchedaAzione, { props: DUE })
        await righe(w)[1].trigger('click')
        await respiro(w)
        expect(comandi.fileMandati).toHaveLength(1)
        expect(comandi.fileMandati[0][0]).toBe('b-2')
    })

    /*
     * ⛔ E porta anche il RESTO: app e destinatario erano gia' stati raccolti, e
     * perderli qui vorrebbe dire ricominciare a chiedere da capo.
     */
    it('⛔ e si porta dietro app e destinatario', async () => {
        const w = mount(TalosMobileSchedaAzione, { props: DUE })
        await righe(w)[0].trigger('click')
        await respiro(w)
        expect(comandi.fileMandati[0][1]).toEqual({ app: 'WhatsApp', contatto: 'Antonino Rizzo' })
    })

    it('⛔ se non parte LO DICE, e lo dice con la parola dell INVIO', async () => {
        comandi.mandaFile = async () => false
        const w = mount(TalosMobileSchedaAzione, { props: DUE })
        await righe(w)[0].trigger('click')
        await respiro(w)
        expect(righe(w)[0].text()).toContain('NON inviato')
    })

    /*
     * ⛔ AL CONTRARIO: con UN file solo non c'era ambiguita', e un elenco di uno
     * e' una domanda senza dubbio.
     */
    it('⛔ con UN file solo la scheda non si disegna', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'quale-file', file: [{ nome: 'x.txt', id: 'a' }] }] } },
        })
        expect(righe(w)).toHaveLength(0)
    })

    /*
     * ⛔ E una voce senza id non si disegna: e' proprio cio' che il tocco
     * consegna, e senza riporterebbe al giro chiuso da cui questa scheda nasce.
     */
    it('⛔ e una voce SENZA id non si disegna', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: { metadata: { cards: [{ tipo: 'quale-file', file: [
                { nome: 'x.txt', id: 'a' }, { nome: 'x.txt', id: '' },
            ] }] } },
        })
        expect(righe(w)).toHaveLength(0)
    })
})


/**
 * ⭐⭐⭐ IL PDF SI APRE — e prima la scheda era un'etichetta MUTA.
 *
 * MISURATO sul Pad il 2026-08-17. TALOS genera un PDF, lo salva in Libreria, e
 * la scheda lo mostra: «TALOS in tre righe.pdf · Documento · 10 KB». Toccandola
 * non succede NIENTE. Owner: «il PDF bisogna poterlo visualizzare dentro la
 * app».
 *
 * ⛔ Un'etichetta che sembra un comando e non lo e' e' peggio di un'etichetta e
 * basta: chi legge tocca, non succede niente, e conclude che l'app e' rotta.
 *
 * ⛔ E il visualizzatore rende con `PdfRenderer` del framework Android — zero
 * dipendenze, zero `.so`, zero byte nel grafo d'avvio, che ha un tetto di
 * 605.000. Una libreria ne avrebbe portati ~16 MB di nativo; pdf.js dentro la
 * WebView avrebbe pagato proprio su quel tetto.
 */
describe('⭐⭐⭐ la scheda di un PDF si apre', () => {
    const conPdf = (extra: Record<string, unknown> = {}) => mount(TalosMobileSchedaAzione, {
        props: {
            metadata: {
                cards: [{
                    tipo: 'creato',
                    titolo: 'TALOS in tre righe.pdf',
                    genere: 'Documento',
                    dettaglio: '10 KB',
                    pdf: 'content://ai.talos/files/abc.pdf',
                    ...extra,
                }],
            },
        },
    })
    const riga = (w: ReturnType<typeof mount>) => w.get('[data-testid="talos-scheda-creato"]')

    it('⛔⛔ col pdf la riga e un BOTTONE, non un riquadro muto', () => {
        expect(riga(conPdf()).element.tagName).toBe('BUTTON')
    })

    it('⛔ e porta il chevron, cosi si vede che si tocca', () => {
        expect(riga(conPdf()).text()).toContain('›')
    })

    /*
     * ⛔ AL CONTRARIO, ed e il caso che tiene onesta la riga sopra: una scheda
     * SENZA pdf e senza rotta resta un riquadro. Se diventasse un bottone,
     * torneremmo al difetto di partenza — un comando che non fa niente.
     */
    it('⛔⛔ ma senza pdf e senza rotta NON e un bottone', () => {
        const w = mount(TalosMobileSchedaAzione, {
            props: {
                metadata: {
                    cards: [{ tipo: 'creato', titolo: 'nota.txt', genere: 'Documento' }],
                },
            },
        })
        expect(w.get('[data-testid="talos-scheda-creato"]').element.tagName).toBe('DIV')
    })

    it('⛔ il visualizzatore NON c e finche nessuno tocca', () => {
        expect(conPdf().find('[data-testid="talos-pdf-viewer"]').exists()).toBe(false)
    })
})

/**
 * ⭐⭐⭐ IL MARKDOWN SI APRE FORMATTATO — rilievo owner 22/8, stessa famiglia
 * del PDF qui sopra: «non è possibile cliccare sul file MD appena creato
 * dalla scheda chat». Vedi `documentTools.ts` per dove `mdFileId` nasce.
 */
describe('⭐⭐⭐ la scheda di un MD si apre, formattata', () => {
    beforeEach(() => { hydrateText.mockReset() })

    const conMd = (extra: Record<string, unknown> = {}) => mount(TalosMobileSchedaAzione, {
        props: {
            metadata: {
                cards: [{
                    tipo: 'creato',
                    titolo: 'appunti.md',
                    genere: 'Documento',
                    dettaglio: '3 KB',
                    mdFileId: 'file-123',
                    ...extra,
                }],
            },
        },
    })
    const riga = (w: ReturnType<typeof mount>) => w.get('[data-testid="talos-scheda-creato"]')

    it('⛔⛔ col mdFileId la riga e un BOTTONE, non un riquadro muto', () => {
        expect(riga(conMd()).element.tagName).toBe('BUTTON')
        expect(riga(conMd()).text()).toContain('›')
    })

    it('⛔ il visualizzatore NON c e finche nessuno tocca', () => {
        expect(conMd().find('[data-testid="talos-markdown-viewer"]').exists()).toBe(false)
    })

    /*
     * ⛔⛔ IL TOCCO VERO: non basta che sia un bottone, deve aprire il testo
     * FORMATTATO — è la stessa distinzione fra Rilievo 5 e Rilievo 6, ed
     * entrambi si chiudono in un solo tocco o nessuno dei due è chiuso
     * davvero.
     */
    it('⛔⛔ il tocco apre il visualizzatore col testo FORMATTATO, letto per id', async () => {
        hydrateText.mockResolvedValue('## Appunti\n\n- uno\n- due')
        const w = conMd()
        await riga(w).trigger('click')
        // `defineAsyncComponent` risolve il proprio `import()` su un giro
        // di microtask che `flushPromises()` da solo non copre sempre —
        // stesso `vi.waitFor` già in uso altrove in questa suite per la
        // stessa classe di componente pigro.
        await vi.waitFor(() => {
            expect(w.find('[data-testid="talos-markdown-viewer"]').exists()).toBe(true)
        })
        await flushPromises()
        expect(hydrateText).toHaveBeenCalledWith('file-123')
        const visualizzatore = w.get('[data-testid="talos-markdown-viewer"]')
        await vi.waitFor(() => {
            expect(visualizzatore.find('h2').exists()).toBe(true)
        })
        expect(visualizzatore.text()).not.toContain('##')
    })
})

/**
 * ⭐⭐⭐ PIÙ DI UNA COSA CREATA IN UN GIRO SOLO — owner 2026-08-27, «hai anche
 * testato quella cosa di ChatGPT? creare un tool UI che ti trasforma una
 * lista in un elemento in chat interattivo?». Non l'Apps SDK di OpenAI: la
 * STESSA scheda `creato` sopra, ripetuta per voce — vedi `tracciaAzione.ts`.
 *
 * ⛔ Nessun tocco su una voce con `dove` in questi test: il componente chiama
 * `useRouter()` senza un plugin router installato in questa suite (nessun
 * test esistente di `creato` lo fa neanche per la sua rotta) — provare il
 * tag/il chevron/l'assenza di crash sulla voce SENZA `dove` copre lo stesso
 * ramo di codice senza dipendere da un router che qui non c'è.
 */
describe('⭐⭐⭐ la scheda "creati" — più voci nella stessa card', () => {
    const conVoci = (voci: Array<Record<string, unknown>>) => mount(TalosMobileSchedaAzione, {
        props: {
            metadata: { cards: [{ tipo: 'creati', voci }] },
        },
    })

    it('una riga per voce, col titolo e il genere di ciascuna', () => {
        const w = conVoci([
            { titolo: 'Prima nota', genere: 'Nota', dove: '/notes/1' },
            { titolo: 'Seconda nota', genere: 'Nota', dove: '/notes/2' },
        ])
        const righe = w.findAll('[data-testid="talos-scheda-creati-voce"]')
        expect(righe).toHaveLength(2)
        expect(righe[0]!.text()).toContain('Prima nota')
        expect(righe[0]!.text()).toContain('Nota')
        expect(righe[1]!.text()).toContain('Seconda nota')
    })

    it('⛔ con `dove` la voce è un BOTTONE col chevron', () => {
        const w = conVoci([{ titolo: 'Prima nota', genere: 'Nota', dove: '/notes/1' }])
        const riga = w.get('[data-testid="talos-scheda-creati-voce"]')
        expect(riga.element.tagName).toBe('BUTTON')
        expect(riga.text()).toContain('›')
    })

    /*
     * ⛔⛔ AL CONTRARIO: la stessa regola di `creato` singolare — senza rotta
     * resta un riquadro muto, mai un bottone che non porta da nessuna parte.
     */
    it('⛔⛔ senza `dove` la voce resta un riquadro, non un bottone, e il tocco non fa niente', async () => {
        const w = conVoci([{ titolo: 'Una memoria', genere: 'Memoria' }])
        const riga = w.get('[data-testid="talos-scheda-creati-voce"]')
        expect(riga.element.tagName).toBe('DIV')
        expect(riga.text()).not.toContain('›')
        await expect(riga.trigger('click')).resolves.not.toThrow()
    })

    it('genere per voce: due voci di specie diversa nella stessa card, mai un genere condiviso', () => {
        const w = conVoci([
            { titolo: 'Comprare il latte', genere: 'Attività', dove: '/tasks/1' },
            { titolo: 'Idea per il weekend', genere: 'Nota', dove: '/notes/9' },
        ])
        const righe = w.findAll('[data-testid="talos-scheda-creati-voce"]')
        expect(righe[0]!.text()).toContain('Attività')
        expect(righe[1]!.text()).toContain('Nota')
    })

    /*
     * ⛔ Zero voci non si disegna — stessa regola di `agenda`/`quale-app`: un
     * tool che dichiara la scheda senza aver creato niente non deve mostrare
     * una card vuota, sarebbe la bugia opposta del «Fatto».
     */
    it('⛔ un elenco VUOTO non disegna nessuna scheda', () => {
        const w = conVoci([])
        expect(w.find('[data-testid="talos-scheda-azione"]').exists()).toBe(false)
    })
})

/**
 * ⭐⭐⭐ L'ARTEFATTO HTML — owner 2026-08-27, «creare artefatti con schemi
 * avanzati e interagibili in chat, come fa ChatGPT: spirografi,
 * simulazioni». Il tocco NON naviga: chiama `talosApriArtefattoDaScheda`,
 * che lancia `TalosArtifactActivity` (WebView e profilo separati,
 * verificato sul Pad a non avere accesso al ponte Capacitor né alla rete).
 * Qui si prova solo il contratto della card, tramite `comandi.artefattiAperti`/
 * `comandi.apriArtefatto` — lo stesso finto condiviso di `schedaComandi`
 * dichiarato in testa al file, non un secondo `vi.mock` per lo stesso modulo.
 */
describe('⭐⭐⭐ la scheda "artefatto" — apre una WebView isolata, non una rotta', () => {
    const conArtefatto = () => mount(TalosMobileSchedaAzione, {
        props: {
            metadata: { cards: [{ tipo: 'artefatto', titolo: 'Spirograph', id: 'a1b2c3' }] },
        },
    })

    it('è un bottone col titolo e il chevron, non un riquadro muto', () => {
        const w = conArtefatto()
        const riga = w.get('[data-testid="talos-scheda-artefatto"]')
        expect(riga.element.tagName).toBe('BUTTON')
        expect(riga.text()).toContain('Spirograph')
        expect(riga.text()).toContain('›')
    })

    it('⛔ il tocco chiama talosApriArtefattoDaScheda con l\'id, non un router.push', async () => {
        const w = conArtefatto()
        await w.get('[data-testid="talos-scheda-artefatto"]').trigger('click')
        await respiro(w)
        expect(comandi.artefattiAperti).toEqual(['a1b2c3'])
    })

    /*
     * ⛔ Verso contrario: `TalosArtifactActivity` rifiuta di aprirsi
     * (dispositivo senza MULTI_PROFILE/MULTI_PROCESS — fail-closed, mai un
     * downgrade silenzioso) e la persona deve VEDERLO, non restare davanti
     * a un tocco che non ha fatto niente.
     */
    it('⛔⛔ se l\'apertura è rifiutata, lo dice a schermo', async () => {
        comandi.apriArtefatto = async () => false
        const w = conArtefatto()
        await w.get('[data-testid="talos-scheda-artefatto"]').trigger('click')
        await respiro(w)
        expect(w.get('[data-testid="talos-scheda-artefatto"]').text()).toContain('Non si è aperta')
    })
})

/**
 * ⭐⭐⭐ SALVARE L'ARTEFATTO NELLA LIBRERIA — owner 2026-08-27, «una cosa
 * molto importante che dà una spinta forte»: senza, un artefatto vive
 * SOLO scorrendo la chat all'indietro. Riusa `chatController.saveArtifactToLibrary`
 * (finto qui, provato per davvero — Libreria vera, ponte vero — sul Pad).
 */
describe('⭐⭐⭐ "Salva nella Libreria" — un\'azione separata dall\'apertura', () => {
    beforeEach(() => { saveArtifactToLibrary.mockReset() })

    const conArtefatto = () => mount(TalosMobileSchedaAzione, {
        props: {
            metadata: { cards: [{ tipo: 'artefatto', titolo: 'Spirograph', id: 'a1b2c3' }] },
        },
    })

    it('chiama saveArtifactToLibrary con id e titolo, non con l\'apertura', async () => {
        saveArtifactToLibrary.mockResolvedValue({ ok: true, fileId: 'f1' })
        const w = conArtefatto()
        await w.get('[data-testid="talos-scheda-artefatto-salva"]').trigger('click')
        await respiro(w)
        expect(saveArtifactToLibrary).toHaveBeenCalledWith('a1b2c3', 'Spirograph')
        // ⛔ Il tocco su «salva» non ha aperto l'Activity — le due azioni
        // sono indipendenti, non un tocco solo che fa entrambe.
        expect(comandi.artefattiAperti).toEqual([])
    })

    it('un successo mostra "Salvato nella Libreria" e disabilita il bottone', async () => {
        saveArtifactToLibrary.mockResolvedValue({ ok: true, fileId: 'f1' })
        const w = conArtefatto()
        const bottone = w.get('[data-testid="talos-scheda-artefatto-salva"]')
        await bottone.trigger('click')
        await respiro(w)
        expect(bottone.text()).toContain('Salvato nella Libreria')
        expect(bottone.attributes('disabled')).toBeDefined()
    })

    /*
     * ⛔ Verso contrario: un salvataggio rifiutato lo dice a schermo, e il
     * bottone resta premibile — a differenza del successo, un fallimento
     * deve poter essere ritentato.
     */
    it('⛔⛔ un fallimento lo dice a schermo, e il bottone resta premibile', async () => {
        saveArtifactToLibrary.mockResolvedValue({ ok: false, reason: 'TALOS_ARTIFACT_SAVE_FAILED' })
        const w = conArtefatto()
        const bottone = w.get('[data-testid="talos-scheda-artefatto-salva"]')
        await bottone.trigger('click')
        await respiro(w)
        expect(bottone.text()).toContain('Non è stato possibile salvarlo')
        expect(bottone.attributes('disabled')).toBeUndefined()
    })

    it('un doppio tocco rapido non chiama il salvataggio due volte', async () => {
        let sblocca!: (value: { ok: true, fileId: string }) => void
        saveArtifactToLibrary.mockReturnValue(new Promise((r) => { sblocca = r }))
        const w = conArtefatto()
        const bottone = w.get('[data-testid="talos-scheda-artefatto-salva"]')
        await bottone.trigger('click')
        await bottone.trigger('click')
        sblocca({ ok: true, fileId: 'f1' })
        await respiro(w)
        expect(saveArtifactToLibrary).toHaveBeenCalledTimes(1)
    })
})
