import { ESTENSIONI_SORGENTE, type TalosElencoFile, type TalosSorgente } from '@/lib/kernel/catalogo'
import type { TalosFontiCodice, TalosLetturaSpazio } from '@/lib/kernel/codiceTools'
import { estensioneDi } from '@/lib/kernel/simboli'

/**
 * ⭐⭐⭐ LO SPAZIO DI LAVORO SU UN DISCO VERO — la sorgente che il telefono usa.
 *
 * ⛔ Il disco arriva iniettato. Su Android è `@capacitor/filesystem` sotto
 * `Directory.Data`, su un computer sarà `node:fs`, nei test è una mappa. Legare
 * questo file a uno dei tre lo renderebbe inutile negli altri due — ed è la
 * stessa ragione per cui `TalosFontiCodice` esiste.
 *
 * ## ⛔⛔ Un tetto che MENTE è peggio di nessun tetto
 *
 * Un telefono non tiene in memoria un progetto senza limite. Ma un elenco
 * troncato in silenzio trasforma ogni file non visto in «il file non esiste» —
 * e il modello, sentendoselo dire, prova a **creare** un file che c'è già.
 *
 * ⇒ Il troncamento si DICHIARA, e il catalogo perde il potere di concludere
 * ASSENTE. Meglio «non lo so» su tutto il progetto che una risposta netta e
 * sbagliata su un file solo.
 */

/** Cartelle che non sono il progetto: sono ciò che il progetto ha prodotto o scaricato. */
export const CARTELLE_SALTATE: ReadonlySet<string> = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', 'coverage',
    '.svelte-kit', '.next', '.nuxt', '.cache', '.gradle', '.idea', '.vscode',
    'android', 'ios', 'target', 'vendor', '__pycache__',
])

/**
 * ⛔⛔ NON MISURATI SUL DISPOSITIVO — e finché non lo sono, sono un'ipotesi.
 *
 * Da dove vengono: sul sorgente vero di TALOS, **4,56 MB di codice occupano
 * 55 MB di heap** dopo il catalogo — un fattore 12. Con 8 MB di tetto ci si
 * aspetta un centinaio di MB, che una WebView dovrebbe reggere.
 *
 * ⛔ «Dovrebbe» non è una misura. Vanno rifatti sul Pad, con un progetto vero,
 * guardando la memoria della WebView — non la mia. Fino ad allora questi due
 * numeri sono l'unica cosa scritta a mano in tutto il kernel, e si vede.
 */
export const TETTO_BYTE = 8 * 1024 * 1024
export const TETTO_FILE = 1500

export interface TalosVoceDisco {
    nome: string
    cartella: boolean
    /** Serve a fermarsi PRIMA di leggere: un file enorme non va nemmeno aperto. */
    byte: number
}

export interface TalosDisco {
    elenca(cartella: string): Promise<readonly TalosVoceDisco[]>
    leggi(percorso: string): Promise<string>
    scrivi(percorso: string, testo: string): Promise<void>
}

export interface TalosFontiDiscoOpzioni {
    tettoByte?: number
    tettoFile?: number
    salta?: ReadonlySet<string>
}

/**
 * ⭐ Costruisce le fonti da un disco, ricordando che cosa ha letto.
 *
 * ⛔ La memoria non serve a rispondere al posto del disco: serve a **non
 * riscrivere** i file che non sono cambiati. Su un telefono riscrivere 452 file
 * a ogni modifica di una funzione è la differenza fra un'attesa e un'app che
 * sembra rotta.
 */
export function fontiDaDisco(disco: TalosDisco, opzioni: TalosFontiDiscoOpzioni = {}): TalosFontiCodice {
    const tettoByte = opzioni.tettoByte ?? TETTO_BYTE
    const tettoFile = opzioni.tettoFile ?? TETTO_FILE
    const salta = opzioni.salta ?? CARTELLE_SALTATE
    let ultimoLetto = new Map<string, string | null>()

    return {
        async leggiSpazio(): Promise<TalosLetturaSpazio> {
            const sorgenti: TalosSorgente[] = []
            let byte = 0
            let elenco: TalosElencoFile = 'completo'

            const scendi = async (cartella: string): Promise<void> => {
                if (elenco !== 'completo') return
                let voci: readonly TalosVoceDisco[]
                try {
                    voci = await disco.elenca(cartella)
                }
                catch (e) {
                    /*
                     * ⛔⛔ Una cartella che non si legge NON si salta in silenzio.
                     * Saltarla significherebbe dire «qui non c'è niente» di un
                     * posto in cui non si è guardato — che è esattamente la
                     * bugia che questo kernel esiste per impedire.
                     */
                    elenco = { troncato: `"${cartella || '.'}" could not be listed (${messaggio(e)})` }
                    return
                }
                for (const voce of voci) {
                    if (elenco !== 'completo') return
                    const percorso = cartella ? `${cartella}/${voce.nome}` : voce.nome
                    if (voce.cartella) {
                        if (salta.has(voce.nome)) continue
                        await scendi(percorso)
                        continue
                    }
                    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue
                    if (sorgenti.length >= tettoFile) {
                        elenco = { troncato: `the workspace has more than ${tettoFile} source files` }
                        return
                    }
                    if (byte + voce.byte > tettoByte) {
                        elenco = { troncato: `the workspace is larger than ${Math.round(tettoByte / 1024 / 1024)} MB of source` }
                        return
                    }
                    byte += voce.byte
                    try {
                        sorgenti.push({ percorso, testo: await disco.leggi(percorso) })
                    }
                    catch {
                        /*
                         * ⛔ Un FILE illeggibile è diverso da una CARTELLA
                         * illeggibile: qui si sa che il file esiste e quale sia,
                         * quindi l'ignoranza è circoscritta a lui — `testo: null`
                         * lo dichiara, e solo le domande sul suo ambito
                         * diventano IGNOTE. Troncare tutto il progetto per un
                         * file sarebbe sprecare la conoscenza che si ha.
                         */
                        sorgenti.push({ percorso, testo: null })
                    }
                }
            }

            await scendi('')
            ultimoLetto = new Map(sorgenti.map((s) => [s.percorso, s.testo]))
            return { sorgenti, elenco }
        },

        async scrivi(sorgenti: readonly TalosSorgente[]): Promise<void> {
            for (const { percorso, testo } of sorgenti) {
                if (testo === null) continue
                /*
                 * ⛔ Solo ciò che è DAVVERO cambiato. L'albero che arriva è
                 * quello intero — il kernel lavora così — ma riscriverlo tutto
                 * sarebbe centinaia di scritture per una funzione sola, e su un
                 * telefono ogni scrittura passa dal ponte nativo.
                 */
                /*
                 * ⛔ E il confronto è con l'ultima LETTURA, non con l'ultima
                 * scrittura. Aggiornare la memoria qui farebbe parlare la
                 * scrittura al posto del disco: se qualcuno modificasse il file
                 * da fuori, TALOS si convincerebbe di averlo già sistemato e
                 * salterebbe la scrittura, lasciando la modifica della persona
                 * al suo posto — e dicendo «fatto».
                 *
                 * ⇒ Ogni `run` rilegge prima di toccare: la lettura e' l'unica
                 * cosa che stabilisce che cosa c'e sul disco.
                 */
                if (ultimoLetto.get(percorso) === testo) continue
                await disco.scrivi(percorso, testo)
            }
        },
    }
}

function messaggio(e: unknown) {
    return e instanceof Error ? e.message : String(e)
}
