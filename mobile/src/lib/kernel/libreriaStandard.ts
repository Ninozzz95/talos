import type { TalosLibreriaStandard } from '@/lib/kernel/semantica'

/**
 * ⭐ LA LIBRERIA STANDARD, caricata pigra come il compilatore.
 *
 * Senza di lei il cancello semantico **accusa codice sano**: `righe.length`
 * diventa *«Property 'length' does not exist on type '{}'»*, perché il
 * compilatore non sa che cosa sia un array. Trovato da un test, non da un
 * ragionamento.
 *
 * ## Perché ES2022 e non tutto
 *
 * Misurato: **25 KB compressi** per ES2022 e le sue basi (11 file), contro
 * **470 KB** per tutte e 99 le librerie di TypeScript. Le differenze stanno in
 * cose che un progetto vero raramente usa e che, se le usa, lo dichiara nel suo
 * `tsconfig` — e allora si carica quella.
 *
 * ⛔ E si tiene una MAPPA, non un elenco: il compilatore le chiede per nome, uno
 * alla volta, e non tutte.
 */

/** Le librerie che compongono ES2022, in ordine di dipendenza. */
export const CATENA_ES2022 = Object.freeze([
    'lib.es5.d.ts',
    'lib.es2015.d.ts',
    'lib.es2016.d.ts',
    'lib.es2017.d.ts',
    'lib.es2018.d.ts',
    'lib.es2019.d.ts',
    'lib.es2020.d.ts',
    'lib.es2021.d.ts',
    'lib.es2022.d.ts',
    'lib.decorators.d.ts',
    'lib.decorators.legacy.d.ts',
])

let inMano: TalosLibreriaStandard | null = null

/**
 * Costruisce la libreria da una funzione che sa leggere un file per nome.
 *
 * ⛔ La lettura arriva da FUORI di proposito: su un telefono i file non stanno su
 * un filesystem Node, e legarli a `node:fs` qui dentro renderebbe questo modulo
 * inutilizzabile proprio dove serve. Chi chiama sa da dove prenderli — dal
 * bundle, da una richiesta, da una cartella dell'app.
 */
export async function componiLibreria(
    leggi: (nome: string) => Promise<string | null>,
    nomi: readonly string[] = CATENA_ES2022,
): Promise<TalosLibreriaStandard> {
    const file = new Map<string, string>()
    for (const nome of nomi) {
        const testo = await leggi(nome)
        /*
         * ⛔ Un file che manca NON ferma tutto: la garanzia si restringe a ciò
         * che le librerie caricate coprono, e questo è meglio di nessun
         * cancello. Ma chi chiama può contare `file.size` e accorgersene.
         */
        if (testo !== null) file.set(nome, testo)
    }
    return { predefinita: 'lib.es2022.d.ts', file }
}

/** ⛔ Solo per i test: dimentica la libreria già composta. */
export function dimenticaLibreria() {
    inMano = null
}

/**
 * La libreria, composta una volta sola.
 *
 * ⛔ Si tiene fra una chiamata e l'altra: ricomporla per ogni cancello
 * significherebbe rileggere 236 KB a ogni modifica proposta.
 */
export async function libreriaStandard(
    leggi: (nome: string) => Promise<string | null>,
): Promise<TalosLibreriaStandard> {
    if (!inMano) inMano = await componiLibreria(leggi)
    return inMano
}
