import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTalosCalendarTools } from '@/lib/tools/calendarioTools'
import type { TalosEventoCalendario } from '@/lib/device/calendario'

/**
 * ⭐⭐⭐ IL CALENDARIO — e le regole che nascono tutte da una MISURA.
 *
 * La capacità è nata da un difetto visto sul Pad il 2026-08-14: «che impegni ho
 * domani?» e TALOS rispondeva «non hai compiti registrati», avendo guardato le
 * PROPRIE note. Una risposta sicura e falsa sulla giornata di una persona.
 */
/**
 * ⛔ L'ORA SI FISSA DA OROLOGIO, NON DA ISTANTE.
 *
 * Qui c'era `Date.parse('2026-08-15T15:00:00.000Z')` con accanto il commento
 * «→ 17:00 (Europe/Rome)», e l'attesa scritta a mano era `17:00–18:00`. Vero
 * su questo computer, falso ovunque altro: MISURATO il 2026-08-16, la stessa
 * suite fa 30 verdi con `TZ=Europe/Rome` e due rossi con `TZ=UTC` — che è il
 * fuso di ogni runner di GitHub, e di chiunque cloni il repo fuori dall'Italia.
 *
 * ⇒ Questi due test parlano di COME SI SCRIVE un orario, non di quale istante
 * sia. Allora l'istante si costruisce dai pezzi dell'orologio locale: così le
 * 17:00 sono le 17:00 dappertutto, e l'attesa resta leggibile invece di
 * diventare un calcolo.
 *
 * ⛔ Il caso «tutto il giorno» qui sotto fa il contrario di proposito — fissa
 * mezzanotte UTC — perché lì il fuso È il soggetto della prova.
 */
function oraLocale(anno: number, mese: number, giorno: number, ore: number): number {
    return new Date(anno, mese - 1, giorno, ore, 0, 0, 0).getTime()
}

function evento(over: Partial<TalosEventoCalendario> = {}): TalosEventoCalendario {
    return {
        titolo: 'Dentista',
        // 2026-08-15, dalle 17:00 alle 18:00 sull'orologio di chi legge.
        inizio: oraLocale(2026, 8, 15, 17),
        fine: oraLocale(2026, 8, 15, 18),
        tuttoIlGiorno: false,
        luogo: 'Via Roma 12',
        calendario: 'persona@example.com',
        occupa: true,
        ...over,
    }
}

/** Cosa ha ricevuto il ponte per l'ULTIMA modifica: è la prova che morde. */
const modifiche: Array<Record<string, unknown>> = []

function attrezzo(eventi: TalosEventoCalendario[], nome = 'calendar_read') {
    const tools = createTalosCalendarTools(
        vi.fn(async () => ({ stato: 'letto' as const, eventi, calendari: ['Famiglia', 'Lavoro'] })),
        vi.fn(async () => ({ stato: 'scritto' as const, calendario: 'x', inizioVero: null })),
        vi.fn(async (input: Record<string, unknown>) => {
            modifiche.push(input)
            return { stato: 'fatto' as const, inizioVero: 1_786_000_000_000, titoloVero: 'Cena da Mario' }
        }),
    )
    return tools.find((t) => t.name === nome)!
}

async function letto(eventi: TalosEventoCalendario[]): Promise<string> {
    const esito = await attrezzo(eventi).run(
        { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
        {} as never,
    )
    return esito.content
}

describe('calendar_read — come si racconta un impegno', () => {
    /*
     * ⛔⛔ MISURATO contro Gemini: sulla stessa domanda lui diceva «Dentista:
     * 17:00 – 18:00», noi «17:00». Il dato c'era e la formattazione lo buttava.
     *
     * Non è estetica: «sono libero domani pomeriggio?» si risponde bene solo
     * sapendo QUANDO FINISCE ciò che occupa — senza, un appuntamento di dieci
     * minuti e uno di quattro ore si leggono uguali.
     */
    it('⛔⛔ dice anche l’ora di FINE, non solo l’inizio', async () => {
        expect(await letto([evento()])).toMatch(/17:00–18:00/)
    })

    /*
     * ⛔ Un evento «tutto il giorno» è a mezzanotte UTC: convertirlo col fuso
     * del telefono lo fa comparire a cavallo di due giorni, o sparire dal
     * giorno giusto. Ferragosto deve restare il 15, non diventare il 14.
     */
    it('⛔⛔ un evento di TUTTO IL GIORNO non scivola di un giorno', async () => {
        const detto = await letto([evento({
            titolo: 'Ferragosto',
            tuttoIlGiorno: true,
            inizio: Date.parse('2026-08-15T00:00:00.000Z'),
            fine: Date.parse('2026-08-16T00:00:00.000Z'),
            occupa: false,
        })])
        expect(detto).toContain('2026-08-15')
        expect(detto).not.toContain('2026-08-14')
        expect(detto).toContain('(all day)')
    })

    /** ⛔ Il calendario si dice: «Dentista» in famiglia e al lavoro sono due fatti. */
    it('dice il luogo e QUALE calendario', async () => {
        const detto = await letto([evento()])
        expect(detto).toContain('Via Roma 12')
        expect(detto).toContain('persona@example.com')
    })

    /*
     * ⛔⛔ TRE ESITI, NON DUE. «Non ho il permesso di guardare» e «ho guardato e
     * non c'è niente» portano a due frasi opposte per la persona: fonderli è
     * esattamente come TALOS è arrivato a dire «non hai impegni» senza aver
     * guardato niente.
     */
    it('⛔⛔ «non ho il permesso» NON si confonde con «non c’è niente»', async () => {
        const tools = createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'permesso-mancante' as const })),
            vi.fn(async () => ({ stato: 'scritto' as const, calendario: 'x', inizioVero: null })),
        )
        const esito = await tools[0]!.run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('never answer from notes or tasks')
    })

    it('e «ho guardato e non c’è niente» è un SUCCESSO, non un errore', async () => {
        const esito = await attrezzo([]).run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('nothing in that period')
    })

    /**
     * ⛔⛔⛔ «NON HAI IMPEGNI» DEVE DIRE DOVE HA GUARDATO.
     *
     * Owner 2026-08-14, dal suo telefono: «che impegni ho domani?» → «Domani,
     * sabato 15 agosto, **non hai impegni in calendario**», con la scheda che
     * mostrava solo Assunzione e Ferragosto. Ma il Dentista e la Cena da Mario
     * c'erano, sincronizzati.
     *
     * Sul Pad, interrogando il provider a mano, i quattro eventi ci sono tutti
     * coi valori giusti — festività `availability=1` (FREE), impegni `0`
     * (BUSY). ⇒ Su quel telefono la risposta è nata da un insieme di calendari
     * **diverso**, e la frase era **identica** a quella giusta.
     *
     * ⛔ «Non hai impegni» è la frase su cui una persona chiude il telefono e
     * considera libera la giornata. Se è sbagliata deve poterlo mostrare da
     * sola: chi legge riconosce all'istante il calendario che manca.
     */
    it('⛔⛔ «non c’è niente» ELENCA i calendari su cui ha guardato', async () => {
        const tools = createTalosCalendarTools(
            vi.fn(async () => ({
                stato: 'letto' as const,
                eventi: [],
                calendari: ['Famiglia', 'persona@example.com'],
            })),
            vi.fn(async () => ({ stato: 'scritto' as const, calendario: 'x', inizioVero: null })),
        )
        const esito = await tools.find((t) => t.name === 'calendar_read')!.run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        expect(esito.content).toContain('Famiglia')
        expect(esito.content).toContain('persona@example.com')
        // ⛔ E si dice alla PERSONA: un elenco che resta nel contesto del
        // modello non aiuta chi ha il calendario davanti e vede che ne manca uno.
        expect(esito.content).toMatch(/Tell the user which calendars/i)
    })

    /**
     * ⛔ Anche a lettura PIENA. Se le fonti si dicessero solo quando non si
     * trova niente, la risposta piena resterebbe l'unica non verificabile — ed
     * è quella su cui la persona fa i suoi piani.
     */
    it('⛔ e le elenca ANCHE quando qualcosa l’ha trovato', async () => {
        const esito = await attrezzo([evento()]).run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        expect(esito.content).toContain('Calendars consulted:')
        expect(esito.content).toContain('Famiglia')
    })

    /**
     * ⛔ E un ponte VECCHIO non manda l'elenco: la lettura non deve fallire per
     * una riga in meno. Il tipo dice che c'è sempre — ma questo attrezzo
     * risponde sulla giornata di una persona, e un `undefined` che fa esplodere
     * tutta la lettura sarebbe un difetto peggiore della sua causa.
     */
    it('⛔ un ponte senza l’elenco NON fa fallire la lettura', async () => {
        const tools = createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'letto' as const, eventi: [] } as never)),
            vi.fn(async () => ({ stato: 'scritto' as const, calendario: 'x', inizioVero: null })),
        )
        const esito = await tools.find((t) => t.name === 'calendar_read')!.run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('nothing in that period')
        expect(esito.content).not.toContain('Calendars consulted')
    })
})

/**
 * ⛔⛔⛔ «SALVO L'IMPEGNO» DETTO SU UN CALENDARIO VUOTO.
 *
 * Owner 2026-08-14, dal suo telefono, con lo schermo: chiesto di mettere un
 * impegno, TALOS chiede su quale calendario, lui sceglie `persona@example.com`,
 * TALOS risponde «Perfetto, salvo l'impegno sul calendario
 * persona@example.com! 📅» — e nel calendario **non c'è niente**. Owner: «per
 * nessun motivo impegno non inserito».
 *
 * Il giro dell'attrezzo c'era (1 s) e un `scritto = false` era già mappato su un
 * errore. ⇒ L'insert aveva risposto di sì, e ci fidavamo della RISPOSTA invece
 * che del FATTO.
 *
 * ⇒ Adesso la riga si RILEGGE dal provider, e «Created» si dice solo dopo. È la
 * stessa regola dell'ultimo centimetro di WhatsApp: «inviato» si dice perché il
 * pulsante sparisce, non perché il click è riuscito.
 */
describe('⛔ una scrittura si dichiara solo se la riga C’È', () => {
    function conScrittura(esito: unknown) {
        return createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'letto' as const, eventi: [], calendari: [] })),
            vi.fn(async () => esito as never),
        ).find((t) => t.name === 'calendar_write')!
    }
    const domanda = {
        title: 'Cena', from: '2026-08-15T18:00:00Z', to: '2026-08-15T19:00:00Z',
    } as never

    it('il provider RIFIUTA: si dice che non è stato creato', async () => {
        const esito = await conScrittura({ stato: 'rifiutato' }).run(domanda, {} as never)
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_CALENDAR_REFUSED')
        expect(esito.content).toMatch(/do not say you saved it/i)
    })

    it('⛔⛔ il provider ACCETTA e poi la riga non c’è: è il caso dell’owner', async () => {
        const esito = await conScrittura({ stato: 'non-rileggibile' }).run(domanda, {} as never)
        expect(esito.ok).toBe(false)
        expect(esito.code).toBe('TALOS_CALENDAR_VANISHED')
        // ⛔ E la riga per il modello deve VIETARE la frase sbagliata, non
        // limitarsi a descrivere il guasto: è quella frase che è arrivata alla
        // persona.
        expect(esito.content).toMatch(/Do NOT say it is saved/i)
    })

    it('⭐ e «creato» dice di essere stato RILETTO', async () => {
        const esito = await conScrittura({ stato: 'scritto', calendario: 'Famiglia', inizioVero: null })
            .run(domanda, {} as never)
        expect(esito.ok).toBe(true)
        expect(esito.content).toContain('Famiglia')
        expect(esito.content).toMatch(/read back/i)
    })

    /**
     * ⛔⛔⛔ IL GIORNO VERO VIENE DAL PROVIDER, non dal modello.
     *
     * MISURATO sul Pad il 2026-08-14 alle 13:33, tre versioni della stessa cosa:
     *
     *   chiesto      «metti in agenda DOMANI alle 21»  → sabato 15
     *   TALOS disse  «domani (domenica 16 agosto)»     → domenica 16
     *   il provider  dtstart=1786993200000             → LUNEDÌ 17
     *
     * Sbagliato di due giorni, e la frase nemmeno d'accordo con ciò che aveva
     * scritto. `time_now` sul telefono rispondeva giusto — «oggi è venerdì 14,
     * domani è sabato 15» — e il modello non l'ha chiamato.
     *
     * ⇒ L'unico numero che non può essere d'accordo con l'errore del modello è
     * quello riletto dal provider. Torna nell'esito, scritto per esteso, e il
     * modello ha l'ordine di riferirlo alla persona.
     */
    it('⛔⛔ l’esito porta il giorno RILETTO, per esteso', async () => {
        const lunedi17 = Date.UTC(2026, 7, 17, 19, 0) // 21:00 a Roma
        const esito = await conScrittura({
            stato: 'scritto', calendario: 'Famiglia', inizioVero: lunedi17,
        }).run(domanda, {} as never)

        expect(esito.ok).toBe(true)
        // Il giorno della settimana per esteso: è quello che fa scattare
        // l'occhio quando è sbagliato. «17/08» non lo fa scattare.
        expect(esito.content).toMatch(/Monday/)
        expect(esito.content).toContain('17')
        expect(esito.content).toContain('August')
        // ⛔ E l'ordine di RIFERIRLO: un dato che resta nel contesto del modello
        // non aiuta la persona che aspetta l'appuntamento sabato.
        expect(esito.content).toMatch(/comes from the phone, not from you/i)
    })

    /**
     * ⛔ E la descrizione dell'ingresso dice di CHIEDERE la data, invece di
     * dedurla: è lì che il difetto è nato.
     */
    it('⛔ il campo `from` ordina di passare da time_now', () => {
        const attrezzo = conScrittura({ stato: 'scritto', calendario: 'x', inizioVero: null })
        const forma = attrezzo.input as unknown as {
            shape: { from: { description?: string } }
        }
        expect(forma.shape.from.description).toMatch(/time_now FIRST/i)
        expect(forma.shape.from.description).toMatch(/never assume today/i)
    })
})

describe('la SCHEDA dell’agenda', () => {
    /*
     * ⛔⛔ Nella scheda va solo l'ORA, non la data — visto sul Pad: «2026-08-15
     * 17:00–18:00» ripetuto su ogni riga occupava metà larghezza e spingeva il
     * titolo fuori. Il giorno lo dice la frase sopra; la scheda risponde a «a
     * che ora».
     */
    it('⛔⛔ le voci portano l’ORA, non la data ripetuta', async () => {
        const esito = await attrezzo([evento()]).run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        const voci = (esito.scheda as { voci: Array<{ quando: string }> }).voci
        expect(voci[0]!.quando).toBe('17:00–18:00')
        expect(voci[0]!.quando).not.toContain('2026')
    })

    /*
     * ⛔ Ma un evento di TUTTO IL GIORNO non ha un'ora: lì la data è l'unica
     * cosa da dire, e toglierla lascerebbe una riga senza quando.
     */
    it('⛔ per un evento di tutto il giorno la DATA resta', async () => {
        const esito = await attrezzo([evento({
            titolo: 'Ferragosto',
            tuttoIlGiorno: true,
            inizio: Date.parse('2026-08-15T00:00:00.000Z'),
            fine: Date.parse('2026-08-16T00:00:00.000Z'),
        })]).run(
            { from: '2026-08-15T00:00:00Z', to: '2026-08-16T00:00:00Z' } as never,
            {} as never,
        )
        const voci = (esito.scheda as { voci: Array<{ quando: string }> }).voci
        expect(voci[0]!.quando).toContain('2026-08-15')
        expect(voci[0]!.quando).toContain('all day')
    })

    /** ⛔ Il TESTO invece la data la tiene: il modello ne ha bisogno per capire. */
    it('⛔ il testo per il modello tiene la data, la scheda no', async () => {
        expect(await letto([evento()])).toContain('2026-08-15')
    })
})

describe('calendar_write — la domanda che non si salta', () => {
    /*
     * ⛔⛔ Visto sul Pad: TALOS chiedeva su quale agenda, la persona rispondeva,
     * e lui scriveva «✓ ho messo in agenda» SENZA richiamare l'attrezzo. La
     * riga diceva cosa chiedere e non cosa fare con la risposta.
     */
    it('⛔⛔ quando chiede quale calendario, dice anche di RICHIAMARSI', async () => {
        const tools = createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'letto' as const, eventi: [], calendari: [] })),
            vi.fn(async () => ({ stato: 'quale-calendario' as const, calendari: ['Famiglia', 'Lavoro'] })),
        )
        const esito = await tools.find((t) => t.name === 'calendar_write')!.run(
            { title: 'Cena', from: '2026-08-15T18:00:00Z', to: '2026-08-15T19:00:00Z' } as never,
            {} as never,
        )
        expect(esito.ok).toBe(false)
        expect(esito.content).toContain('call calendar_write AGAIN')
        expect(esito.content).toContain('Famiglia, Lavoro')
    })
})

/**
 * ⭐⭐⭐ IL VERSO CHE MANCAVA — censimento contro Gemini, 2026-08-14.
 *
 * Lui dichiara «aggiungere, visualizzare **o modificare** eventi su Google
 * Calendar»; TALOS sapeva creare e leggere. E la conseguenza è quella già
 * misurata sulla sveglia: davanti a «sposta la cena alle 21» il modello, avendo
 * solo l'attrezzo che METTE, ne crea un **secondo** — e la persona si ritrova
 * due impegni che si contraddicono.
 */
describe('calendar_write — cambiare e cancellare, non solo creare', () => {
    async function scrivi(input: Record<string, unknown>) {
        modifiche.length = 0
        return attrezzo([], 'calendar_write').run(input as never, {} as never)
    }

    /*
     * ⛔⛔ IL TEST CHE MORDE: con `event` non si deve creare NIENTE. Se il ramo
     * cadesse, questo attrezzo aggiungerebbe un impegno al posto di spostarlo —
     * cioè proprio il difetto che la modifica esiste per togliere.
     */
    it("⛔ con `event` si CAMBIA quell'impegno, non se ne crea un altro", async () => {
        const esito = await scrivi({ event: '42', title: 'Cena da Mario', from: '2026-08-15T21:00:00Z' })
        expect(esito.ok).toBe(true)
        expect(modifiche).toHaveLength(1)
        expect(modifiche[0]).toMatchObject({ id: 42, titolo: 'Cena da Mario' })
        expect(modifiche[0]!.elimina).toBeUndefined()
    })

    /*
     * ⛔ Solo i campi mandati viaggiano: se passassero anche gli altri, cambiare
     * l'ora cancellerebbe il luogo e le note di un impegno che c'era già.
     */
    it('⛔ viaggiano SOLO i campi da cambiare', async () => {
        await scrivi({ event: '7', from: '2026-08-15T21:00:00Z' })
        expect(Object.keys(modifiche[0]!).sort()).toEqual(['id', 'inizio'])
    })

    it('⛔ `remove` cancella, e lo dice come una cosa verificata', async () => {
        const esito = await scrivi({ event: '9', remove: true })
        expect(modifiche[0]).toMatchObject({ id: 9, elimina: true })
        expect(esito.content).toContain('TALOS checked the calendar afterwards')
    })

    /*
     * ⛔ L'ora che si riporta è quella RILETTA dal provider, non quella chiesta:
     * stessa regola della scrittura, e nasce dallo stesso difetto — un impegno
     * finito su un altro giorno con la chat che diceva quello giusto.
     */
    it("⛔ si riporta l'ora VERA riletta, non quella chiesta", async () => {
        const esito = await scrivi({ event: '1', from: '2026-01-01T00:00:00Z' })
        expect(esito.content).toContain('read it back from the calendar')
        expect(esito.content).toContain(new Date(1_786_000_000_000).toString())
    })

    it('⛔ un id che non è un numero non tocca niente', async () => {
        const esito = await scrivi({ event: 'quello di ieri', title: 'x' })
        expect(esito.ok).toBe(false)
        expect(modifiche).toHaveLength(0)
    })
})

/**
 * ⛔ E la LETTURA deve dare l'id, se no non c'è niente da indirizzare: la
 * modifica esisterebbe e il modello non potrebbe usarla.
 */
describe("calendar_read — l'id viaggia fino al modello", () => {
    it('⛔ ogni riga porta il suo id, etichettato', async () => {
        const testo = await letto([evento({ id: 77, titolo: 'Dentista' })])
        expect(testo).toContain('[id 77]')
    })
})

/**
 * ⛔⛔⛔ UNA SCHEDA NON SOPRAVVIVE ALL'AZIONE CHE LA SMENTISCE.
 *
 * MISURATO sul Pad il 2026-08-14: chiesto «cancella Prova Spostamento», TALOS
 * ha risposto **«Ho cancellato l'evento»** — vero, il provider diceva
 * `deleted=1` — e sotto quella frase la scheda mostrava ancora
 * «21:00–22:00 Prova Spostamento», con la spunta «✓ Verificato sul telefono».
 *
 * Il turno aveva fatto due giri: `calendar_read`, che disegna l'agenda, e poi
 * `calendar_write` che cancella. La scheda era vera quando è nata e falsa mezzo
 * secondo dopo.
 *
 * ⛔ Ed è **parola per parola il difetto misurato in GEMINI** e già scritto nel
 * commento del componente: «annullata la sveglia, la sua scheda continuava a
 * mostrare Sveglia 07:30 sotto la frase è stata cancellata». Averlo scritto non
 * ci ha impedito di rifarlo — la regola stava nel commento, non nel codice.
 *
 * ⛔ Si guarda il SORGENTE perché la regola vive dentro il giro del turno, in
 * linea nel controller (là per un motivo scritto: una funzione esportata costava
 * al grafo d'avvio). La prova vera è sul telefono ed è stata fatta; questo
 * cancello impedisce che qualcuno tolga la riga senza accorgersene.
 */
describe('⛔ la scheda dell\'agenda muore con la scrittura che la smentisce', () => {
    const controller = readFileSync(
        resolve(__dirname, '../../..', 'src/stores/chatController.ts'),
        'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')

    it('⛔ una scheda agenda si butta se DOPO è riuscita una scrittura', () => {
        expect(controller).toContain("if (tipo !== 'agenda') return false")
        expect(controller).toMatch(
            /j > indice[\s\S]{0,120}?dopo\.tool === 'calendar_write'[\s\S]{0,80}?dopo\.status === 'succeeded'/,
        )
    })

    /*
     * ⛔ Solo DOPO: una lettura fatta dopo la scrittura descrive il calendario
     * nuovo ed è la scheda giusta da mostrare. Buttarla sarebbe togliere alla
     * persona proprio la conferma che stava cercando.
     */
    it('⛔ il filtro guarda l\'ORDINE, non solo la presenza', () => {
        expect(controller).toContain('.map((r, i) => [r, i] as const)')
        expect(controller).toContain('!smentita(i,')
    })
})

/**
 * ⛔⛔ CREARE UN EVENTO NON LASCIAVA NESSUNA SCHEDA — e non era una dimenticanza.
 *
 * Owner 2026-08-15, tre schermate dell'assistente a confronto:
 *
 *     sveglia  → scheda «07:00 · Alarm»
 *     torcia   → scheda con l'interruttore e «✓ Verified on the phone»
 *     evento   → NIENTE, solo la frase
 *
 * Il buco nasce da una cura giusta: `calendar_read` produce la scheda `agenda`,
 * e `smentita()` in `chatController` la BUTTA quando nello stesso turno una
 * scrittura riesce dopo — perché un'agenda che mostra ancora l'evento
 * cancellato è peggio di nessuna agenda. Quella regola resta, ma buttava la
 * vecchia senza metterne una nuova: scrivere in agenda era l'unica azione che
 * TOGLIEVA informazione dallo schermo.
 */
describe('un evento creato torna come SCHEDA, non solo come frase', () => {
    const quando = Date.parse('2026-08-16T12:00:00.000Z')
    function conEsito(esito: unknown) {
        return createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'letto' as const, eventi: [], calendari: [] })),
            vi.fn(async () => esito as never),
        ).find((t) => t.name === 'calendar_write')!
    }
    const scritto = { stato: 'scritto', calendario: 'lavoro@example.com', inizioVero: quando }
    const domanda = {
        title: 'Riunione', from: '2026-08-16T12:00:00Z', to: '2026-08-16T13:00:00Z',
        location: 'Via Roma 12',
    } as never

    it('la scheda esiste, ed è del tipo che il componente sa già disegnare', async () => {
        const esito = await conEsito(scritto).run(domanda, {} as never)
        expect(esito.ok).toBe(true)
        const scheda = (esito as { scheda?: { tipo?: string, voci?: unknown[] } }).scheda
        expect(scheda?.tipo).toBe('agenda')
        expect(scheda?.voci).toHaveLength(1)
    })

    it('porta il titolo, il luogo e il calendario VERO', async () => {
        const esito = await conEsito(scritto).run(domanda, {} as never)
        const voce = (esito as { scheda: { voci: Array<Record<string, string>> } }).scheda.voci[0]!
        expect(voce.titolo).toBe('Riunione')
        expect(voce.luogo).toBe('Via Roma 12')
        // ⛔ Il calendario è quello che il PROVIDER dice, non quello chiesto.
        expect(voce.calendario).toBe('lavoro@example.com')
    })

    it('⛔ ora presa dal PROVIDER, non da quello che il modello ha chiesto', async () => {
        /*
         * È la stessa regola di `quandoDavvero` nella frase: il 14 agosto il
         * modello aveva sbagliato il giorno di DUE, e la sola fonte che non
         * poteva essere d'accordo con lui era la riga riletta dal provider.
         * Una scheda che prende la data dall'input confermerebbe l'errore
         * invece di smentirlo.
         */
        const altroGiorno = Date.parse('2026-08-18T09:30:00.000Z')
        const esito = await conEsito({ ...scritto, inizioVero: altroGiorno }).run(domanda, {} as never)
        const voce = (esito as { scheda: { voci: Array<Record<string, string>> } }).scheda.voci[0]!
        const atteso = new Date(altroGiorno).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        expect(voce.quando).toBe(atteso)
        expect(voce.quando).not.toBe('')
    })

    it('⛔ TACE sull ora se il provider non la restituisce, invece di inventarla', async () => {
        const esito = await conEsito({ ...scritto, inizioVero: null }).run(domanda, {} as never)
        const voce = (esito as { scheda: { voci: Array<Record<string, string>> } }).scheda.voci[0]!
        expect(voce.quando).toBe('')
        expect(voce.titolo).toBe('Riunione')
    })

    it('⛔ nessuna scheda quando la scrittura NON è riuscita', async () => {
        // Una scheda su un fallimento è la bugia peggiore: mostra un evento che
        // non esiste, con la faccia di uno che esiste.
        for (const fallito of [{ stato: 'rifiutato' }, { stato: 'non-rileggibile' }]) {
            const esito = await conEsito(fallito).run(domanda, {} as never)
            expect(esito.ok, JSON.stringify(fallito)).toBe(false)
            expect((esito as { scheda?: unknown }).scheda, JSON.stringify(fallito)).toBeUndefined()
        }
    })
})
