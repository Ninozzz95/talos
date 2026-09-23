import { TALOS_BYTE_PER_TOKEN } from '@/lib/tools/aperturaProgressiva'
import type { TalosToolDefinition } from '@/lib/tools/registry'
import { TALOS_TOOL_ACTIONS, type TalosToolAction } from '@/lib/tools/permissionTypes'

/**
 * ⭐⭐⭐ L'IMPRONTA DEL PROFILO — Fase 1.1 del piano piattaforma.
 *
 * «Non costruiamo il compilatore: gli diamo un nome e un'impronta, perché il
 * risultato c'è già». Il risultato è l'apertura a gradi: 68 attrezzi diventano
 * 4 nel prefisso, −96% di token. Quello che mancava non era il calcolo, era
 * **saper dire quando quella superficie cambia**.
 *
 * ## Perché serve, e non è burocrazia
 *
 * La cache dei prompt combacia per PREFISSO ESATTO, e la gerarchia è
 *
 *     attrezzi  →  sistema  →  messaggi
 *
 * cioè gli attrezzi stanno davanti a tutto. Un byte diverso lì e **muore
 * l'intera conversazione in cache**, non solo la parte cambiata. In giro se ne
 * raccontano due casi che valgono da soli questo file: un serializzatore che
 * ordinava le chiavi dello schema in modo diverso fra due richieste, e un
 * attrezzo modificato a metà sessione che ha bruciato 20.000 token.
 *
 * ⇒ L'impronta è il modo di ACCORGERSENE. Senza, il conto arriva come un
 * numero di token più alto e nessuno sa perché.
 *
 * ## ⛔ E in TALOS la minaccia NON è l'apertura a gradi
 *
 * L'apertura a gradi usa il `defer_loading` nativo: i differiti stanno già nel
 * prefisso come abbozzi e nessun attrezzo viene aggiunto a conversazione
 * aperta. La lista sul filo è costante. La cosa che invece cambia davvero, e
 * durante la conversazione, sono i **permessi**: chi concede o toglie un
 * potere cambia quali attrezzi vengono offerti, quindi cambia il prefisso,
 * quindi azzera la cache. È lì che questa impronta guadagna il suo posto.
 *
 * ## ⛔⛔ L'impronta NON canonicalizza, ed è una scelta
 *
 * Verrebbe naturale ordinare le chiavi prima di calcolare l'hash, così due
 * serializzazioni «equivalenti» darebbero la stessa impronta. **Sarebbe il
 * contrario di ciò che serve.** Il fornitore non vede una forma equivalente:
 * vede i byte. Se il nostro serializzatore cambia l'ordine delle chiavi, la
 * cache muore per davvero — e un'impronta canonicalizzata direbbe «tutto
 * uguale», nascondendo esattamente il difetto per cui esiste.
 *
 * ⇒ Si calcola sui byte che si spediscono, così com'è.
 */

/** Le tre categorie di potere, contate. */
export type TalosPoteriDelProfilo = Readonly<Record<TalosToolAction, number>>

export interface TalosProfiloCompilato {
    /** Chi ha prodotto questa superficie: `anthropic/a-gradi`, `locale/gbnf`, … */
    readonly nome: string
    /** I nomi nell'ORDINE in cui viaggiano. L'ordine fa parte dell'impronta. */
    readonly attrezzi: readonly string[]
    /** Quelli che il modello dovrà cercarsi: portano `defer_loading`. */
    readonly differiti: readonly string[]
    /** I byte della superficie, come vengono serializzati e SPEDITI. */
    readonly byteSchema: number
    /** Stima con la costante misurata su QUESTI schemi, non sull'inglese medio. */
    readonly tokenStimati: number
    /**
     * ⭐⭐ I byte che il MODELLO vede davvero — e non sono gli stessi.
     *
     * MISURATO il 2026-08-17, sulla suite intera con tutti gli attrezzi accesi:
     *
     *     spediti, forma intera      17.132 byte
     *     spediti, forma a gradi     17.541 byte   ⛔ PIU' GRANDI
     *     visti dal modello, a gradi  ~1.400 byte
     *
     * L'apertura a gradi manda comunque lo schema INTERO di ogni attrezzo, e ci
     * aggiunge `defer_loading: true` piu' la riga della ricerca: sul filo pesa
     * un po' di piu'. Il risparmio non e' nella trasmissione — e' in cio' che
     * entra nel contesto del modello, e quindi nei token che il fornitore conta.
     *
     * ⛔ Senza questa distinzione l'impronta avrebbe riportato «a gradi costa di
     * piu'», che e' vero sul filo e falso su cio' che conta. Un numero giusto
     * che risponde alla domanda sbagliata e' indistinguibile da uno sbagliato.
     */
    readonly byteInVista: number
    readonly tokenInVista: number
    readonly poteri: TalosPoteriDelProfilo
    /** L'impronta dei byte spediti. Cambia ⇔ la cache è morta. */
    readonly impronta: string
}

/**
 * FNV-1a a 32 bit, in esadecimale.
 *
 * ⛔ Non `crypto.subtle`: quella è asincrona, e un'impronta che si può
 * calcolare solo con un `await` non si può mettere dentro il punto in cui si
 * costruisce la richiesta senza cambiarne la forma. Qui non serve resistere a
 * un avversario — serve accorgersi di un cambiamento — e per quello FNV-1a è
 * abbastanza, è sincrono e non porta dipendenze nel grafo d'avvio, che ha un
 * tetto suo.
 */
export function talosImprontaDeiByte(testo: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < testo.length; i++) {
        hash ^= testo.charCodeAt(i)
        // moltiplicazione FNV a 32 bit senza perdere i bit alti in float
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}

/** Un attrezzo sul filo, per quel poco che ci serve saperne. */
interface RigaSulFilo {
    name?: unknown
    defer_loading?: unknown
}

function nomeDellaRiga(riga: unknown): string | null {
    if (typeof riga !== 'object' || riga === null) return null
    const nome = (riga as RigaSulFilo).name
    return typeof nome === 'string' ? nome : null
}

function eDifferita(riga: unknown): boolean {
    if (typeof riga !== 'object' || riga === null) return false
    return (riga as RigaSulFilo).defer_loading === true
}

/**
 * Il profilo di ciò che sta per partire.
 *
 * `attrezziSpediti` è **la lista già pronta per il filo** — quella che esce da
 * `talosAttrezziAnthropicAGradi` o da `talosToolsForAnthropic` — perché è
 * quella che il fornitore hasha. Le definizioni servono solo a dire di che
 * potere è ciascun nome: sul filo quel dato non viaggia.
 */
export function talosProfiloCompilato(
    nome: string,
    attrezziSpediti: readonly unknown[],
    definizioni: ReadonlyArray<TalosToolDefinition<never>>,
): TalosProfiloCompilato {
    const serializzato = JSON.stringify(attrezziSpediti)
    const byteSchema = serializzato.length

    const poteriDi = new Map<string, TalosToolAction>()
    for (const definizione of definizioni) poteriDi.set(definizione.name, definizione.action)

    const attrezzi: string[] = []
    const differiti: string[] = []
    // ⛔ Dal vocabolario: un potere nuovo deve comparire col suo zero, non
    // sparire dal conteggio. (Non tocca `impronta`, che e' l'hash dei byte
    // spediti — questo e' un conteggio riportato a parte.)
    const poteri = Object.fromEntries(
        TALOS_TOOL_ACTIONS.map((azione) => [azione, 0]),
    ) as Record<TalosToolAction, number>
    for (const riga of attrezziSpediti) {
        const nomeRiga = nomeDellaRiga(riga)
        if (nomeRiga === null) continue
        attrezzi.push(nomeRiga)
        if (eDifferita(riga)) differiti.push(nomeRiga)
        /*
         * ⛔ Un nome senza definizione NON si conta come `read` per comodità:
         * `tool_search_tool_bm25` è di Anthropic, non nostro, e attribuirgli un
         * potere che non abbiamo dichiarato falserebbe il totale che questa
         * riga esiste per dire.
         */
        const potere = poteriDi.get(nomeRiga)
        if (potere) poteri[potere] += 1
    }

    // Ciò che il modello si trova davanti: tutto tranne i differiti.
    const inVista = attrezziSpediti.filter((riga) => !eDifferita(riga))
    const byteInVista = JSON.stringify(inVista).length

    return Object.freeze({
        nome,
        attrezzi: Object.freeze(attrezzi),
        differiti: Object.freeze(differiti),
        byteSchema,
        tokenStimati: Math.round(byteSchema / TALOS_BYTE_PER_TOKEN),
        byteInVista,
        tokenInVista: Math.round(byteInVista / TALOS_BYTE_PER_TOKEN),
        poteri: Object.freeze(poteri),
        impronta: talosImprontaDeiByte(serializzato),
    })
}

/** Perché la cache è morta, quando è morta. */
export interface TalosEsitoDellaCache {
    readonly sopravvive: boolean
    /** Che cosa è cambiato, in una frase che si può mostrare o scrivere in log. */
    readonly perche?: string
}

/**
 * La cache del prefisso è sopravvissuta fra due turni?
 *
 * ⛔ Confronta le impronte, non gli elenchi: due liste con gli stessi nomi in
 * ordine diverso sono due prefissi diversi, e il fornitore le tratta come tali.
 * Un confronto «per insieme» direbbe che va tutto bene mentre paghiamo il
 * prefisso intero a ogni messaggio.
 *
 * Il `perche` invece guarda gli elenchi, perché serve a una persona: sapere
 * CHE è cambiato non aiuta se non si sa COSA.
 */
export function talosCacheSopravvissuta(
    prima: TalosProfiloCompilato | null,
    dopo: TalosProfiloCompilato,
): TalosEsitoDellaCache {
    // Il primo messaggio di una conversazione non ha un «prima»: non c'era
    // niente da perdere, e chiamarlo «cache morta» sarebbe un falso allarme.
    if (!prima) return { sopravvive: true }
    if (prima.impronta === dopo.impronta) return { sopravvive: true }

    const primaSet = new Set(prima.attrezzi)
    const dopoSet = new Set(dopo.attrezzi)
    const tolti = prima.attrezzi.filter((nome) => !dopoSet.has(nome))
    const messi = dopo.attrezzi.filter((nome) => !primaSet.has(nome))
    if (tolti.length || messi.length) {
        const pezzi: string[] = []
        if (tolti.length) pezzi.push(`tolti ${tolti.join(', ')}`)
        if (messi.length) pezzi.push(`aggiunti ${messi.join(', ')}`)
        return { sopravvive: false, perche: pezzi.join(' · ') }
    }
    if (prima.attrezzi.join(' ') !== dopo.attrezzi.join(' ')) {
        return { sopravvive: false, perche: 'stessi attrezzi, ORDINE diverso' }
    }
    /*
     * Stessi nomi, stesso ordine, impronta diversa ⇒ è cambiato il CONTENUTO:
     * una descrizione, uno schema, o l'ordine delle chiavi dentro una riga.
     * È il caso che una canonicalizzazione avrebbe nascosto, ed è il motivo per
     * cui l'impronta non canonicalizza.
     */
    return { sopravvive: false, perche: 'stessi attrezzi, contenuto o serializzazione diversi' }
}

/**
 * ⛔ L'ULTIMO profilo spedito, perché un'impronta da sola non dice niente.
 *
 * Un'impronta serve a un CONFRONTO: «è cambiata rispetto a prima?». Senza un
 * posto dove sta il «prima», questo file sarebbe una funzione che nessuno
 * chiama — il difetto che questo progetto insegue da settimane.
 *
 * Una variabile di modulo e non una mappa per conversazione: la cache del
 * fornitore è una sola e vive sull'ultimo prefisso spedito, quindi la domanda
 * vera è «l'ultima richiesta partita aveva la stessa superficie di questa?».
 * Una mappa per conversazione risponderebbe a una domanda che nessuno fa.
 */
let ultimoProfiloSpedito: TalosProfiloCompilato | null = null

/**
 * Registra il profilo che sta per partire e dice se la cache è sopravvissuta.
 *
 * ⇒ Chiamare questa, non `talosCacheSopravvissuta`, dal punto in cui si
 * costruisce la richiesta: qui il «prima» si aggiorna da sé, e chi chiama non
 * deve ricordarsi di farlo.
 */
export function talosRegistraProfilo(profilo: TalosProfiloCompilato): TalosEsitoDellaCache {
    const esito = talosCacheSopravvissuta(ultimoProfiloSpedito, profilo)
    ultimoProfiloSpedito = profilo
    return esito
}

/** Cosa ha visto il modello l'ultima volta. `null` prima del primo messaggio. */
export function talosUltimoProfilo(): TalosProfiloCompilato | null {
    return ultimoProfiloSpedito
}

/** Solo per le prove: rimette il registro a com'era all'avvio. */
export function talosDimenticaIlProfilo(): void {
    ultimoProfiloSpedito = null
}
