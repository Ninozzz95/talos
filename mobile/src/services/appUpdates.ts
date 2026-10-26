import { reactive, readonly } from 'vue'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

/**
 * L'aggiornamento automatico dell'app (owner 22/10/2026): il nativo controlla, scarica, verifica e installa
 * (`android/.../aggiornamenti/`); qui lo stato che l'interfaccia mostra e le quattro azioni della persona.
 *
 * Lo stato NON si tiene in due posti: il nativo lo persiste e a ogni cambio manda l'evento `cambio` con lo stato intero, che qui
 * si copia. Fuori dal nativo (web, test) tutto resta inerte, fase `NESSUNA`.
 * Ledger: `.claude/ragionamento/LEDGER-AGGIORNAMENTO-AUTOMATICO-MOBILE-2026-10-22.md`.
 */
export type TalosFaseAggiornamento = 'NESSUNA' | 'IN_SCARICAMENTO' | 'PRONTA' | 'IN_INSTALLAZIONE' | 'AGGIORNATA' | 'FALLITA'

export interface TalosNoteAggiornamento {
    en: readonly string[]
    it: readonly string[]
}

export interface TalosStatoAggiornamenti {
    fase: TalosFaseAggiornamento
    installata: string
    versione: string | null
    note: TalosNoteAggiornamento | null
    pagina: string | null
    dimensione: number | null
    /** Byte dell'APK arrivati finora (D-UPD-1): il nativo li aggiorna al massimo una volta al secondo. */
    scaricati: number | null
    motivo: string | null
    ultimoControllo: number | null
    appenaAggiornata: string | null
    allUscita: boolean
    permessoConcesso: boolean
    automatici: boolean
    soloWifi: boolean
    avvisami: boolean
}

export type TalosEsitoControlloOra = 'trovata' | 'aggiornata' | 'rifiutata' | 'irraggiungibile'

interface TalosAggiornamentiBridge {
    stato(): Promise<Partial<TalosStatoAggiornamenti>>
    controllaOra(): Promise<Partial<TalosStatoAggiornamenti> & { esito?: TalosEsitoControlloOra }>
    impostazioni(opzioni: Partial<Pick<TalosStatoAggiornamenti, 'automatici' | 'soloWifi' | 'avvisami'>>): Promise<Partial<TalosStatoAggiornamenti>>
    riavviaOra(): Promise<Partial<TalosStatoAggiornamenti> & { motivo?: string | null }>
    allProssimoAvvio(): Promise<Partial<TalosStatoAggiornamenti>>
    uscita(): Promise<void>
    apriPermesso(): Promise<Partial<TalosStatoAggiornamenti>>
    visto(): Promise<Partial<TalosStatoAggiornamenti>>
    addListener(evento: 'cambio', ascolto: (stato: Partial<TalosStatoAggiornamenti>) => void): Promise<PluginListenerHandle>
}

const FASI: readonly TalosFaseAggiornamento[] = ['NESSUNA', 'IN_SCARICAMENTO', 'PRONTA', 'IN_INSTALLAZIONE', 'AGGIORNATA', 'FALLITA']

const state = reactive<TalosStatoAggiornamenti>({
    fase: 'NESSUNA',
    installata: '',
    versione: null,
    note: null,
    pagina: null,
    dimensione: null,
    scaricati: null,
    motivo: null,
    ultimoControllo: null,
    appenaAggiornata: null,
    allUscita: false,
    permessoConcesso: false,
    automatici: true,
    soloWifi: true,
    avvisami: true,
})

export const talosAggiornamenti = readonly(state)

let bridge: TalosAggiornamentiBridge | null = null
function plugin(): TalosAggiornamentiBridge {
    // ⛔ mai `await` sul proxy del plugin: è thenable (lezione della dettatura, `services/privacyScreen.ts`)
    return (bridge ??= registerPlugin<TalosAggiornamentiBridge>('TalosAggiornamenti'))
}

function testi(valore: unknown): string[] | null {
    if (!Array.isArray(valore) || valore.length === 0) return null
    return valore.every((v) => typeof v === 'string') ? (valore as string[]) : null
}

/** Copia lo stato del nativo, campo per campo e per tipo: un campo assente o di un altro tipo resta com'era. */
export function talosApplicaStatoAggiornamenti(arrivato: Partial<TalosStatoAggiornamenti> | null | undefined): void {
    if (!arrivato || typeof arrivato !== 'object') return
    if (FASI.includes(arrivato.fase as TalosFaseAggiornamento)) state.fase = arrivato.fase as TalosFaseAggiornamento
    if (typeof arrivato.installata === 'string') state.installata = arrivato.installata
    for (const chiave of ['versione', 'pagina', 'motivo', 'appenaAggiornata'] as const) {
        if (chiave in arrivato) state[chiave] = typeof arrivato[chiave] === 'string' ? arrivato[chiave] as string : null
    }
    for (const chiave of ['dimensione', 'scaricati', 'ultimoControllo'] as const) {
        if (chiave in arrivato) state[chiave] = typeof arrivato[chiave] === 'number' ? arrivato[chiave] as number : null
    }
    for (const chiave of ['allUscita', 'permessoConcesso', 'automatici', 'soloWifi', 'avvisami'] as const) {
        if (typeof arrivato[chiave] === 'boolean') state[chiave] = arrivato[chiave] as boolean
    }
    if ('note' in arrivato) {
        const note = arrivato.note as { en?: unknown; it?: unknown } | null
        const en = testi(note?.en)
        const it = testi(note?.it)
        state.note = en && it ? { en, it } : null
    }
}

let ascolto: PluginListenerHandle | null = null

/** All'avvio dell'app: legge lo stato e si mette in ascolto dei cambi. Due chiamate non aprono due ascolti. */
export async function talosAvviaAggiornamenti(): Promise<void> {
    if (!Capacitor.isNativePlatform() || ascolto) return
    try {
        ascolto = await plugin().addListener('cambio', talosApplicaStatoAggiornamenti)
        talosApplicaStatoAggiornamenti(await plugin().stato())
    } catch {
        // un plugin assente non deve fermare l'app: l'aggiornamento resta spento, l'app funziona
    }
}

async function chiama<T extends Partial<TalosStatoAggiornamenti>>(azione: () => Promise<T>): Promise<T | null> {
    if (!Capacitor.isNativePlatform()) return null
    try {
        const risposta = await azione()
        talosApplicaStatoAggiornamenti(risposta)
        return risposta
    } catch {
        return null
    }
}

/** Al ritorno nell'app: il permesso «Installa app sconosciute» si concede FUORI da TALOS, nessun evento lo annuncia. */
export async function talosRileggiAggiornamenti(): Promise<void> {
    await chiama(() => plugin().stato())
}

export async function talosControllaOra(): Promise<TalosEsitoControlloOra | null> {
    return (await chiama(() => plugin().controllaOra()))?.esito ?? null
}

export async function talosImpostaAggiornamenti(scelte: Partial<Pick<TalosStatoAggiornamenti, 'automatici' | 'soloWifi' | 'avvisami'>>): Promise<void> {
    await chiama(() => plugin().impostazioni(scelte))
}

/** Torna null se l'installazione è partita (TALOS si chiude), altrimenti il motivo per cui non è partita. */
export async function talosRiavviaOra(): Promise<string | null> {
    const risposta = await chiama(() => plugin().riavviaOra())
    return risposta === null ? 'plugin' : (risposta.motivo ?? null)
}

export async function talosAlProssimoAvvio(): Promise<void> {
    await chiama(() => plugin().allProssimoAvvio())
}

export async function talosApriPermessoAggiornamenti(): Promise<void> {
    await chiama(() => plugin().apriPermesso())
}

export async function talosAggiornamentoVisto(): Promise<void> {
    await chiama(() => plugin().visto())
}

/** TALOS va in sottofondo: con «Al prossimo avvio» scelto e niente al lavoro, parte l'attesa dell'installazione. */
export async function talosUscitaPerAggiornamento(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !state.allUscita || state.fase !== 'PRONTA') return
    try {
        await plugin().uscita()
    } catch {
        // si riproverà alla prossima uscita
    }
}

/** Il cassetto e il segnale hanno qualcosa da dire? */
export function talosAggiornamentoDaMostrare(s: Pick<TalosStatoAggiornamenti, 'fase' | 'appenaAggiornata'> = state): boolean {
    return s.fase === 'PRONTA' || s.fase === 'FALLITA' || s.fase === 'IN_INSTALLAZIONE' || s.appenaAggiornata !== null
}

/** Solo per i test: rimette lo stato iniziale. */
export function talosAzzeraAggiornamentiPerTest(): void {
    ascolto = null
    bridge = null
    Object.assign(state, {
        fase: 'NESSUNA', installata: '', versione: null, note: null, pagina: null, dimensione: null, scaricati: null, motivo: null,
        ultimoControllo: null, appenaAggiornata: null, allUscita: false, permessoConcesso: false, automatici: true,
        soloWifi: true, avvisami: true,
    } satisfies TalosStatoAggiornamenti)
}
