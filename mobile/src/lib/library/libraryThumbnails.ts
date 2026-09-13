/**
 * U-20 — LE ANTEPRIME VERE DELLA LIBRERIA, la parte che non tocca niente.
 *
 * Qui c'è solo il ragionamento: *che anteprima merita questo file*, *come si
 * chiama la sua miniatura*, *quanto dev'essere larga*, e *cosa si scrive dentro
 * un'anteprima tipografica*. Nessun disco, nessun canvas, nessun ponte nativo —
 * quelli stanno in `services/talosThumbnailStore.ts`.
 *
 * ⛔ È diviso così perché la parte che decide è l'unica che si può provare senza
 * un telefono. Un modulo solo avrebbe avuto i suoi casi limite — un file
 * corrotto, una cache vecchia, un'estensione sconosciuta — raggiungibili solo
 * montando `@capacitor/filesystem`, e quelli sono esattamente i casi che nessuno
 * prova mai.
 *
 * ## Le quattro strade, e perché sono quattro e non una
 *
 * | contenuto           | anteprima                         | costo          |
 * |---------------------|-----------------------------------|----------------|
 * | immagine            | l'immagine stessa, ridotta        | un decode      |
 * | PDF                 | la prima pagina                   | un render      |
 * | testo / MD / CSV    | titolo + righe, **in DOM**        | **zero**       |
 * | tutto il resto      | il glifo del formato              | zero           |
 *
 * ⛔ La terza riga è il punto. Il mockup disegna `.mini-document` — un titolo e
 * quattro trattini — con del CSS, e rasterizzarla sarebbe stato lavoro vero
 * (canvas, font, encode, scrittura su disco, invalidazione) per ottenere
 * un'immagine di una cosa che il browser disegna gratis. Un'anteprima che costa
 * meno di zero non ha nemmeno bisogno di una cache.
 *
 * ## Perché un PDF non passa da pdfjs qui
 *
 * `pdfjs-dist` c'è già nel progetto, ma per **estrarre il testo**
 * (`lib/chat/attachmentAnalysis.ts`). Rasterizzare una pagina dentro la WebView
 * è la strada che l'owner ha già scartato con dei numeri davanti, quando è nato
 * il visore dei PDF: il framework Android ha `PdfRenderer`, che costa 0 byte di
 * APK e 0 nel grafo d'avvio, mentre pdf.js come renderer avrebbe pagato proprio
 * sul tetto del grafo. La miniatura non è una ragione per rifare quella scelta
 * al contrario: chiama lo stesso ponte del visore.
 *
 * Fonti lette il 12/09/2026:
 * - https://capacitorjs.com/docs/apis/filesystem — `Directory.Cache` su Android è
 *   `getCacheDir()`, «can be deleted in cases of low memory»: il posto giusto per
 *   qualcosa che si sa rifare.
 * - https://capacitorjs.com/docs/basics/utilities — `Capacitor.convertFileSrc`.
 * - https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap —
 *   `resizeWidth` / `resizeQuality` / `imageOrientation`.
 */

import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import { talosLibraryFilePresentation } from '@/lib/libraryFilePresentation'

/**
 * Come si fa l'anteprima di questo file.
 *
 * - `image` / `pdf` — si genera un'immagine e si tiene su disco.
 * - `typographic` — si disegna in DOM, non si genera e non si conserva niente.
 * - `none` — nessuna anteprima possibile: resta il glifo del formato.
 */
export type TalosThumbnailKind = 'image' | 'pdf' | 'typographic' | 'none'

/**
 * I formati che si aprono e si riducono come immagini.
 *
 * ⛔ SVG NO, ed è deliberato: un SVG è un documento eseguibile, e darlo in pasto
 * a un decoder per farne una miniatura vuol dire eseguirlo. Un file della
 * Libreria può arrivare da una pagina web letta da TALOS, cioè da uno
 * sconosciuto. Prende il glifo, come qualunque formato senza anteprima.
 *
 * ⛔ HEIC/HEIF nemmeno: la WebView di Android non li decodifica, e provarci
 * costa una lettura intera del file per finire in un `catch`.
 */
const FORMATI_IMMAGINE_APRIBILI = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif',
])

/**
 * I formati la cui anteprima è il TESTO che contengono.
 *
 * Si guarda il tipo dichiarato e, per i file senza tipo credibile, il glifo che
 * `talosLibraryFilePresentation` ha già dedotto dal nome: è la stessa funzione
 * che decide l'icona, quindi un file che mostra l'icona «testo» non può
 * ritrovarsi con un'anteprima di un'altra famiglia.
 */
const GLIFI_TIPOGRAFICI = new Set(['text', 'code', 'data', 'spreadsheet'])

export function talosThumbnailKind(file: TalosLocalVaultFile): TalosThumbnailKind {
    // ⛔ Prima di tutto: se i byte non ci sono, non c'è niente da guardare. Una
    // riga `pending` o `failed` ha `private_uri` vuoto per contratto
    // (`talosVaultService.ts`), e chiedere un'anteprima spenderebbe un giro del
    // ponte per sentirsi dire di no.
    if (file.status !== 'available' || file.private_uri.trim() === '') return 'none'

    const tipo = file.media_type.trim().toLowerCase().split(';', 1)[0] ?? ''
    if (FORMATI_IMMAGINE_APRIBILI.has(tipo)) return 'image'
    if (tipo === 'application/pdf') return 'pdf'

    const glifo = talosLibraryFilePresentation(file.display_name, file.media_type).iconKind
    if (GLIFI_TIPOGRAFICI.has(glifo)) return 'typographic'
    // L'HTML si legge come codice — è testo, e il suo glifo è `code`; il ramo
    // sopra lo prende già. Qui restano archivi, fogli Office binari, Word: roba
    // di cui non sappiamo leggere una pagina senza aprirla davvero.
    return 'none'
}

/** Un'anteprima che si genera e si conserva su disco. */
export function talosThumbnailIsRastered(kind: TalosThumbnailKind): boolean {
    return kind === 'image' || kind === 'pdf'
}

/**
 * ── LA CHIAVE ───────────────────────────────────────────────────────────────
 *
 * Identifica il CONTENUTO, non il file: se i byte cambiano la chiave cambia, e
 * la miniatura vecchia smette di essere trovata invece di restare a mentire.
 *
 * ⛔ `sha256` per primo perché è il contenuto stesso. Quando manca (righe più
 * vecchie della colonna) si ripiega su `updated_at` + dimensione: due segnali
 * deboli che insieme reggono, perché una modifica che non tocca né l'orologio né
 * la lunghezza è un caso che non abbiamo — i file della Libreria si sostituiscono
 * interi, non si riscrivono a pezzi.
 *
 * ⛔ E l'`id` resta in testa, in chiaro: è ciò che permette di cancellare le
 * miniature di un file eliminato senza doversi ricordare quale versione aveva.
 */
export function talosThumbnailKey(file: TalosLocalVaultFile): string {
    const versione = file.sha256?.trim()
        ? file.sha256.trim().slice(0, 16)
        : `${file.updated_at}-${file.size_bytes}`
    return `${sanifica(file.id)}__${sanifica(versione)}`
}

/** L'`id` nudo dentro una chiave, per riconoscere le miniature di un file. */
export function talosThumbnailKeyPrefix(fileId: string): string {
    return `${sanifica(fileId)}__`
}

/**
 * Tutto ciò che non è una lettera, una cifra o un trattino diventa un trattino.
 *
 * ⛔ Non è cosmesi: la chiave finisce in un NOME DI FILE, e `updated_at` è un
 * ISO con i due punti dentro — un carattere che su alcuni filesystem non si può
 * scrivere e che in un percorso Android è comunque un modo di cercare guai. Un
 * `id` arriva normalizzato dal repository, ma questa funzione non ha il diritto
 * di fidarsene: il pezzo di versione no di sicuro.
 */
function sanifica(valore: string): string {
    return valore.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 80)
}

/** La cartella delle miniature, sotto la cache: si sa rifare, e il sistema può svuotarla. */
export const TALOS_THUMBNAIL_DIR = 'talos-library-thumbs'

export function talosThumbnailPath(key: string, estensione: 'webp' | 'png'): string {
    return `${TALOS_THUMBNAIL_DIR}/${key}.${estensione}`
}

/**
 * ── LA MISURA ───────────────────────────────────────────────────────────────
 *
 * ⛔ NIENTE SCRITTO A MANO: la larghezza in pixel la decide la LARGHEZZA VERA
 * della scheda a schermo, moltiplicata per la densità del dispositivo. Una
 * costante qui sarebbe un telefono indovinato — sgranata sul Pad, memoria buttata
 * sul telefono.
 *
 * I due estremi ci sono per ragioni diverse:
 * - **160 px** in basso: sotto questa soglia una prima pagina di PDF non si legge
 *   più come una pagina, e la miniatura smette di dire qualcosa.
 * - **1024 px** in alto: è il tetto del buon senso su un bitmap che vive in una
 *   scheda. Una scheda larga più di così non esiste nella griglia, e il ritaglio
 *   `object-cover` non chiede di più.
 *
 * E la densità si limita a 2: il Pad dichiara 2.75, e il terzo di pixel in più
 * non si vede mentre il file su disco crescerebbe del 90%.
 */
export const TALOS_THUMBNAIL_MIN_PX = 160
export const TALOS_THUMBNAIL_MAX_PX = 1024

export function talosThumbnailWidthPx(cssWidth: number, devicePixelRatio: number): number {
    const larghezza = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : TALOS_THUMBNAIL_MIN_PX
    const densita = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
        ? Math.min(devicePixelRatio, 2)
        : 1
    const grezza = Math.round(larghezza * densita)
    return Math.min(Math.max(grezza, TALOS_THUMBNAIL_MIN_PX), TALOS_THUMBNAIL_MAX_PX)
}

/**
 * ── L'ANTEPRIMA TIPOGRAFICA ─────────────────────────────────────────────────
 *
 * Il `.mini-document` del mockup: una linguetta in accento, un titolo, e quattro
 * righe che digradano. Qui si decide **cosa** ci va dentro; il disegno è di
 * `TalosMobileLibraryArt.vue`.
 *
 * Le righe NON sono il testo del file: sono la sua FORMA. Si mandano a schermo
 * come barre di lunghezza proporzionale, perché a 150 px di larghezza il testo
 * vero sarebbe illeggibile e un'anteprima illeggibile è rumore che sembra
 * contenuto. Quello che si legge davvero è il titolo.
 *
 * ⛔ Il titolo è la prima riga NON VUOTA del contenuto, ripulita dai cancelletti
 * del Markdown — non il nome del file, che sta già scritto sotto la scheda.
 * Quando il contenuto non c'è (estrazione mai riuscita, o file solo binario) si
 * torna `null` e la scheda cade sul glifo: un riquadro col titolo e quattro
 * trattini finti direbbe che c'è del testo dove non c'è.
 */
export interface TalosTypographicPreview {
    /** La prima riga del contenuto, già ripulita. */
    title: string
    /** Le lunghezze relative (0…1) delle righe da disegnare, al massimo 4. */
    lines: number[]
}

const RIGHE_ANTEPRIMA = 4
const LARGHEZZA_RIFERIMENTO = 60

export function talosTypographicPreview(
    extractedText: string | null | undefined,
): TalosTypographicPreview | null {
    if (typeof extractedText !== 'string') return null
    const righe = extractedText
        .split(/\r?\n/)
        .map((riga) => riga.replace(/^[#>\s*_\-=|]+/, '').replace(/[|*_`]+/g, '').trim())
        .filter((riga) => riga.length > 0)
    if (righe.length === 0) return null

    const title = righe[0]!.slice(0, 60)
    /*
     * Le barre partono dalla SECONDA riga. Se il file ha una riga sola — un CSV
     * di sola intestazione, un appunto di tre parole — si disegnano comunque
     * quattro barre corte: la forma di un foglio quasi vuoto è un'informazione,
     * un riquadro col solo titolo sembrerebbe un'anteprima non finita.
     */
    const corpo = righe.slice(1, 1 + RIGHE_ANTEPRIMA)
    const lines: number[] = []
    for (let indice = 0; indice < RIGHE_ANTEPRIMA; indice += 1) {
        const riga = corpo[indice]
        const quota = riga
            ? Math.min(riga.length, LARGHEZZA_RIFERIMENTO) / LARGHEZZA_RIFERIMENTO
            : 0.3
        // Mai sotto un terzo: una barra da due pixel si legge come un difetto di
        // disegno, non come una riga corta.
        lines.push(Math.max(0.34, Math.min(1, quota)))
    }
    return { title, lines }
}
