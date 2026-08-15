// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

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
    commutati: [] as Array<[string, boolean]>,
    aperti: [] as Array<[string, Record<string, string>, string]>,
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
    comandi.commutati = []
    comandi.aperti = []
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
