import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TalosDisco, TalosVoceDisco } from '@/lib/kernel/fontiDisco'

/**
 * ⭐⭐⭐ IL DISCO DEL BANCO — il gemello di `discoCapacitor`, su `node:fs`.
 *
 * ## Perché esiste, e perché la sua esistenza è la prova di una promessa
 *
 * Il kernel del codice è TypeScript puro su una **porta iniettata**: nove file,
 * e uno solo sa dove gira — `discoCapacitor.ts`, che parla Android. Il piano
 * lo dichiarava così: *«l'app gli passa il Filesystem di Capacitor, il banco
 * `node:fs`»*. ⇒ Questo file è la seconda metà di quella frase, ed è corto
 * perché la promessa era mantenuta: `TalosDisco` ha **tre metodi**.
 *
 * ⛔ Misurato il 2026-08-20 prima di scriverlo, invece di darlo per buono:
 * `agentLoop.ts` ha 3 import di **tipo** e **zero import di valore**, e degli
 * altri otto file del kernel nessuno nomina Capacitor. Non c'era niente da
 * portare: c'era solo da fornire l'altra implementazione.
 *
 * ## ⛔ Perché sta in `scripts/` e NON in `src/lib/kernel/`
 *
 * Perché importa `node:fs`. Un file dentro `src/` può essere importato da una
 * schermata per distrazione, e allora `node:fs` finisce nel grafo del bundle
 * mobile: nel migliore dei casi gonfia il pezzo iniziale — che ha un tetto di
 * 609.000 byte e il 2026-08-20 l'ho già sfondato una volta per **4.241 byte**
 * dovuti a un solo `import` — nel peggiore rompe la build.
 *
 * ⇒ Il disco del banco vive **col banco**. La regola non è scritta da nessuna
 * parte, è nel posto: da qui, importarlo dall'app non è una svista possibile.
 */
export interface TalosDiscoNodeOpzioni {
    /** La radice dello spazio di lavoro, come percorso assoluto. */
    radice: string
}

export function discoNode(o: TalosDiscoNodeOpzioni): TalosDisco {
    const radice = o.radice.replace(/[\\/]+$/, '')
    const dentro = (percorso: string) => (percorso ? join(radice, percorso) : radice)

    return {
        async elenca(cartella: string): Promise<readonly TalosVoceDisco[]> {
            const voci = await readdir(dentro(cartella), { withFileTypes: true })
            return Promise.all(voci.map(async (v): Promise<TalosVoceDisco> => {
                const cartellaVera = v.isDirectory()
                /*
                 * ⛔ Qui la taglia si CHIEDE, mentre su Android arriva già da
                 * `readdir`. È la differenza che rende utile avere due
                 * implementazioni invece di una astrazione sola: la porta è la
                 * stessa, il costo no. Su un albero grande questa è una `stat`
                 * per file, ed è il prezzo che `node:fs` chiede per un dato che
                 * l'altra piattaforma regala.
                 *
                 * ⛔ E si tratta l'errore come ZERO, non come un'eccezione: un
                 * file sparito fra `readdir` e `stat` — succede, e su Windows
                 * succede anche per un lock — non deve far fallire la lettura
                 * di tutto lo spazio di lavoro. Vedi la nota gemella in
                 * `discoCapacitor`: un elenco troncato costa più di un byte
                 * sbagliato.
                 */
                let byte = 0
                if (!cartellaVera) {
                    try { byte = (await stat(join(dentro(cartella), v.name))).size }
                    catch { byte = 0 }
                }
                return { nome: v.name, cartella: cartellaVera, byte }
            }))
        },

        async leggi(percorso: string): Promise<string> {
            return readFile(dentro(percorso), 'utf8')
        },

        async scrivi(percorso: string, testo: string): Promise<void> {
            /*
             * ⛔ Le cartelle intermedie possono non esistere: `discoCapacitor`
             * lo risolve con `recursive: true` sulla scrittura, `node:fs` vuole
             * il `mkdir` a parte. Stessa promessa, due modi di mantenerla.
             */
            await mkdir(dirname(dentro(percorso)), { recursive: true })
            await writeFile(dentro(percorso), testo, 'utf8')
        },
    }
}
