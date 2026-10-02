import { talosHarnessUiApiBase } from '@/lib/harness/harnessUiApiBase'
import { intestazioniServerCodice } from '@/lib/harness/harnessUiSegreto'

/*
 * ⛔⛔ 70-B (30/09/2026 notte, contratto desktop 70 + ART-ROTTO) — gli artefatti del Codice, come quelli della chat.
 *
 * Owner: «Riuso della chat». L'HTML vive su disco nel server del Codice (`GET /api/v1/artifacts/<id>`, dietro il segreto
 * del 70-A); al tocco su «Apri» diventa una copia nella cartella privata dell'app (`TalosArtifactBridge.create`) e si
 * apre nella STESSA finestra isolata della chat (`open`: WebView e Profilo separati, mai un iframe dentro TALOS — vedi
 * `TalosArtifactActivity.kt`). Owner: «Sì, come la chat» — «Salva nella Libreria» passa da
 * `saveArtifactToLibrary`, la via di `TalosMobileSchedaAzione.vue`. Ledger
 * `.claude/ragionamento/LEDGER-70B-ARTEFATTI-CODICE-2026-09-30.md`.
 *
 * ⛔ La copia nativa si ricorda per id del server solo finché l'app è aperta: il plugin nativo genera il suo id, e
 * cambiarlo toccherebbe la chat. Dopo un riavvio dell'app, il primo «Apri» fa una copia nuova (dichiarato nel ledger).
 */

export type EsitoArtefattoCodice = { ok: true } | { ok: false, motivo: 'NOT_FOUND' | 'READ_FAILED' | 'OPEN_FAILED' | 'SAVE_FAILED' }

const copieNative = new Map<string, string>()

/** L'HTML dell'artefatto dal server del Codice; un 401 (server ripartito) rilegge il segreto una volta. */
export async function leggiHtmlArtefattoCodice(id: string): Promise<{ ok: true, html: string } | { ok: false, motivo: 'NOT_FOUND' | 'READ_FAILED' }> {
    const url = `${talosHarnessUiApiBase()}/api/v1/artifacts/${encodeURIComponent(id)}`
    try {
        let risposta = await fetch(url, { headers: { Accept: 'application/json', ...await intestazioniServerCodice() }, cache: 'no-store' })
        if (risposta.status === 401) {
            risposta = await fetch(url, { headers: { Accept: 'application/json', ...await intestazioniServerCodice({ rinnova: true }) }, cache: 'no-store' })
        }
        if (risposta.status === 404) return { ok: false, motivo: 'NOT_FOUND' }
        if (!risposta.ok) return { ok: false, motivo: 'READ_FAILED' }
        const busta = await risposta.json() as { ok?: boolean, data?: { html?: unknown } }
        return typeof busta?.data?.html === 'string' ? { ok: true, html: busta.data.html } : { ok: false, motivo: 'READ_FAILED' }
    } catch {
        return { ok: false, motivo: 'READ_FAILED' }
    }
}

async function copiaNativa(id: string, titolo: string): Promise<{ ok: true, idNativo: string } | { ok: false, motivo: 'NOT_FOUND' | 'READ_FAILED' }> {
    const ricordata = copieNative.get(id)
    if (ricordata) return { ok: true, idNativo: ricordata }
    const lettura = await leggiHtmlArtefattoCodice(id)
    if (!lettura.ok) return lettura
    try {
        const { TalosArtifactBridge } = await import('@/lib/device/artifactPlugin')
        const { id: idNativo } = await TalosArtifactBridge.create({ title: titolo || 'Artifact', html: lettura.html })
        copieNative.set(id, idNativo)
        return { ok: true, idNativo }
    } catch {
        return { ok: false, motivo: 'READ_FAILED' }
    }
}

/** «Apri» sulla scheda del Codice: la finestra isolata della chat. */
export async function apriArtefattoCodice(id: string, titolo: string): Promise<EsitoArtefattoCodice> {
    const copia = await copiaNativa(id, titolo)
    if (!copia.ok) return copia
    try {
        const { TalosArtifactBridge } = await import('@/lib/device/artifactPlugin')
        const esito = await TalosArtifactBridge.open({ id: copia.idNativo })
        if (esito.opened === true) return { ok: true }
    } catch {
        // La copia nativa non c'è più (o la finestra non parte): al tocco dopo si rifà.
    }
    copieNative.delete(id)
    return { ok: false, motivo: 'OPEN_FAILED' }
}

/**
 * ⛔ OSS-70B-1 (30/09/2026 notte, owner «Codice · titolo della sessione»): da dove viene la pagina. `sessione` è la
 * sessione del Codice come la vede l'app (id e titolo dell'elenco); `sessioneServer` è l'id del server.
 *
 * ⛔ E7 (01/10/2026, owner «Dall'evento dell'artefatto»): `modello` arriva dall'evento `ArtifactCreated`, dove il server
 * scrive il modello che ha fatto QUEL giro. Prima qui si leggeva dall'elenco delle sessioni del server, che il modello
 * non lo porta: un errore mio (E5 del ledger), visto sul Pad.
 */
export interface ContestoArtefattoCodice {
    sessioneServer?: string | null
    modello?: string | null
    sessione?: { id: string, titolo: string } | null
}

/** «Salva nella Libreria» sulla scheda del Codice: la stessa via della chat, con l'origine del Codice. */
export async function salvaArtefattoCodice(id: string, titolo: string, contesto: ContestoArtefattoCodice = {}): Promise<EsitoArtefattoCodice> {
    const copia = await copiaNativa(id, titolo)
    if (!copia.ok) return copia
    try {
        const { useChatController } = await import('@/stores/chatController')
        const sessione = contesto.sessione
        const controller = useChatController()
        const esito = sessione
            ? await controller.saveArtifactToLibrary(copia.idNativo, titolo, {
                codice: { sessionId: sessione.id, title: sessione.titolo },
                model: typeof contesto.modello === 'string' && contesto.modello ? contesto.modello : null,
            })
            : await controller.saveArtifactToLibrary(copia.idNativo, titolo)
        return esito.ok ? { ok: true } : { ok: false, motivo: 'SAVE_FAILED' }
    } catch {
        return { ok: false, motivo: 'SAVE_FAILED' }
    }
}

/**
 * ⛔ OSS-70B-3 (30/09/2026 notte, owner «Riconoscere la stessa pagina»): la scheda del Codice chiede, quando nasce, se la
 * pagina è già nella Libreria (stessa impronta), così dopo una ricarica non torna «Salva» e non invita a un doppione.
 * Nel dubbio (server o Libreria che non rispondono) dice «non salvato»: il salvataggio stesso non fa comunque copie.
 */
export async function statoArtefattoCodice(id: string): Promise<{ salvato: boolean }> {
    const lettura = await leggiHtmlArtefattoCodice(id)
    if (!lettura.ok) return { salvato: false }
    try {
        const { useChatController } = await import('@/stores/chatController')
        return { salvato: (await useChatController().libraryFileWithSameContent(lettura.html)) !== null }
    } catch {
        return { salvato: false }
    }
}
