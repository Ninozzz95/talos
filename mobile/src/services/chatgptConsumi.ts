/**
 * N15 — il conto LOCALE dell'uso del piano ChatGPT e il benvenuto una volta per account (mockup approvato dall'owner il 12/10).
 *
 * ⛔ Qui non c'è nessun numero di OpenAI: il piano non pubblica i suoi limiti (indicazione del desktop del 13/10/2026). Si conta
 * solo ciò che è partito da QUESTO telefono — un istante e un numero di token per richiesta — e il pannello lo dice in chiaro.
 * ⛔ Niente di segreto: mai un token d'accesso, un testo o un indirizzo. Per questo sta nelle preferenze e non nel Keystore;
 * dell'account resta solo un'impronta (SHA-256), per non rimostrare il benvenuto a chi l'ha già letto.
 *
 * Un deposito che non risponde non ferma la chat: il conto semplicemente manca.
 */
export const CHIAVE_CONSUMI_CHATGPT = 'talos.chatgpt.consumi.v1'
export const CHIAVE_BENVENUTO_CHATGPT = 'talos.chatgpt.benvenuto.v1'

const ORE_5_MS = 5 * 60 * 60 * 1000
const GIORNI_7_MS = 7 * 24 * 60 * 60 * 1000
/** Un tetto alle righe tenute: sette giorni di uso fitto ci stanno larghi, e la voce non cresce senza fine. */
const RIGHE_MASSIME = 5000

export interface TalosDepositoSemplice {
    getItem(chiave: string): string | null
    setItem(chiave: string, valore: string): void
    removeItem(chiave: string): void
}
export interface TalosChatgptFinestra { richieste: number, token: number }
export interface TalosChatgptRiassunto { ore5: TalosChatgptFinestra, giorni7: TalosChatgptFinestra }

async function impronta(email: string | null): Promise<string> {
    const testo = new TextEncoder().encode((email ?? '').trim().toLowerCase())
    const somma = await globalThis.crypto.subtle.digest('SHA-256', testo)
    return Array.from(new Uint8Array(somma), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function creaConsumiChatgpt({ deposito, clock = Date.now }: { deposito: TalosDepositoSemplice, clock?: () => number }) {
    function leggi(): Array<[number, number]> {
        try {
            const righe: unknown = JSON.parse(deposito.getItem(CHIAVE_CONSUMI_CHATGPT) ?? '[]')
            if (!Array.isArray(righe)) return []
            const dopo = clock() - GIORNI_7_MS
            return righe.filter((r): r is [number, number] => Array.isArray(r) && Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[0] > dopo)
        } catch { return [] }
    }
    function finestra(righe: Array<[number, number]>, durata: number): TalosChatgptFinestra {
        const dopo = clock() - durata
        const dentro = righe.filter(([quando]) => quando > dopo)
        return { richieste: dentro.length, token: dentro.reduce((somma, [, token]) => somma + token, 0) }
    }
    function benvenuti(): string[] {
        try {
            const visti: unknown = JSON.parse(deposito.getItem(CHIAVE_BENVENUTO_CHATGPT) ?? '[]')
            return Array.isArray(visti) ? visti.filter((v): v is string => typeof v === 'string') : []
        } catch { return [] }
    }
    return {
        /** Una richiesta al piano è partita. `token` nullo = il fornitore non l'ha detto: la richiesta conta lo stesso. */
        registra(token: number | null): void {
            const quanti = typeof token === 'number' && Number.isFinite(token) && token > 0 ? Math.round(token) : 0
            try {
                const righe = [...leggi(), [clock(), quanti] as [number, number]].slice(-RIGHE_MASSIME)
                deposito.setItem(CHIAVE_CONSUMI_CHATGPT, JSON.stringify(righe))
            } catch { /* il conto manca, la chat no */ }
        },
        riassunto(): TalosChatgptRiassunto {
            const righe = leggi()
            return { ore5: finestra(righe, ORE_5_MS), giorni7: finestra(righe, GIORNI_7_MS) }
        },
        /** All'uscita: il conto era di quell'account. Il benvenuto già letto resta letto. */
        azzera(): void {
            try { deposito.removeItem(CHIAVE_CONSUMI_CHATGPT) } catch { /* niente da togliere */ }
        },
        async benvenutoDaMostrare(email: string | null): Promise<boolean> {
            try { return !benvenuti().includes(await impronta(email)) } catch { return false }
        },
        async segnaBenvenuto(email: string | null): Promise<void> {
            try {
                const chi = await impronta(email)
                const visti = benvenuti()
                if (!visti.includes(chi)) deposito.setItem(CHIAVE_BENVENUTO_CHATGPT, JSON.stringify([...visti, chi].slice(-20)))
            } catch { /* al più lo rivede una volta */ }
        },
    }
}

let istanza: ReturnType<typeof creaConsumiChatgpt> | null = null
export function talosConsumiChatgpt(): ReturnType<typeof creaConsumiChatgpt> {
    istanza ??= creaConsumiChatgpt({ deposito: globalThis.localStorage })
    return istanza
}
