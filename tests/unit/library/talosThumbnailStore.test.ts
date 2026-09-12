// @vitest-environment jsdom

/**
 * U-20 — L'ARCHIVIO DELLE MINIATURE: la cache che prende, quella che manca, e
 * tutti i modi in cui può andare storto.
 *
 * ⛔ Ogni prova ha il suo VERSO CONTRARIO, perché qui il difetto tipico è una
 * funzione che risponde bene e non fa niente: una cache che «prende» sempre
 * (e quindi non genera mai), una generazione che «riesce» sempre (e quindi
 * scrive file vuoti), una cancellazione che «funziona» senza toccare il disco.
 * Un cancello che non respinge mai supera una prova a senso unico esattamente
 * come uno vero.
 *
 * Il filesystem è un port iniettato, e il ponte dei PDF pure: è la ragione per
 * cui questi casi si possono provare qui invece che sperando in un Pad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createTalosThumbnailStore,
    type TalosThumbnailFilesystemPort,
} from '@/services/talosThumbnailStore'
import { TALOS_THUMBNAIL_DIR, talosThumbnailKey } from '@/lib/library/libraryThumbnails'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pdf(patch: Partial<TalosLocalVaultFile> = {}): TalosLocalVaultFile {
    return {
        id: 'vault-pdf',
        display_name: 'piano.pdf',
        media_type: 'application/pdf',
        size_bytes: 4096,
        private_uri: 'talos-vault/files/vault-pdf.pdf',
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: null,
        failure_code: null,
        metadata: {},
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
        ...patch,
    }
}

/** Un errore del plugin come lo manda davvero: con il suo codice. */
function nonEsiste(): Error & { code: string } {
    return Object.assign(new Error('File does not exist'), { code: 'OS-PLUG-FILE-0008' })
}

interface Banco {
    fs: TalosThumbnailFilesystemPort
    scritti: Map<string, string>
    cancellati: string[]
    presenti: Set<string>
    voci: string[]
    statCount: () => number
}

function banco(): Banco {
    const scritti = new Map<string, string>()
    const cancellati: string[] = []
    const presenti = new Set<string>()
    const voci: string[] = []
    let stats = 0
    const fs: TalosThumbnailFilesystemPort = {
        async stat({ path }) {
            stats += 1
            if (!presenti.has(path)) throw nonEsiste()
            return {}
        },
        async writeFile({ path, data }) {
            scritti.set(path, data)
            presenti.add(path)
            voci.push(path.slice(`${TALOS_THUMBNAIL_DIR}/`.length))
            return {}
        },
        async deleteFile({ path }) {
            cancellati.push(path)
            presenti.delete(path)
            return {}
        },
        async readdir() {
            return { files: voci.map((name) => ({ name })) }
        },
        async mkdir() { return {} },
        async getUri({ path }) { return { uri: `file:///data/cache/${path}` } },
    }
    return { fs, scritti, cancellati, presenti, voci, statCount: () => stats }
}

function negozio(over: Partial<Parameters<typeof createTalosThumbnailStore>[0]> = {}, b = banco()) {
    const store = createTalosThumbnailStore({
        readBytes: async () => null,
        filesystem: b.fs,
        directory: 'CACHE',
        isNative: () => true,
        toWebViewUrl: (uri) => uri.replace('file://', 'https://localhost/_capacitor_file_'),
        renderPdfPage: async () => PNG_BASE64,
        ...over,
    })
    return { store, b }
}

describe('la cache: quando manca e quando prende', () => {
    it('la prima volta GENERA e scrive, la seconda RITROVA senza generare', async () => {
        const rendi = vi.fn(async () => PNG_BASE64)
        const { store, b } = negozio({ renderPdfPage: rendi })
        const file = pdf()

        const primo = await store.thumbnailFor(file, 320)
        expect(rendi).toHaveBeenCalledTimes(1)
        expect(rendi).toHaveBeenCalledWith('talos-vault/files/vault-pdf.pdf', 320)
        expect(primo).toContain('_capacitor_file_')
        expect(b.scritti.size).toBe(1)

        // Un negozio NUOVO sullo stesso disco: è la seconda apertura della
        // Libreria, non la stessa istanza che si ricorda a memoria.
        const secondo = createTalosThumbnailStore({
            readBytes: async () => null,
            filesystem: b.fs,
            directory: 'CACHE',
            isNative: () => true,
            toWebViewUrl: (uri) => uri.replace('file://', 'https://localhost/_capacitor_file_'),
            renderPdfPage: rendi,
        })
        const ritrovato = await secondo.thumbnailFor(file, 320)
        expect(rendi).toHaveBeenCalledTimes(1)
        expect(ritrovato).toBe(primo)
    })

    /**
     * ⛔ IL VERSO CONTRARIO DELLA CACHE: cambiano i byte, la chiave cambia, e la
     * miniatura vecchia non viene più trovata. Senza questo, un file sostituito
     * mostrerebbe per sempre l'immagine di quello di prima.
     */
    it('un file SOSTITUITO non riceve la miniatura di prima: la rigenera', async () => {
        const rendi = vi.fn(async () => PNG_BASE64)
        const { store } = negozio({ renderPdfPage: rendi })
        await store.thumbnailFor(pdf({ sha256: 'a'.repeat(64) }), 320)
        await store.thumbnailFor(pdf({ sha256: 'b'.repeat(64) }), 320)
        expect(rendi).toHaveBeenCalledTimes(2)
    })

    /**
     * ⛔ La cartella della cache Android il sistema può SVUOTARLA
     * (https://capacitorjs.com/docs/apis/filesystem, letta il 12/09/2026). Non
     * è un guasto: è il contratto, e la miniatura si rifà.
     */
    it('se il sistema svuota la cache, la miniatura si rigenera da sola', async () => {
        const rendi = vi.fn(async () => PNG_BASE64)
        const { store, b } = negozio({ renderPdfPage: rendi })
        const file = pdf()
        await store.thumbnailFor(file, 320)
        b.presenti.clear()

        const dopo = createTalosThumbnailStore({
            readBytes: async () => null,
            filesystem: b.fs,
            directory: 'CACHE',
            isNative: () => true,
            renderPdfPage: rendi,
        })
        expect(await dopo.thumbnailFor(file, 320)).not.toBeNull()
        expect(rendi).toHaveBeenCalledTimes(2)
    })
})

describe('cosa finisce davvero dentro il file', () => {
    /**
     * ⛔ IL PUNTO CRITICO, e la ricerca lo dice a lettere:
     * `writeFile` senza `encoding` decodifica la stringa come base64 NUDO
     * (https://capacitorjs.com/docs/apis/filesystem, letta il 12/09/2026). Un
     * `data:image/png;base64,` in testa verrebbe decodificato PREFISSO COMPRESO
     * e il file uscirebbe corrotto — senza un errore da nessuna parte.
     */
    it('scrive base64 NUDO, anche se il ponte manda un data-URL', async () => {
        const { store, b } = negozio({
            renderPdfPage: async () => `data:image/png;base64,${PNG_BASE64}`,
        })
        await store.thumbnailFor(pdf(), 320)
        const [scritto] = [...b.scritti.values()]
        expect(scritto).toBe(PNG_BASE64)
        expect(scritto?.startsWith('data:')).toBe(false)
    })

    it('scrive sotto la cartella delle miniature, col nome della chiave', async () => {
        const { store, b } = negozio()
        const file = pdf()
        await store.thumbnailFor(file, 320)
        expect([...b.scritti.keys()]).toEqual([
            `${TALOS_THUMBNAIL_DIR}/${talosThumbnailKey(file)}.png`,
        ])
    })
})

describe('quando non si può fare, e non è un guasto', () => {
    it('un PDF che il ponte non rende NON diventa un errore: torna nulla e non scrive', async () => {
        const { store, b } = negozio({ renderPdfPage: async () => null })
        expect(await store.thumbnailFor(pdf(), 320)).toBeNull()
        expect(b.scritti.size).toBe(0)
    })

    it('un ponte che ESPLODE non arriva alla pagina', async () => {
        const { store } = negozio({
            renderPdfPage: async () => { throw new Error('bad_alloc') },
        })
        await expect(store.thumbnailFor(pdf(), 320)).resolves.toBeNull()
    })

    /** Nessuna anteprima possibile: non si chiede niente a nessuno. */
    it('non chiama il ponte per un formato che non ha anteprima', async () => {
        const rendi = vi.fn(async () => PNG_BASE64)
        const { store } = negozio({ renderPdfPage: rendi })
        const zip = pdf({ display_name: 'backup.zip', media_type: 'application/zip' })
        expect(await store.thumbnailFor(zip, 320)).toBeNull()
        expect(rendi).not.toHaveBeenCalled()
    })

    /**
     * Disco pieno, permesso negato, cartella sparita fra il `mkdir` e la
     * scrittura: la miniatura c'è comunque per questa visita. Meglio una
     * scheda giusta senza cache di una scheda vuota.
     */
    it('se la scrittura fallisce mostra comunque l\'anteprima, in memoria', async () => {
        const b = banco()
        b.fs.writeFile = async () => { throw new Error('ENOSPC') }
        const { store } = negozio({}, b)
        const url = await store.thumbnailFor(pdf(), 320)
        expect(url).toContain('base64,')
    })
})

describe('il web: nessun file da mostrare, la miniatura resta in memoria', () => {
    it('non scrive niente e restituisce un indirizzo mostrabile', async () => {
        const { store, b } = negozio({ isNative: () => false })
        const url = await store.thumbnailFor(pdf(), 320)
        expect(url?.startsWith('data:image/png;base64,')).toBe(true)
        expect(b.scritti.size).toBe(0)
        expect(b.statCount()).toBe(0)
    })
})

describe('eliminare un file elimina anche la sua immagine', () => {
    it('butta TUTTE le versioni di quel file, e non tocca quelle degli altri', async () => {
        const { store, b } = negozio()
        const v1 = pdf({ sha256: 'a'.repeat(64) })
        const v2 = pdf({ sha256: 'b'.repeat(64) })
        const altro = pdf({ id: 'vault-altro', sha256: 'c'.repeat(64) })
        await store.thumbnailFor(v1, 320)
        await store.thumbnailFor(v2, 320)
        await store.thumbnailFor(altro, 320)
        expect(b.scritti.size).toBe(3)

        await store.forget('vault-pdf')

        expect(b.cancellati).toHaveLength(2)
        expect(b.cancellati.every((path) => path.includes('vault-pdf'))).toBe(true)
        expect(b.presenti.size).toBe(1)
        expect([...b.presenti][0]).toContain('vault-altro')
        expect(store.cached(v1)).toBeNull()
        expect(store.cached(altro)).not.toBeNull()
    })

    it('non protesta se non c\'è niente da cancellare', async () => {
        const b = banco()
        b.fs.readdir = async () => { throw nonEsiste() }
        const { store } = negozio({}, b)
        await expect(store.forget('vault-pdf')).resolves.toBeUndefined()
    })
})

describe('la coda: una generazione alla volta', () => {
    let inCorso = 0
    let massimo = 0

    beforeEach(() => { inCorso = 0; massimo = 0 })

    /**
     * ⛔ Venti file in griglia sono venti decode e venti scritture. Farle partire
     * insieme all'apertura della Libreria vuol dire che il thread che disegna
     * compete con sé stesso: la lista appare, e poi si inchioda.
     */
    it('non genera due miniature nello stesso momento', async () => {
        const { store } = negozio({
            renderPdfPage: async () => {
                inCorso += 1
                massimo = Math.max(massimo, inCorso)
                await new Promise((r) => setTimeout(r, 5))
                inCorso -= 1
                return PNG_BASE64
            },
        })
        await Promise.all([
            store.thumbnailFor(pdf({ id: 'a', sha256: 'a'.repeat(64) }), 320),
            store.thumbnailFor(pdf({ id: 'b', sha256: 'b'.repeat(64) }), 320),
            store.thumbnailFor(pdf({ id: 'c', sha256: 'c'.repeat(64) }), 320),
        ])
        expect(massimo).toBe(1)
    })

    /** Chiedere due volte lo stesso file non lo genera due volte. */
    it('due richieste per lo stesso file condividono una generazione sola', async () => {
        const rendi = vi.fn(async () => {
            await new Promise((r) => setTimeout(r, 5))
            return PNG_BASE64
        })
        const { store } = negozio({ renderPdfPage: rendi })
        const file = pdf()
        const [uno, due] = await Promise.all([
            store.thumbnailFor(file, 320),
            store.thumbnailFor(file, 320),
        ])
        expect(rendi).toHaveBeenCalledTimes(1)
        expect(uno).toBe(due)
    })
})
