import { Capacitor } from '@capacitor/core'

/**
 * ⭐⭐⭐ LA SONDA DEL KERNEL — l'unica cosa del kernel che non era mai girata
 * su un telefono.
 *
 * ## Perché esiste, e perché è una sonda e non un test
 *
 * Il kernel del codice — catalogo dei simboli, cancello semantico, mutazione —
 * è TypeScript puro su una **porta iniettata**: non nomina mai Capacitor, e i
 * suoi dodici file di prova girano in Node. ⛔ Ma il commit che l'ha collegato
 * chiude con «**NON VERIFICATO SU DISPOSITIVO**», e ha ragione: c'è un file
 * solo che sa di essere su Android, `discoCapacitor.ts`, e quello nessun test
 * in Node può misurarlo.
 *
 * ⇒ Quello che qui si prova non è il kernel: è **il confine**. Che il
 * filesystem vero si comporti come l'adattatore presume.
 *
 * ## ⛔ Le due domande, e nessuna delle due è accademica
 *
 * **1. La taglia c'è?** `discoCapacitor` la tratta come facoltativa e lo
 * dichiara: «`size` può mancare, su alcune piattaforme `readdir` non lo
 * riporta». La documentazione di `@capacitor/filesystem` dice il contrario —
 * in `FileInfo` solo `ctime` è opzionale. Uno dei due sbaglia, e se la taglia
 * mancasse venendo letta come enorme scatterebbe il tetto dei byte e l'elenco
 * verrebbe **troncato**: un elenco troncato fa perdere ogni `ASSENTE` del
 * progetto, cioè proprio la risposta per cui il catalogo esiste.
 *
 * **2. I file ci sono?** Cercato prima di scrivere questa sonda:
 * `capacitor-plugins#1940` riporta un `readdir` che **restituisce solo le
 * cartelle**, e `#1131` un `uri` che perde il nome del file. Sono difetti
 * dichiarati contro la stessa API. ⇒ Un adattatore che desse per scontato di
 * vedere i file leggerebbe un progetto vuoto e direbbe che nessun simbolo
 * esiste — la bugia peggiore che il catalogo possa dire.
 *
 * ⇒ Lo decide il telefono, non la documentazione.
 *
 * ## ⛔ La cartella la crea l'APP
 *
 * Non `adb`. Una cartella creata dalla shell nasce con modo 0770 e proprietario
 * `shell`: l'app è un altro UID e non la attraversa, quindi il file c'è,
 * l'impronta è giusta, e `isFile()` risponde falso. È una lezione già pagata.
 *
 * ## ⛔ Perché le etichette passano dal dizionario, e non erano così
 *
 * La prima versione le scriveva in italiano dentro questo file, con la scusa
 * che «la sonda descrive fatti misurati e ha senso solo per chi la sta
 * leggendo adesso». Falso, e smentito dal suo stesso aggancio: la sonda è
 * **permanente**, sta nella piega del Doctor che ogni persona può aprire, e
 * `Copia diagnostica` la spedisce dentro un rapporto condivisibile. A una
 * persona che usa l'app in inglese sarebbero arrivate quattro righe in
 * italiano — mentre ogni riga vicina passa da `t(labelKey)`.
 *
 * ⇒ Le etichette hanno una chiave. I **valori** restano com'erano di
 * proposito: sono cifre, oppure le parole del tipo del kernel — `completo`,
 * `troncato`, `presente`, `assente` — che sono il **dato**, non la prosa.
 * Tradurle nasconderebbe quale ramo ha risposto.
 */
export interface TalosKernelDoctorRow {
    id: string
    labelKey: string
    value: string
    ok: boolean
}

export async function talosKernelDoctorRows(): Promise<TalosKernelDoctorRow[]> {
    if (!Capacitor.isNativePlatform()) return []

    const righe: TalosKernelDoctorRow[] = []
    const radice = 'talos-sonda-kernel'

    try {
        const [
            { Filesystem, Directory, Encoding },
            { discoCapacitor },
            { fontiDaDisco },
            { costruisciCatalogo, risolviSimbolo },
        ] = await Promise.all([
            import('@capacitor/filesystem'),
            import('@/lib/kernel/discoCapacitor'),
            import('@/lib/kernel/fontiDisco'),
            import('@/lib/kernel/catalogo'),
        ])

        /*
         * Un progetto minuscolo ma VERO: due file, un simbolo dichiarato in uno
         * e assente dall'altro. È il caso più piccolo in cui il catalogo può
         * dire due delle sue tre risposte.
         */
        await Filesystem.mkdir({ path: `${radice}/src`, directory: Directory.Data, recursive: true })
            .catch(() => undefined)
        await Filesystem.writeFile({
            path: `${radice}/src/prezzo.ts`,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true,
            data: 'export function conSconto(centesimi: number): number {\n    return centesimi\n}\n',
        })
        await Filesystem.writeFile({
            path: `${radice}/src/vuoto.ts`,
            directory: Directory.Data,
            encoding: Encoding.UTF8,
            recursive: true,
            data: '// nessuna dichiarazione\n',
        })

        /* ── 1. ⛔ I FILE si vedono? Vedi `capacitor-plugins#1940`. */
        const elenco = await Filesystem.readdir({ path: `${radice}/src`, directory: Directory.Data })
        const file = elenco.files.filter((f) => f.type === 'file')
        righe.push({
            id: 'kernel-readdir-file',
            labelKey: 'doctor.kernelWorkspaceFiles',
            value: `${file.length}/${elenco.files.length}`,
            ok: file.length === 2,
        })

        /* ── 2. E la taglia c'è davvero, o l'adattatore ha ragione a temerla assente? */
        const conTaglia = file.filter((f) => typeof f.size === 'number' && f.size > 0)
        righe.push({
            id: 'kernel-readdir-size',
            labelKey: 'doctor.kernelFileSize',
            value: `${conTaglia.length}/${file.length}`,
            ok: file.length > 0 && conTaglia.length === file.length,
        })

        /* ── 3. Il disco e le fonti: l'albero si legge per intero? */
        const disco = discoCapacitor({ filesystem: Filesystem, radice, directory: Directory.Data })
        const fonti = fontiDaDisco(disco)
        const spazio = await fonti.leggiSpazio()
        const completo = spazio.elenco === 'completo'
        righe.push({
            id: 'kernel-lettura-spazio',
            labelKey: 'doctor.kernelWorkspaceRead',
            /*
             * ⛔ Quando è completo il valore è una CIFRA NUDA, come le righe
             * vicine («Modelli sul dispositivo — 0»). La prima versione
             * scriveva `2 · completo`, e a schermo in inglese quel `completo`
             * si leggeva come una parola non tradotta — lo stesso difetto che
             * questa sonda stava curando, rifatto in piccolo.
             *
             * ⇒ La parola resta solo nel caso ROTTO, dove la riga è rossa, sta
             * in cima, e chi la legge sta indagando: lì `troncato: <motivo>` è
             * una diagnosi, come il messaggio dell'errore nel `catch`.
             *
             * ⛔ `presente`/`assente` della riga dopo restano invece com'erano:
             * accostati al NOME del simbolo si leggono come coppia, cioè come
             * dato — e sono il vocabolario a tre stati del kernel.
             */
            value: completo
                ? `${spazio.sorgenti.length}`
                : `troncato: ${(spazio.elenco as { troncato: string }).troncato}`,
            /*
             * ⛔ Non basta che i file ci siano: l'elenco dev'essere COMPLETO.
             * Un elenco troncato produce numeri plausibili e toglie al catalogo
             * la sola risposta che nessun altro sa dare — «non c'è».
             */
            ok: spazio.sorgenti.length === 2 && completo,
        })

        /* ── 4. Il catalogo, nei DUE versi: ciò che c'è e ciò che non c'è. */
        // ⛔ L'elenco si PASSA: il catalogo deve sapere se ha visto tutto, o
        // dichiarerebbe `assente` avendo guardato solo una parte.
        const catalogo = await costruisciCatalogo(spazio.sorgenti, { elenco: spazio.elenco })
        const presente = risolviSimbolo(catalogo, 'conSconto', 'src/prezzo.ts')
        const assente = risolviSimbolo(catalogo, 'scontoFedelta', 'src/prezzo.ts')
        righe.push({
            id: 'kernel-catalogo',
            labelKey: 'doctor.kernelCatalogue',
            value: `conSconto: ${presente.stato} · scontoFedelta: ${assente.stato}`,
            ok: presente.stato === 'presente' && assente.stato === 'assente',
        })
    }
    catch (rotta) {
        /*
         * ⛔ Una sonda che si rompe DICE che si è rotta. Il silenzio di una
         * diagnostica è indistinguibile da un esito buono, ed è il modo in cui
         * un sottosistema spento passa per sano.
         */
        righe.push({
            id: 'kernel-sonda',
            labelKey: 'doctor.kernelProbe',
            value: rotta instanceof Error ? rotta.message : String(rotta),
            ok: false,
        })
    }
    finally {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')
        await Filesystem.rmdir({ path: radice, directory: Directory.Data, recursive: true })
            .catch(() => undefined)
    }

    return righe
}
