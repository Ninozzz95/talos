/**
 * N12 — il motore `locale` della dettatura: **Parakeet** dentro il telefono, in ibrido col riconoscitore di sistema.
 *
 * Decisioni dell'owner (12/10/2026): parole vive dal riconoscitore di oggi, testo finale da Parakeet; il riconoscitore di oggi
 * resta come riserva. ⛔ MISURATO sul Pad il 13/10/2026: due ascolti insieme non si possono fare (con la nostra cattura aperta
 * il riconoscitore di sistema sente silenzio), quindi il microfono lo apre UNO solo — il plugin `TalosAsrLocale` — che dà lo
 * stesso audio anche a un riconoscitore di sistema suo. Qui arrivano già le due cose: le parole vive e, alla fine, Parakeet.
 *
 * La regola, tutta qui:
 *   · mentre si parla il testo è quello del sistema, un tratto dopo l'altro (ogni tratto riparte da zero: si accoda);
 *   · quando la persona ferma, il testo di Parakeet SOSTITUISCE quello del sistema;
 *   · se Parakeet non risponde in tempo, sbaglia o torna vuoto, resta il testo del sistema, e lo si dice (`onFallback`);
 *   · se il locale non parte, la stessa pressione passa al riconoscitore di sistema (`motorePerQuestaDettatura`).
 *
 * ⛔ Caricato a richiesta, alla prima dettatura: niente di questo entra nel pacchetto d'avvio.
 */
import { registerPlugin } from '@capacitor/core'
import { TALOS_MODELLO_PARAKEET } from '@/lib/voice/modelloParakeet'
import type { TalosDictationEngine, TalosDictationEvents, TalosDictationStartOptions } from '@/services/dictation'

export interface TalosAsrLocalePonte {
    stato(opzioni?: TalosAsrDove): Promise<{ file: Record<string, number>, sigilli?: Record<string, string>, caricato: boolean }>
    ascolta(opzioni?: TalosAsrDove & {
        vive?: boolean, lingua?: string, automatica?: boolean, lingueAmmesse?: string[], silenzioMs?: number, massimoSecondi?: number,
    }): Promise<{ campionamento: number, vive: boolean }>
    /** Comincia a rileggere ciò che la cattura ha sentito FINORA, senza fermarla. Il risultato lo usa `trascrivi({ anticipo: true })`. */
    anticipa(opzioni?: TalosAsrDove): Promise<void>
    trascrivi(opzioni?: TalosAsrDove & { anticipo?: boolean }): Promise<{ testo: string, audioMs: number, decodificaMs: number, picco: number, tagliato: boolean }>
    annulla(): Promise<void>
    scarica(): Promise<void>
    rimuovi(opzioni?: TalosAsrDove): Promise<{ tolti: number }>
    /** Ricalcola l'impronta dei file che non hanno un sigillo valido e li sigilla. Costa qualche secondo. */
    verifica(opzioni?: TalosAsrDove): Promise<{ sigilli: Record<string, string> }>
    addListener(evento: string, ascoltatore: (dati: { text?: string, code?: string, language?: string, rms?: number }) => void): Promise<{ remove(): Promise<void> }>
    removeAllListeners(): Promise<void>
}

/** Quale modello: il plugin lo cerca dove il motore dei download dell'app mette quel deposito a quella revisione. */
export interface TalosAsrDove { cartella?: string, deposito?: string, revisione?: string }
export const TALOS_ASR_DOVE: Readonly<TalosAsrDove> = Object.freeze({
    deposito: TALOS_MODELLO_PARAKEET.deposito, revisione: TALOS_MODELLO_PARAKEET.revisione,
})

/** Quanto si aspetta Parakeet dopo lo stop: sul Pad decodifica a 20 volte il tempo reale, più 4 s di carico la prima volta. */
const TETTO_FINALE_MS = 20_000
/** Il modello caricato costa ~1 GB (misurato sul Pad): si rilascia poco dopo l'ultima dettatura. */
const RILASCIO_DOPO_MS = 60_000
/** Quanto si aspetta chi sta ancora pensando, a turno: lo stesso tempo del riconoscitore di sistema (`TALOS_ATTESA_INIZIO_MS`). */
const ATTESA_INIZIO_MS = 8_000
/**
 * Quanto silenzio, dopo parole sentite, chiude il turno. LiveKit 500 ms, Pipecat 200-600 ms. Provato a 800 ms dall'owner con
 * la sua voce il 13/10/2026: «troppo stretto» (tagliava le pause per pensare) ⇒ scelta sua: 1,2 secondi.
 */
const SILENZIO_TURNO_MS = 1_200
/** Di quanto risale il pavimento di rumore a ogni blocco da 100 ms quando non trova un minimo nuovo. */
const CRESCITA_PAVIMENTO = 1.002
/** Sotto questo livello (0-1) non è voce, per quanto silenziosa sia la stanza. */
const VOCE_MINIMA = 0.008
/** Dopo quanta pausa Parakeet comincia a rileggere ciò che ha sentito finora. */
const PAUSA_ANTICIPO_MS = 300
/** Oltre questa durata di cattura non si rilegge in anticipo: ogni rilettura rifà tutto l'audio da capo. */
const ANTICIPO_FINO_A_MS = 20_000

const codice = (guasto: unknown): string => {
    const g = guasto as { code?: unknown, message?: unknown } | null
    const testo = typeof g?.code === 'string' && g.code ? g.code : String(g?.message ?? guasto ?? '')
    return /^[A-Z][A-Z0-9_]{3,63}/u.exec(testo)?.[0] ?? 'TALOS_ASR_FAILED'
}
const accoda = (prima: string, dopo: string): string => (prima && dopo ? `${prima} ${dopo}` : prima || dopo)

export interface TalosMotoreLocale extends TalosDictationEngine {
    /** Il modello è sul telefono, intero, ed è quello che qualcuno ha verificato per impronta. */
    disponibile(): Promise<boolean>
}

export function creaMotoreLocale({ ponte, tettoFinaleMs = TETTO_FINALE_MS, rilascioDopoMs = RILASCIO_DOPO_MS, clock = Date.now }: {
    ponte: TalosAsrLocalePonte
    clock?: () => number
    tettoFinaleMs?: number
    rilascioDopoMs?: number
}): TalosMotoreLocale {
    type Sessione = { eventi: TalosDictationEvents, finito: string, viva: string, anticipata: boolean }
    let sessione: Sessione | null = null

    /** Chiude QUELLA sessione: Parakeet rilegge tutto, il suo testo sostituisce quello vivo, poi `onEnd`. Una volta sola. */
    async function chiudi(mia: Sessione): Promise<void> {
        if (sessione !== mia) return
        sessione = null
        const delSistema = accoda(mia.finito, mia.viva)
        let scadenza: ReturnType<typeof setTimeout> | undefined
        try {
            const esito = await Promise.race([
                // N12-ANTICIPO: se Parakeet ha già riletto alla pausa e dopo non si è più parlato, si usa quel lavoro.
                ponte.trascrivi(mia.anticipata ? { ...TALOS_ASR_DOVE, anticipo: true } : TALOS_ASR_DOVE),
                new Promise<never>((_, rifiuta) => { scadenza = setTimeout(() => rifiuta(new Error('TALOS_ASR_FINALE_IN_RITARDO')), tettoFinaleMs) }),
            ])
            const testo = esito.testo.trim()
            if (testo) mia.eventi.onPartial(testo)
            else {
                // Parakeet non ha sentito parole: resta ciò che ha scritto il sistema, e si dice.
                mia.eventi.onPartial(delSistema)
                mia.eventi.onFallback?.('TALOS_ASR_FINALE_VUOTO')
            }
        } catch (guasto) {
            mia.eventi.onPartial(delSistema)
            mia.eventi.onFallback?.(codice(guasto))
            await ponte.annulla().catch(() => {})
        } finally {
            clearTimeout(scadenza)
            await ponte.removeAllListeners().catch(() => {})
            mia.eventi.onEnd()
            clearTimeout(rilascio)
            rilascio = setTimeout(() => { if (!sessione) void ponte.scarica().catch(() => {}) }, rilascioDopoMs)
        }
    }
    let rilascio: ReturnType<typeof setTimeout> | undefined

    async function disponibile(): Promise<boolean> {
        // Ogni file col suo peso E col SIGILLO del motore dei download: l'impronta verificata allo scaricamento, valida solo
        // se il file non è più cambiato. Un file copiato a mano, o cambiato dopo, non ha sigillo e non si usa.
        try {
            const { file, sigilli } = await ponte.stato(TALOS_ASR_DOVE)
            return TALOS_MODELLO_PARAKEET.file.every((f) => file?.[f.nome] === f.byte && sigilli?.[f.nome] === f.sha256)
        } catch { return false }
    }

    return {
        disponibile,
        attendeIlFinale: true,
        supported: disponibile,
        // Il permesso del microfono è uno solo, ed è quello che chiede già la dettatura di sistema: lo chiede chi compone.
        requestPermission: async () => true,

        async start(eventi: TalosDictationEvents, opzioni: TalosDictationStartOptions = {}): Promise<void> {
            clearTimeout(rilascio)
            const mia: Sessione = { eventi, finito: '', viva: '', anticipata: false }
            const apertaLaCattura = clock()
            // L'ultimo istante in cui c'è stata voce, cioè un livello sopra il rumore (N12-TURNO).
            // ⛔ NON le parole vive: MISURATO sul Pad il 13/10/2026 — arrivano in ritardo, a frase già finita, e contarle
            // come voce faceva ripartire il silenzio e buttava la rilettura anticipata (da fine frase a invio: 1,6-4,3 s,
            // a caso). Le parole dicono solo CHE si è parlato; QUANDO si è smesso lo dice il livello.
            let ultimaVoce = clock()
            await ponte.removeAllListeners()
            await ponte.addListener('talosAsrViva', (d) => {
                if (sessione !== mia || !d.text) return
                mia.viva = d.text
                eventi.onPartial(accoda(mia.finito, mia.viva))
            })
            await ponte.addListener('talosAsrTratto', (d) => {
                if (sessione !== mia || !d.text) return
                mia.finito = accoda(mia.finito, d.text)
                mia.viva = ''
                eventi.onPartial(mia.finito)
            })
            // La lingua che il riconoscitore ha sentito: chi compone la usa per rispondere nella stessa lingua, come oggi.
            await ponte.addListener('talosAsrLingua', (d) => {
                if (sessione === mia && d.language) eventi.onLanguage?.(d.language)
            })
            /*
             * «A turno» (la barra dell'assistente, owner 13/10/2026): il turno lo chiude il SILENZIO. Il riconoscitore delle
             * parole vive chiude la sua sessione quando chi parla tace: se si è sentito qualcosa, è la fine del turno; se non
             * si è sentito niente e il tempo d'attesa è passato, è «non hai parlato», come col riconoscitore di sistema.
             */
            if (opzioni.endOnSilence === true) {
                const apertaAlle = clock()
                const attesaMs = opzioni.minimumMillis ?? ATTESA_INIZIO_MS
                await ponte.addListener('talosAsrViveRiaperte', () => {
                    if (sessione !== mia) return
                    if (accoda(mia.finito, mia.viva)) { void chiudi(mia); return }
                    if (clock() - apertaAlle < attesaMs) return
                    sessione = null
                    void (async () => {
                        await ponte.annulla().catch(() => {})
                        await ponte.removeAllListeners().catch(() => {})
                        eventi.onError('noSpeech')
                    })()
                })
            }
            /*
             * ⛔ N12-TURNO (owner 13/10/2026: «Fine del turno decisa da noi») e N12-ANTICIPO («Parakeet rilegge mentre
             * parli»). La cattura è nostra, e il plugin manda il livello di ogni blocco da 100 ms. «Voce» = livello sopra
             * tre volte il pavimento di rumore e sopra un minimo assoluto.
             *   · ANTICIPO, per tutti: dopo parole sentite, alla prima pausa (300 ms) Parakeet comincia a rileggere ciò che
             *     c'è; se poi non si parla più, alla chiusura il testo è già pronto (~1 s risparmiato, misurato). Solo per
             *     catture corte: ogni rilettura rifà tutto l'audio, e in una dettatura lunga costerebbe a ogni pausa.
             *   · TURNO, solo «a turno»: 1,2 s senza voce chiudono (aspettare il riconoscitore di sistema costa ~1,8 s;
             *     LiveKit ne aspetta 0,5, Pipecat 0,2-0,6). La fine della sessione viva resta come rete di sicurezza.
             */
            let pavimento = Number.POSITIVE_INFINITY
            await ponte.addListener('talosAsrLivello', (d) => {
                if (sessione !== mia || typeof d.rms !== 'number') return
                // Il pavimento è il minimo sentito, che risale piano (lo 0,2% a blocco) per seguire una stanza che diventa più
                // rumorosa. ⛔ Non «il minimo degli ultimi 5 s»: cinque secondi di parlato senza una pausa lo portavano al livello
                // della voce, e la voce diventava silenzio (visto rosso in N12-ANTICIPO-03).
                pavimento = Math.min(pavimento * CRESCITA_PAVIMENTO, d.rms)
                if (d.rms > Math.max(pavimento * 3, VOCE_MINIMA)) { ultimaVoce = clock(); mia.anticipata = false; return }
                if (!accoda(mia.finito, mia.viva)) return
                const silenzio = clock() - ultimaVoce
                if (!mia.anticipata && silenzio >= PAUSA_ANTICIPO_MS && clock() - apertaLaCattura <= ANTICIPO_FINO_A_MS) {
                    mia.anticipata = true
                    void ponte.anticipa(TALOS_ASR_DOVE).catch(() => { mia.anticipata = false })
                }
                if (opzioni.endOnSilence === true && silenzio >= SILENZIO_TURNO_MS) void chiudi(mia)
            })
            sessione = mia
            try {
                await ponte.ascolta({
                    ...TALOS_ASR_DOVE,
                    vive: true,
                    ...(opzioni.language ? { lingua: opzioni.language } : {}),
                    automatica: opzioni.autoLanguage !== false,
                    ...(opzioni.allowedLanguages?.length ? { lingueAmmesse: [...opzioni.allowedLanguages] } : {}),
                    ...(opzioni.silenceMillis ? { silenzioMs: opzioni.silenceMillis } : {}),
                })
            } catch (guasto) {
                sessione = null
                await ponte.removeAllListeners().catch(() => {})
                throw guasto
            }
            eventi.onStart?.()
        },

        async stop(): Promise<void> {
            if (sessione) await chiudi(sessione)
        },
    }
}

/**
 * Il motore di QUESTA dettatura: il locale se il modello c'è ed è verificato, altrimenti quello di sistema. Se il locale non
 * parte (microfono occupato, libreria che non si carica…), la stessa pressione passa al sistema e lo dice: mai una dettatura muta.
 */
export async function motorePerQuestaDettatura(sistema: TalosDictationEngine, locale: TalosMotoreLocale): Promise<TalosDictationEngine> {
    if (!(await locale.disponibile())) return sistema
    let inUso: TalosDictationEngine = locale
    return {
        supported: () => sistema.supported(),
        requestPermission: () => sistema.requestPermission(),
        async start(eventi, opzioni) {
            try {
                inUso = locale
                await locale.start(eventi, opzioni)
            } catch (guasto) {
                inUso = sistema
                eventi.onFallback?.(codice(guasto))
                await sistema.start(eventi, opzioni)
            }
        },
        stop: () => inUso.stop(),
        get attendeIlFinale() { return inUso === locale },
    }
}

/** Il ponte verso il plugin nativo (`TalosAsrLocale`). */
export function talosAsrLocalePonte(): TalosAsrLocalePonte {
    return registerPlugin<TalosAsrLocalePonte>('TalosAsrLocale')
}

let motore: TalosMotoreLocale | null = null
/** L'unico motore locale dell'app (il rilascio del modello conta le dettature: devono passare tutte da qui). */
export function talosMotoreLocale(): TalosMotoreLocale {
    motore ??= creaMotoreLocale({ ponte: talosAsrLocalePonte() })
    return motore
}
