/**
 * Quanto pesera', letto dal NOME, prima di aver chiesto niente.
 *
 * Owner 2026-08-04, sul mockup approvato: la capienza dev'essere «un'etichetta
 * che vedo sempre» — cioe' su OGNI riga, anche quelle che arrivano dalla
 * ricerca sul Hub.
 *
 * ## Il problema che risolve
 *
 * Un risultato di ricerca non porta la dimensione dei file: per averla servono
 * una `pathsInfo` per repository, e venti righe sarebbero venti richieste. E'
 * il modo piu' veloce di finire nel limitatore che gli utenti anonimi
 * condividono con tutti quelli dietro lo stesso operatore.
 *
 * Ma il nome la dice quasi sempre: `Qwen3-Coder-30B-A3B-Instruct-Q4_K_M` porta
 * i parametri e la quantizzazione, e da quei due il peso si stima con un errore
 * che non cambia MAI il verdetto — la differenza fra «ci sta» e «non ci sta» e'
 * di gigabyte, la stima sbaglia di centinaia di megabyte.
 *
 * ## Il limite, dichiarato
 *
 * E' una STIMA e va detto a chi legge: `estimated: true` esiste per questo.
 * Quando si apre il repository i byte veri arrivano e sostituiscono questa —
 * una stima che si spaccia per misura e' peggio di nessun numero, perche' chi
 * la legge smette di verificare.
 *
 * Se il nome non dice i PARAMETRI, non si inventa: torna `null`, e la riga
 * mostra il modello senza etichetta invece di una capienza immaginata. La
 * quantizzazione invece si assume, e lo si dichiara — vedi dentro.
 */

/** Bit per peso, per quantizzazione. Dal formato GGUF, non stimati. */
const BITS: Record<string, number> = {
    Q2_K: 2.6, Q3_K_S: 3.4, Q3_K_M: 3.9, Q3_K_L: 4.3,
    Q4_0: 4.5, Q4_1: 5.0, Q4_K_S: 4.6, Q4_K_M: 4.8,
    Q5_0: 5.5, Q5_1: 6.0, Q5_K_S: 5.5, Q5_K_M: 5.7,
    Q6_K: 6.6, Q8_0: 8.5,
    IQ2_XXS: 2.1, IQ2_XS: 2.3, IQ3_XXS: 3.1, IQ3_S: 3.4, IQ4_XS: 4.3, IQ4_NL: 4.5,
    F16: 16, BF16: 16, F32: 32,
}

/** I parametri, in miliardi, se il nome li dice: `30B`, `9b`, `1.5B`. */
const PARAMS = /(?:^|[-_.\s])(\d+(?:\.\d+)?)\s*b(?=[-_.\s]|$)/i

export interface TalosEstimatedSize {
    /**
     * I parametri in miliardi, letti dal nome.
     *
     * E' il numero da cui discende tutto il resto, e serve anche da solo: il
     * filtro di peso lo usa quando il Hub non e' riuscito ad aprire il file e
     * quindi `gguf.total` non c'e'. Prima restava sepolto in una variabile
     * locale, e chi ne aveva bisogno avrebbe dovuto rifare la stessa regex.
     */
    parametersB: number
    /** I byte che il file occupera' una volta scaricato. */
    fileBytes: number
    /**
     * Quanto serve per USARLO, non solo per tenerlo.
     *
     * I pesi piu' un margine per la cache del contesto e per il runtime. E' il
     * numero che conta per la capienza: un file che entra sul disco ma non
     * nella memoria non si puo' aprire, e dirlo dopo il download e' tardi.
     */
    workingBytes: number
    /** Sempre `true` qui. Esiste perche' chi mostra il numero possa dirlo. */
    estimated: true
    /**
     * La quantizzazione che si e' dovuta assumere, quando il nome non la dice.
     *
     * `null` significa che era scritta nel nome: allora la stima riguarda solo
     * il peso, non anche quale variante.
     */
    assumedQuantisation: string | null
}

/**
 * Il margine sopra i pesi, per poterlo davvero aprire.
 *
 * 1.25 non e' un numero tondo scelto a caso: la cache del contesto su una
 * finestra media piu' i buffer di llama.cpp stanno intorno al quarto del
 * modello. Sbagliare in difetto qui vuol dire dire «ci sta» a qualcosa che poi
 * non si apre — l'errore che costa un download intero.
 */
const MARGINE_DI_LAVORO = 1.25

/**
 * La stima, o `null` se il nome non basta.
 *
 * Servono i PARAMETRI: senza quelli non c'e' niente da cui partire, e un ordine
 * di grandezza non decide fra «ci sta» e «non ci sta». La quantizzazione, se
 * manca, si assume — e la stima lo dichiara.
 */
export function talosEstimateSizeFromName(name: string): TalosEstimatedSize | null {
    const parametri = PARAMS.exec(name)
    if (!parametri) return null

    const miliardi = Number(parametri[1])
    if (!Number.isFinite(miliardi) || miliardi <= 0 || miliardi > 2000) return null

    /*
     * La quantizzazione, o quella che si prenderebbe.
     *
     * MISURATO sul dispositivo il 2026-08-04: su venti righe sfogliate dal Hub,
     * UNA sola portava entrambi i pezzi nel nome. E' strutturale — il nome del
     * REPOSITORY dice i parametri (`Qwen3-Coder-30B`), la quantizzazione e' una
     * proprieta' dei FILE che stanno dentro. Pretendere entrambi lasciava
     * diciannove righe senza l'etichetta che l'owner ha approvato.
     *
     * Quando manca si assume Q4_K_M: e' la variante che su un telefono si
     * prende quasi sempre, ed e' anche quella che un repository quasi sempre
     * pubblica. «Quanto peserebbe in Q4» e' un'affermazione vera e utile su un
     * repository da 30 miliardi; tacere non lo e'.
     *
     * E si DICHIARA: `assumedQuantisation` viaggia con la stima.
     */
    const trovata = Object.keys(BITS).find((q) => new RegExp(`[-_.]${q}(?:[-_.]|$)`, 'i').test(name))
    const chiave = trovata ?? 'Q4_K_M'

    // miliardi di pesi × bit per peso ÷ 8 = byte
    const fileBytes = (miliardi * 1e9 * BITS[chiave]!) / 8
    return {
        parametersB: miliardi,
        fileBytes,
        workingBytes: fileBytes * MARGINE_DI_LAVORO,
        estimated: true,
        assumedQuantisation: trovata ? null : chiave,
    }
}

/*
 * Il verdetto NON sta piu' qui.
 *
 * `talosEstimatedBand` viveva in fondo a questo file e guardava solo la
 * memoria. Era il posto sbagliato in un modo che si e' pagato: questo modulo
 * parla di NOMI e di pesi, e un verdetto ospitato qui e' un verdetto che nessuno
 * confronta con quello vero — cosi' ha smesso di misurare il disco senza che
 * niente lo facesse notare.
 *
 * Ora sta in `fit.ts`, accanto al calcolo completo, e si chiama
 * `talosEstimatedCapacity`. Stessa riserva, stessa soglia, stesso ORDINE dei
 * cancelli: se un giorno cambia il calcolo, cambia per tutti e due insieme.
 */
