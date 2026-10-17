/**
 * ⛔ K4-A (ledger `LEDGER-K4-CANCELLO-PROVE-R4-2026-10-17.md`; owner 14/10 «Prove rosse d'ambiente: elenco scritto nel mobile … il
 * cancello K4 fallisce se cade una prova NON in elenco»): il confronto fra gli esiti delle prove di r4 sul Pad e l'elenco scritto
 * (`attese-r4-pad.json`). Modello adattato da web-platform-tests (un problema è ogni esito diverso da quello scritto; più esiti =
 * intermittente) e da `xfail(strict=True)` di pytest (una riga che adesso passa fa fallire: l'elenco va ripulito). Niente adb qui:
 * solo testo in entrata, un verdetto in uscita.
 */
export const SCHEMA_ATTESE_R4 = 'talos.mobile.attese-r4.v1'

/**
 * Le cause d'ambiente già viste sul Pad (K0, giri 1-4: piano §«Risultati di K0»), con l'espressione che le riconosce nel perché di
 * una rossa. La prima che corrisponde vince: le più specifiche stanno prima. Una rossa che nessuna riconosce è «da-capire» e
 * blocca la validazione finché qualcuno non la legge.
 */
export const CAUSE_R4 = {
    'git-assente': { parole: 'git non c\'è sul telefono (fase a parte del Codice)', regola: /spawnSync git ENOENT|\bgit ENOENT|git: inaccessible or not found/u },
    'npm-assente': { parole: 'npm e npx non ci sono sul telefono', regola: /npm: inaccessible or not found|spawn npm ENOENT|\bnpm ENOENT|"npx" was not found/u },
    'ripgrep-assente': { parole: 'ripgrep non c\'è sul telefono (la ricerca ripiega sulla camminata JS)', regola: /ripgrep|@vscode\/ripgrep|shipped rg|\brg ENOENT/u },
    'shell-windows-wsl': { parole: 'la prova sceglie la shell Windows/WSL', regola: /COMMAND_ENVIRONMENT_UNSUPPORTED|Windows\/WSL shell/u },
    'casa-linux-wsl': { parole: 'la casa Linux in WSL esiste solo sul desktop', regola: /CASA_LINUX|wsl -d|disco di Windows/u },
    'llama-server-desktop': { parole: 'il motore dei modelli locali del desktop (llama-server, scaricamento diretto da Hugging Face): il mobile ha il suo', regola: /llama-server|modelPath must be absolute|direct transfer dependencies are invalid|RUNTIME_ARCH_UNSUPPORTED/u },
    'helper-allegati-windows': { parole: 'l\'aiuto degli allegati talos-chat-upload.exe è solo Windows', regola: /CHAT-FILES|talos-chat-upload|Upload helper|build-chat-upload-helper/u },
    'modulo-runtime-per-percorso': { parole: 'il modulo di runtime per percorso Windows scritto nella prova', regola: /runtime module must be an absolute path/u },
    'link-vietato': { parole: 'link() è vietato alle app Android (r4 ha il ripiego, la prova presume link)', regola: /EACCES: permission denied, link|expected: 'link'/u },
    'file-non-copiato': { parole: 'la prova legge un file che il pacchetto delle prove non porta', regola: /ERR_MODULE_NOT_FOUND|Cannot find module|scandir '[^']*context-engine\/tests'/u },
    'prova-che-lancia-prove': { parole: 'la prova lancia altre prove, che sul telefono sono rosse per l\'ambiente', regola: /ha test rossi nel figlio|Command failed: .*--test /u },
    // senza espressione: si danno a mano, riga per riga, dopo averle lette
    'watcher-linux': { parole: 'su Linux il watcher ricorsivo dei file è fatto da più watcher: la prova conta quelli di Windows', regola: /(?!)/u },
    'ripgrep-assente-cerca': { parole: 'senza ripgrep «cerca» sul telefono dà i nomi dei file e non le righe: la prova presume le righe', regola: /(?!)/u },
    'windows-nella-prova': { parole: 'la prova scrive un percorso o un comportamento di Windows', regola: /junction|reparse|NTFS|EXFAT|radice volume|must be an absolute|An explicit working folder is required|C:\\\\/u },
}
const DA_CAPIRE = 'da-capire'
const causaDi = (testo) => Object.entries(CAUSE_R4).find(([, c]) => c.regola.test(String(testo ?? '')))?.[0] ?? DA_CAPIRE

const RIGA_ESITO = /^( *)(not )?ok \d+ - (.*)$/u
const RIGA_SOTTOPROVA = /^( *)# Subtest: (.*)$/u
const DIRETTIVA = / # (SKIP|TODO)\b.*$/iu

/** Nel TAP di Node `#` e `\` nei nomi arrivano preceduti da `\`. */
const senzaFughe = (nome) => nome.replace(/\\([#\\])/gu, '$1')

/**
 * Le FOGLIE del TAP di `node --test` (un genitore che fallisce per i figli non è una prova in più), col nome dei genitori
 * (`genitore > figlio`), e i conti finali del runner. `completo` è falso se mancano i conti: il file si è fermato a metà.
 */
export function leggiTapR4(testo) {
    const righe = String(testo ?? '').split(/\r?\n/u)
    const genitori = []
    const prove = []
    let rientroPrima = -1
    const conti = {}
    /** Il blocco YAML che segue ogni esito (`---` … `...`): si salta, e per una rossa diventa il suo `dettaglio`. */
    let blocco = null
    let ultima = null
    for (const riga of righe) {
        if (blocco) {
            if (riga === `${blocco.rientro}...`) {
                if (blocco.prova) blocco.prova.dettaglio = blocco.righe.join('\n')
                blocco = null
            } else blocco.righe.push(riga.slice(blocco.rientro.length))
            continue
        }
        if (ultima && riga === `${ultima.rientro}---`) {
            blocco = { rientro: ultima.rientro, prova: ultima.prova?.esito === 'fail' ? ultima.prova : null, righe: [] }
            ultima = null
            continue
        }
        ultima = null
        const sotto = RIGA_SOTTOPROVA.exec(riga)
        if (sotto) {
            const livello = sotto[1].length / 4
            genitori.length = livello
            genitori[livello] = senzaFughe(sotto[2])
            continue
        }
        const esito = RIGA_ESITO.exec(riga)
        if (esito) {
            const rientro = esito[1].length
            const livello = rientro / 4
            // il risultato di un genitore arriva DOPO quelli dei figli, che hanno un rientro maggiore
            const genitore = rientroPrima > rientro
            rientroPrima = rientro
            if (genitore) { ultima = { rientro: `${esito[1]}  `, prova: null }; continue }
            const grezzo = esito[3]
            const direttiva = DIRETTIVA.exec(grezzo)?.[1]?.toUpperCase() ?? null
            const nome = senzaFughe(grezzo.replace(DIRETTIVA, ''))
            const prova = {
                nome: [...genitori.slice(0, livello), nome].join(' > '),
                esito: direttiva === 'SKIP' ? 'skip' : direttiva === 'TODO' ? 'todo' : esito[2] ? 'fail' : 'pass',
            }
            prove.push(prova)
            ultima = { rientro: `${esito[1]}  `, prova }
            continue
        }
        const conto = /^# (tests|pass|fail) (\d+)$/u.exec(riga)
        if (conto) conti[conto[1]] = Number(conto[2])
    }
    return { prove, conti, completo: Number.isInteger(conti.tests) }
}

/** Gli errori dell'elenco, in parole (vuoto se va bene). */
export function validaAtteseR4(attese) {
    const errori = []
    if (attese?.schema !== SCHEMA_ATTESE_R4) errori.push(`schema: atteso ${SCHEMA_ATTESE_R4}, trovato «${attese?.schema}»`)
    const cause = attese?.cause && typeof attese.cause === 'object' ? attese.cause : {}
    const viste = new Set()
    for (const [i, v] of (Array.isArray(attese?.voci) ? attese.voci : []).entries()) {
        if (typeof v?.file !== 'string' || !v.file) { errori.push(`voce ${i}: manca il file`); continue }
        if (v.prova !== null && typeof v.prova !== 'string') errori.push(`voce ${i}: «prova» è un nome o null (tutto il file)`)
        const esiti = [].concat(v.esito)
        if (!esiti.includes('fail') || esiti.some((e) => e !== 'fail' && e !== 'pass')) errori.push(`voce ${i}: esito «${v.esito}» non valido (fail, o [fail, pass] se intermittente)`)
        if (v.causa === DA_CAPIRE) errori.push(`voce ${i}: causa «${DA_CAPIRE}» (${v.file} › ${v.prova ?? '(tutto il file)'}): leggere la rossa e dare la causa`)
        else if (!Object.hasOwn(cause, v.causa)) errori.push(`voce ${i}: causa «${v.causa}» non dichiarata in «cause»`)
        const chiave = `${v.file}\u0000${v.prova}`
        if (viste.has(chiave)) errori.push(`voce ${i}: doppione di ${v.file} › ${v.prova ?? '(tutto il file)'}`)
        viste.add(chiave)
    }
    return errori
}

const intermittente = (voce) => Array.isArray(voce.esito) && voce.esito.includes('pass')

/**
 * Il verdetto del cancello. `esiti`: `[{ file, codice, scaduto, tap }]`, uno per file di prova lanciato sul Pad.
 * `ok` è vero solo se ogni rossa è in elenco e ogni riga dell'elenco è ancora rossa (o dichiarata intermittente).
 */
export function confrontaAtteseR4({ esiti, attese }) {
    const errori = validaAtteseR4(attese)
    if (errori.length) throw new Error(`elenco delle attese non valido: ${errori.join('; ')}`)
    const perFile = new Map()
    for (const v of attese.voci) perFile.set(v.file, [...(perFile.get(v.file) ?? []), v])
    const inattese = []
    const vecchie = []
    const intermittenti = []
    const conti = { file: esiti.length, prove: 0, verdi: 0, rosseAttese: 0, inattese: 0, vecchie: 0 }
    const lanciati = new Set()

    for (const e of esiti) {
        lanciati.add(e.file)
        const voci = perFile.get(e.file) ?? []
        const intera = voci.find((v) => v.prova === null) ?? null
        const singole = new Map(voci.filter((v) => v.prova !== null).map((v) => [v.prova, v]))
        const letto = e.scaduto ? null : leggiTapR4(e.tap)
        if (!letto?.completo) {
            if (!intera) inattese.push({ file: e.file, prova: null, motivo: e.scaduto ? 'scaduto' : 'senza-tap' })
            continue
        }
        const nomi = new Set(letto.prove.map((p) => p.nome))
        let rosse = 0
        for (const p of letto.prove) {
            conti.prove += 1
            const voce = singole.get(p.nome)
            if (p.esito === 'fail') {
                rosse += 1
                if (intera || voce) conti.rosseAttese += 1
                else inattese.push({ file: e.file, prova: p.nome, motivo: 'rossa' })
            } else if (p.esito === 'pass') {
                conti.verdi += 1
                if (voce && intermittente(voce)) intermittenti.push({ file: e.file, prova: p.nome })
                else if (voce) vecchie.push({ file: e.file, prova: p.nome, motivo: 'passa' })
            }
        }
        for (const [prova] of singole) if (!nomi.has(prova)) vecchie.push({ file: e.file, prova, motivo: 'assente' })
        if (rosse === 0 && e.codice !== 0 && !intera) inattese.push({ file: e.file, prova: null, motivo: `uscita-${e.codice}` })
        if (intera && rosse === 0 && e.codice === 0) {
            if (intermittente(intera)) intermittenti.push({ file: e.file, prova: null })
            else vecchie.push({ file: e.file, prova: null, motivo: 'passa' })
        }
    }
    for (const v of attese.voci) if (!lanciati.has(v.file)) vecchie.push({ file: v.file, prova: v.prova, motivo: 'non-lanciato' })
    conti.inattese = inattese.length
    conti.vecchie = vecchie.length
    return { ok: inattese.length === 0 && vecchie.length === 0, inattese, vecchie, intermittenti, conti }
}

/** Dalla `tabella.txt` del Pad (`file|uscita|pass|fail|saltate|secondi`) agli esiti; `leggi(nomeTap)` dà il TAP di quel file. */
export function esitiDaTabellaR4(tabella, leggi) {
    return String(tabella ?? '').split(/\r?\n/u).filter(Boolean).map((riga) => {
        const [file, codice, , , , secondi] = riga.split('|')
        const uscita = Number(codice)
        return { file, codice: uscita, scaduto: uscita === 124, secondi: Number(secondi), tap: leggi(`${file.replaceAll('/', '_')}.tap`) }
    })
}

/**
 * L'elenco PROPOSTO dagli esiti di un giro: ogni rossa con la causa riconosciuta nel suo perché, un file scaduto o rotto a file
 * intero. Va letto riga per riga prima di diventare `attese-r4-pad.json`: «da-capire» non passa la validazione.
 */
export function proponiAtteseR4({ esiti, pin }) {
    const voci = []
    for (const e of esiti) {
        const letto = e.scaduto ? null : leggiTapR4(e.tap)
        if (!letto?.completo) { voci.push({ file: e.file, prova: null, esito: 'fail', causa: e.scaduto ? DA_CAPIRE : causaDi(e.tap) }); continue }
        const rosse = letto.prove.filter((p) => p.esito === 'fail')
        for (const p of rosse) voci.push({ file: e.file, prova: p.nome, esito: 'fail', causa: causaDi(p.dettaglio) })
        if (rosse.length === 0 && e.codice !== 0) voci.push({ file: e.file, prova: null, esito: 'fail', causa: causaDi(e.tap) })
    }
    const usate = [...new Set(voci.map((v) => v.causa))].filter((c) => c !== DA_CAPIRE)
    return { schema: SCHEMA_ATTESE_R4, pin, cause: Object.fromEntries(usate.map((c) => [c, CAUSE_R4[c].parole])), voci }
}
