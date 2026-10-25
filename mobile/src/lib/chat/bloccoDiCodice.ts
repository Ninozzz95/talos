/**
 * Blocchi di codice: esportazione come file (bozzetto approvato dall'owner il 23/10/2026, specifica unica col desktop).
 * Funzioni pure: estensione, nome del file, contenuto. Le trappole vengono dalla ricerca del Desktop
 * (`RICERCA-BLOCCHI-CODICE-2026-10-23.md`): LibreChat `downloadFile.ts:81-85` (guardia `hasOwnProperty`, mai `in`, e la lingua
 * breve usata così com'è), Streamdown `utils.ts:74-76` (BOM per il CSV, «so Excel on Windows correctly detects the encoding»).
 */

/** Le sole eccezioni: per il resto una lingua breve e sicura È già la sua estensione (`go`, `rs`, `html`, `css`, `sql`…). */
const ESTENSIONI: Readonly<Record<string, string>> = {
    python: 'py', py: 'py', javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
    bash: 'sh', sh: 'sh', shell: 'sh', zsh: 'sh', powershell: 'ps1', ps1: 'ps1', ps: 'ps1',
    markdown: 'md', md: 'md', yaml: 'yml', yml: 'yml', rust: 'rs', golang: 'go', ruby: 'rb', kotlin: 'kt', csharp: 'cs',
    'c#': 'cs', cpp: 'cpp', 'c++': 'cpp', objectivec: 'm', perl: 'pl', haskell: 'hs', text: 'txt', plaintext: 'txt',
    plain: 'txt', console: 'txt', dockerfile: 'dockerfile', vue: 'vue', svelte: 'svelte', json: 'json', html: 'html',
}

export type TalosFormatoDelFile = 'lingua' | 'md' | 'txt'

/**
 * Formati che Windows esegue o apre come programma e che non sono script da leggere: come lingua di un recinto non hanno senso,
 * e come estensione renderebbero il testo un programma (Desktop 23-24/10, stesso elenco). Gli script (bat, ps1, js…) restano loro.
 */
const BINARIE: ReadonlySet<string> = new Set([
    'exe', 'com', 'scr', 'msi', 'msp', 'lnk', 'pif', 'cpl', 'dll', 'jar', 'appx', 'msix',
    'url', 'scf', 'inf', 'hta', 'application', 'gadget',
])

export function estensioneDellaLingua(lingua: string): string {
    const chiave = lingua.trim().toLowerCase()
    if (Object.prototype.hasOwnProperty.call(ESTENSIONI, chiave)) return ESTENSIONI[chiave]!
    // ECMAScript con la versione (es6, es2015, ES2020) è JavaScript (Desktop 24/10)
    if (/^es\d+$/.test(chiave)) return 'js'
    // la lingua con la versione attaccata è la lingua: python3.11 → py, html5 → html, css3 → css, c99 → c (Desktop 23-24/10)
    const senzaVersione = chiave.replace(/[\d.]+$/, '')
    if (senzaVersione !== chiave && /^[a-z]+$/.test(senzaVersione)) {
        if (Object.prototype.hasOwnProperty.call(ESTENSIONI, senzaVersione)) return ESTENSIONI[senzaVersione]!
        if (!BINARIE.has(senzaVersione)) return senzaVersione
    }
    if (BINARIE.has(chiave) || BINARIE.has(senzaVersione)) return 'txt'
    return /^[a-z0-9]{1,11}$/.test(chiave) ? chiave : 'txt'
}

/** Il nome che il modello scrive nella riga d'apertura: «python sync.py» oppure «title="sync.py"». Solo l'ultima parte del percorso. */
export function nomeDalRecinto(info: string): string | null {
    const titolo = /title\s*=\s*["']([^"']+)["']/i.exec(info)?.[1]
    const parole = info.trim().split(/\s+/)
    const candidato = titolo ?? (parole.length > 1 && /\.[A-Za-z0-9]{1,11}$/.test(parole[1]!) ? parole[1]! : null)
    if (!candidato) return null
    const base = candidato.split(/[\\/]/).pop() ?? ''
    return base || null
}

// CONIN$ e CONOUT$ sono riservati come CON (Desktop 24/10; Microsoft, «Naming Files, Paths, and Namespaces»)
const RISERVATI = /^(con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(\..*)?$/i

/**
 * Valido su Windows: niente `<>:"/\|?*` né caratteri di controllo o di formato, niente punti e spazi in fondo, nomi riservati
 * con `_`, ≤100 caratteri veri. I caratteri di formato (`\p{Cf}`) vanno via perché U+202E rovescia la lettura del nome
 * («photo‮gpj.exe» si legge «photoexe.jpg»); il taglio conta i caratteri con `Array.from`, così una emoji non si spezza
 * (revisione del Desktop, 23/10).
 */
export function nomeSicuro(nome: string): string {
    // eslint-disable-next-line no-control-regex
    let pulito = nome.replace(/\p{Cf}/gu, '').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '').replace(/[. ]+$/, '')
    if (RISERVATI.test(pulito)) pulito = `_${pulito}`
    const caratteri = Array.from(pulito)
    if (caratteri.length > 100) {
        const punto = pulito.lastIndexOf('.')
        const estensione = punto > 0 && pulito.length - punto <= 12 ? pulito.slice(punto) : ''
        pulito = caratteri.slice(0, 100 - Array.from(estensione).length).join('') + estensione
    }
    return pulito
}

/** Le estensioni che Windows esegue o apre come programma: dal modello passano solo se sono quelle della lingua dichiarata. */
const ESEGUIBILI: ReadonlySet<string> = new Set([
    'exe', 'com', 'scr', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'msi', 'msp', 'lnk', 'reg',
    'jar', 'pif', 'cpl', 'scf', 'url', 'msc', 'inf', 'dll',
])

function due(n: number): string {
    return String(n).padStart(2, '0')
}

/** Il nome del file da scaricare: quello del modello se c'è, altrimenti `talos-<lingua>-<AAAAMMGG-HHMM>`; l'estensione dal formato. */
export function nomeDelFile(info: string, lingua: string, ora: Date, formato: TalosFormatoDelFile): string {
    const estensione = formato === 'md' ? 'md' : formato === 'txt' ? 'txt' : estensioneDellaLingua(lingua)
    const delModello = nomeDalRecinto(info)
    if (delModello) {
        const punto = delModello.lastIndexOf('.')
        const radice = punto > 0 ? delModello.slice(0, punto) : delModello
        const finale = formato === 'lingua' && punto > 0 ? delModello : `${radice}.${estensione}`
        const sicuro = nomeSicuro(finale)
        // l'estensione si legge sul nome GIÀ ripulito: «setup.exe.» e i caratteri invisibili non aggirano il controllo
        const estensioneFinale = sicuro.includes('.') ? sicuro.slice(sicuro.lastIndexOf('.') + 1).toLowerCase() : ''
        const eseguibileEstranea = ESEGUIBILI.has(estensioneFinale) && estensioneFinale !== estensione
        if (sicuro && !sicuro.startsWith('.') && !eseguibileEstranea) return sicuro
    }
    const parolaLingua = (/^[a-z0-9]{1,20}$/.test(lingua.trim().toLowerCase()) && lingua.trim().toLowerCase()) || 'code'
    const quando = `${ora.getFullYear()}${due(ora.getMonth() + 1)}${due(ora.getDate())}-${due(ora.getHours())}${due(ora.getMinutes())}`
    return nomeSicuro(`talos-${parolaLingua}-${quando}.${estensione}`)
}

/**
 * Il testo del file, dal codice GREZZO: il .md in un recinto più lungo di ogni fila di apici interna, il .csv col BOM. Il BOM
 * segue il file FINALE (`nomeFile`, revisione del Desktop 23/10): anche un blocco «text dati.csv» diventa un .csv.
 */
export function contenutoDelFile(codice: string, lingua: string, formato: TalosFormatoDelFile, nomeFile?: string): string {
    if (formato === 'md') {
        const piuLunga = Math.max(0, ...[...codice.matchAll(/`+/g)].map((m) => m[0].length))
        const recinto = '`'.repeat(Math.max(3, piuLunga + 1))
        return `${recinto}${lingua.trim()}\n${codice}\n${recinto}\n`
    }
    const finale = nomeFile ?? `.${formato === 'lingua' ? estensioneDellaLingua(lingua) : formato}`
    if (/\.csv$/i.test(finale)) return `﻿${codice}`
    return codice
}

export function tipoDelContenuto(formato: TalosFormatoDelFile): string {
    return formato === 'md' ? 'text/markdown' : 'text/plain'
}

/** Le righe come le vede chi legge: l'a capo finale non apre una riga nuova. */
export function righeDelCodice(codice: string): number {
    if (!codice) return 0
    return codice.replace(/\n$/, '').split('\n').length
}

const NOMI_SCRITTI: Readonly<Record<string, string>> = {
    javascript: 'JavaScript', js: 'JavaScript', typescript: 'TypeScript', ts: 'TypeScript', tsx: 'TSX', jsx: 'JSX',
    csharp: 'C#', cpp: 'C++', 'c++': 'C++', powershell: 'PowerShell', ps1: 'PowerShell', golang: 'Go', objectivec: 'Objective-C',
    html: 'HTML', css: 'CSS', json: 'JSON', sql: 'SQL', xml: 'XML', yaml: 'YAML', yml: 'YAML', csv: 'CSV', php: 'PHP', svg: 'SVG',
    toml: 'TOML', md: 'Markdown', sh: 'Shell', py: 'Python',
}

/** Testo semplice non è una lingua: il titolo resta «Code · n lines», mai «Codice Text» in una frase italiana (Desktop 24/10). */
const SENZA_NOME: ReadonlySet<string> = new Set(['text', 'plain', 'plaintext', 'txt'])

/** Il nome della lingua come si scrive, per il titolo del menu ⋯ («Python code · 120 lines»). Vuoto se il blocco non ha lingua. */
export function nomeDellaLingua(lingua: string): string {
    const chiave = lingua.trim().toLowerCase()
    if (!chiave || SENZA_NOME.has(chiave)) return ''
    if (Object.prototype.hasOwnProperty.call(NOMI_SCRITTI, chiave)) return NOMI_SCRITTI[chiave]!
    return chiave.charAt(0).toUpperCase() + chiave.slice(1)
}
