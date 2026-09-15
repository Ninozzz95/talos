/**
 * Il formato di un backup TALOS — dichiarato, versionato e verificabile.
 *
 * ## Perché esiste, e perché adesso
 *
 * La chiave di firma dell'APK è persa (debito aperto). Rifarla significa un
 * pacchetto che non può aggiornare quello installato: si disinstalla, e con
 * l'app se ne vanno chat, Libreria, memorie e chiavi. L'owner ha detto prima
 * «non è un problema» e subito dopo si è corretto: **«dobbiamo usare un metodo
 * di export»**. Aveva ragione la seconda volta.
 *
 * ## Cosa dev'essere, per essere utile
 *
 * 1. **Completo.** Un backup che salva le chat e perde la Libreria è un backup
 *    che scopri incompleto il giorno in cui serve.
 * 2. **Portabile.** Deve aprirsi dopo una reinstallazione, cioè **senza** la
 *    chiave legata al Keystore di quel dispositivo. Quindi la protezione è una
 *    passphrase, non l'hardware.
 * 3. **Verificabile.** Ogni sezione porta il proprio conteggio e la propria
 *    impronta: al ripristino si controlla di aver riletto ciò che era stato
 *    scritto. È la stessa disciplina della postcondizione (D18) applicata al
 *    backup — «l'ho riaperto» invece di «l'ho scritto».
 * 4. **Onesto su cosa contiene.** Il manifesto dice a chiare lettere se dentro
 *    ci sono le chiavi dei provider, perché un file che contiene chiavi non si
 *    manda in giro come un allegato qualunque.
 *
 * ## Come si batte quello che esiste
 *
 * Agora ha `.agora`: conversazioni, memorie, prompt, impostazioni **e chiavi**,
 * con strategie Merge/Replace/Skip e import dai formati di Claude e ChatGPT.
 * È la barra da superare, e la si supera su due cose che loro non hanno:
 *
 * - ⭐ **La provenienza.** Ogni file esportato porta con sé da dove veniva —
 *   quale chat, quale modello, quando. È la stessa regola che vale dentro
 *   l'app: i metadati sono dati, mai istruzioni.
 * - ⭐ **Il ripristino si annuncia prima.** Come il piano (D15): TALOS dice
 *   cosa sta per scrivere, quanto, e cosa sovrascriverà — e tu approvi. Un
 *   import che parte e basta è un piano approvato senza leggerlo.
 */

/** La versione del formato. Cambia solo quando cambia il significato di un campo. */
export const TALOS_BACKUP_FORMAT = 1

/**
 * Cosa può contenere un backup, sezione per sezione.
 *
 * ⛔ L'elenco è chiuso e ordinato: al ripristino le sezioni si scrivono in
 * QUESTO ordine, perché un messaggio senza la sua sessione è una riga orfana e
 * un allegato senza il suo file è un riferimento rotto.
 */
export const TALOS_BACKUP_SECTIONS = [
    'sessions',
    'messages',
    'attachments',
    'vaultFiles',
    'notes',
    'tasks',
    'memories',
    'researchRuns',
    'providerKeys',
    'settings',
] as const

export type TalosBackupSection = typeof TALOS_BACKUP_SECTIONS[number]

/**
 * Le sezioni che contengono SEGRETI.
 *
 * Servono a due cose: a chiedere la passphrase senza discutere, e a dirlo nel
 * manifesto. Un backup che contiene chiavi e non lo dichiara è una trappola per
 * chi lo appoggia su un cloud.
 */
export const TALOS_BACKUP_SECRET_SECTIONS: readonly TalosBackupSection[] = [
    'providerKeys',
]

export interface TalosBackupSectionRecord {
    /** Quante righe. Al ripristino si conta di nuovo e si confronta. */
    readonly count: number
    /**
     * SHA-256 del contenuto canonico della sezione.
     *
     * Non è una firma — non c'è nessuno da autenticare — ed è per questo che si
     * chiama impronta: dice se il file è arrivato intero, non chi l'ha scritto.
     */
    readonly digest: string
}

export interface TalosBackupManifest {
    readonly format: typeof TALOS_BACKUP_FORMAT
    /** La build che ha scritto il backup: un ripristino incompatibile deve saperlo. */
    readonly appBuild: string
    readonly createdAt: string
    /** Il dispositivo di origine, per nome commerciale. Nessun identificativo. */
    readonly deviceModel: string | null
    /**
     * ⛔ Dichiarato, sempre: dentro ci sono segreti?
     *
     * Se `true`, il file va trattato come una chiave. L'app lo dice all'export e
     * lo ripete all'import.
     */
    readonly containsSecrets: boolean
    readonly sections: Readonly<Partial<Record<TalosBackupSection, TalosBackupSectionRecord>>>
}

/** Come si comporta il ripristino quando trova qualcosa che esiste già. */
export type TalosBackupStrategy =
    /** Tiene ciò che c'è e aggiunge solo ciò che manca. Il default. */
    | 'merge'
    /** Sostituisce l'esistente con la versione del backup. */
    | 'replace'
    /** Salta tutto ciò che esiste già, senza guardare quale sia più recente. */
    | 'skip'

/**
 * Cosa il ripristino STA PER fare, detto prima di farlo.
 *
 * ⭐ È il piano (D15) applicato al backup. Nessuno degli export in circolazione
 * lo fa: si preme «importa» e si scopre dopo cosa è cambiato. Qui prima si legge
 * il file, si contano le collisioni, e si mostra la riga per riga: quante ne
 * arrivano, quante ne esistono già, quante verranno sovrascritte.
 */
export interface TalosBackupRestorePlan {
    readonly manifest: TalosBackupManifest
    readonly strategy: TalosBackupStrategy
    readonly steps: readonly {
        readonly section: TalosBackupSection
        readonly incoming: number
        readonly alreadyPresent: number
        /** Quante righe verranno scritte davvero, con questa strategia. */
        readonly willWrite: number
        /** Quante verranno SOVRASCRITTE: è il numero che fa decidere. */
        readonly willOverwrite: number
    }[]
}

/**
 * Il piano di ripristino, calcolato — puro, quindi provabile senza dispositivo.
 *
 * `incoming` viene dal file, `alreadyPresent` da ciò che c'è sul dispositivo.
 * La funzione non tocca niente: dice soltanto cosa succederebbe.
 */
export function talosPlanRestore(
    manifest: TalosBackupManifest,
    presente: Readonly<Partial<Record<TalosBackupSection, number>>>,
    collisioni: Readonly<Partial<Record<TalosBackupSection, number>>>,
    strategy: TalosBackupStrategy,
): TalosBackupRestorePlan {
    const steps = TALOS_BACKUP_SECTIONS
        .filter((section) => manifest.sections[section] !== undefined)
        .map((section) => {
            const incoming = manifest.sections[section]?.count ?? 0
            const alreadyPresent = presente[section] ?? 0
            const scontro = Math.min(collisioni[section] ?? 0, incoming)
            /*
             * `merge` scrive le nuove e lascia stare le esistenti; `replace`
             * scrive tutto e sovrascrive le collisioni; `skip` scrive solo le
             * nuove — che sul conteggio coincide con merge, e differisce nel
             * fatto che merge può ancora aggiornare campi mancanti mentre skip
             * non tocca proprio la riga.
             */
            const willOverwrite = strategy === 'replace' ? scontro : 0
            const willWrite = strategy === 'replace' ? incoming : incoming - scontro
            return { section, incoming, alreadyPresent, willWrite, willOverwrite }
        })
    return { manifest, strategy, steps }
}

/** Il totale che si mostra sul pulsante: la somma non va ricalcolata a mano ogni volta. */
export function talosRestoreTotals(plan: TalosBackupRestorePlan): {
    willWrite: number
    willOverwrite: number
} {
    return plan.steps.reduce(
        (totale, passo) => ({
            willWrite: totale.willWrite + passo.willWrite,
            willOverwrite: totale.willOverwrite + passo.willOverwrite,
        }),
        { willWrite: 0, willOverwrite: 0 },
    )
}

/**
 * Un manifesto letto da un file, validato.
 *
 * ⛔ Fallisce CHIUSO: qualunque cosa non torni, il backup non si apre. Un file
 * di backup arriva dal disco, da un cloud, da una chat — cioè da fuori, come una
 * pagina web. Un import indulgente è una porta.
 */
export function talosParseBackupManifest(value: unknown): TalosBackupManifest | null {
    if (value === null || typeof value !== 'object') return null
    const record = value as Record<string, unknown>
    if (record.format !== TALOS_BACKUP_FORMAT) return null
    if (typeof record.appBuild !== 'string' || record.appBuild.length > 200) return null
    if (typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) return null
    if (!(record.deviceModel === null || typeof record.deviceModel === 'string')) return null
    if (typeof record.containsSecrets !== 'boolean') return null

    const grezze = record.sections
    if (grezze === null || typeof grezze !== 'object') return null
    const sections: Partial<Record<TalosBackupSection, TalosBackupSectionRecord>> = {}
    for (const [chiave, valore] of Object.entries(grezze as Record<string, unknown>)) {
        // Una sezione che non conosciamo non si ignora: il file è di un'altra
        // versione, e fingere di saperla leggere è il modo di perdere dati in
        // silenzio.
        if (!(TALOS_BACKUP_SECTIONS as readonly string[]).includes(chiave)) return null
        if (valore === null || typeof valore !== 'object') return null
        const sezione = valore as Record<string, unknown>
        if (typeof sezione.count !== 'number' || !Number.isInteger(sezione.count) || sezione.count < 0) return null
        if (typeof sezione.digest !== 'string' || !/^[0-9a-f]{64}$/.test(sezione.digest)) return null
        sections[chiave as TalosBackupSection] = { count: sezione.count, digest: sezione.digest }
    }

    return {
        format: TALOS_BACKUP_FORMAT,
        appBuild: record.appBuild,
        createdAt: record.createdAt,
        deviceModel: record.deviceModel,
        containsSecrets: record.containsSecrets,
        sections,
    }
}
