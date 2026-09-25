/**
 * ⭐ A3-84 seconda parte (owner 25/09/2026, 10:20) — «nuova risposta» su una chat che ha risposto mentre eri altrove,
 * finché non la apri. Open WebUI mette i non letti in cima all'elenco; il desktop TALOS lo dice per un minuto
 * (`session-item.js`, `SEGNALE_NOVITA_MS`); l'owner ha scelto «finché non la apri».
 *
 * Il registro sta sul telefono: una BASE (il momento del primo avvio con questa funzione) e, per ogni chat, l'ultima
 * volta che l'hai guardata. ⛔ La base esiste perché il primo avvio non accenda l'elenco intero: una risposta di prima
 * della base non è una novità, è storia.
 *
 * Puro: l'archivio (Preferences sul telefono) e l'istante arrivano da fuori.
 */
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

export interface TalosRegistroViste {
    readonly base: string
    readonly viste: Readonly<Record<string, string>>
}

export interface TalosArchivioViste {
    leggi(): Promise<string | null>
    scrivi(valore: string): Promise<void>
}

/**
 * Una RISPOSTA completa (assistente, salvata, non fermata a metà) arrivata dopo l'ultima volta che hai guardato la
 * chat — o dopo la base, se non l'hai mai aperta. La chat che stai guardando adesso non è mai «nuova».
 */
export function talosNuovaRisposta(sessione: TalosLocalChatSession, registro: TalosRegistroViste, guardata: string | null): boolean {
    if (sessione.id === guardata) return false
    const ultimo = sessione.last_message
    if (!ultimo || ultimo.role !== 'assistant' || ultimo.state !== 'persisted' || ultimo.interrupted) return false
    if (!ultimo.created_at) return false
    const soglia = registro.viste[sessione.id] ?? registro.base
    return Date.parse(ultimo.created_at) > Date.parse(soglia)
}

export function talosSegnaVista(registro: TalosRegistroViste, id: string, adesso: Date): TalosRegistroViste {
    return { base: registro.base, viste: { ...registro.viste, [id]: adesso.toISOString() } }
}

/** Le chat cancellate escono dal registro: non si tiene memoria di ciò che non c'è più. */
export function talosPotaRegistro(registro: TalosRegistroViste, vive: ReadonlySet<string>): TalosRegistroViste {
    return { base: registro.base, viste: Object.fromEntries(Object.entries(registro.viste).filter(([id]) => vive.has(id))) }
}

function istanteValido(valore: unknown): valore is string {
    return typeof valore === 'string' && !Number.isNaN(Date.parse(valore))
}

/**
 * Rilettura difensiva, come per ogni dato sul disco: un registro illeggibile, storto o un archivio che non risponde
 * fanno ripartire la base da ADESSO — niente novità inventate, mai una caduta dell'elenco. Le voci sbagliate si
 * scartano una per una, le buone restano.
 */
export async function talosLeggiRegistroViste(archivio: TalosArchivioViste, adesso: Date): Promise<TalosRegistroViste> {
    const nuovo: TalosRegistroViste = { base: adesso.toISOString(), viste: {} }
    let grezzo: string | null
    try {
        grezzo = await archivio.leggi()
    } catch {
        return nuovo
    }
    let letto: unknown = null
    if (grezzo) {
        try { letto = JSON.parse(grezzo) } catch { letto = null }
    }
    if (!letto || typeof letto !== 'object' || Array.isArray(letto)) {
        await archivio.scrivi(JSON.stringify(nuovo)).catch(() => undefined)
        return nuovo
    }
    const { base, viste } = letto as { base?: unknown, viste?: unknown }
    const buone = viste && typeof viste === 'object' && !Array.isArray(viste)
        ? Object.fromEntries(Object.entries(viste as Record<string, unknown>).filter((voce): voce is [string, string] => istanteValido(voce[1])))
        : {}
    return { base: istanteValido(base) ? base : nuovo.base, viste: buone }
}
