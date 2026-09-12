// @vitest-environment jsdom

/**
 * U-20 — la METÀ DELLE MINIATURE CHE SI PROVA SENZA UN TELEFONO.
 *
 * `lib/library/libraryThumbnails.ts` non tocca il disco, non apre un canvas e
 * non chiama il ponte nativo: decide soltanto *che anteprima merita un file*,
 * *come si chiama la sua miniatura*, *quanto dev'essere larga* e *cosa si
 * scrive dentro un'anteprima tipografica*. È esattamente la parte in cui vivono
 * i casi limite — il formato sconosciuto, la cache vecchia, il file senza testo
 * — e separarla è ciò che permette di provarli davvero.
 *
 * ⛔ Ogni prova qui è fatta anche AL VERSO CONTRARIO: non basta che un PDF
 * chieda un'anteprima, serve che un archivio ZIP NON la chieda; non basta che
 * due file diversi abbiano chiavi diverse, serve che lo STESSO file con byte
 * diversi ne abbia una nuova. Una funzione che dice sempre di sì supera una
 * prova a senso unico esattamente come una giusta.
 */
import { describe, expect, it } from 'vitest'
import {
    TALOS_THUMBNAIL_DIR,
    TALOS_THUMBNAIL_MAX_PX,
    TALOS_THUMBNAIL_MIN_PX,
    talosThumbnailIsRastered,
    talosThumbnailKey,
    talosThumbnailKeyPrefix,
    talosThumbnailKind,
    talosThumbnailPath,
    talosThumbnailWidthPx,
    talosTypographicPreview,
} from '@/lib/library/libraryThumbnails'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

function file(patch: Partial<TalosLocalVaultFile> = {}): TalosLocalVaultFile {
    return {
        id: 'vault-1',
        display_name: 'appunti.md',
        media_type: 'text/markdown',
        size_bytes: 2048,
        private_uri: 'talos-vault/files/vault-1.md',
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

describe('talosThumbnailKind — che anteprima merita un file', () => {
    it('genera un raster per le immagini che un decoder sa aprire e per i PDF', () => {
        expect(talosThumbnailKind(file({ media_type: 'image/png', display_name: 'foto.png' }))).toBe('image')
        expect(talosThumbnailKind(file({ media_type: 'image/jpeg', display_name: 'foto.jpg' }))).toBe('image')
        expect(talosThumbnailKind(file({ media_type: 'application/pdf', display_name: 'piano.pdf' }))).toBe('pdf')
        expect(talosThumbnailIsRastered('image')).toBe(true)
        expect(talosThumbnailIsRastered('pdf')).toBe(true)
    })

    it('disegna in DOM, senza generare niente, per testo · Markdown · CSV · codice', () => {
        for (const [nome, tipo] of [
            ['appunti.md', 'text/markdown'],
            ['note.txt', 'text/plain'],
            ['costi.csv', 'text/csv'],
            ['pagina.html', 'text/html'],
            ['dati.json', 'application/json'],
        ] as const) {
            expect(talosThumbnailKind(file({ display_name: nome, media_type: tipo })))
                .toBe('typographic')
        }
        expect(talosThumbnailIsRastered('typographic')).toBe(false)
    })

    /**
     * ⛔ IL VERSO CONTRARIO, e non è pedanteria: è il caso in cui un'anteprima
     * costerebbe la lettura intera di un file per finire in un `catch`.
     */
    it('NON chiede un\'anteprima a ciò di cui non sa leggere una pagina', () => {
        expect(talosThumbnailKind(file({ display_name: 'backup.zip', media_type: 'application/zip' }))).toBe('none')
        expect(talosThumbnailKind(file({ display_name: 'lettera.docx', media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))).toBe('none')
        expect(talosThumbnailKind(file({ display_name: 'foto.heic', media_type: 'image/heic' }))).toBe('none')
    })

    /**
     * ⛔ Un SVG è un documento ESEGUIBILE, e i file della Libreria possono
     * arrivare da una pagina letta per conto di qualcun altro. Darlo in pasto a
     * un decoder per farne una miniatura vuol dire eseguirlo.
     */
    it('rifiuta un SVG, che è un documento eseguibile e non un\'immagine da aprire', () => {
        expect(talosThumbnailKind(file({ display_name: 'logo.svg', media_type: 'image/svg+xml' }))).toBe('none')
    })

    /** Una riga che non ha byte non ha niente da mostrare, e chiederlo costa un giro del ponte. */
    it('non chiede niente per un file che non è disponibile o non ha una copia', () => {
        expect(talosThumbnailKind(file({ media_type: 'image/png', status: 'pending', private_uri: '' }))).toBe('none')
        expect(talosThumbnailKind(file({ media_type: 'image/png', status: 'failed', private_uri: '' }))).toBe('none')
        expect(talosThumbnailKind(file({ media_type: 'image/png', private_uri: '   ' }))).toBe('none')
    })
})

describe('talosThumbnailKey — la chiave identifica il CONTENUTO', () => {
    it('cambia quando cambiano i byte, e resta quando non cambia niente', () => {
        const prima = file({ sha256: 'a'.repeat(64) })
        const uguale = file({ sha256: 'a'.repeat(64) })
        const dopo = file({ sha256: 'b'.repeat(64) })
        expect(talosThumbnailKey(prima)).toBe(talosThumbnailKey(uguale))
        expect(talosThumbnailKey(prima)).not.toBe(talosThumbnailKey(dopo))
    })

    /**
     * Senza impronta si ripiega su orologio + dimensione. Due segnali deboli che
     * insieme reggono: i file della Libreria si sostituiscono interi.
     */
    it('senza sha256 distingue comunque due versioni dello stesso file', () => {
        const prima = file({ sha256: null, updated_at: '2026-09-01T10:00:00.000Z', size_bytes: 10 })
        const dopo = file({ sha256: null, updated_at: '2026-09-02T10:00:00.000Z', size_bytes: 10 })
        const piuGrande = file({ sha256: null, updated_at: '2026-09-01T10:00:00.000Z', size_bytes: 11 })
        expect(talosThumbnailKey(prima)).not.toBe(talosThumbnailKey(dopo))
        expect(talosThumbnailKey(prima)).not.toBe(talosThumbnailKey(piuGrande))
    })

    /**
     * ⛔ La chiave finisce in un NOME DI FILE. `updated_at` è un ISO coi due
     * punti dentro — un carattere che in un percorso è un modo di cercare guai.
     */
    it('non lascia passare nel nome del file caratteri che un percorso non vuole', () => {
        const key = talosThumbnailKey(file({ id: 'a/b:c\\d', sha256: null, updated_at: '2026-09-01T10:00:00.000Z' }))
        expect(key).toMatch(/^[a-zA-Z0-9_-]+$/)
        expect(key).not.toContain(':')
        expect(key).not.toContain('/')
        expect(talosThumbnailPath(key, 'webp')).toBe(`${TALOS_THUMBNAIL_DIR}/${key}.webp`)
    })

    /** Il prefisso è ciò che permette di buttare OGNI versione di un file eliminato. */
    it('riconosce tutte le versioni di uno stesso file dal prefisso', () => {
        const uno = talosThumbnailKey(file({ id: 'vault-9', sha256: 'a'.repeat(64) }))
        const due = talosThumbnailKey(file({ id: 'vault-9', sha256: 'b'.repeat(64) }))
        const altro = talosThumbnailKey(file({ id: 'vault-8', sha256: 'a'.repeat(64) }))
        const prefisso = talosThumbnailKeyPrefix('vault-9')
        expect(uno.startsWith(prefisso)).toBe(true)
        expect(due.startsWith(prefisso)).toBe(true)
        expect(altro.startsWith(prefisso)).toBe(false)
    })
})

describe('talosThumbnailWidthPx — la misura la decide lo schermo', () => {
    it('moltiplica la larghezza vera della scheda per la densità', () => {
        expect(talosThumbnailWidthPx(200, 2)).toBe(400)
        expect(talosThumbnailWidthPx(200, 1)).toBe(200)
    })

    /** La densità si limita a 2: il terzo di pixel in più non si vede, il file sì. */
    it('non va oltre la densità 2, nemmeno su un Pad che ne dichiara 2,75', () => {
        expect(talosThumbnailWidthPx(300, 2.75)).toBe(600)
    })

    it('resta dentro i due estremi, e sopravvive a una misura assurda', () => {
        expect(talosThumbnailWidthPx(10, 1)).toBe(TALOS_THUMBNAIL_MIN_PX)
        expect(talosThumbnailWidthPx(4000, 2)).toBe(TALOS_THUMBNAIL_MAX_PX)
        expect(talosThumbnailWidthPx(0, 0)).toBe(TALOS_THUMBNAIL_MIN_PX)
        expect(talosThumbnailWidthPx(Number.NaN, Number.NaN)).toBe(TALOS_THUMBNAIL_MIN_PX)
    })
})

describe('talosTypographicPreview — il titolo vero, e la forma del testo', () => {
    it('prende la prima riga non vuota e la ripulisce dai segni del Markdown', () => {
        const preview = talosTypographicPreview('\n\n#  Prospetto dei costi\n\nUna riga di corpo\nUn\'altra\n')
        expect(preview?.title).toBe('Prospetto dei costi')
    })

    it('disegna quattro barre, proporzionate alla lunghezza delle righe', () => {
        const preview = talosTypographicPreview([
            'Titolo',
            'x'.repeat(60),
            'x'.repeat(30),
            'x',
        ].join('\n'))
        expect(preview?.lines).toHaveLength(4)
        expect(preview!.lines[0]).toBeCloseTo(1, 5)
        expect(preview!.lines[1]).toBeCloseTo(0.5, 5)
        // ⛔ Mai sotto un terzo: una barra da due pixel si legge come un
        // difetto di disegno, non come una riga corta.
        expect(preview!.lines[2]).toBeGreaterThanOrEqual(0.34)
        expect(preview!.lines[3]).toBeGreaterThanOrEqual(0.34)
    })

    /**
     * ⛔ IL VERSO CONTRARIO: senza contenuto si torna `null` e la scheda cade sul
     * glifo. Un riquadro con un titolo e quattro trattini finti direbbe che c'è
     * del testo dove non ce n'è.
     */
    it('torna nulla quando non c\'è testo da cui ricavare qualcosa', () => {
        expect(talosTypographicPreview(null)).toBeNull()
        expect(talosTypographicPreview(undefined)).toBeNull()
        expect(talosTypographicPreview('')).toBeNull()
        expect(talosTypographicPreview('   \n\n \n')).toBeNull()
        expect(talosTypographicPreview('###\n---\n')).toBeNull()
    })
})
