/**
 * ⛔ Owner 26/10/2026: «dalla chat il file ordini dal pad si deve poter aprire se ci clicco sopra, come qualunque altro file sia su
 * mobile che su desktop». Il percorso di un allegato della persona da aprire con l'anteprima dell'albero (`GET /:id/tree/file`),
 * relativo alla radice della sessione; null = il chip resta un'etichetta.
 *
 * La regola del desktop (r4 7d1d3d7dd, `chipDegliAllegati`): dentro la cartella della sessione, relativo o assoluto sotto la radice
 * (maiuscole indifferenti); mai «..», «~», un segmento vuoto o un indirizzo web. Un relativo di UN segmento è un file vero alla radice
 * (o alla base) e si apre (revisione del Desktop 26/10); resta un'etichetta solo il chip senza percorso. `radice` null = sessione del
 * PC: il percorso assoluto del PC non arriva mai al dispositivo (`fileRemoti.ts`), quindi un assoluto non si può provare dentro.
 *
 * `base` (`RunStarted.contesto.cartellaBase`): la cartella di PARTENZA, dove stanno i file della chat, quando non è la radice dei
 * permessi (Accesso pieno da un progetto: radice = il disco). Un relativo si risolve sulla base e torna relativo alla radice, da cui
 * parte la rotta dell'albero; una base fuori dalla radice (la radice si è ristretta) non apre niente.
 */
export function percorsoApribileR4(percorso: string | undefined, radice: string | null, base: string | null = null): string | null {
    const grezzo = percorso?.trim().replace(/\\/gu, '/') ?? ''
    if (!grezzo) return null
    const unita = /^[A-Za-z]:\//u.test(grezzo)
    const assoluto = unita || grezzo.startsWith('/')
    // un indirizzo (`https:`, `file:`…), mai un'unità di Windows
    if (!unita && /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(grezzo)) return null
    let relativo = grezzo
    if (assoluto) {
        if (grezzo.startsWith('//') || radice === null) return null
        const r = normale(radice)
        if (!r || !dentro(grezzo, r)) return null
        relativo = grezzo.slice(r.length + 1)
    }
    const segmenti = relativo.split('/').filter((s, i) => !(s === '.' && i === 0))
    if (segmenti.length === 0 || segmenti.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('~'))) return null
    if (assoluto || base === null || radice === null) return segmenti.join('/')
    const r = normale(radice)
    const b = normale(base)
    if (b.toLowerCase() === r.toLowerCase()) return segmenti.join('/')
    if (!r || !dentro(b, r)) return null
    return [...b.slice(r.length + 1).split('/'), ...segmenti].join('/')
}

function normale(cartella: string): string {
    return cartella.trim().replace(/\\/gu, '/').replace(/\/+$/u, '')
}

/** `percorso` sta sotto `cartella`, seguita dal separatore («/wxy» non sta sotto «/w»). */
function dentro(percorso: string, cartella: string): boolean {
    return percorso.toLowerCase().startsWith(`${cartella.toLowerCase()}/`)
}
