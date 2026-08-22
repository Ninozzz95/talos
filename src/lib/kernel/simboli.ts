/**
 * ⭐⭐⭐ CHI DICHIARA UN NOME — il livello SINTATTICO del catalogo.
 *
 * ## ⛔ Perché non una ricerca testuale
 *
 * Un commento che nomina `scontoFedelta`, una stringa che lo contiene, una
 * chiamata a una funzione che non esiste: nessuna di queste **dichiara** niente.
 * Una `grep` le conta tutte, e il catalogo direbbe «c'è» su un simbolo che non
 * c'è — che è esattamente il difetto che questo kernel esiste per impedire.
 *
 * ## ⛔⛔ E perché il compilatore TypeScript, dopo aver scelto babel
 *
 * La prima stesura usava `@babel/parser`, scelto su un numero **sbagliato**: 23
 * MB attribuiti a TypeScript. Quei 23 MB sono il pacchetto npm intero — `.d.ts`,
 * locali, `tsc`, `tsserver` — e **nulla di ciò viene spedito**. Il compilatore
 * spedibile è `typescript.js`: 8,7 MB grezzi, **1,57 MB compressi**, contro un
 * bundle di 7,0 MB e un'app che scarica già modelli da gigabyte.
 *
 * ⇒ Ma il peso non è nemmeno la ragione principale. Babel **non sa seguire gli
 * alias**: davanti a `export { conSconto as sconto }` direbbe che `sconto` non è
 * dichiarato in nessun file. È dichiarato — con un altro nome, e rinominato in
 * transito. Per una garanzia che deve reggere su progetti veri quella è una
 * risposta falsa, e il tri-stato non la salva: sarebbe un `ASSENTE` sicuro di sé.
 *
 * Il livello semantico sta in `semantica.ts`; qui c'è quello sintattico, che
 * risponde alla domanda più stretta e molto più a buon mercato: **questo nome è
 * dichiarato in QUESTO file?**
 *
 * ⛔ Il compilatore si carica pigro: chi non apre la sezione codice non paga un
 * byte. Provato — importandolo da codice d'app, il pezzo d'avvio non cambia e il
 * compilatore finisce in un pezzo separato.
 */

import type * as TS from 'typescript'

/** Le estensioni che sappiamo davvero leggere. Le altre sono `nonSupportato`. */
export const ESTENSIONI_SORGENTE = Object.freeze(['.mjs', '.js', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'])

export type TalosCoperturaFile =
    | 'completa'
    /** Il file non si lascia leggere come sorgente: parse rotto, tipi in un `.js`. */
    | 'sorgenteInvalida'
    /** Un'estensione che non sappiamo trattare. */
    | 'nonSupportato'

export interface TalosDichiarazioni {
    copertura: TalosCoperturaFile
    nomi: ReadonlySet<string>
    /** Perché non è `completa`, quando non lo è — per la diagnosi, non per l'utente. */
    perche?: string
}

/*
 * ⛔ Il compilatore si tiene fra una chiamata e l'altra: risolverlo per ogni file
 * significherebbe risolvere un modulo per ogni sorgente di un progetto.
 */
let compilatore: typeof TS | null = null

export async function caricaCompilatore(): Promise<typeof TS> {
    if (!compilatore) compilatore = (await import('typescript')).default ?? await import('typescript')
    return compilatore
}

/** ⛔ Solo per i test: rimette il caricamento pigro allo stato iniziale. */
export function dimenticaCompilatore() {
    compilatore = null
}

export function estensioneDi(nome: string) {
    const punto = nome.lastIndexOf('.')
    return punto < 0 ? '' : nome.slice(punto).toLowerCase()
}

/**
 * ⛔⛔ LA LINGUA SI DICHIARA AL PARSER, e senza costa un falso `ASSENTE`.
 *
 * `createSourceFile` senza `ScriptKind` parla **TypeScript** qualunque sia
 * l'estensione. Un `.mjs` con `function a(x: number)` verrebbe letto benissimo —
 * copertura completa, `ASSENTE` autorizzato — su un file che **Node non
 * caricherebbe nemmeno**.
 *
 * ⇒ Dichiarare di aver capito un file che il runtime rifiuta è la stessa bugia
 * del tri-stato, un piano più in basso.
 */
export function genereDi(ts: typeof TS, nomeFile: string): TS.ScriptKind {
    switch (estensioneDi(nomeFile)) {
        case '.ts': case '.mts': case '.cts': return ts.ScriptKind.TS
        case '.tsx': return ts.ScriptKind.TSX
        case '.jsx': return ts.ScriptKind.JSX
        default: return ts.ScriptKind.JS
    }
}

/** I nomi dichiarati da un sorgente, e con che copertura. */
export async function dichiaratiIn(testo: string, nomeFile: string): Promise<TalosDichiarazioni> {
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
        return {
            copertura: 'nonSupportato',
            nomi: new Set(),
            perche: `estensione ${estensioneDi(nomeFile) || '(nessuna)'}`,
        }
    }
    const ts = await caricaCompilatore()
    return dichiaratiConCompilatore(ts, testo, nomeFile)
}

/** La stessa cosa, quando il compilatore è già in mano — evita un `await` per file. */
export function dichiaratiConCompilatore(
    ts: typeof TS,
    testo: string,
    nomeFile: string,
): TalosDichiarazioni {
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
        return { copertura: 'nonSupportato', nomi: new Set(), perche: `estensione ${estensioneDi(nomeFile)}` }
    }

    const sorgente = ts.createSourceFile(
        nomeFile,
        testo,
        ts.ScriptTarget.Latest,
        true,
        genereDi(ts, nomeFile),
    )

    /*
     * ⛔ `parseDiagnostics` e non «ha lanciato un'eccezione»: il parser di
     * TypeScript è indulgente e produce un albero anche da un file rotto. Senza
     * questo controllo un file a metà modifica sembrerebbe letto benissimo, e
     * ciò che vi manca sarebbe dichiarato ASSENTE — mentre **un file
     * temporaneamente invalido non rende assente ciò che contiene**.
     */
    const rotture = (sorgente as TS.SourceFile & { parseDiagnostics?: readonly TS.Diagnostic[] })
        .parseDiagnostics ?? []
    if (rotture.length > 0) {
        return {
            copertura: 'sorgenteInvalida',
            nomi: new Set(),
            perche: `${rotture.length} errori di sintassi`,
        }
    }

    /*
     * ⛔⛔ E il parser NON BASTA per i file JavaScript. `ScriptKind.JS` non rende
     * `parseDiagnostics` sensibile alle annotazioni di tipo: quel controllo lo fa
     * il checker, che è un'altra fase e un altro costo. Misurato: zero
     * diagnostiche con entrambi i generi.
     *
     * ⇒ Si guarda l'albero: nodi che in JavaScript **non esistono** dentro un
     * file JavaScript significano che quel file non è valido nella sua lingua.
     */
    const genere = genereDi(ts, nomeFile)
    if (genere === ts.ScriptKind.JS || genere === ts.ScriptKind.JSX) {
        const soloTypeScript = contieneCostruttiTypeScript(ts, sorgente)
        if (soloTypeScript) {
            return { copertura: 'sorgenteInvalida', nomi: new Set(), perche: 'costrutti TypeScript in un file JavaScript' }
        }
    }

    return { copertura: 'completa', nomi: raccogliDichiarazioni(ts, sorgente) }
}

/** ⛔ Un'annotazione di tipo su un nodo qualunque: in JavaScript non esiste. */
function tipoAnnotato(ts: typeof TS, nodo: TS.Node): boolean {
    const forse = (nodo as unknown as { type?: unknown }).type
    return forse !== undefined && typeof forse === 'object' && forse !== null
        && ts.isTypeNode(forse as TS.Node)
}

function contieneCostruttiTypeScript(ts: typeof TS, sorgente: TS.SourceFile): boolean {
    let trovato = false
    const visita = (nodo: TS.Node) => {
        if (trovato) return
        if (
            ts.isInterfaceDeclaration(nodo)
            || ts.isTypeAliasDeclaration(nodo)
            || ts.isEnumDeclaration(nodo)
            || ts.isModuleDeclaration(nodo)
            || ts.isAsExpression(nodo)
            || ts.isTypeAssertionExpression(nodo)
            || ts.isNonNullExpression(nodo)
            || ts.isTypeParameterDeclaration(nodo)
            || tipoAnnotato(ts, nodo)
        ) {
            trovato = true
            return
        }
        ts.forEachChild(nodo, visita)
    }
    ts.forEachChild(sorgente, visita)
    return trovato
}

function raccogliDichiarazioni(ts: typeof TS, sorgente: TS.SourceFile): Set<string> {
    const nomi = new Set<string>()

    const prendi = (nodo: TS.Node | undefined) => {
        if (!nodo) return
        if (ts.isIdentifier(nodo)) { nomi.add(nodo.text); return }
        if (ts.isObjectBindingPattern(nodo) || ts.isArrayBindingPattern(nodo)) {
            for (const el of nodo.elements) {
                if (!ts.isOmittedExpression(el)) prendi(el.name)
            }
        }
    }

    const visita = (nodo: TS.Node) => {
        if (ts.isFunctionDeclaration(nodo) || ts.isClassDeclaration(nodo)) prendi(nodo.name)
        else if (ts.isVariableDeclaration(nodo)) prendi(nodo.name)
        else if (
            ts.isTypeAliasDeclaration(nodo) || ts.isInterfaceDeclaration(nodo)
            || ts.isEnumDeclaration(nodo) || ts.isModuleDeclaration(nodo)
        ) prendi(nodo.name)
        else if (ts.isMethodDeclaration(nodo) || ts.isPropertyDeclaration(nodo)) prendi(nodo.name)
        /*
         * ⭐ E le RIESPORTAZIONI CON RINOMINA: `export { conSconto as sconto }`
         * dichiara il nome `sconto` in questo file, anche se la definizione sta
         * altrove. Un catalogo che le salta direbbe che `sconto` non esiste in
         * nessun file del progetto — ed è la risposta che ha fatto buttare la
         * versione a babel.
         */
        else if (ts.isExportSpecifier(nodo)) prendi(nodo.name)
        else if (ts.isImportSpecifier(nodo)) prendi(nodo.name)
        else if (ts.isImportClause(nodo)) prendi(nodo.name)
        else if (ts.isNamespaceImport(nodo)) prendi(nodo.name)
        ts.forEachChild(nodo, visita)
    }
    ts.forEachChild(sorgente, visita)
    return nomi
}
