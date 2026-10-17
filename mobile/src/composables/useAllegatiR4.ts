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
    /** A3: la ricevuta di ogni file della bozza (per id della bozza), con il testo se è partito col messaggio. */
    const fileDellaBozza = new Map<string, AllegatoR4>()

    const dice = (chiave: string, valori: Record<string, string> = {}) => testoAllegatiR4(chiave, opzioni.lingua(), valori)
    const motivo = (guasto: unknown) => {
        const codice = (guasto as { code?: unknown } | null)?.code
        return typeof codice === 'string' && codice ? codice : guasto instanceof Error ? guasto.message : String(guasto)
    }

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
        lettore.onerror = () => ko(new Error(dice('cannotReadFile')))
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
                if (!letta?.base64) throw new Error(dice('cannotReadFile'))
                dataUrl = `data:${letta.tipo || bozza.mediaType};base64,${letta.base64}`
                byte = Promise.resolve(daBase64(letta.base64))
            }
            const risposta = await opzioni.cliente().richiesta({ metodo: 'POST', percorso: '/api/v1/chat-images', corpo: JSON.stringify({ nome: bozza.displayName, dataUrl }) })
            let corpo: { ok?: boolean; data?: { id?: unknown; mimeType?: unknown; byte?: unknown }; error?: { message?: unknown } } | null = null
            try { corpo = JSON.parse(risposta.corpo) } catch { corpo = null }
            const id = typeof corpo?.data?.id === 'string' ? corpo.data.id : null
            if (risposta.stato < 200 || risposta.stato >= 300 || !corpo?.ok || !id) {
                throw new Error(typeof corpo?.error?.message === 'string' ? corpo.error.message : `HTTP ${risposta.stato}`)
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
            Object.assign(voce()!, { status: 'failed', error: `${dice('imageFailed')} · ${guasto instanceof Error ? guasto.message : String(guasto)}` })
        }
    }

    /** A3: il nativo scrive il file in `allegati/` e torna la ricevuta del desktop; il testo solo per i file di testo entro il tetto. */
    async function caricaFile(bozza: TalosMobileAttachmentDraft, s: TalosPickedFile, uri: string, mia: number): Promise<void> {
        const voce = () => vassoio.find((v) => v.id === bozza.id)
        try {
            const allega = opzioni.cliente().allegaFile
            if (!allega) throw new Error(dice('serverNoConfirm'))
            const r = await allega({ uri, nome: s.name, testo: testoAllegabileR4(s.name, s.declaredMediaType) })
            if (r?.tipo !== 'file' || typeof r.nome !== 'string' || r.percorso !== `allegati/${r.nome}` || typeof r.assoluto !== 'string'
                || !Number.isSafeInteger(r.bytes) || r.bytes < 0 || r.bytes > MASSIMO_FILE_R4) throw new Error(dice('serverNoConfirm'))
            if (mia !== generazione || !voce()) return
            const testo = typeof r.testo === 'string' && r.testo.length <= CARATTERI_PER_ALLEGATO_R4 ? r.testo : null
            fileDellaBozza.set(bozza.id, {
                tipo: 'file', nome: r.nome, percorso: r.percorso, assoluto: r.assoluto, ...(testo === null ? {} : { contenuto: testo, caratteri: testo.length }),
            })
            Object.assign(voce()!, { status: 'authorized', displayName: r.nome, sizeBytes: r.bytes, permissions: ['model.read'] })
        } catch (guasto) {
            if (mia !== generazione || !voce()) return
            // Pad 16/10: il perché in parole, mai il codice grezzo del nativo (come la chat)
            const codice = motivo(guasto)
            const perché = codice === 'PAYLOAD_LIMIT' ? dice('fileTooLargeBody')
                : CODICI_DELLA_COPIA.has(codice) ? opzioni.t('harness.r4FileNotCopied') : codice
            Object.assign(voce()!, { status: 'failed', error: `${dice('fileFailed')} · ${perché}` })
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
                if (s.source.kind === 'web-blob') return caricaImmagine(bozza, { blob: s.source.blob }, mia)
                return immagini.includes(s) ? caricaImmagine(bozza, { uri: s.source.uri }, mia) : caricaFile(bozza, s, s.source.uri, mia)
            }))
        } catch (guasto) {
            if (mia === generazione) errore.value = `${dice(via === 'file' ? 'fileFailed' : 'imageFailed')} · ${motivo(guasto)}`
        } finally {
            if (mia === generazione) occupato.value = false
        }
    }

    function togli(id: string): void {
        const i = vassoio.findIndex((v) => v.id === id)
        if (i >= 0) vassoio.splice(i, 1)
        fileDellaBozza.delete(id)
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
        const quante = pronte().immagini.length
        return quante === 0 || consentito(quante)
    }

    /** Dopo un invio partito, o cambiando sessione: il vassoio si svuota e i caricamenti a metà non entrano più. */
    function svuota(): void {
        generazione += 1
        vassoio.splice(0)
        fileDellaBozza.clear()
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

    return { vassoio, occupato, errore, domanda, rispondi, scegli, togli, pronte, puoPartire, svuota, lettore }
}
