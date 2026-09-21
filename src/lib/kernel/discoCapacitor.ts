import { Directory, Encoding } from '@capacitor/filesystem'
import type { TalosDisco, TalosVoceDisco } from '@/lib/kernel/fontiDisco'

/**
 * ⭐⭐⭐ IL DISCO DEL TELEFONO — l'unico file del kernel che sa di essere su Android.
 *
 * Tutto il resto è iniettabile apposta: il catalogo, i cancelli e le fonti non
 * nominano mai Capacitor. Qui si paga il conto una volta sola, e resta un file
 * corto abbastanza da leggerlo tutto.
 *
 * ## ⛔ Perché `Directory.Data` e non lo Storage Access Framework
 *
 * Un progetto di codice non è un documento: sono migliaia di file piccoli, letti
 * e riscritti in continuazione, con un `.git` che dev'essere sotto il controllo
 * di chi lavora. SAF dà un permesso su una cartella scelta dalla persona, ma
 * ogni accesso passa da un content provider — e su un albero di sorgenti quel
 * costo si moltiplica per il numero di file.
 *
 * ⇒ Lo spazio di lavoro sta nella cartella privata dell'app, dove TALOS ha un
 * filesystem vero. SAF resterà la porta per **portare dentro** e **portare
 * fuori** un progetto, non il posto dove ci si lavora.
 */

/** Il minimo indispensabile, dichiarato qui perché i test non montino Capacitor. */
export interface TalosPortaFilesystem {
    readdir(o: { path: string, directory?: Directory }): Promise<{
        files: ReadonlyArray<{ name: string, type: string, size?: number }>
    }>
    readFile(o: { path: string, directory?: Directory, encoding?: Encoding }): Promise<{ data: string | Blob }>
    writeFile(o: {
        path: string
        data: string
        directory?: Directory
        encoding?: Encoding
        recursive?: boolean
    }): Promise<unknown>
}

export interface TalosDiscoCapacitorOpzioni {
    filesystem: TalosPortaFilesystem
    /** La cartella dello spazio di lavoro, relativa a `directory`. */
    radice: string
    directory?: Directory
}

export function discoCapacitor(o: TalosDiscoCapacitorOpzioni): TalosDisco {
    const directory = o.directory ?? Directory.Data
    const radice = o.radice.replace(/\/+$/, '')
    const dentro = (percorso: string) => (percorso ? `${radice}/${percorso}` : radice)

    return {
        async elenca(cartella: string): Promise<readonly TalosVoceDisco[]> {
            const { files } = await o.filesystem.readdir({ path: dentro(cartella), directory })
            return files.map((f) => ({
                nome: f.name,
                cartella: f.type === 'directory',
                /*
                 * ⛔ `size` può mancare: su alcune piattaforme `readdir` non lo
                 * riporta. Zero è la scelta prudente — un file di dimensione
                 * ignota non deve far scattare il tetto e troncare un elenco
                 * che invece era leggibile per intero. Se poi è davvero enorme,
                 * lo scoprirà chi legge, e sarà un file illeggibile: circoscritto.
                 */
                byte: f.size ?? 0,
            }))
        },

        async leggi(percorso: string): Promise<string> {
            const { data } = await o.filesystem.readFile({
                path: dentro(percorso), directory, encoding: Encoding.UTF8,
            })
            /* Su nativo torna una stringa, sul web un Blob: entrambe le vie. */
            return typeof data === 'string' ? data : await data.text()
        },

        async scrivi(percorso: string, testo: string): Promise<void> {
            await o.filesystem.writeFile({
                path: dentro(percorso), directory, data: testo, encoding: Encoding.UTF8,
                /* Le cartelle intermedie possono non esistere ancora. */
                recursive: true,
            })
        },
    }
}
