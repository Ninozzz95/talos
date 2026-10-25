/**
 * ⛔ R5.13 scambio di file, fetta F2 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`; mockup approvati
 * dall'owner il 25/10): il protocollo del dispositivo verso il PC, senza interfaccia.
 *
 * Le operazioni sono quelle di `harness-ui/src/remoto/file-dispositivi.mjs` di r4 `d3d36f1c6` (contratto Parte 2, «Revision 1»):
 *  - invio: `file.upload.begin` → pezzi `file.upload.chunk {da}` di al più 512 KiB, al più 4 in volo sullo STESSO canale e
 *    mandati nell'ordine di `da` → `file.upload.end`. `da ≠ ricevuti` ⇒ 409 `offset-mismatch` col `ricevuti` del PC, da cui si
 *    riparte; una caduta ⇒ «pausa», poi `begin {riprendi}`; un trasferimento scaduto ⇒ si ricomincia da 0;
 *  - scarico: `file.read {versione, da, quanti}` dal punto in cui il parziale del dispositivo è arrivato; `FILE_GONE` ⇒ «cambiato»,
 *    senza riprovare (va chiesto di nuovo al PC); lo sha256 si controlla alla fine, nel nativo.
 * I BYTE stanno nel nativo (`TalosRemotoFile`, Kotlin): qui passa un pezzo base64url alla volta, mai il file intero.
 */

export const PEZZO_REMOTO = 512 * 1024
export const MASSIMO_FILE_REMOTO = 25 * 1024 * 1024
/** Al più 4 pezzi in volo (contratto P2.1): sul relay 50 pezzi in fila sarebbero 7-15 s di sola attesa. */
const FINESTRA = 4
/** Dopo tante riprese senza progresso ci si ferma: un PC che rifiuta sempre non fa girare il dispositivo per sempre. */
const RIPRESE_MASSIME = 20

export interface ClienteFileRemoti {
    richiesta(op: string, args: Record<string, unknown>): Promise<unknown>
}

export interface NativoFileRemoti {
    preparaInvio(o: { uri: string }): Promise<{ invioId: string, nome: string, dimensione: number, sha256: string }>
    pezzoInvio(o: { invioId: string, da: number, quanti: number }): Promise<{ dati: string }>
    chiudiInvio(o: { invioId: string }): Promise<void>
    iniziaScarico(o: { pcId: string, sessionId: string, fileId: string, versione: string, nome: string, dimensione: number }): Promise<{ scaricoId: string, ricevuti: number }>
    accodaScarico(o: { scaricoId: string, da: number, dati: string }): Promise<{ ricevuti: number }>
    concludiScarico(o: { scaricoId: string, sha256: string | null }): Promise<{ percorsoLocale: string, mime: string, eseguibile: boolean, byte: number }>
}

export type OrigineFileRemoto = 'allegato' | 'modello' | 'inviato'

/** Una riga di `file.list`, già controllata. Mai un percorso del PC. */
export interface RigaFileRemoto {
    fileId: string
    nome: string
    dimensione: number
    mime: string
    immagine: boolean
    origine: OrigineFileRemoto
    versione: string
    giro?: number
    sha256?: string
    /** D-1 (Desktop, 25/10): solo le offerte. */
    offertaId?: string
    inviataAlle?: number
}

export type StatoFileRemoto =
    | { stato: 'in-invio' | 'sul-pc' | 'pausa' | 'in-scarico' | 'scaricato', fatti: number, totale: number }
    /** B9-3: il PC è pieno (`RATE_LIMITED`): si aspetta il turno, e il vassoio lo dice. */
    | { stato: 'attesa-turno' }
    | { stato: 'cambiato' }
    | { stato: 'errore', codice: string }

export interface RicevutaInvioRemoto {
    tipo: 'file'
    nome: string
    percorso: string
    bytes: number
    fileId: string
    versione: string
    /** Solo se chiesto: il testo di un file entro `MASSIMO_TESTO_REMOTO` byte. */
    testo?: string
}

type Errore = Error & { code?: string, reason?: string, params?: Record<string, string> }
const codice = (e: unknown) => (e && typeof e === 'object' && typeof (e as Errore).code === 'string' ? (e as Errore).code! : 'OPERATION_FAILED')
const guasto = (code: string, message = code): Errore => Object.assign(new Error(message), { code })
const intero = (v: unknown, min = 0) => (Number.isSafeInteger(v) && (v as number) >= min ? v as number : null)
const oggetto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)

const ID_TRASFERIMENTO = /^[A-Za-z0-9_-]{22}$/u
const ID_FILE = /^[A-Za-z0-9_-]{32}$/u
const SHA256 = /^[0-9a-f]{64}$/iu
const ORIGINI = new Set<OrigineFileRemoto>(['allegato', 'modello', 'inviato'])

/**
 * Revisione S4 (Desktop, 25/10): lo stallo conta solo i giri CONSECUTIVI senza progresso. Un relay ballerino con tante cadute
 * brevi, ognuna seguita da qualche byte in più, non ferma un trasferimento lungo. Si chiama in cima a ogni giro coi byte fatti;
 * torna vero quando i giri fermi superano `RIPRESE_MASSIME`.
 */
function contatoreDelloStallo(): (fatti: number) => boolean {
    let migliore = -1
    let fermi = 0
    return (fatti) => {
        if (fatti > migliore) { migliore = fatti; fermi = 0; return false }
        fermi += 1
        return fermi > RIPRESE_MASSIME
    }
}

/** Il `ricevuti` di un OFFSET_MISMATCH del nativo: il plugin Capacitor lo mette in `data`. */
function ricevutiDelNativo(e: unknown): number | null {
    const x = e as { data?: { ricevuti?: unknown }, ricevuti?: unknown }
    const n = Number(x?.data?.ricevuti ?? x?.ricevuti)
    return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** Il `ricevuti` di un rifiuto `offset-mismatch`/`transfer-incomplete`, o null. */
function ricevutiDelRifiuto(e: unknown): number | null {
    const x = e as Errore
    if (x?.code !== 'BAD_MESSAGE' || (x.reason !== 'offset-mismatch' && x.reason !== 'transfer-incomplete')) return null
    const n = Number(x.params?.ricevuti)
    return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** Ciò che serve a un invio: i pezzi da `da` e la chiusura. Il nativo per un file, i byte in pagina per un'immagine. */
type SorgenteInvio = Pick<NativoFileRemoti, 'pezzoInvio' | 'chiudiInvio'>
interface Preparato { invioId: string, nome: string, dimensione: number, sha256: string }

/** Il tetto del testo che viaggia col messaggio (`MASSIMO_TESTO` del nativo, `TETTI_ALLEGATI.caratteriPerAllegato` del desktop). */
export const MASSIMO_TESTO_REMOTO = 200_000
/**
 * ⛔ CAMBIA 1 (Desktop, 25/10): il PC tiene al più 8 trasferimenti aperti per dispositivo e risponde `RATE_LIMITED` a un `begin` di
 * troppo. Il dispositivo aspetta il suo turno con attese crescenti e riprova: la bozza non fallisce mai per questo.
 */
export const ATTESE_DEL_TURNO_MS = Object.freeze([1000, 2000, 4000, 8000, 15000])
/**
 * ⛔ B9-3 (revisione del blocco 9): un PC pieno degli orfani di questo dispositivo lo teneva in attesa fino a 24 h, in silenzio. Dopo
 * queste attese (~45 s) la bozza fallisce con la sua frase («il computer sta ricevendo troppi file»): la persona riprova.
 */
const ATTESE_DEL_TURNO_MASSIME = 6
/** ⛔ B9-2: una bozza tolta, o un cambio di sessione, ferma il suo invio (`CANCELLED`), prima del pezzo dopo e di `end`. */
const fermato = (segnale: AbortSignal | undefined) => { if (segnale?.aborted) throw guasto('CANCELLED') }
type Dormi = (ms: number) => Promise<void>
const dormiDavvero: Dormi = (ms) => new Promise((ok) => { setTimeout(ok, ms) })

/** Il tetto di un'immagine (`allegaFile` del desktop: 5 MiB), come il PC lo controlla a `begin` (`image-too-large`). */
export const MASSIMO_IMMAGINE_REMOTA = 5 * 1024 * 1024

/**
 * Manda un file a una sessione del PC. `attendiConnessione` torna quando il canale col PC è di nuovo aperto (la pausa dura quanto
 * serve). Torna la ricevuta nella forma di `allegaFile` locale, senza `assoluto`: il percorso assoluto del PC non esce mai dal PC.
 * Con `testo`, un file entro `MASSIMO_TESTO_REMOTO` byte torna anche col suo testo (UTF-8 rigoroso, come il nativo locale).
 */
export async function inviaFileAlPc(
    cliente: ClienteFileRemoti,
    nativo: NativoFileRemoti,
    { sessionId, uri, testo = false, segnale }: { sessionId: string, uri: string, testo?: boolean, segnale?: AbortSignal },
    onStato: (s: StatoFileRemoto) => void,
    attendiConnessione: () => Promise<void>,
    dormi: Dormi = dormiDavvero,
): Promise<RicevutaInvioRemoto> {
    fermato(segnale)
    const p = await nativo.preparaInvio({ uri })
    try {
        if (!Number.isSafeInteger(p.dimensione) || p.dimensione < 0 || p.dimensione > MASSIMO_FILE_REMOTO) throw guasto('FILE_TOO_LARGE')
        const letto = testo && p.dimensione <= MASSIMO_TESTO_REMOTO ? await testoDelFile(nativo, p) : null
        const ricevuta = await invia(cliente, nativo, p, { sessionId, nome: p.nome, dimensione: p.dimensione, sha256: p.sha256 },
            (id) => ({ sessionId, riprendi: id }), ricevutaDi, onStato, attendiConnessione, dormi, segnale)
        return letto === null ? ricevuta : { ...ricevuta, testo: letto }
    } finally {
        await nativo.chiudiInvio({ invioId: p.invioId }).catch(() => undefined)
    }
}

/** Il testo di un file piccolo, dal primo pezzo; null se non è UTF-8 valido (un binario non viaggia col messaggio). */
async function testoDelFile(nativo: SorgenteInvio, p: Preparato): Promise<string | null> {
    if (p.dimensione === 0) return ''
    const { dati } = await nativo.pezzoInvio({ invioId: p.invioId, da: 0, quanti: p.dimensione })
    const byte = daBase64Url(dati)
    if (byte.length !== p.dimensione) return null
    try { return new TextDecoder('utf-8', { fatal: true }).decode(byte) } catch { return null }
}

export interface RicevutaImmagineRemota { immagineId: string, mime: string, byte: number }

/**
 * D-5/D-6 (contratto Parte 2, «Revision 3», PC `42315b13a`): un'immagine va SOLO al modello, nell'archivio delle immagini della
 * finestra; mai in `allegati/`. Un trasferimento SENZA sessione: `begin {immagine: true}` (ripetuto alla ripresa), pezzi e `end`,
 * che torna `{immagineId, nome, mime, byte, sha256}`. I rifiuti del PC (`image-invalid`, `image-too-large`, `images-unavailable`)
 * risalgono col loro motivo. I byte sono già in pagina (al più 5 MiB): fanno da sorgente al posto del nativo.
 */
export async function inviaImmagineAlPc(
    cliente: ClienteFileRemoti,
    { nome, byte, segnale, onStato = () => undefined }: { nome: string, byte: Uint8Array, segnale?: AbortSignal, onStato?: (s: StatoFileRemoto) => void },
    attendiConnessione: () => Promise<void>,
    dormi: Dormi = dormiDavvero,
): Promise<RicevutaImmagineRemota> {
    fermato(segnale)
    if (byte.length > MASSIMO_IMMAGINE_REMOTA) throw Object.assign(guasto('BAD_MESSAGE', 'An image can be at most 5 MiB.'), { reason: 'image-too-large', stato: 413 })
    const p: Preparato = { invioId: 'immagine', nome, dimensione: byte.length, sha256: await sha256Esa(byte) }
    const sorgente: SorgenteInvio = {
        async pezzoInvio({ da, quanti }) { return { dati: aBase64Url(byte.subarray(da, da + Math.min(quanti, PEZZO_REMOTO))) } },
        async chiudiInvio() {},
    }
    return invia(cliente, sorgente, p, { immagine: true, nome, dimensione: byte.length, sha256: p.sha256 },
        (id) => ({ immagine: true, riprendi: id }), ricevutaImmagineDi, onStato, attendiConnessione, dormi, segnale)
}

const ID_IMMAGINE = /^[0-9a-f]{64}$/u
const MIME_IMMAGINE = /^image\/(png|jpeg|webp)$/u
function ricevutaImmagineDi(r: Record<string, unknown> | null): RicevutaImmagineRemota {
    const byte = intero(r?.byte, 1)
    if (!r || typeof r.immagineId !== 'string' || !ID_IMMAGINE.test(r.immagineId) || typeof r.mime !== 'string' || !MIME_IMMAGINE.test(r.mime) || byte === null) {
        throw guasto('BAD_MESSAGE', 'The computer confirmed the image in an unknown shape.')
    }
    return { immagineId: r.immagineId, mime: r.mime, byte }
}

async function sha256Esa(byte: Uint8Array): Promise<string> {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', byte.slice()))
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('')
}
function aBase64Url(byte: Uint8Array): string {
    let binario = ''
    for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000))
    return btoa(binario).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')
}
function daBase64Url(dati: string): Uint8Array {
    const binario = atob(dati.replace(/-/gu, '+').replace(/_/gu, '/'))
    const byte = new Uint8Array(binario.length)
    for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
    return byte
}

/**
 * Il giro dell'invio, uguale per file e immagini: `begin` (o la ripresa), i pezzi a finestra, `end` letto da `ricevuta`. Una caduta
 * ⇒ «pausa» e ripresa; un trasferimento scaduto ⇒ da capo; un `offset-mismatch` ⇒ dal `ricevuti` del PC; lo stallo lo conta `fermo`.
 */
async function invia<T>(
    cliente: ClienteFileRemoti,
    sorgente: SorgenteInvio,
    p: Preparato,
    argsInizio: Record<string, unknown>,
    argsRipresa: (trasferimentoId: string) => Record<string, unknown>,
    ricevuta: (r: Record<string, unknown> | null) => T,
    onStato: (s: StatoFileRemoto) => void,
    attendiConnessione: () => Promise<void>,
    dormi: Dormi,
    segnale: AbortSignal | undefined,
): Promise<T> {
    const totale = p.dimensione
    let trasferimentoId: string | null = null
    let ricevuti = 0
    /**
     * ⛔ B9-1: tutti i byte sono sul PC e `end` è partito. Se la risposta si perde, il PC può aver già salvato il file: si richiede
     * `end` (il PC lo ridà uguale), mai un `begin` da capo, che lo salverebbe due volte (`rapporto-2.txt`).
     */
    let fineChiesta = false
    const fermo = contatoreDelloStallo()
    /**
     * ⛔ B10-1 (revisione del blocco 10): una bozza fermata a metà chiede al PC di buttare il parziale e liberare il posto subito
     * (`file.upload.abort`, contratto Parte 2, revisione 4), senza aspettarlo: un PC vecchio (UNKNOWN_OPERATION) o spento lo libera
     * da sé dopo 10 minuti di inattività.
     */
    const chiudi = () => {
        if (trasferimentoId) void Promise.resolve(trasferimentoId).then((id) => cliente.richiesta('file.upload.abort', { trasferimentoId: id })).catch(() => {})
    }
    for (;;) {
        if (segnale?.aborted) { chiudi(); fermato(segnale) }
        if (fermo(ricevuti)) { onStato({ stato: 'errore', codice: 'TRANSFER_STALLED' }); throw guasto('TRANSFER_STALLED') }
        try {
            if (trasferimentoId && fineChiesta) {
                try {
                    const r = ricevuta(oggetto(await cliente.richiesta('file.upload.end', { trasferimentoId })))
                    onStato({ stato: 'sul-pc', fatti: totale, totale })
                    return r
                } catch (e) {
                    if (codice(e) !== 'TRANSFER_UNKNOWN' && codice(e) !== 'TRANSFER_EXPIRED') throw e
                    // il PC non ricorda più la fine (riavviato): si chiede la ripresa; un PC aggiornato risponde «tutto ricevuto»
                    fineChiesta = false
                }
            }
            if (trasferimentoId) {
                try {
                    ricevuti = inizio(await cliente.richiesta('file.upload.begin', argsRipresa(trasferimentoId))).ricevuti
                } catch (e) {
                    if (codice(e) === 'TRANSFER_EXPIRED' || codice(e) === 'TRANSFER_UNKNOWN') { trasferimentoId = null; ricevuti = 0; continue }
                    throw e
                }
            } else {
                const b = inizio(await turnoDelPc(() => cliente.richiesta('file.upload.begin', argsInizio), dormi, onStato, segnale))
                trasferimentoId = b.trasferimentoId
                ricevuti = b.ricevuti
            }
            onStato({ stato: 'in-invio', fatti: ricevuti, totale })
            // i byte confermati da un gruppo valgono anche se il gruppo poi cade: sono il progresso che azzera lo stallo
            ricevuti = await pompa(cliente, sorgente, p.invioId, trasferimentoId, ricevuti, totale, (fatti) => {
                ricevuti = Math.max(ricevuti, fatti)
                onStato({ stato: 'in-invio', fatti, totale })
            }, segnale)
            if (ricevuti < totale) continue
            fermato(segnale)
            fineChiesta = true
            const r = ricevuta(oggetto(await cliente.richiesta('file.upload.end', { trasferimentoId })))
            onStato({ stato: 'sul-pc', fatti: totale, totale })
            return r
        } catch (e) {
            if (codice(e) === 'CANCELLED') { chiudi(); throw e }
            // ⛔ B10-3 (revisione del blocco 10): il PC ha liberato il trasferimento (inattivo, o PC pieno): un pezzo o `end` dice
            // TRANSFER_UNKNOWN/EXPIRED. Niente era salvato: si ricomincia con un `begin` nuovo, mai un errore per la persona.
            if ((codice(e) === 'TRANSFER_UNKNOWN' || codice(e) === 'TRANSFER_EXPIRED') && trasferimentoId) {
                trasferimentoId = null; ricevuti = 0; fineChiesta = false
                continue
            }
            if (codice(e) === 'DISCONNECTED') {
                onStato({ stato: 'pausa', fatti: ricevuti, totale })
                await attendiConnessione()
                continue
            }
            const daDove = ricevutiDelRifiuto(e)
            if (daDove !== null && trasferimentoId) { ricevuti = daDove; fineChiesta = false; continue }
            onStato({ stato: 'errore', codice: codice(e) })
            throw e
        }
    }
}

/**
 * Un `begin` nuovo finché il PC dice `RATE_LIMITED`: si aspetta il turno, fuori dal conto dello stallo (il PC non è fermo, è pieno).
 * B9-3: lo stato «attesa del turno» si dice subito; dopo `ATTESE_DEL_TURNO_MASSIME` attese il `RATE_LIMITED` risale e la bozza fallisce.
 */
async function turnoDelPc(inizia: () => Promise<unknown>, dormi: Dormi, onStato: (s: StatoFileRemoto) => void, segnale: AbortSignal | undefined): Promise<unknown> {
    for (let giro = 0; ; giro++) {
        try {
            return await inizia()
        } catch (e) {
            if (codice(e) !== 'RATE_LIMITED' || giro >= ATTESE_DEL_TURNO_MASSIME) throw e
            if (giro === 0) onStato({ stato: 'attesa-turno' })
            await dormi(ATTESE_DEL_TURNO_MS[Math.min(giro, ATTESE_DEL_TURNO_MS.length - 1)]!)
            fermato(segnale)
        }
    }
}

function inizio(v: unknown): { trasferimentoId: string, ricevuti: number } {
    const r = oggetto(v)
    const ricevuti = intero(r?.ricevuti)
    if (!r || typeof r.trasferimentoId !== 'string' || !ID_TRASFERIMENTO.test(r.trasferimentoId) || ricevuti === null) throw guasto('BAD_MESSAGE', 'The computer answered the start of the transfer in an unknown shape.')
    return { trasferimentoId: r.trasferimentoId, ricevuti }
}

function ricevutaDi(r: Record<string, unknown> | null): RicevutaInvioRemoto {
    const bytes = intero(r?.dimensione)
    if (!r || typeof r.nome !== 'string' || r.percorso !== `allegati/${r.nome}` || bytes === null
        || typeof r.fileId !== 'string' || !ID_FILE.test(r.fileId) || typeof r.versione !== 'string' || !ID_FILE.test(r.versione)) {
        throw guasto('BAD_MESSAGE', 'The computer confirmed the file in an unknown shape.')
    }
    return { tipo: 'file', nome: r.nome, percorso: r.percorso, bytes, fileId: r.fileId, versione: r.versione }
}

/**
 * I pezzi da `da` alla fine, a gruppi di al più `FINESTRA`: i byte si leggono dal nativo, poi le richieste partono nell'ordine di
 * `da` senza aspettare la risposta della precedente (il PC le tiene in fila per trasferimento). Torna fin dove il PC ha confermato.
 * Una caduta o un `offset-mismatch` si rilanciano DOPO che tutto il gruppo si è chiuso, così la ripresa parte da un punto vero.
 */
async function pompa(
    cliente: ClienteFileRemoti, nativo: SorgenteInvio, invioId: string, trasferimentoId: string,
    da: number, totale: number, avanza: (fatti: number) => void, segnale: AbortSignal | undefined,
): Promise<number> {
    let confermati = da
    let prossimo = da
    while (prossimo < totale) {
        fermato(segnale)
        const gruppo: Array<{ da: number, quanti: number }> = []
        while (gruppo.length < FINESTRA && prossimo < totale) {
            const quanti = Math.min(PEZZO_REMOTO, totale - prossimo)
            gruppo.push({ da: prossimo, quanti })
            prossimo += quanti
        }
        const byte = await Promise.all(gruppo.map((g) => nativo.pezzoInvio({ invioId, da: g.da, quanti: g.quanti })))
        const risposte = await Promise.allSettled(gruppo.map((g, i) => cliente.richiesta('file.upload.chunk', { trasferimentoId, da: g.da, dati: byte[i].dati })))
        let primoGuasto: unknown = null
        for (const r of risposte) {
            if (r.status === 'fulfilled') {
                const n = intero(oggetto(r.value)?.ricevuti)
                if (n !== null) confermati = Math.max(confermati, n)
            } else if (!primoGuasto || codice(r.reason) === 'DISCONNECTED') primoGuasto = r.reason
        }
        avanza(confermati)
        if (primoGuasto) {
            const daDove = ricevutiDelRifiuto(primoGuasto)
            if (daDove !== null) { confermati = daDove; prossimo = daDove; continue }
            throw primoGuasto
        }
        prossimo = confermati
    }
    return confermati
}

/** Scarica sul dispositivo un file che il PC offre (o elenca). Torna il file locale, controllato. */
export async function scaricaFileDalPc(
    cliente: ClienteFileRemoti,
    nativo: NativoFileRemoti,
    { pcId, sessionId, riga }: { pcId: string, sessionId: string, riga: RigaFileRemoto },
    onStato: (s: StatoFileRemoto) => void,
    attendiConnessione: () => Promise<void>,
): Promise<{ percorsoLocale: string, mime: string, eseguibile: boolean }> {
    const totale = riga.dimensione
    let s: { scaricoId: string, ricevuti: number }
    try {
        s = await nativo.iniziaScarico({ pcId, sessionId, fileId: riga.fileId, versione: riga.versione, nome: riga.nome, dimensione: totale })
    } catch (e) {
        onStato({ stato: 'errore', codice: codice(e) })
        throw e
    }
    let ricevuti = s.ricevuti
    const fermo = contatoreDelloStallo()
    for (;;) {
        if (fermo(ricevuti)) { onStato({ stato: 'errore', codice: 'TRANSFER_STALLED' }); throw guasto('TRANSFER_STALLED') }
        try {
            const r = oggetto(await cliente.richiesta('file.read', {
                sessionId, fileId: riga.fileId, versione: riga.versione, da: ricevuti, quanti: Math.max(1, Math.min(PEZZO_REMOTO, totale - ricevuti)),
            }))
            if (!r || typeof r.dati !== 'string' || typeof r.fine !== 'boolean') throw guasto('BAD_MESSAGE', 'The computer sent a piece in an unknown shape.')
            if (r.dati.length) ricevuti = (await nativo.accodaScarico({ scaricoId: s.scaricoId, da: ricevuti, dati: r.dati })).ricevuti
            onStato({ stato: 'in-scarico', fatti: ricevuti, totale })
            // revisione S3-1: un giro senza progresso (pezzo vuoto, o lo stesso `da`) lo conta `fermo` in cima al giro dopo
            if (r.fine) break
        } catch (e) {
            // revisione S4-3: il parziale del dispositivo è altrove (un pezzo ripetuto, un parziale ritrovato): si riparte da lì
            const daDove = codice(e) === 'OFFSET_MISMATCH' ? ricevutiDelNativo(e) : null
            if (daDove !== null) { ricevuti = daDove; continue }
            if (codice(e) === 'DISCONNECTED') {
                onStato({ stato: 'pausa', fatti: ricevuti, totale })
                await attendiConnessione()
                continue
            }
            if (codice(e) === 'FILE_GONE') { onStato({ stato: 'cambiato' }); throw e }
            onStato({ stato: 'errore', codice: codice(e) })
            throw e
        }
    }
    try {
        const c = await nativo.concludiScarico({ scaricoId: s.scaricoId, sha256: riga.sha256 ?? null })
        onStato({ stato: 'scaricato', fatti: totale, totale })
        return { percorsoLocale: c.percorsoLocale, mime: c.mime, eseguibile: c.eseguibile }
    } catch (e) {
        onStato({ stato: 'errore', codice: codice(e) })
        throw e
    }
}

/** Una riga di `file.list` controllata per forma (mai per posizione); null se è storta. */
export function rigaFileRemoto(v: unknown): RigaFileRemoto | null {
    const r = oggetto(v)
    if (!r) return null
    const dimensione = intero(r.dimensione)
    if (typeof r.fileId !== 'string' || !ID_FILE.test(r.fileId)) return null
    if (typeof r.nome !== 'string' || !r.nome || r.nome.length > 255 || /[\\/]|^\.\.?$/u.test(r.nome)) return null
    if (dimensione === null || dimensione > MASSIMO_FILE_REMOTO) return null
    if (typeof r.mime !== 'string' || r.mime.length > 100 || typeof r.immagine !== 'boolean') return null
    if (typeof r.origine !== 'string' || !ORIGINI.has(r.origine as OrigineFileRemoto)) return null
    if (typeof r.versione !== 'string' || !ID_FILE.test(r.versione)) return null
    // un `percorso` (che il PC non manda mai) NON si copia: la riga si costruisce solo coi campi noti
    const riga: RigaFileRemoto = {
        fileId: r.fileId, nome: r.nome, dimensione, mime: r.mime, immagine: r.immagine, origine: r.origine as OrigineFileRemoto, versione: r.versione,
    }
    const giro = intero(r.giro)
    if (giro !== null) riga.giro = giro
    if (typeof r.sha256 === 'string' && SHA256.test(r.sha256)) riga.sha256 = r.sha256.toLowerCase()
    if (typeof r.offertaId === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(r.offertaId)) riga.offertaId = r.offertaId
    const alle = intero(r.inviataAlle)
    if (alle !== null) riga.inviataAlle = alle
    return riga
}

/** `file.list` di una sessione: le righe buone e quante se ne sono scartate (per il diario, mai mostrate). */
export async function elencoFileDelPc(cliente: ClienteFileRemoti, sessionId: string): Promise<{ righe: RigaFileRemoto[], scartate: number }> {
    const r = oggetto(await cliente.richiesta('file.list', { sessionId }))
    const items = Array.isArray(r?.items) ? r!.items as unknown[] : []
    const righe = items.map(rigaFileRemoto).filter((x): x is RigaFileRemoto => x !== null)
    return { righe, scartate: items.length - righe.length }
}
