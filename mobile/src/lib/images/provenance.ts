/**
 * Chi ha fatto questa immagine, letto dall'immagine stessa.
 *
 * Owner 2026-08-04: «mettiamo un watermark semitrasparente esattamente come fa
 * ChatGPT, in modo da riconoscere che quella e' un'immagine generata
 * dall'intelligenza artificiale».
 *
 * ## Cio' che la misura ha cambiato
 *
 * Misurato sul dispositivo il 2026-08-04, contro l'API vera: le immagini che
 * OpenAI restituisce **portano gia' dentro** un manifesto C2PA firmato — un
 * chunk PNG `caBX` da ~25-29 KB, subito dopo l'intestazione:
 *
 *     IHDR:13  →  caBX:29030  →  IDAT:1008321  →  IEND:0
 *
 * e dentro c'e' cio' che serve, in chiaro:
 *
 *     claim_generator_info.name  "OpenAI Media Service API"
 *     softwareAgent              { name: "gpt-image", version: "pre-2.0" }
 *     c2pa.actions.v2            action: c2pa.created
 *     digitalSourceType          .../trainedAlgorithmicMedia
 *
 * piu' la catena di certificati (SSL.com C2PA Root CA 2025) e le risposte OCSP.
 *
 * Quindi il lavoro NON e' costruire una provenienza: e' non distruggere quella
 * che c'e', e mostrarla. Firmarne una nostra sarebbe anche impossibile da fare
 * onestamente — un'app distribuita non puo' custodire una chiave privata di
 * firma, perche' chiunque la estrarrebbe dall'APK e potrebbe firmare a nome di
 * TALOS qualunque cosa.
 *
 * ## Il limite, detto invece che nascosto
 *
 * Questo lettore **non verifica la firma**. Verificarla vorrebbe dire ricalcolare
 * l'impronta dell'immagine, seguire la catena dei certificati fino a una radice
 * fidata e interrogare l'OCSP: e' il mestiere di una libreria C2PA vera, non di
 * duecento righe.
 *
 * Percio' cio' che si riporta e' «questo file DICHIARA di venire da X», mai
 * «questo file e' autentico». Sono due frasi diverse, e spacciare la prima per
 * la seconda sarebbe peggio che tacere: chi legge si fiderebbe di un controllo
 * che nessuno ha fatto.
 */

/** Cosa un file dichiara di se stesso. Mai una verifica: una dichiarazione. */
export interface TalosImageProvenance {
    /** Il file porta Content Credentials. */
    hasCredentials: boolean
    /** Chi ha prodotto il manifesto, es. «OpenAI Media Service API». */
    generator: string | null
    /** Lo strumento dichiarato, es. «gpt-image». */
    softwareAgent: string | null
    /**
     * Il file dichiara di essere stato generato da un algoritmo addestrato.
     *
     * Viene dal `digitalSourceType` dello standard IPTC — che e' il vocabolario
     * a cui rimanda il regolamento europeo — e non da un'euristica nostra.
     */
    declaresAiGenerated: boolean
}

export const TALOS_NO_PROVENANCE: TalosImageProvenance = {
    hasCredentials: false,
    generator: null,
    softwareAgent: null,
    declaresAiGenerated: false,
}

/** Il tipo di chunk PNG in cui lo standard C2PA mette il manifesto. */
const PNG_C2PA_CHUNK = 'caBX'
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/**
 * Il manifesto dentro un PNG, se c'e'.
 *
 * Si cammina la catena dei chunk invece di cercare `caBX` a tentoni nei byte:
 * quella sigla puo' capitare per caso dentro i dati compressi di un'immagine, e
 * un falso positivo qui direbbe a una persona che la sua foto e' stata generata
 * da una macchina.
 */
function findPngC2paChunk(bytes: Uint8Array): Uint8Array | null {
    if (bytes.length < 8) return null
    for (let i = 0; i < 8; i += 1) if (bytes[i] !== PNG_SIGNATURE[i]) return null

    let cursor = 8
    while (cursor + 8 <= bytes.length) {
        const length = (bytes[cursor]! << 24 >>> 0) + (bytes[cursor + 1]! << 16)
            + (bytes[cursor + 2]! << 8) + bytes[cursor + 3]!
        const type = String.fromCharCode(
            bytes[cursor + 4]!, bytes[cursor + 5]!, bytes[cursor + 6]!, bytes[cursor + 7]!,
        )
        const start = cursor + 8
        if (start + length > bytes.length) return null
        if (type === PNG_C2PA_CHUNK) return bytes.subarray(start, start + length)
        if (type === 'IEND') return null
        // 12 = lunghezza(4) + tipo(4) + CRC(4)
        cursor += 12 + length
    }
    return null
}

/**
 * Il manifesto dentro un JPEG, se c'e'.
 *
 * Lo standard lo mette in segmenti APP11, che possono essere PIU' D'UNO quando
 * il manifesto supera i 64 KB di un segmento. Non li ricuciamo: da qui serve
 * leggere delle etichette, e quelle stanno nel primo pezzo. Cio' che questo
 * lettore non sa fare e' scritto in cima al file, non lasciato indovinare.
 */
function findJpegC2paSegment(bytes: Uint8Array): Uint8Array | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
    let cursor = 2
    while (cursor + 4 <= bytes.length) {
        if (bytes[cursor] !== 0xff) return null
        const marker = bytes[cursor + 1]!
        // L'inizio dei dati compressi: da qui in poi non ci sono piu' segmenti.
        if (marker === 0xda) return null
        const length = (bytes[cursor + 2]! << 8) + bytes[cursor + 3]!
        if (length < 2 || cursor + 2 + length > bytes.length) return null
        if (marker === 0xeb) return bytes.subarray(cursor + 4, cursor + 2 + length)
        cursor += 2 + length
    }
    return null
}

/**
 * Le stringhe di testo di un manifesto, NELL'ORDINE in cui compaiono.
 *
 * Il manifesto e' CBOR dentro contenitori JUMBF. Leggerlo a caratteri non
 * funziona, ed e' la misura ad averlo detto: nel CBOR il byte che dichiara la
 * lunghezza di una stringa corta e' `0x60 + lunghezza`, cioe' una LETTERA
 * STAMPABILE. Nel manifesto vero, `softwareAgent` e' seguito da
 * `dnameigpt-imagegversiongpre-2.0` — dove `d`, `i` e `g` sono lunghezze, non
 * testo. Un lettore a caratteri riporterebbe `dnamex` come nome del produttore.
 *
 * Quindi si leggono i TOKEN: si scorre il CBOR e si decodificano solo le
 * stringhe di testo, che e' il minimo che serve e non finge di essere un parser
 * completo. Cio' che non e' una stringa si salta di UN byte — non si prova a
 * saltare la struttura, perche' sbagliare quel salto perderebbe in silenzio
 * tutto il resto del manifesto.
 */
function cborTextTokens(bytes: Uint8Array): string[] {
    const tokens: string[] = []
    let cursor = 0
    while (cursor < bytes.length && tokens.length < 4000) {
        const head = bytes[cursor]!
        // Tipo maggiore 3 = stringa di testo. 0x60..0x77 porta la lunghezza
        // dentro il byte stesso; 0x78 la mette nel byte successivo.
        let length = -1
        let start = cursor + 1
        if (head >= 0x60 && head <= 0x77) {
            length = head - 0x60
        } else if (head === 0x78 && cursor + 1 < bytes.length) {
            length = bytes[cursor + 1]!
            start = cursor + 2
        }
        if (length < 1 || start + length > bytes.length) { cursor += 1; continue }

        let testo = ''
        let stampabile = true
        for (let i = start; i < start + length; i += 1) {
            const byte = bytes[i]!
            if (byte < 0x20 || byte > 0x7e) { stampabile = false; break }
            testo += String.fromCharCode(byte)
        }
        if (!stampabile) { cursor += 1; continue }
        tokens.push(testo)
        cursor = start + length
    }
    return tokens
}

/**
 * Il valore di una chiave dentro l'oggetto che segue un'etichetta.
 *
 * `claim_generator_info` → `name` → «OpenAI Media Service API»: tre token di
 * fila. La chiave si cerca solo nella FINESTRA subito dopo l'etichetta, non in
 * tutto il manifesto: `name` compare decine di volte, e il primo che si
 * incontra altrove appartiene a un'altra cosa.
 */
function valueOf(tokens: readonly string[], label: string, key: string): string | null {
    const at = tokens.indexOf(label)
    if (at < 0) return null
    const limite = Math.min(tokens.length - 1, at + 6)
    for (let i = at + 1; i < limite; i += 1) {
        if (tokens[i] === key) return tokens[i + 1] ?? null
    }
    return null
}

/**
 * Cosa questo file dichiara di se stesso.
 *
 * Non lancia mai: un file corrotto, troncato o di un formato che non
 * conosciamo torna «nessuna dichiarazione», che e' esattamente la verita' —
 * non sappiamo. Un'eccezione qui farebbe sparire un'immagine dalla
 * conversazione per colpa di una sua etichetta.
 */
export function readTalosImageProvenance(bytes: Uint8Array): TalosImageProvenance {
    let manifest: Uint8Array | null = null
    try {
        manifest = findPngC2paChunk(bytes) ?? findJpegC2paSegment(bytes)
    } catch {
        return TALOS_NO_PROVENANCE
    }
    if (!manifest || manifest.length === 0) return TALOS_NO_PROVENANCE

    const tokens = cborTextTokens(manifest)
    // La sigla dello standard dentro il contenitore JUMBF. Senza, quel chunk
    // non e' un manifesto C2PA e non se ne riporta niente.
    if (!tokens.some((token) => token.startsWith('c2pa'))) return TALOS_NO_PROVENANCE

    return {
        hasCredentials: true,
        generator: valueOf(tokens, 'claim_generator_info', 'name'),
        softwareAgent: valueOf(tokens, 'softwareAgent', 'name'),
        // Il vocabolario IPTC a cui rimanda il regolamento europeo, non una
        // nostra euristica sul nome del modello.
        declaresAiGenerated: tokens.some((token) => token.endsWith('trainedAlgorithmicMedia')),
    }
}

/**
 * Il nome da mostrare a una persona.
 *
 * «OpenAI Media Service API» e' il nome che il manifesto porta, ed e' il nome
 * di un servizio, non di chi l'ha fatta: in una conversazione si legge come
 * gergo. Si accorcia a cio' che una persona riconosce, e quando non si
 * riconosce niente si mostra il nome per intero invece di inventarne uno.
 */
export function talosProvenanceLabel(provenance: TalosImageProvenance): string | null {
    if (!provenance.hasCredentials) return null
    const raw = provenance.generator ?? provenance.softwareAgent
    if (!raw) return null
    if (/openai/i.test(raw)) return 'OpenAI'
    if (/google|gemini|deepmind/i.test(raw)) return 'Google'
    if (/adobe/i.test(raw)) return 'Adobe'
    return raw.replace(/\s+(API|Service|Media Service)\b/gi, '').trim() || raw
}
