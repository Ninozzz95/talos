#!/usr/bin/env node
/**
 * ⛔⛔ IL CONTROLLO PRE-VOLO DELLA CONSEGNA 0.1.17 / 0.1.18.
 *
 * ## Perché esiste
 *
 * Owner, 2026-08-20: «fai in modo che io debba mandare solo il brief e lui
 * faccia tutte le verifiche da solo, e che mi fermi se qualcosa non va prima
 * del lavoro; se è tutto a posto può andare da solo».
 *
 * ⛔ E perché serve DAVVERO, non per scrupolo: lo stesso giorno gli otto hook
 * che tengono in piedi le regole d'oro erano stati **cancellati** da una
 * scrittura che sostituiva invece di fondere. Gli hook continuavano a sparare
 * nella sessione aperta — la configurazione sta in memoria — e sarebbero
 * spariti alla prima sessione nuova, senza un errore da nessuna parte.
 *
 * Un ambiente rotto che sembra sano è il modo esatto in cui un agente lavora
 * per ore e produce lavoro da buttare.
 *
 * ## Come si legge l'esito
 *
 *   uscita 0  → tutto a posto, si può partire da soli
 *   uscita 1  → ⛔ qualcosa è rotto: NON si comincia, si avvisa l'owner
 *
 * ## Uso
 *
 *   node .claude/preflight-consegna.mjs          tutto, cancelli compresi
 *   node .claude/preflight-consegna.mjs --rapido salta i cancelli lunghi
 */
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const RADICE = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
const MOBILE = path.join(RADICE, 'mobile')
const RAPIDO = process.argv.includes('--rapido')

const guasti = []
const avvisi = []
const righe = []

function ok(cosa, dettaglio) { righe.push(['  ok  ', cosa, dettaglio ?? '']) }
function rotto(cosa, perche) { guasti.push({ cosa, perche }); righe.push(['  ⛔  ', cosa, perche]) }
function forse(cosa, perche) { avvisi.push({ cosa, perche }); righe.push(['  ~   ', cosa, perche]) }

/** Un comando che può fallire senza far esplodere il controllo. */
function prova(comando, opzioni = {}) {
    try {
        return {
            ok: true,
            uscita: execSync(comando, {
                cwd: opzioni.cwd ?? RADICE,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: opzioni.timeout ?? 60_000,
            }),
        }
    } catch (guasto) {
        return { ok: false, uscita: String(guasto.stdout ?? '') + String(guasto.stderr ?? ''), errore: guasto }
    }
}

/* ------------------------------------------------------------------ */
/* 1. LE OTTO GUARDIE — la cosa che si è davvero rotta                 */
/* ------------------------------------------------------------------ */

const ATTESI = [
    ['mai-push.mjs', 'il push, su qualunque remoto'],
    ['mai-perdere-lavoro.mjs', 'i comandi che cancellano lavoro'],
    ['cancelli.mjs', 'scrivere codice senza ricerca web (Regola Zero)'],
    ['typecheck-vero.mjs', 'il typecheck finto'],
    ['non-fermarti.mjs', 'fermarsi con una promessa o una domanda'],
    ['verifica-prima-di-chiudere.mjs', 'chiudere un turno senza aver provato'],
    ['dopo-la-compattazione.mjs', 'perdere i contratti dopo una compattazione'],
]

const impostazioni = path.join(RADICE, '.claude', 'settings.json')
if (!existsSync(impostazioni)) {
    rotto('.claude/settings.json', 'NON ESISTE: nessuna guardia è agganciata')
} else {
    let letto = null
    try { letto = JSON.parse(readFileSync(impostazioni, 'utf8')) } catch (guasto) {
        rotto('.claude/settings.json', 'JSON non valido: ' + guasto.message)
    }
    if (letto) {
        const agganciati = Object.values(letto.hooks ?? {})
            .flat()
            .flatMap((gruppo) => gruppo.hooks ?? [])
            .map((h) => String(h.command ?? ''))

        for (const [file, cosaImpedisce] of ATTESI) {
            const inConfig = agganciati.some((c) => c.includes(file))
            const suDisco = existsSync(path.join(RADICE, '.claude', 'hooks', file))
            if (!inConfig) rotto('guardia ' + file, 'NON agganciata — non impedirebbe più: ' + cosaImpedisce)
            else if (!suDisco) rotto('guardia ' + file, 'agganciata ma il file NON esiste su disco')
            else ok('guardia ' + file, cosaImpedisce)
        }

        const modo = letto.permissions?.defaultMode
        if (!modo) forse('permissions.defaultMode', 'assente: chiederà il permesso a ogni comando')
        else if (modo === 'bypassPermissions') rotto('permissions.defaultMode', 'bypassPermissions: nessuna rete, il classificatore non guarda più niente')
        else ok('permissions.defaultMode', modo + (modo === 'auto' ? ' — ogni comando passa dal classificatore' : ''))

        /*
         * ⛔ `hard_deny` è l'unico posto in cui un divieto NON si può aggirare:
         * lo schema lo definisce come «security boundaries that user intent does
         * NOT clear». Una regola in `deny` la si scavalca cambiando la forma del
         * comando; questa no. Se manca, il divieto più importante — mai spingere
         * — vale quanto un buon proposito.
         */
        const durissimi = letto.autoMode?.hard_deny ?? []
        if (modo === 'auto' && durissimi.length === 0) {
            rotto('autoMode.hard_deny', 'VUOTO in modalità auto: i divieti non sono invalicabili')
        } else if (durissimi.length > 0) {
            const testo = durissimi.join(' ')
            const mancanti = [
                ['git push', 'il push'],
                ['git tag', 'i tag'],
                ['gh release', 'le release'],
                ['.claude/hooks', 'spegnere le proprie guardie'],
            ].filter(([chiave]) => !testo.includes(chiave)).map(([, nome]) => nome)
            if (mancanti.length) rotto('autoMode.hard_deny', 'non copre: ' + mancanti.join(', '))
            else ok('autoMode.hard_deny', durissimi.length + ' confini invalicabili, guardie comprese')
        }

        // ⛔ I divieti che non devono mancare, per nome.
        const negati = (letto.permissions?.deny ?? []).join(' ')
        const tutti = negati + ' ' + durissimi.join(' ')
        for (const [chiave, nome] of [['git push', 'il push'], ['git tag', 'i tag'], ['gh release', 'le release']]) {
            if (tutti.includes(chiave)) ok('divieto ' + chiave, nome + ' è bloccato')
            else rotto('divieto ' + chiave, 'MANCA: ' + nome + ' non è bloccato')
        }
    }
}

/* ------------------------------------------------------------------ */
/* 2. I DOCUMENTI — la rotta, e i brief che non si inventano           */
/* ------------------------------------------------------------------ */

const consegna = path.join(RADICE, '.claude', 'CONSEGNA-0.1.17-0.1.18.md')
if (existsSync(consegna)) {
    const testo = readFileSync(consegna, 'utf8')
    ok('la consegna', testo.split('\n').length + ' righe')
    // ⛔ La rinumerazione è la cosa che si sbaglia il primo giorno.
    if (!testo.includes('0.1.17') || !testo.includes('0.1.18')) {
        rotto('la consegna', 'non nomina le versioni giuste: la rinumerazione manca')
    }
} else {
    rotto('la consegna', 'NON ESISTE: ' + consegna)
}

/*
 * ⛔⛔⛔ LA CONSEGNA DELLA SICUREZZA, e la sua CUSTODIA.
 *
 * Owner, 2026-08-21: prima la sicurezza, poi si torna alla 0.1.17.
 *
 * ⛔ Il documento della revisione descrive falle **non ancora chiuse di un
 * repository pubblico**. Se un giorno finisse dentro l'albero di git, la mappa
 * uscirebbe prima della toppa — e non se ne accorgerebbe nessuno, perché un
 * file in piu in una cartella non fa rumore.
 *
 * ⇒ Il pre-volo controlla DUE cose opposte, ed entrambe fermano il lavoro:
 * che il documento **ci sia** dov'e custodito, e che **non ci sia** nel repo.
 */
const sicurezza = path.join(RADICE, '.claude', 'CONSEGNA-REVIEW-SICUREZZA.md')
if (existsSync(sicurezza)) ok('la consegna sicurezza', readFileSync(sicurezza, 'utf8').split('\n').length + ' righe')
else rotto('la consegna sicurezza', 'NON ESISTE: ' + sicurezza)

const REVIEW = 'C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE/2026-08-21-code-review-indipendente-f77d9f2.md'
if (!existsSync(REVIEW)) {
    rotto('la review custodita', 'NON ESISTE: ' + REVIEW)
} else {
    const n = readFileSync(REVIEW, 'utf8').split('\n').length
    if (n < 3000) rotto('la review custodita', 'troppo corta: ' + n + ' righe, ne servivano almeno 3.000')
    else ok('la review custodita', n + ' righe, fuori dall albero di git')
}

/*
 * ⛔ Il verso contrario, ed e quello che protegge davvero: la revisione NON
 * deve essere entrata nel repo, ne come copia ne sotto un altro nome. Si
 * chiede a `git ls-files`, non a un elenco scritto a mano.
 */
try {
    const tracciati = execSync('git ls-files', { cwd: RADICE, encoding: 'utf8' })
        .split('\n')
        .filter((r) => /code-review|CODE_REVIEW/i.test(r))
    if (tracciati.length) rotto('la review NON e nel repo', 'TRACCIATA: ' + tracciati.join(', '))
    else ok('la review NON e nel repo', 'nessun file tracciato la contiene')
} catch (e) {
    forse('la review NON e nel repo', 'git ls-files non ha risposto: ' + (e?.message ?? e))
}

const RICERCHE = 'C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE'
const BRIEF = [
    ['2026-08-19-talos-llama-implementation-research-kickoff.md', 1500, '0.1.17 — motore su GPU'],
    ['2026-08-19-talos-personal-voice-engine-blueprint.md', 3000, '0.1.18 — voce personale'],
]
for (const [nome, minimo, cosa] of BRIEF) {
    const p = path.join(RICERCHE, nome)
    if (!existsSync(p)) { rotto('brief ' + cosa, 'NON ESISTE: ' + p); continue }
    const righeBrief = readFileSync(p, 'utf8').split('\n').length
    if (righeBrief < minimo) rotto('brief ' + cosa, 'troppo corto: ' + righeBrief + ' righe, ne servivano almeno ' + minimo)
    else ok('brief ' + cosa, righeBrief + ' righe')
}

/* ------------------------------------------------------------------ */
/* 3. LA MEMORIA — gli indici che si caricano da soli                  */
/* ------------------------------------------------------------------ */

const MEMORIA = 'C:/Users/Antonino/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory'
const indice = path.join(MEMORIA, 'MEMORY.md')
if (!existsSync(indice)) rotto('MEMORY.md', 'NON ESISTE: le regole vincolanti non si caricano')
else {
    const byte = readFileSync(indice, 'utf8').length
    // ⛔ Due tetti compilati dentro claude.exe: 200 righe e 25 KB, e oltre
    //   quelli il contenuto viene tagliato IN SILENZIO.
    const numeroRighe = readFileSync(indice, 'utf8').split('\n').length
    if (byte > 25_000 || numeroRighe > 200) rotto('MEMORY.md', 'oltre il tetto: ' + byte + ' byte / ' + numeroRighe + ' righe — verrebbe TAGLIATO in silenzio')
    else ok('MEMORY.md', byte + ' byte · ' + numeroRighe + ' righe (tetto 25.000 / 200)')
}
const lezioni = path.join(RADICE, '.claude', 'MEMORIA-LEZIONI.md')
if (existsSync(lezioni)) ok('MEMORIA-LEZIONI.md', 'il secondo indice c\'è')
else rotto('MEMORIA-LEZIONI.md', 'NON ESISTE: metà delle lezioni non si carica')

for (const nome of ['kickoff-motore-locale-gpu-016.md', 'voce-personale-blueprint-017.md']) {
    const p = path.join(MEMORIA, nome)
    if (!existsSync(p)) { rotto('memoria ' + nome, 'NON ESISTE'); continue }
    const testo = readFileSync(p, 'utf8')
    if (!testo.includes('RINUMERAT')) rotto('memoria ' + nome, 'manca la nota della RINUMERAZIONE: il brief dentro dice la versione vecchia')
    else ok('memoria ' + nome, 'porta la nota della rinumerazione')
}

/* ------------------------------------------------------------------ */
/* 4. IL REPOSITORY — rami, remoti, albero                             */
/* ------------------------------------------------------------------ */

const stato = prova('git status --porcelain')
if (!stato.ok) rotto('git', 'non risponde in ' + RADICE)
else if (stato.uscita.trim()) forse('albero di lavoro', 'ci sono modifiche non committate:\n' + stato.uscita.trim().split('\n').slice(0, 5).map((r) => '        ' + r).join('\n'))
else ok('albero di lavoro', 'pulito')

const ramo = prova('git rev-parse --abbrev-ref HEAD')
if (ramo.ok) ok('ramo', ramo.uscita.trim())

const remoti = prova('git remote -v')
if (remoti.ok) {
    const testo = remoti.uscita
    const privato = testo.includes('agent-virtual-machine')
    const pubblico = testo.includes('/talos')
    if (privato) ok('remoto privato', 'agent-virtual-machine')
    else rotto('remoto privato', 'non trovato: siamo nel repository giusto?')
    if (pubblico) ok('remoto pubblico', 'talos — ⛔ i tag di release vanno SOLO lì, e non li fai tu')
    else forse('remoto pubblico', 'non configurato qui (non serve al tuo lavoro)')
}

/* ------------------------------------------------------------------ */
/* 5. IL DISPOSITIVO — che è tuo, per entrambe le release              */
/* ------------------------------------------------------------------ */

function adbPath() {
    if (process.env.TALOS_ADB) return process.env.TALOS_ADB
    const casa = process.env.LOCALAPPDATA ?? process.env.HOME ?? ''
    const candidato = path.join(casa, 'Android', 'Sdk', 'platform-tools', 'adb.exe')
    return existsSync(candidato) ? candidato : 'adb'
}

const ADB = adbPath()
try {
    const elenco = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8', timeout: 20_000 })
    const collegati = elenco.split('\n').filter((r) => /\sdevice(\s|$)/.test(r))
    if (collegati.length === 0) rotto('il Pad', 'nessun dispositivo collegato: niente si può chiudere senza')
    else {
        ok('il Pad', collegati[0].trim().split(/\s+/)[0])
        const pacchetti = execFileSync(ADB, ['shell', 'pm', 'list', 'packages', 'ai.talos'], { encoding: 'utf8', timeout: 20_000 })
        if (pacchetti.includes('package:ai.talos')) ok('ai.talos', 'installato')
        else rotto('ai.talos', 'NON installato sul dispositivo')

        // ⛔ La viewport si lascia sempre com'era: se la trovi alterata, qualcuno
        //   ha lasciato a metà un giro sulle quattro combinazioni.
        const dimensione = execFileSync(ADB, ['shell', 'wm', 'size'], { encoding: 'utf8', timeout: 20_000 })
        if (dimensione.includes('Override')) forse('viewport del Pad', 'ALTERATA: ' + dimensione.trim().replace(/\n/g, ' · ') + ' — serve `adb shell wm size reset`')
        else ok('viewport del Pad', dimensione.trim())
    }
} catch (guasto) {
    rotto('adb', 'non eseguibile: ' + String(guasto.message).split('\n')[0])
}

/* ------------------------------------------------------------------ */
/* 6. GLI ATTREZZI                                                     */
/* ------------------------------------------------------------------ */

if (!existsSync(path.join(MOBILE, 'package.json'))) rotto('mobile/', 'non trovato: siamo nella cartella giusta?')
else ok('mobile/', 'presente')

if (!existsSync(path.join(MOBILE, 'node_modules'))) rotto('node_modules', 'assenti: serve `npm ci` dentro mobile/')
else ok('node_modules', 'presenti')

const script = path.join(MOBILE, 'scripts', 'device.mjs')
if (existsSync(script)) ok('scripts/device.mjs', 'il telecomando del Pad c\'è')
else rotto('scripts/device.mjs', 'NON ESISTE: niente tocchi reali')

const gradlew = path.join(MOBILE, 'android', 'gradlew.bat')
if (existsSync(gradlew) || existsSync(path.join(MOBILE, 'android', 'gradlew'))) ok('gradlew', 'presente')
else rotto('gradlew', 'NON ESISTE in mobile/android')

/* ------------------------------------------------------------------ */
/* 7. I CANCELLI — lunghi, ma sono la verità                           */
/* ------------------------------------------------------------------ */

if (RAPIDO) {
    forse('i cancelli', 'SALTATI (--rapido): non sai se parti da un albero verde')
} else if (guasti.length > 0) {
    forse('i cancelli', 'saltati: c\'è già qualcosa di rotto sopra, si sistema quello prima')
} else {
    const inizio = Date.now()

    const tipi = prova('npm run typecheck', { cwd: MOBILE, timeout: 600_000 })
    if (tipi.ok) ok('typecheck', 'verde')
    else rotto('typecheck', 'ROSSO:\n' + tipi.uscita.split('\n').slice(-8).map((r) => '        ' + r).join('\n'))

    const suite = prova('npx vitest run', { cwd: MOBILE, timeout: 900_000 })
    const conto = /Tests\s+(\d+)\s+passed/.exec(suite.uscita)
    if (suite.ok) ok('suite', (conto ? conto[1] + ' test' : '') + ' verdi')
    else rotto('suite', 'ROSSA:\n' + suite.uscita.split('\n').filter((r) => /FAIL|×/.test(r)).slice(0, 6).map((r) => '        ' + r).join('\n'))

    const build = prova('npm run build', { cwd: MOBILE, timeout: 900_000 })
    const byte = /"initial_javascript_bytes":(\d+),"maximum_initial_javascript_bytes":(\d+)/.exec(build.uscita)
    if (build.ok && byte) ok('build', Number(byte[1]).toLocaleString('it-IT') + ' / ' + Number(byte[2]).toLocaleString('it-IT') + ' byte')
    else if (build.ok) ok('build', 'verde')
    else rotto('build', 'ROSSA:\n' + build.uscita.split('\n').slice(-6).map((r) => '        ' + r).join('\n'))

    righe.push(['      ', '(i cancelli hanno preso ' + Math.round((Date.now() - inizio) / 1000) + ' s)', ''])
}

/* ------------------------------------------------------------------ */
/* L'esito                                                             */
/* ------------------------------------------------------------------ */

const LARGA = Math.max(...righe.map(([, cosa]) => cosa.length))
console.log('')
console.log('  CONTROLLO PRE-VOLO — consegna 0.1.17 / 0.1.18')
console.log('  ' + '─'.repeat(LARGA + 40))
for (const [segno, cosa, dettaglio] of righe) {
    console.log(segno + cosa.padEnd(LARGA + 2) + dettaglio)
}
console.log('')

if (guasti.length > 0) {
    console.log('  ⛔ NON SI COMINCIA. ' + guasti.length + (guasti.length === 1 ? ' cosa è rotta' : ' cose sono rotte') + ':')
    for (const g of guasti) console.log('     · ' + g.cosa + ' — ' + g.perche.split('\n')[0])
    console.log('')
    console.log('  Dillo all\'owner con queste parole e ASPETTA. Un ambiente rotto che')
    console.log('  sembra sano è il modo esatto in cui si lavora ore per niente.')
    console.log('')
    process.exit(1)
}

if (avvisi.length > 0) {
    console.log('  ~ ' + avvisi.length + (avvisi.length === 1 ? ' avvertenza' : ' avvertenze') + ', non bloccanti:')
    for (const a of avvisi) console.log('     · ' + a.cosa + ' — ' + a.perche.split('\n')[0])
    console.log('')
}

console.log('  ✓ TUTTO A POSTO. Si può partire da soli.')
console.log('')
/*
 * ⛔ L'ORDINE È CAMBIATO IL 2026-08-21, per decisione dell'owner: prima la
 * sicurezza, e solo quando è stabile si torna alla 0.1.17 — che va chiusa
 * il prima possibile.
 *
 * ⛔ Questa riga sta QUI e non nella mia memoria: è l'ultima cosa che si legge
 * prima di cominciare, ed è il posto dove un ordine non si perde.
 */
console.log('  ⛔ PRIMA LA SICUREZZA. Ordine dell\'owner del 2026-08-21.')
console.log('')
console.log('  Il prossimo passo, e in questo ordine:')
console.log('    1. apri .claude/CONSEGNA-REVIEW-SICUREZZA.md, per intero')
console.log('    2. verifica la custodia:  sha256sum -c IMPRONTE.txt  in TALOS-RICERCHE')
console.log('    3. leggi la review custodita — TUTTA, non solo l\'indice dei rilievi')
console.log('    4. crea il ramo lane/sicurezza-review da lane/talos-mobile')
console.log('')
console.log('  Quando i rilievi critici sono chiusi e i cancelli sono verdi:')
console.log('    5. scrivi .claude/RITORNO-REVIEW-SICUREZZA.md e FERMATI')
console.log('    6. poi si riprende la 0.1.17 da .claude/CONSEGNA-0.1.17-0.1.18.md')
console.log('')
process.exit(0)
