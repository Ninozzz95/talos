/**
 * ⛔ K3-C Allegati (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10). Le regole degli allegati del Codice su r4, copiate dal
 * desktop r4 @ 701c6c0d2 (invariate da 2161afb32) e provate sul golden calcolato dal suo codice vero (`allegati-golden-701c6c0d2.json`).
 */
import allegati from './testi/app-allegati-r4.json'

/**
 * A1 «Allega alla chat» (`allegaFileAllaChat`, `legacy/app.js:20218`): il file entra nel campo come `@percorso `, in fondo; un `@`
 * lasciato a metà in fondo (la persona stava scrivendo una menzione) si sostituisce.
 */
export function conMenzioneR4(testo: string, percorso: string): string {
    return `${testo.replace(/@[^\s]*$/u, '')}@${percorso} `
}

/** Un allegato del compositore come lo tiene il desktop: un'immagine caricata in r4, o un file del progetto (col testo se piccolo). */
export interface AllegatoR4 {
    tipo: 'immagine' | 'file'
    nome: string
    id?: string
    mimeType?: string
    byte?: number
    percorso?: string
    assoluto?: string
    contenuto?: string
    caratteri?: number
}

export interface AllegatoDellaBollaR4 {
    tipo?: string
    nome?: string
    percorso?: string
    caratteri?: number
}
export interface BollaR4 {
    testo: string
    allegati: AllegatoDellaBollaR4[]
}

const it = allegati.it as Record<string, string>
const en = allegati.en as Record<string, string>
const conValori = (frase: string, valori: Record<string, string>) => frase.replace(/\{(\w+)\}/gu, (tutto, k: string) => (k in valori ? valori[k] : tutto))
/** `perIlModello` (C09, owner 03/10 e 10/10): le righe per il MODELLO sono sempre in inglese, qualunque sia la lingua dell'interfaccia. */
const perIlModello = (chiave: string, valori: Record<string, string> = {}) => conValori(en[`attachments.${chiave}`], valori)
/** `TETTO_TESTO_ALLEGATO`: ~5k token; oltre, una pagina sola mangerebbe mezza finestra. */
const TETTO_TESTO_ALLEGATO = 20_000

/** Le frasi che dicono «descrivi l'immagine» quando la persona ha mandato solo immagini: nella bolla non si mostrano. */
export const FRASI_SOLO_IMMAGINE_R4: readonly string[] = Object.freeze([it['attachments.promptDescribeImage'], en['attachments.promptDescribeImage']])
const LINGUE = {
    intestazioni: [en['attachments.promptHeader'], it['attachments.promptHeader']],
    prefissiFile: [en['attachments.promptFileLine'], it['attachments.promptFileLine']].map((t) => t.replace('{percorso}', '')),
}

/** `testoConAllegati` (`legacy/app.js:26836`): il testo che parte per il modello. I file per percorso; quelli col testo, anche il testo. */
export function testoPerIlModelloR4(testo: string, voci: readonly AllegatoR4[]): string {
    if (voci.length === 0) return testo
    const righe: string[] = []
    const blocchi: string[] = []
    for (const a of voci) {
        if (a.tipo === 'immagine') continue
        if (a.contenuto) {
            const corpo = String(a.contenuto).slice(0, TETTO_TESTO_ALLEGATO)
            const tagliato = String(a.contenuto).length > TETTO_TESTO_ALLEGATO
            blocchi.push(`--- ${a.nome} (${a.assoluto || a.percorso || ''})${tagliato ? ` — ${perIlModello('promptTruncated', { n: TETTO_TESTO_ALLEGATO.toLocaleString('en-US') })}` : ''} ---\n${corpo}`)
            righe.push(`- ${a.nome}${(a.assoluto || a.percorso) ? ` (${a.assoluto || a.percorso})` : ''}`)
            continue
        }
        righe.push(`- ${perIlModello('promptFileLine', { percorso: a.assoluto || a.percorso || a.nome })}`)
    }
    if (!righe.length && !blocchi.length) return testo || perIlModello('promptDescribeImage')
    const testa = `${testo}\n\n${perIlModello('promptHeader')}\n${righe.join('\n')}`
    return blocchi.length ? `${testa}\n\n${blocchi.join('\n\n')}` : testa
}

/** `allegatiPerBolla`: la forma minima di un allegato non immagine per i chip (le immagini viaggiano già a parte, `immagini`). */
export function allegatiPerBollaR4(voci: readonly AllegatoR4[]): AllegatoDellaBollaR4[] {
    return voci
        .filter((a) => a && a.tipo !== 'immagine')
        .map((a) => ({
            ...(typeof a.tipo === 'string' ? { tipo: a.tipo } : {}),
            ...(typeof a.nome === 'string' && a.nome ? { nome: a.nome } : {}),
            ...((a.assoluto || a.percorso) ? { percorso: String(a.assoluto || a.percorso) } : {}),
            ...(Number.isSafeInteger(a.caratteri) && (a.caratteri as number) >= 0 ? { caratteri: a.caratteri } : {}),
        }))
        .filter((a) => a.nome || a.percorso)
}

/** `bollaDaInviare`: la bolla che accompagna un invio, solo quando ciò che la persona vede è diverso da ciò che parte per il modello. */
export function bollaDaInviareR4(mostra: string | null | undefined, perIlModelloTesto: string, voci: readonly AllegatoR4[]): BollaR4 | null {
    if (mostra === null || mostra === undefined || mostra === perIlModelloTesto) return null
    const testo = String(mostra)
    const file = allegatiPerBollaR4(voci)
    return testo.trim() === '' && file.length === 0 ? null : { testo, allegati: file }
}

const nomeDalPercorso = (percorso: string) => String(percorso).split(/[\\/]/u).pop() || String(percorso)

/** `bollaDaConsegna`: per le sessioni salvate senza bolla, il blocco degli allegati si stacca dal testo per il modello (IT ed EN). */
export function bollaDaConsegnaR4(consegna: unknown): BollaR4 | null {
    if (typeof consegna !== 'string' || consegna === '') return null
    for (const intestazione of LINGUE.intestazioni.filter(Boolean)) {
        const segno = `\n\n${intestazione}\n- `
        const dove = consegna.indexOf(segno)
        if (dove < 0) continue
        const righe = consegna.slice(dove + segno.length - 2).split('\n')
        const voci: AllegatoDellaBollaR4[] = []
        for (const riga of righe) {
            if (!riga.startsWith('- ')) break
            const corpo = riga.slice(2)
            const prefisso = LINGUE.prefissiFile.find((p) => p && corpo.startsWith(p))
            if (prefisso) { const percorso = corpo.slice(prefisso.length); voci.push({ tipo: 'file', nome: nomeDalPercorso(percorso), percorso }); continue }
            const conPercorso = /^(.*) \(([^()]*)\)$/u.exec(corpo)
            voci.push(conPercorso ? { tipo: 'file', nome: conPercorso[1], percorso: conPercorso[2] } : { tipo: 'file', nome: corpo })
        }
        if (voci.length) return { testo: consegna.slice(0, dove), allegati: voci }
    }
    return null
}

/**
 * `bollaPerLaRigiocata`: la bolla conservata se c'è, altrimenti quella ricostruita dal testo per il modello; le immagini del giro si
 * aggiungono ai chip. `null` = il testo così com'è (nessun allegato da staccare).
 */
export function bollaPerLaRigiocataR4({ bolla = null, consegna = '', immagini = [] }: { bolla?: unknown; consegna?: string; immagini?: readonly unknown[] }): { testo: string; allegati: unknown[] } | null {
    const conservata = bolla && typeof bolla === 'object' && typeof (bolla as BollaR4).testo === 'string' ? bolla as BollaR4 : null
    const base = conservata ?? bollaDaConsegnaR4(consegna)
    if (!base) return null
    return { testo: base.testo, allegati: [...(Array.isArray(base.allegati) ? base.allegati : []), ...(Array.isArray(immagini) ? immagini : [])] }
}

export const TIPI_IMMAGINE_R4: readonly string[] = Object.freeze(['image/png', 'image/jpeg', 'image/webp'])
export const MASSIMO_IMMAGINE_R4 = 5 * 1024 * 1024
/** `allegaFile` (`legacy/app.js:26997`): PNG, JPEG o WebP (`chat-image-attachments.mjs`), al massimo 5 MiB. */
export function controllaImmagineR4(tipo: string, byte: number): 'formato' | 'grande' | null {
    if (!TIPI_IMMAGINE_R4.includes(tipo)) return 'formato'
    return byte > MASSIMO_IMMAGINE_R4 ? 'grande' : null
}

/** A3: `MAX_CHAT_FILE_BYTES` del desktop (`chat-file-upload.mjs`) e `TETTI_ALLEGATI.caratteriPerAllegato` (`components/allegati.js`). */
export const MASSIMO_FILE_R4 = 25 * 1024 * 1024
export const CARATTERI_PER_ALLEGATO_R4 = 200_000
const ESTENSIONI_TESTO_ALLEGABILE = ['md', 'txt', 'json', 'jsonl', 'csv', 'log', 'yml', 'yaml', 'xml', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'sh', 'bat', 'ps1', 'ini', 'toml', 'html', 'css', 'svg']

/** `èTestoAllegabile` (`legacy/app.js:26992`): un file di testo viaggia col messaggio, col suo contenuto (BUG-20 del desktop). */
export function testoAllegabileR4(nome: string, tipo: string): boolean {
    if (/^text\//u.test(tipo) || tipo === 'application/json' || tipo === 'image/svg+xml') return true
    const punto = nome.lastIndexOf('.')
    return punto > 0 && ESTENSIONI_TESTO_ALLEGABILE.includes(nome.slice(punto + 1).toLowerCase())
}

/** Il costo nel chip di un file: sta in `costoFileR4.ts`, perché la lista dei messaggi è nel pacchetto d'avvio. */
export { costoDelFileR4 } from './costoFileR4'

/** Le parole degli allegati del desktop (`app.attachments.*`) nella lingua dell'interfaccia. */
export function testoAllegatiR4(chiave: string, lingua: string, valori: Record<string, string> = {}): string {
    const tabella = /^it(?:-|$)/iu.test(lingua) ? it : en
    return conValori(tabella[`attachments.${chiave}`] ?? en[`attachments.${chiave}`] ?? chiave, valori)
}
