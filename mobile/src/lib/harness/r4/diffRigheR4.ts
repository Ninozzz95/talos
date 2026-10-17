/**
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): il diff dei file scritti, COPIA FISSATA di `legacy/app.js` del
 * desktop r4 @ 701c6c0d2 (provata contro il golden calcolato dal codice vero, `tests/fixtures/r4/revisione-golden-701c6c0d2.json`):
 *   · `RIGHE_MASSIME_DIFF` (:17558), `righeDelTesto`/`calcolaDiffRighe` (:17575-17600): LCS per righe, `null` oltre 1.500 righe;
 *   · `formattaRigheConNumero` (:17609-17617): numero della riga DOPO (una riga tolta non ne ha) e il segno, nel testo della riga;
 *   · `REGEX_SIMBOLI_TOP_LEVEL`/`simboliDichiarati`/`simboliSpariti` (:17852-17865): le funzioni e classi dichiarate a colonna zero
 *     che una riscrittura fa sparire (un avviso, non un blocco);
 *   · `contaDiff` di `components/review.js`: aggiunte e tolte contate dalle righe.
 * Senza testi: lo importa `pannelloR4.ts`, e le parole della Revisione stanno in `revisioneR4.ts`.
 */
export type TipoRigaDiffR4 = 'add' | 'del' | 'ctx'
export type RigaDiffR4 = [TipoRigaDiffR4, string]

export const RIGHE_MASSIME_DIFF_R4 = 1500

/** Le righe di un testo: `\r\n` come `\n`, un solo a-capo finale non è una riga, il testo vuoto non ha righe. */
export const righeDelTestoR4 = (testo: unknown): string[] => {
    const t = String(testo ?? '').replace(/\r\n/g, '\n').replace(/\n$/, '')
    return t === '' ? [] : t.split('\n')
}

/** Le righe del diff fra due testi (LCS); `null` oltre il tetto. */
export function calcolaDiffRigheR4(prima: unknown, dopo: unknown): RigaDiffR4[] | null {
    const a = righeDelTestoR4(prima)
    const b = righeDelTestoR4(dopo)
    if (a.length > RIGHE_MASSIME_DIFF_R4 || b.length > RIGHE_MASSIME_DIFF_R4) return null
    const n = a.length
    const m = b.length
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    const righe: RigaDiffR4[] = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (a[i] === b[j]) { righe.push(['ctx', a[i]]); i += 1; j += 1 } else if (lcs[i + 1][j] >= lcs[i][j + 1]) { righe.push(['del', a[i]]); i += 1 } else { righe.push(['add', b[j]]); j += 1 }
    }
    while (i < n) { righe.push(['del', a[i]]); i += 1 }
    while (j < m) { righe.push(['add', b[j]]); j += 1 }
    return righe
}

/** «   3 + testo»: il numero della riga nel file dopo (4 colonne; vuoto per una riga tolta) e il segno. */
export function formattaRigheConNumeroR4(righe: RigaDiffR4[]): RigaDiffR4[] {
    let numero = 0
    return righe.map(([tipo, testo]) => {
        if (tipo !== 'del') numero += 1
        const colNumero = tipo === 'del' ? ''.padStart(4) : String(numero).padStart(4)
        const marcatore = tipo === 'add' ? '+' : tipo === 'del' ? '-' : ' '
        return [tipo, `${colNumero} ${marcatore} ${testo}`]
    })
}

const REGEX_SIMBOLI_TOP_LEVEL = /^(?:export\s+)?(?:async\s+)?(?:def|class|function)\s+(\w+)/

function simboliDichiarati(testo: unknown): Set<string> {
    const trovati = new Set<string>()
    for (const riga of String(testo ?? '').split('\n')) {
        const m = REGEX_SIMBOLI_TOP_LEVEL.exec(riga)
        if (m) trovati.add(m[1])
    }
    return trovati
}

/** Le funzioni e classi dichiarate prima e non più dopo. */
export function simboliSparitiR4(prima: unknown, dopo: unknown): string[] {
    const dopoSet = simboliDichiarati(dopo)
    return [...simboliDichiarati(prima)].filter((nome) => !dopoSet.has(nome))
}

/** Righe aggiunte e tolte, contate dalle righe del diff. */
export function contaRigheDiffR4(righe: readonly RigaDiffR4[]): { aggiunte: number; rimozioni: number } {
    let aggiunte = 0
    let rimozioni = 0
    for (const [tipo] of righe) {
        if (tipo === 'add') aggiunte += 1
        else if (tipo === 'del') rimozioni += 1
    }
    return { aggiunte, rimozioni }
}
