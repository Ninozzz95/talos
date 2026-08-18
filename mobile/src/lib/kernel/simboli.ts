/**
 * ⭐⭐⭐ CHI DICHIARA UN NOME — l'estrattore, e sta dietro un caricamento pigro.
 *
 * ## ⛔ Perché non una ricerca testuale
 *
 * Un commento che nomina `scontoFedelta`, una stringa che lo contiene, una
 * chiamata a una funzione che non esiste: nessuna di queste **dichiara** niente.
 * Una `grep` le conta tutte, e il catalogo direbbe «c'è» su un simbolo che non
 * c'è — che è esattamente il difetto che questo kernel esiste per impedire.
 *
 * ## ⛔ Perché non il compilatore TypeScript
 *
 * MISURATO: `typescript` pesa **23 MB** sul disco, e l'APK è già a 50. Fuori
 * discussione per un telefono.
 *
 * `@babel/parser` invece: **501 KB di sorgente, 98 KB compressi** — ed è già
 * fra le dipendenze transitive, quindi non aggiunge un pacchetto nuovo.
 *
 * ⛔ E si carica **solo quando serve**: `import()` dinamico, così chi non apre
 * mai la sezione codice non paga un byte. La misura che conta non è quanto pesa
 * la libreria, è quanto pesa **all'avvio** — e all'avvio pesa zero.
 */

/** Le estensioni che sappiamo davvero leggere. Le altre sono `nonSupportato`. */
export const ESTENSIONI_SORGENTE = Object.freeze(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.mts', '.cts'])

export type TalosCoperturaFile =
    | 'completa'
    /** Il file non si lascia leggere come sorgente: parse rotto, tipi in un `.js`. */
    | 'sorgenteInvalida'
    /** Un'estensione che non sappiamo trattare. */
    | 'nonSupportato'

export interface TalosDichiarazioni {
    copertura: TalosCoperturaFile
    nomi: ReadonlySet<string>
    /** Perché non è `completa`, quando non lo è — serve alla diagnosi, non all'utente. */
    perche?: string
}

/*
 * ⛔ Il parser si tiene fra una chiamata e l'altra: caricarlo per ogni file
 * significherebbe risolvere un modulo per ogni sorgente di un progetto.
 */
let parserCaricato: typeof import('@babel/parser') | null = null

export async function caricaParser() {
    if (!parserCaricato) parserCaricato = await import('@babel/parser')
    return parserCaricato
}

/** ⛔ Solo per i test: rimette il caricamento pigro allo stato iniziale. */
export function dimenticaParser() {
    parserCaricato = null
}

const estensioneDi = (nome: string) => {
    const punto = nome.lastIndexOf('.')
    return punto < 0 ? '' : nome.slice(punto).toLowerCase()
}

/** Il file parla TypeScript, o JavaScript puro? Lo decide l'estensione. */
export function eTypeScript(nomeFile: string) {
    return ['.ts', '.tsx', '.mts', '.cts'].includes(estensioneDi(nomeFile))
}

/**
 * I nomi **dichiarati** da un sorgente, e con che copertura.
 *
 * ⛔⛔ La lingua si dichiara al parser. Un `.mjs` con `function a(x: number)`
 * **non è JavaScript valido** — Node non lo caricherebbe — e leggerlo come se lo
 * fosse significa dichiarare di aver capito un file che il runtime rifiuta.
 * Quella è la stessa bugia del tri-stato, un piano più in basso.
 */
export async function dichiaratiIn(testo: string, nomeFile: string): Promise<TalosDichiarazioni> {
    const estensione = estensioneDi(nomeFile)
    if (!ESTENSIONI_SORGENTE.includes(estensione)) {
        return { copertura: 'nonSupportato', nomi: new Set(), perche: `estensione ${estensione || '(nessuna)'}` }
    }

    const parser = await caricaParser()
    let albero
    try {
        albero = parser.parse(testo, {
            sourceType: 'unambiguous',
            /*
             * ⛔ ESPLICITO anche se è già il valore predefinito, e una mutazione
             * l'ha confermato: mettendolo a `true` nessun test diventa rosso,
             * perché su un file davvero rotto babel lancia comunque.
             *
             * ⇒ Resta scritto per la stessa ragione per cui si dichiara
             * l'ambiente di un processo figlio invece di ereditarlo: il giorno
             * in cui babel cambia il predefinito, un parse parziale verrebbe
             * accettato in silenzio e il catalogo direbbe «ho letto tutto» su
             * mezzo file.
             */
            errorRecovery: false,
            plugins: [
                ...(eTypeScript(nomeFile) ? ['typescript' as const] : []),
                'jsx' as const,
                'decorators-legacy' as const,
            ],
        })
    }
    catch (errore) {
        /*
         * ⛔ Un parse rotto è `sorgenteInvalida`, e il caso più sottile è quello
         * che la ricerca segnala per primo: **un file temporaneamente invalido
         * mentre qualcuno lo sta scrivendo non rende assente ciò che contiene.**
         */
        return {
            copertura: 'sorgenteInvalida',
            nomi: new Set(),
            perche: errore instanceof Error ? errore.message.slice(0, 120) : 'parse fallito',
        }
    }

    const nomi = new Set<string>()
    const prendi = (nodo: { type?: string, name?: string, properties?: unknown[], elements?: unknown[], value?: unknown, argument?: unknown } | null | undefined) => {
        if (!nodo || typeof nodo !== 'object') return
        if (nodo.type === 'Identifier' && nodo.name) { nomi.add(nodo.name); return }
        // Destrutturazione: `const { a, b: c } = x`, `const [d] = y`, `...resto`
        if (nodo.type === 'ObjectPattern') { for (const p of nodo.properties ?? []) prendi(p as never); return }
        if (nodo.type === 'ArrayPattern') { for (const e of nodo.elements ?? []) prendi(e as never); return }
        if (nodo.type === 'ObjectProperty') { prendi(nodo.value as never); return }
        if (nodo.type === 'RestElement' || nodo.type === 'AssignmentPattern') { prendi((nodo.argument ?? (nodo as { left?: unknown }).left) as never); return }
    }

    const visita = (nodo: Record<string, unknown> | null | undefined) => {
        if (!nodo || typeof nodo !== 'object') return
        const tipo = nodo.type as string | undefined
        switch (tipo) {
            case 'FunctionDeclaration':
            case 'ClassDeclaration':
            case 'TSInterfaceDeclaration':
            case 'TSTypeAliasDeclaration':
            case 'TSEnumDeclaration':
            case 'TSModuleDeclaration':
                prendi(nodo.id as never)
                break
            case 'VariableDeclarator':
                prendi(nodo.id as never)
                break
            case 'ClassMethod':
            case 'ClassProperty':
            case 'TSDeclareMethod':
                prendi(nodo.key as never)
                break
        }
        for (const chiave of Object.keys(nodo)) {
            if (chiave === 'loc' || chiave === 'leadingComments' || chiave === 'trailingComments') continue
            const valore = nodo[chiave]
            if (Array.isArray(valore)) { for (const v of valore) visita(v as never) }
            else if (valore && typeof valore === 'object') visita(valore as never)
        }
    }
    visita(albero.program as never)

    return { copertura: 'completa', nomi }
}
