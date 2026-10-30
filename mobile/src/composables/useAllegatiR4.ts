import { reactive, ref, shallowRef } from 'vue'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosNativeCamera } from '@/services/nativeCamera'
import type { TalosNativeFilePicker, TalosPickedFile } from '@/services/nativeFilePicker'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'
import { talosImageSendDecision, type TalosImageConsentStance } from '@/lib/chat/consensoImmagini'
import {
    CARATTERI_PER_ALLEGATO_R4, MASSIMO_FILE_R4, controllaImmagineR4, testoAllegabileR4, testoAllegatiR4, type AllegatoR4,
} from '@/lib/harness/r4/allegatiR4'
import type { TalosLettoreByteImmagine } from '@/lib/chat/byteImmagine'
import { fraseErroreRemoto } from '@/lib/remoto/frasiRemoto'
import type { StatoFileRemoto } from '@/lib/remoto/fileRemoti'

/**
 * ⛔ K3-C Allegati (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): gli allegati del Codice su r4.
 *
 * A2 (owner 16/10 «Immagini», «Anteprima vera», consenso «Stessa regola della chat»): la galleria e la fotocamera della chat
 * (`createTalosNativeCamera`), il controllo del desktop (`allegaFile`, `legacy/app.js:26995`: PNG, JPEG o WebP fino a 5 MiB, poi
 * `POST /api/v1/chat-images {nome, dataUrl}`), il vassoio della chat e la sua domanda sul consenso (`talosImageSendDecision`).
 * Nessuna immagine passa dal Vault della chat: sta in r4, col suo id di 64 esadecimali. Nel vassoio la bozza porta `r4:<id>` come
 * `vaultFileId`, la stessa forma delle bolle rigiocate (`eventiR4.ts`), così il lettore dei byte serve tutte e due.
 *
 * A3 (owner 16/10 «L'app li scrive in allegati/»): «Allega un file» col selettore della chat (`createNativeFilePicker`). Il nativo
 * scrive il documento in `<cartella di lavoro>/allegati/` senza sovrascrivere (`allegaFile`, come l'helper del desktop) e torna la
 * ricevuta; un file di testo entro il tetto viaggia col messaggio (BUG-20 del desktop). Un'immagine scelta come file va per la
 * strada delle immagini, come `allegaFile` del desktop: i suoi byte li legge il nativo (`immagineScelta`).
 */

/** `TETTI_ALLEGATI.quanti` del desktop (`components/allegati.js` @ 2161afb32): oltre, troppo contesto per un messaggio. */
export const QUANTI_ALLEGATI_R4 = 10
const PREFISSO_R4 = 'r4:'
/** I rifiuti del nativo `allegaFile` (i codici dell'helper del desktop) che la persona legge come «il file non si è copiato». */
const CODICI_DELLA_COPIA = new Set(['QUERY_INVALID', 'FOLDER_INVALID', 'FILE_EXISTS', 'FILE_WRITE_FAILED'])
/** R5.13 F3: i guasti del canale verso il PC, che hanno la frase del controllo remoto (`computer.errors.*`). */
const CODICI_DEL_CANALE = new Set(['CONNECT_FAILED', 'DISCONNECTED', 'NOT_PAIRED', 'REVOKED'])

export type RispostaConsensoR4 = 'allow' | 'once' | 'deny'

export interface OpzioniAllegatiR4 {
    cliente: () => TalosR4ClientePonte
    fotocamera: () => TalosNativeCamera | Promise<TalosNativeCamera>
    /** A3: il selettore dei file della chat. */
    selettoreFile: () => TalosNativeFilePicker | Promise<TalosNativeFilePicker>
    /** `shell.image_attachment_consent`, la stessa preferenza della chat. */
    consenso: () => TalosImageConsentStance
    /** «Sempre»: la preferenza si alza ad `allow`, come la chat (`answerImageConsent`). */
    ricordaSempre: () => Promise<void> | void
    /** Il fornitore del modello del Codice: l'id per la regola, il nome per la domanda. */
    fornitore: () => { id: string | null; nome: string }
    lingua: () => string
    /** I testi della chat (`chat.imageConsentDenied`). */
    t: (chiave: string) => string
    /**
     * R5.13 F3: con la sessione sul PC, l'id della conversazione aperta (null se non è ancora partita). Il file va lì, a pezzi, e la
     * ricevuta non ha `assoluto`. Assente in locale: il nativo riceve gli stessi argomenti di sempre.
     */
    sessione?: () => string | null
    /**
     * ⛔ D-F3-1 (dal Pad, 25/10; Desktop: «il tocco esplicito, come l'invio»): il PC vuole il consenso della cartella per scrivere un
     * file. La schermata alza la stessa riga «Chiedi al PC» dell'invio; su «Consentita» chiama `riprovaDopoConsenso`.
     */
    suConsenso?: (guasto: { code: string; message: string; reason?: string; params?: Record<string, unknown> }) => void
}

/** I byte di un'immagine scelta: dalla galleria arrivano come Blob, dal selettore dei file li legge il nativo. */
type ByteImmagine = { blob: Blob } | { uri: string }

export function useAllegatiR4(opzioni: OpzioniAllegatiR4) {
    const vassoio = reactive<TalosMobileAttachmentDraft[]>([])
    const occupato = ref(false)
    const errore = ref<string | null>(null)
    const domanda = ref<{ count: number; provider: string } | null>(null)
    let risolvi: ((r: RispostaConsensoR4) => void) | null = null
    /** Il «sì» per QUESTA bozza (come `imageConsentGivenForDraft` della chat): si azzera quando la bozza parte. */
    const consensoDellaBozza = ref(false)
    /** La generazione della bozza: un caricamento finito dopo un cambio di sessione o un invio non entra nel vassoio sbagliato. */
    let generazione = 0
    let prossimo = 0
    const memoria = shallowRef(new Map<string, Uint8Array>())
    /** La frase di `puoPartire` quando un allegato era in viaggio: si toglie da sola quando l'ultimo arriva. */
    let erroreDellAttesa: string | null = null
    /** A3: la ricevuta di ogni file della bozza (per id della bozza), con il testo se è partito col messaggio. */
    const fileDellaBozza = new Map<string, AllegatoR4>()

    const dice = (chiave: string, valori: Record<string, string> = {}) => testoAllegatiR4(chiave, opzioni.lingua(), valori)
    /**
     * ⛔ D-F3-1 (Desktop 25/10, «mai più un codice grezzo»): il perché di un guasto in parole. Un codice noto ha la sua frase; uno
     * sconosciuto la frase generica; un guasto senza codice è già una frase dell'app (`dice(...)`).
     */
    const perché = (guasto: unknown, tipo: 'file' | 'immagine' = 'file'): string => {
        const g = guasto as { code?: unknown; reason?: unknown } | null
        const codice = typeof g?.code === 'string' && g.code ? g.code : null
        // r4 risponde `QUERY_INVALID` a un'immagine che non è PNG, JPEG o WebP (`immagini-risposte-2161afb32.json`); il PC dice il motivo
        if (g?.reason === 'image-invalid' || (tipo === 'immagine' && codice === 'QUERY_INVALID')) return dice('imageFormatBody')
        if (g?.reason === 'image-too-large') return dice('imageTooLargeBody')
        if (g?.reason === 'image-empty') return opzioni.t('computer.imageEmpty')
        // B9-4: senza codice passa solo una frase dell'app (`fraseDellApp`); un TypeError o un lancio del nativo è la frase generica
        if (!codice) return (guasto as { fraseDellApp?: unknown } | null)?.fraseDellApp === true && guasto instanceof Error ? guasto.message : opzioni.t('chat.attachmentErrors.generic')
        if (g?.reason === 'images-unavailable') return opzioni.t('computer.imagesUnavailable')
        // r4 173c755b3: il PC ha ricevuto il file ma non è riuscito a scriverlo (`OPERATION_FAILED`, `save-failed`)
        if (g?.reason === 'save-failed') return opzioni.t('computer.fileSaveFailed')
        if (codice === 'PAYLOAD_LIMIT' || codice === 'FILE_TOO_LARGE') return dice('fileTooLargeBody')
        if (codice === 'FILE_NO_CONVERSATION') return dice('fileNoConversation')
        if (codice === 'CONSENT_REQUIRED') return opzioni.t('computer.fileNeedsConsent')
        if (codice === 'NOT_AVAILABLE_REMOTELY') return opzioni.t('computer.onlyFromPc')
        if (codice === 'RATE_LIMITED') return opzioni.t('computer.fileBusy')
        if (CODICI_DELLA_COPIA.has(codice)) return opzioni.t('harness.r4FileNotCopied')
        if (CODICI_DEL_CANALE.has(codice)) return opzioni.t(fraseErroreRemoto(codice) ?? 'computer.errors.generic')
        return opzioni.t('chat.attachmentErrors.generic')
    }
    /** Una frase dell'app come guasto: il vassoio la mostra così com'è (B9-4). */
    const fraseDellApp = (frase: string) => Object.assign(new Error(frase), { fraseDellApp: true })
    /** ⛔ B9-2: l'interruttore dell'invio di ogni bozza (solo col PC): togliere la bozza o svuotare il vassoio ferma il suo invio. */
    const interruttori = new Map<string, AbortController>()
    const statoInVassoio = (id: string, mia: number) => (st: StatoFileRemoto) => {
        const v = vassoio.find((x) => x.id === id)
        if (mia !== generazione || !v || v.status !== 'ingesting') return
        if (st.stato === 'in-invio' || st.stato === 'sul-pc') v.progress = { phase: 'sending', sent: st.fatti, total: st.totale }
        else if (st.stato === 'pausa') v.progress = { phase: 'paused', sent: st.fatti, total: st.totale }
        else if (st.stato === 'attesa-turno') v.progress = { phase: 'waiting', sent: 0, total: v.sizeBytes }
    }
    /** I file fermati dal consenso del PC: su «Consentita» ripartono da sé (`riprovaDopoConsenso`). */
    const inAttesaDelConsenso = new Map<string, { s: TalosPickedFile; uri: string }>()

    function chiedi(quante: number): Promise<RispostaConsensoR4> {
        return new Promise((r) => {
            if (risolvi) { r('deny'); return }
            risolvi = r
            domanda.value = { count: quante, provider: opzioni.fornitore().nome }
        })
    }
    async function rispondi(risposta: RispostaConsensoR4): Promise<void> {
        domanda.value = null
        const r = risolvi
        risolvi = null
        if (risposta === 'allow') await opzioni.ricordaSempre()
        if (risposta !== 'deny') consensoDellaBozza.value = true
        r?.(risposta)
    }

    /** Il consenso alla scelta, come la chat: «mai» lo dice, «chiedi» fa la domanda (una volta per bozza). */
    async function consentito(quante: number): Promise<boolean> {
        const decisione = talosImageSendDecision({
            imageCount: quante, provider: opzioni.fornitore().id, alreadyAnsweredForDraft: consensoDellaBozza.value, stance: opzioni.consenso(),
        })
        if (decisione === 'send') return true
        if (decisione === 'refuse') { errore.value = opzioni.t('chat.imageConsentDenied'); return false }
        return (await chiedi(quante)) !== 'deny'
    }

    const leggiDataUrl = (blob: Blob) => new Promise<string>((ok, ko) => {
        const lettore = new FileReader()
        lettore.onload = () => ok(String(lettore.result))
        lettore.onerror = () => ko(fraseDellApp(dice('cannotReadFile')))
        lettore.readAsDataURL(blob)
    })
    const daBase64 = (base64: string) => {
        const binario = atob(base64)
        const byte = new Uint8Array(binario.length)
        for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
        return byte
    }

    function nuovaBozza(s: TalosPickedFile): TalosMobileAttachmentDraft {
        const bozza: TalosMobileAttachmentDraft = {
            id: `r4-allegato-${++prossimo}`, source: 'picker', displayName: s.name, mediaType: s.declaredMediaType || 'application/octet-stream',
            sizeBytes: s.sizeBytes, status: 'ingesting', vaultFileId: null, grantId: null, bindingId: null, permissions: [], error: null,
        }
        vassoio.push(bozza)
        // ⛔ B10-2 (revisione del blocco 10): l'interruttore nasce con la bozza, prima della lettura dei byte
        interruttori.set(bozza.id, new AbortController())
        return bozza
    }

    async function caricaImmagine(bozza: TalosMobileAttachmentDraft, sorgente: ByteImmagine, mia: number): Promise<void> {
        const voce = () => vassoio.find((v) => v.id === bozza.id)
        try {
            let dataUrl: string
            let byte: Promise<Uint8Array>
            if ('blob' in sorgente) {
                dataUrl = await leggiDataUrl(sorgente.blob)
                byte = sorgente.blob.arrayBuffer().then((b) => new Uint8Array(b))
            } else {
                const letta = await opzioni.cliente().immagineScelta?.({ uri: sorgente.uri })
                if (!letta?.base64) throw fraseDellApp(dice('cannotReadFile'))
                dataUrl = `data:${letta.tipo || bozza.mediaType};base64,${letta.base64}`
                byte = Promise.resolve(daBase64(letta.base64))
            }
            // B10-2: tolta (o vassoio svuotato) mentre si leggevano i byte: non parte nulla
            if (mia !== generazione || !voce()) return
            const remoto = opzioni.sessione !== undefined
            const risposta = await opzioni.cliente().richiesta({
                metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: bozza.displayName, dataUrl }),
                // B9-2/B9-5: col PC l'immagine si ferma con la bozza e dice il suo avanzamento
                ...(remoto ? { segnale: interruttore(bozza.id), onStato: statoInVassoio(bozza.id, mia) } : {}),
            })
            let corpo: { ok?: boolean; data?: { id?: unknown; mimeType?: unknown; byte?: unknown }; error?: { message?: unknown } } | null = null
            try { corpo = JSON.parse(risposta.corpo) } catch { corpo = null }
            const id = typeof corpo?.data?.id === 'string' ? corpo.data.id : null
            if (risposta.stato < 200 || risposta.stato >= 300 || !corpo?.ok || !id) {
                const e = corpo?.error as { message?: unknown; code?: unknown; reason?: unknown } | undefined
                throw Object.assign(new Error(typeof e?.message === 'string' ? e.message : `HTTP ${risposta.stato}`), {
                    code: typeof e?.code === 'string' ? e.code : `HTTP_${risposta.stato}`, ...(typeof e?.reason === 'string' ? { reason: e.reason } : {}),
                })
            }
            if (mia !== generazione || !voce()) return
            // i byte appena scelti fanno subito l'anteprima della bolla, senza tornare a chiederli a r4
            void byte.then((b) => { memoria.value.set(id, b) }).catch(() => undefined)
            Object.assign(voce()!, {
                status: 'authorized', vaultFileId: `${PREFISSO_R4}${id}`, permissions: ['model.read'],
                mediaType: typeof corpo.data?.mimeType === 'string' ? corpo.data.mimeType : bozza.mediaType,
                sizeBytes: typeof corpo.data?.byte === 'number' ? corpo.data.byte : bozza.sizeBytes,
            })
        } catch (guasto) {
            if (mia !== generazione || !voce()) return
            Object.assign(voce()!, { status: 'failed', error: `${dice('imageFailed')} · ${perché(guasto, 'immagine')}`, progress: null })
        }
    }

    /** A3: il nativo scrive il file in `allegati/` e torna la ricevuta del desktop; il testo solo per i file di testo entro il tetto. */
    async function caricaFile(bozza: TalosMobileAttachmentDraft, s: TalosPickedFile, uri: string, mia: number): Promise<void> {
        const voce = () => vassoio.find((v) => v.id === bozza.id)
        try {
            const allega = opzioni.cliente().allegaFile
            if (!allega) throw fraseDellApp(dice('serverNoConfirm'))
            const testoChiesto = testoAllegabileR4(s.name, s.declaredMediaType)
            // R5.13 F3: col PC, la sessione e lo stato dell'invio; in locale gli argomenti di sempre
            const remoto = opzioni.sessione !== undefined
            const r = await allega(remoto ? {
                uri, nome: s.name, testo: testoChiesto, ...(opzioni.sessione!() ? { sessionId: opzioni.sessione!()! } : {}),
                onStato: statoInVassoio(bozza.id, mia), segnale: interruttore(bozza.id),
            } : { uri, nome: s.name, testo: testoChiesto })
            if (r?.tipo !== 'file' || typeof r.nome !== 'string' || r.percorso !== `allegati/${r.nome}` || (!remoto && typeof r.assoluto !== 'string')
                || !Number.isSafeInteger(r.bytes) || r.bytes < 0 || r.bytes > MASSIMO_FILE_R4) throw fraseDellApp(dice('serverNoConfirm'))
            if (mia !== generazione || !voce()) return
            const testo = typeof r.testo === 'string' && r.testo.length <= CARATTERI_PER_ALLEGATO_R4 ? r.testo : null
            fileDellaBozza.set(bozza.id, {
                tipo: 'file', nome: r.nome, percorso: r.percorso, ...(typeof r.assoluto === 'string' ? { assoluto: r.assoluto } : {}),
                ...(testo === null ? {} : { contenuto: testo, caratteri: testo.length }),
            })
            Object.assign(voce()!, { status: 'authorized', displayName: r.nome, sizeBytes: r.bytes, permissions: ['model.read'], progress: null })
        } catch (guasto) {
            if (mia !== generazione || !voce()) return
            // Pad 16/10: il perché in parole, mai il codice grezzo del nativo (come la chat)
            Object.assign(voce()!, { status: 'failed', error: `${dice('fileFailed')} · ${perché(guasto)}`, progress: null })
            const g = guasto as { code?: unknown; message?: unknown; reason?: unknown; params?: unknown }
            if (g?.code === 'CONSENT_REQUIRED') {
                inAttesaDelConsenso.set(bozza.id, { s, uri })
                opzioni.suConsenso?.({
                    code: 'CONSENT_REQUIRED', message: typeof g.message === 'string' ? g.message : 'CONSENT_REQUIRED',
                    ...(typeof g.reason === 'string' ? { reason: g.reason } : {}),
                    ...(g.params && typeof g.params === 'object' ? { params: g.params as Record<string, unknown> } : {}),
                })
            }
        }
    }

    /**
     * La galleria, la fotocamera o il selettore dei file: il tetto del desktop, poi per le immagini il loro controllo e il consenso
     * della chat, per i file il tetto dei 25 MiB; infine una bozza per allegato e il caricamento.
     */
    async function scegli(via: 'galleria' | 'fotocamera' | 'file'): Promise<void> {
        if (occupato.value) return
        occupato.value = true
        errore.value = null
        const mia = generazione
        try {
            let scelte: TalosPickedFile[]
            if (via === 'file') scelte = await (await opzioni.selettoreFile()).pickFiles()
            else {
                const camera = await opzioni.fotocamera()
                scelte = via === 'galleria' ? await camera.pickPhotos() : await camera.takePhoto()
            }
            if (!scelte.length || mia !== generazione) return
            if (vassoio.filter((v) => v.status !== 'failed').length + scelte.length > QUANTI_ALLEGATI_R4) {
                errore.value = `${dice('tooMany')} · ${dice('tooManyBody', { massimo: String(QUANTI_ALLEGATI_R4) })}`
                return
            }
            const immagini = scelte.filter((s) => (s.declaredMediaType || '').startsWith('image/'))
            for (const s of scelte) {
                if (immagini.includes(s)) {
                    const problema = controllaImmagineR4(s.declaredMediaType, s.sizeBytes)
                    if (problema === 'formato') { errore.value = `${dice('imageFormat')} · ${dice('imageFormatBody')}`; return }
                    if (problema === 'grande') { errore.value = `${dice('imageTooLarge')} · ${dice('imageTooLargeBody')}`; return }
                } else {
                    if (s.sizeBytes > MASSIMO_FILE_R4) { errore.value = `${dice('fileTooLarge')} · ${dice('fileTooLargeBody')}`; return }
                    if (s.source.kind !== 'native-uri') { errore.value = `${dice('fileFailed')} · ${dice('cannotReadFile')}`; return }
                }
            }
            if (immagini.length && (!(await consentito(immagini.length)) || mia !== generazione)) return
            await Promise.all(scelte.map((s) => {
                const bozza = nuovaBozza(s)
                const carica = s.source.kind === 'web-blob' ? caricaImmagine(bozza, { blob: s.source.blob }, mia)
                    : immagini.includes(s) ? caricaImmagine(bozza, { uri: s.source.uri }, mia) : caricaFile(bozza, s, s.source.uri, mia)
                return carica.finally(() => {
                    if (mia === generazione && erroreDellAttesa && errore.value === erroreDellAttesa && !vassoio.some((v) => v.status === 'ingesting')) {
                        errore.value = null
                        erroreDellAttesa = null
                    }
                })
            }))
        } catch (guasto) {
            if (mia === generazione) errore.value = `${dice(via === 'file' ? 'fileFailed' : 'imageFailed')} · ${perché(guasto, via === 'file' ? 'file' : 'immagine')}`
        } finally {
            if (mia === generazione) occupato.value = false
        }
    }

    /** ⛔ D-F3-1: su «Consentita» i file fermati dal consenso ripartono, una volta sola. */
    async function riprovaDopoConsenso(): Promise<void> {
        const mia = generazione
        const da = [...inAttesaDelConsenso.entries()]
        inAttesaDelConsenso.clear()
        await Promise.all(da.map(([id, { s, uri }]) => {
            const v = vassoio.find((x) => x.id === id)
            if (!v || v.status !== 'failed') return Promise.resolve()
            Object.assign(v, { status: 'ingesting', error: null, progress: null })
            return caricaFile(v, s, uri, mia)
        }))
    }

    /** L'interruttore di una bozza, creato al primo uso; tolto quando la bozza esce dal vassoio. */
    function interruttore(id: string): AbortSignal {
        // una bozza già tolta (o mai nata) ha l'interruttore scattato: il suo invio non parte
        return interruttori.get(id)?.signal ?? AbortSignal.abort()
    }

    function togli(id: string): void {
        interruttori.get(id)?.abort()
        interruttori.delete(id)
        const i = vassoio.findIndex((v) => v.id === id)
        if (i >= 0) vassoio.splice(i, 1)
        fileDellaBozza.delete(id)
        inAttesaDelConsenso.delete(id)
        if (!vassoio.length) consensoDellaBozza.value = false
    }

    /** Gli allegati pronti nell'ordine del vassoio, come li vuole l'invio (`AllegatoR4`), e `immagini: [{id}]` solo con le immagini. */
    function pronte(): { voci: AllegatoR4[]; immagini: { id: string }[] } {
        const voci = vassoio.filter((v) => v.status === 'authorized').flatMap((v): AllegatoR4[] => {
            if (v.vaultFileId?.startsWith(PREFISSO_R4)) {
                return [{ tipo: 'immagine', nome: v.displayName, id: v.vaultFileId.slice(PREFISSO_R4.length), mimeType: v.mediaType, byte: v.sizeBytes }]
            }
            const file = fileDellaBozza.get(v.id)
            return file ? [file] : []
        })
        return { voci, immagini: voci.filter((v) => v.tipo === 'immagine').map((v) => ({ id: v.id as string })) }
    }

    /**
     * Prima dell'invio, la regola della chat (`talosImageSendDecision`): il fornitore può essere cambiato dopo la scelta. `false` = non
     * parte (il testo NON si manda senza le immagini).
     */
    async function puoPartire(): Promise<boolean> {
        // R5.13 F3 (Desktop 25/10, «tutte e due le modalità, come la finestra»): un allegato ancora in viaggio non si perde dal
        // messaggio; la finestra blocca l'invio (`fileUploads`/`imageUploads`) e dice `attachments.loading`. Vale anche per «Accoda».
        if (vassoio.some((v) => v.status === 'ingesting')) {
            erroreDellAttesa = `${dice('loading')} · ${dice('loadingBody')}`
            errore.value = erroreDellAttesa
            return false
        }
        const quante = pronte().immagini.length
        return quante === 0 || consentito(quante)
    }

    /** Dopo un invio partito, o cambiando sessione: il vassoio si svuota e i caricamenti a metà non entrano più. */
    function svuota(): void {
        generazione += 1
        for (const c of interruttori.values()) c.abort()
        interruttori.clear()
        vassoio.splice(0)
        fileDellaBozza.clear()
        inAttesaDelConsenso.clear()
        occupato.value = false
        errore.value = null
        consensoDellaBozza.value = false
        if (risolvi) void rispondi('deny')
    }

    /** L'anteprima vera delle bolle: `r4:<id>` si legge da r4 (`immagine`), una volta per id. */
    const lettore: TalosLettoreByteImmagine = async (fileId) => {
        if (!fileId.startsWith(PREFISSO_R4)) return null
        const id = fileId.slice(PREFISSO_R4.length)
        const giàLetta = memoria.value.get(id)
        if (giàLetta) return giàLetta
        const cliente = opzioni.cliente()
        if (!cliente.immagine) return null
        try {
            const risposta = await cliente.immagine({ id })
            if (risposta.stato !== 200 || !risposta.base64) return null
            const byte = daBase64(risposta.base64)
            memoria.value.set(id, byte)
            return byte
        } catch {
            return null
        }
    }

    return { vassoio, occupato, errore, domanda, rispondi, scegli, togli, pronte, puoPartire, svuota, lettore, riprovaDopoConsenso }
}
