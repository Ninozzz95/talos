/**
 * U-20 — LE MINIATURE DELLA LIBRERIA: generarle una volta, ritrovarle sempre.
 *
 * Questo file fa tre cose e nessuna di più: **cerca** una miniatura già fatta,
 * **la genera** se non c'è, e **la butta** quando il file sparisce. Cosa meriti
 * un'anteprima e come si chiami lo decide `lib/library/libraryThumbnails.ts`,
 * che non tocca né il disco né un canvas ed è l'unica metà che si prova senza
 * un telefono.
 *
 * ## ⛔ Una alla volta, e mai davanti alla lista
 *
 * Venti file in griglia sono venti decode, venti encode e venti scritture. Farle
 * partire tutte insieme all'apertura della Libreria significa che il thread che
 * disegna la pagina compete con sé stesso: la lista appare, e poi si inchioda.
 * Qui c'è **una coda seriale**: la pagina si disegna subito con i glifi, e le
 * miniature arrivano una dopo l'altra, senza che nessuna delle due cose aspetti
 * l'altra.
 *
 * ## ⛔ Sotto la CACHE, non sotto i dati
 *
 * `Directory.Cache` su Android è `getCacheDir()`, e la documentazione dice che il
 * sistema «can be deleted in cases of low memory»
 * (https://capacitorjs.com/docs/apis/filesystem, letta il 12/09/2026). È
 * esattamente la garanzia che serve: una miniatura si sa rifare dal file
 * originale, quindi perderla non costa niente e tenerla nei dati dell'utente
 * gonfierebbe i backup con roba derivata. Se la cartella sparisce, il primo
 * `stat` fallisce e la miniatura si rigenera — senza che nessuno se ne accorga.
 *
 * ## ⛔ Il PDF NON passa da pdf.js
 *
 * Lo rende `PdfRenderer` del framework Android, via lo **stesso ponte** che usa
 * il visore dei PDF (`TalosDeviceBridge.renderizzaPdf`). È una scelta che
 * l'owner ha già fatto con i numeri davanti quando quel visore è nato: il
 * renderer del framework costa **0 byte** di APK e 0 nel grafo d'avvio, mentre
 * pdf.js come renderer avrebbe pagato proprio sul tetto del grafo — che esiste
 * perché su questo telefono gira anche il motore locale. La miniatura non è una
 * ragione per rifare quella scelta al contrario.
 *
 * ⭐ E c'è un secondo guadagno che non era lo scopo: il ponte torna **già un PNG
 * codificato**, quindi per un PDF non c'è nessun decode, nessun canvas e nessun
 * encode da questa parte — i byte che arrivano sono i byte che si scrivono.
 *
 * ## Fonti, lette il 12/09/2026
 *
 * - https://capacitorjs.com/docs/apis/filesystem — `writeFile` senza `encoding`
 *   scrive binario e pretende **base64 NUDO**: mai un `data:…;base64,…`, che
 *   verrebbe decodificato prefisso compreso e scritto corrotto. `Directory.Cache`.
 *   Gli errori portano un `code`: `OS-PLUG-FILE-0008` è «non esiste».
 * - https://capacitorjs.com/docs/basics/utilities — `Capacitor.convertFileSrc`:
 *   su Android `file:///…` diventa `https://localhost/_capacitor_file_/…`
 *   (schema `https` di serie dalla v3, https://capacitorjs.com/docs/config).
 * - https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap —
 *   accetta un `Blob` diretto; `resizeWidth`, `resizeQuality` (di serie `'low'`),
 *   `imageOrientation` di serie `'from-image'`, cioè l'EXIF è già rispettato.
 * - https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close —
 *   `close()` libera la memoria grafica: senza, venti miniature di fila la
 *   tengono tutta.
 * - https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob —
 *   ⛔ un tipo non supportato **non dà errore**: ripiega su PNG in silenzio. Per
 *   questo il tipo vero si rilegge da `blob.type` invece di darlo per buono.
 * - https://developer.mozilla.org/en-US/docs/Web/API/FileReader/readAsDataURL —
 *   la via giusta per Blob → base64. ⛔ `btoa(String.fromCharCode(...bytes))`
 *   sfonda lo stack oltre ~100.000 elementi
 *   (https://github.com/mathiasbynens/base64/issues/13).
 */

import {
    TALOS_THUMBNAIL_DIR,
    talosThumbnailKey,
    talosThumbnailKeyPrefix,
    talosThumbnailKind,
    talosThumbnailPath,
    type TalosThumbnailKind,
} from '@/lib/library/libraryThumbnails'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/** Le sole due estensioni che questo archivio scrive. */
const ESTENSIONI = ['webp', 'png'] as const
type TalosThumbnailExt = (typeof ESTENSIONI)[number]

/**
 * Il filesystem, ridotto alle sole chiamate che servono qui.
 *
 * Un port e non `Filesystem` direttamente: è ciò che permette di provare la
 * cache che prende, la cache che manca e la cartella svuotata senza un telefono
 * — e sono i tre casi che contano.
 */
export interface TalosThumbnailFilesystemPort {
    stat(options: { path: string; directory: string }): Promise<unknown>
    writeFile(options: {
        path: string
        data: string
        directory: string
        recursive?: boolean
    }): Promise<unknown>
    deleteFile(options: { path: string; directory: string }): Promise<unknown>
    readdir(options: { path: string; directory: string }): Promise<{ files: Array<{ name: string }> }>
    mkdir(options: { path: string; directory: string; recursive?: boolean }): Promise<unknown>
    getUri(options: { path: string; directory: string }): Promise<{ uri: string }>
}

export interface TalosThumbnailStoreOptions {
    /** I byte del file originale, come la Libreria sa leggerli. */
    readBytes: (fileId: string) => Promise<Uint8Array | null>
    filesystem?: TalosThumbnailFilesystemPort
    /** Il valore di `Directory.Cache`. Passato perché l'enum è un modulo nativo. */
    directory?: string
    /** Una pagina di PDF come PNG in base64, dal ponte nativo. */
    renderPdfPage?: (percorso: string, larghezzaPx: number) => Promise<string | null>
    /** `file:///…` → indirizzo che la WebView sa caricare. */
    toWebViewUrl?: (uri: string) => string
    /** Siamo su un telefono? Sul web la miniatura resta in memoria. */
    isNative?: () => boolean
}

export interface TalosThumbnailStore {
    /**
     * L'indirizzo della miniatura di questo file, generandola se serve.
     * `null` quando non se ne può fare una — e `null` è una risposta valida,
     * non un guasto: chi chiama mostra il glifo del formato.
     */
    thumbnailFor(file: TalosLocalVaultFile, widthPx: number): Promise<string | null>
    /** La miniatura già pronta, senza generare niente. Per disegnare subito. */
    cached(file: TalosLocalVaultFile): string | null
    /** Il file non c'è più: via anche le sue miniature, di ogni versione. */
    forget(fileId: string): Promise<void>
    /** Si chiude la Libreria: lascia andare quanto è tenuto in memoria. */
    release(): void
}

/** Il file non esiste — distinto da «il disco ha un problema». */
function eUnNonEsiste(errore: unknown): boolean {
    const codice = (errore as { code?: unknown } | null)?.code
    if (typeof codice === 'string') return codice === 'OS-PLUG-FILE-0008'
    // I port di prova e le versioni più vecchie del plugin dicono solo una
    // frase. ⛔ Si accetta, ma non si indovina oltre: qualunque altro guasto
    // (permesso, disco pieno) porta comunque a rigenerare, che è il
    // comportamento giusto per una cache — mai a cancellare qualcosa.
    const messaggio = errore instanceof Error ? errore.message : String(errore ?? '')
    return /not exist|does not exist|no such file|File does not exist/i.test(messaggio)
}

/**
 * Blob → base64 nudo.
 *
 * ⛔ `readAsDataURL` e non `btoa(String.fromCharCode(...))`: il secondo esplode
 * sopra il centinaio di migliaia di byte, che per una miniatura a piena densità
 * su un tablet non è un numero lontano. E il prefisso `data:…;base64,` si toglie
 * qui, una volta sola, perché `writeFile` lo scriverebbe dentro il file.
 */
async function base64Nudo(blob: Blob): Promise<string> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const lettore = new FileReader()
        lettore.onload = () => resolve(String(lettore.result ?? ''))
        lettore.onerror = () => reject(lettore.error ?? new Error('TALOS_THUMB_READ_FAILED'))
        lettore.readAsDataURL(blob)
    })
    const virgola = dataUrl.indexOf(',')
    return virgola >= 0 ? dataUrl.slice(virgola + 1) : dataUrl
}

/**
 * Un'immagine ridotta alla larghezza voluta, come Blob.
 *
 * ⛔ `createImageBitmap` con `resizeWidth` fa la riduzione nel decoder, cioè
 * senza mai materializzare l'immagine a piena risoluzione: una foto da 12
 * megapixel non passa mai per la memoria della pagina. Disegnarla su un canvas
 * grande e poi rimpicciolirlo avrebbe fatto l'opposto.
 *
 * ⛔ `bitmap.close()` in un `finally`: senza, la memoria grafica resta occupata
 * fino al garbage collector, e queste chiamate arrivano una dopo l'altra.
 */
async function riduciImmagine(bytes: Uint8Array, larghezzaPx: number, mediaType: string): Promise<{
    base64: string
    ext: TalosThumbnailExt
} | null> {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
    const copia = new Uint8Array(bytes)
    const sorgente = new Blob([copia.buffer as ArrayBuffer], { type: mediaType })
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(sorgente, {
            resizeWidth: larghezzaPx,
            // `'medium'` e non `'high'`: su una scheda da 170 px la differenza
            // non si vede, e `'high'` è un filtro Lanczos su ogni file.
            resizeQuality: 'medium',
            // Di serie è già questo; scritto perché una foto ruotata dall'EXIF
            // che esce coricata è il difetto che si nota per primo, e va detto
            // che non è un caso.
            imageOrientation: 'from-image',
        })
    } catch {
        // Formato che il decoder non conosce, byte corrotti, immagine troncata:
        // per chi guarda è la stessa cosa, un file senza anteprima.
        return null
    }
    try {
        const tela = document.createElement('canvas')
        tela.width = bitmap.width
        tela.height = bitmap.height
        const pennello = tela.getContext('2d')
        if (!pennello) return null
        pennello.drawImage(bitmap, 0, 0)
        const blob = await new Promise<Blob | null>((resolve) => {
            if (typeof tela.toBlob !== 'function') { resolve(null); return }
            tela.toBlob((prodotto) => resolve(prodotto), 'image/webp', 0.82)
        })
        if (!blob) return null
        /*
         * ⛔ Il tipo si RILEGGE. `toBlob` con un formato non supportato non dà
         * errore: ripiega su PNG in silenzio (MDN, 12/09/2026). Fidarsi del
         * tipo chiesto vorrebbe dire scrivere un PNG dentro un file `.webp` —
         * il contenuto si vedrebbe lo stesso, ma la cache non saprebbe più
         * cosa ha su disco, ed è il tipo di bugia che si scopre mesi dopo.
         */
        const ext: TalosThumbnailExt = blob.type === 'image/webp' ? 'webp' : 'png'
        return { base64: await base64Nudo(blob), ext }
    } catch {
        return null
    } finally {
        bitmap.close()
    }
}

export function createTalosThumbnailStore(
    options: TalosThumbnailStoreOptions,
): TalosThumbnailStore {
    /** Gli indirizzi già risolti, per chiave di contenuto. */
    const pronte = new Map<string, string>()
    /** Le generazioni in corso, per non chiedere due volte la stessa cosa. */
    const inCorso = new Map<string, Promise<string | null>>()
    /** Le miniature che vivono solo in memoria: il web, e i ripieghi. */
    const soloInMemoria = new Set<string>()
    /** La coda: una generazione alla volta, in ordine di richiesta. */
    let coda: Promise<unknown> = Promise.resolve()
    let cartellaPronta = false

    const directory = options.directory ?? 'CACHE'

    /**
     * ⛔⛔⛔ IL PLUGIN NON SI RESTITUISCE DA UNA FUNZIONE `async`.
     *
     * Trovato da un test, non da una lettura: `Filesystem.then() is not
     * implemented on web`. Un plugin Capacitor è un **Proxy** che intercetta
     * OGNI accesso a proprietà e lo trasforma in una chiamata al plugin —
     * `then` compreso. E JavaScript, quando una funzione `async` restituisce un
     * oggetto, gli chiede `.then` per sapere se è una promessa: il Proxy
     * risponde con una funzione, JavaScript la chiama, e la chiamata parte
     * verso il nativo con il nome di metodo `then`.
     *
     * ⇒ Si legano i metodi UNO A UNO dentro un oggetto normale. Costa cinque
     * righe e toglie di mezzo una classe intera di guasti — questo sarebbe
     * arrivato fino al Pad, dove nessuna anteprima si sarebbe mai generata e
     * l'errore sarebbe stato un `catch` silenzioso.
     *
     * (https://capacitorjs.com/docs/plugins/web e
     * https://github.com/ionic-team/capacitor/issues/4684, letti il 12/09/2026.)
     */
    let porta: TalosThumbnailFilesystemPort | null | undefined
    async function filesystem(): Promise<TalosThumbnailFilesystemPort | null> {
        if (options.filesystem) return options.filesystem
        if (porta !== undefined) return porta
        try {
            const modulo = await import('@capacitor/filesystem')
            const fs = modulo.Filesystem
            porta = {
                stat: (o) => fs.stat(o as never),
                writeFile: (o) => fs.writeFile(o as never),
                deleteFile: (o) => fs.deleteFile(o as never),
                readdir: (o) => fs.readdir(o as never),
                mkdir: (o) => fs.mkdir(o as never),
                getUri: (o) => fs.getUri(o as never),
            }
        } catch {
            porta = null
        }
        return porta
    }

    async function nativo(): Promise<boolean> {
        if (options.isNative) return options.isNative()
        try {
            const { Capacitor } = await import('@capacitor/core')
            return Capacitor.isNativePlatform()
        } catch {
            return false
        }
    }

    async function indirizzoDi(fs: TalosThumbnailFilesystemPort, path: string): Promise<string | null> {
        try {
            const { uri } = await fs.getUri({ path, directory })
            if (options.toWebViewUrl) return options.toWebViewUrl(uri)
            const { Capacitor } = await import('@capacitor/core')
            return Capacitor.convertFileSrc(uri)
        } catch {
            return null
        }
    }

    /** La miniatura è già su disco? Si provano le due estensioni possibili. */
    async function suDisco(fs: TalosThumbnailFilesystemPort, key: string): Promise<string | null> {
        for (const ext of ESTENSIONI) {
            const path = talosThumbnailPath(key, ext)
            try {
                await fs.stat({ path, directory })
            } catch (errore) {
                if (eUnNonEsiste(errore)) continue
                // Un guasto che non è «non esiste» non autorizza a dichiarare
                // che il file manca: si smette di cercare e si rigenera, che
                // costa ma non mente.
                return null
            }
            return indirizzoDi(fs, path)
        }
        return null
    }

    async function generaBase64(
        file: TalosLocalVaultFile,
        kind: TalosThumbnailKind,
        larghezzaPx: number,
    ): Promise<{ base64: string; ext: TalosThumbnailExt } | null> {
        if (kind === 'pdf') {
            /*
             * ⛔ Il ponte vuole il percorso della Libreria così com'è: sa già
             * che `private_uri` è relativo a `filesDir` e lo risolve lui
             * (TalosDevicePlugin.kt). Provare a renderlo assoluto qui sarebbe
             * indovinare il lato Android da dentro la WebView.
             */
            const rendi = options.renderPdfPage ?? (async (percorso: string, larghezza: number) => {
                try {
                    const { TalosDeviceBridge } = await import('@/lib/device/devicePlugin')
                    const esito = await TalosDeviceBridge.renderizzaPdf({
                        percorso,
                        pagina: 0,
                        larghezza,
                    })
                    return esito.done === true && typeof esito.png === 'string' ? esito.png : null
                } catch {
                    return null
                }
            })
            const png = await rendi(file.private_uri, larghezzaPx)
            // ⛔ Anche qui il prefisso: se un giorno il ponte cominciasse a
            // mandare un data-URL, scriverlo dentro il file darebbe una
            // miniatura corrotta senza un solo errore da nessuna parte.
            if (!png) return null
            const virgola = png.indexOf(',')
            const nudo = png.startsWith('data:') && virgola >= 0 ? png.slice(virgola + 1) : png
            return { base64: nudo, ext: 'png' }
        }
        const bytes = await options.readBytes(file.id).catch(() => null)
        if (!bytes || bytes.byteLength === 0) return null
        return riduciImmagine(bytes, larghezzaPx, file.media_type)
    }

    async function genera(
        file: TalosLocalVaultFile,
        kind: TalosThumbnailKind,
        key: string,
        larghezzaPx: number,
    ): Promise<string | null> {
        const prodotto = await generaBase64(file, kind, larghezzaPx)
        if (!prodotto) return null

        const fs = await filesystem()
        if (!fs || !await nativo()) {
            /*
             * Il web: non c'è un file da mostrare, c'è un IndexedDB dietro un
             * plugin (https://capacitorjs.com/docs/apis/filesystem, letta il
             * 12/09/2026). La miniatura resta in memoria per la durata della
             * visita, ed è ciò che il brief chiede.
             *
             * ⛔ Un `data:` URL e non un object URL: un blob va REVOCATO, e chi
             * lo dimentica lascia dietro di sé memoria che nessuno libera
             * finché la scheda resta aperta — è la falla che il composable
             * delle anteprime immagine dichiara di esistere per evitare, e che
             * si è comunque riaperta una volta. Una miniatura è qualche decina
             * di kB: non vale un ciclo di vita da gestire a mano.
             */
            const url = urlDaBase64(prodotto.base64, prodotto.ext)
            soloInMemoria.add(url)
            return url
        }

        const path = talosThumbnailPath(key, prodotto.ext)
        try {
            if (!cartellaPronta) {
                await fs.mkdir({ path: TALOS_THUMBNAIL_DIR, directory, recursive: true })
                    .catch(() => undefined)
                cartellaPronta = true
            }
            await fs.writeFile({ path, data: prodotto.base64, directory, recursive: true })
        } catch {
            // Disco pieno, cache svuotata sotto i piedi, permesso negato: la
            // miniatura c'è ancora in memoria per questa visita.
            return urlDaBase64(prodotto.base64, prodotto.ext)
        }
        return await indirizzoDi(fs, path) ?? urlDaBase64(prodotto.base64, prodotto.ext)
    }

    /** Un indirizzo mostrabile senza toccare il disco. Usato dal web e dai ripieghi. */
    function urlDaBase64(base64: string, ext: TalosThumbnailExt): string {
        return `data:image/${ext};base64,${base64}`
    }

    return {
        cached(file) {
            return pronte.get(talosThumbnailKey(file)) ?? null
        },

        async thumbnailFor(file, widthPx) {
            const kind = talosThumbnailKind(file)
            if (kind !== 'image' && kind !== 'pdf') return null
            const key = talosThumbnailKey(file)
            const gia = pronte.get(key)
            if (gia) return gia
            const corso = inCorso.get(key)
            if (corso) return corso

            /*
             * ⛔ La coda è QUI e non dentro `genera`: mettere in fila anche la
             * lettura della cache vorrebbe dire che la ventesima miniatura già
             * pronta aspetta le diciannove generazioni davanti a sé, e la
             * seconda apertura della Libreria sarebbe lenta quanto la prima.
             * In fila ci va solo il lavoro vero.
             */
            const lavoro = (async (): Promise<string | null> => {
                const fs = await filesystem()
                if (fs && await nativo()) {
                    const disco = await suDisco(fs, key)
                    if (disco) return disco
                }
                const mio = coda.then(() => genera(file, kind, key, widthPx), () => genera(file, kind, key, widthPx))
                coda = mio.catch(() => undefined)
                return mio
            })()

            inCorso.set(key, lavoro)
            try {
                const esito = await lavoro
                if (esito) pronte.set(key, esito)
                return esito
            } catch {
                // ⛔ Mai un'eccezione fino alla pagina: un file corrotto è una
                // scheda col glifo, non una schermata rossa.
                return null
            } finally {
                inCorso.delete(key)
            }
        },

        async forget(fileId) {
            const prefisso = talosThumbnailKeyPrefix(fileId)
            for (const key of [...pronte.keys()]) {
                if (key.startsWith(prefisso)) pronte.delete(key)
            }
            const fs = await filesystem()
            if (!fs || !await nativo()) return
            /*
             * ⛔ Si elencano e si cancellano TUTTE le versioni, non solo quella
             * corrente: se il file è stato sostituito prima di essere eliminato,
             * la miniatura vecchia è ancora lì e nessuno la cercherebbe più —
             * un file cancellato che lascia dietro di sé una sua immagine è
             * esattamente ciò che «elimina» non deve fare.
             */
            try {
                const { files } = await fs.readdir({ path: TALOS_THUMBNAIL_DIR, directory })
                for (const voce of files) {
                    if (!voce.name.startsWith(prefisso)) continue
                    await fs.deleteFile({
                        path: `${TALOS_THUMBNAIL_DIR}/${voce.name}`,
                        directory,
                    }).catch(() => undefined)
                }
            } catch {
                // La cartella non c'è ancora, o il sistema l'ha svuotata: non
                // c'è niente da cancellare, ed è il risultato voluto.
            }
        },

        release() {
            /*
             * Ciò che sta su disco resta: è il punto della cache, e riaprire la
             * Libreria deve costare un `stat` invece di venti generazioni. Si
             * lascia andare solo quello che vive in memoria — il ramo web e i
             * ripieghi — perché quello sì che è pagato a ogni visita.
             */
            for (const [key, url] of [...pronte]) {
                if (soloInMemoria.has(url)) pronte.delete(key)
            }
            soloInMemoria.clear()
        },
    }
}
