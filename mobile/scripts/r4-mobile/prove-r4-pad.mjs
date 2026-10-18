#!/usr/bin/env node
/**
 * ⛔ K4-A (ledger `LEDGER-K4-CANCELLO-PROVE-R4-2026-10-17.md`): le prove di r4 sul Pad, dal PC. Si fanno girare TUTTE (come K0) e si
 * confrontano con l'elenco scritto `attese-r4-pad.json` (`confronta-attese-r4.mjs`): il cancello è rosso per una rossa nuova e per
 * una riga dell'elenco che adesso passa.
 *
 * Sottocomandi (il Pad è quello di `ANDROID_SERIAL`; `ADB` sceglie l'eseguibile):
 *   prepara  --r4 <checkout r4> --commit <sha> --lavoro <cartella>   copia dal commit con le prove, node_modules linux-arm64, archivio
 *   lancia   --lavoro <cartella>                                       invia, estrae nel dominio dell'app, avvia in sottofondo sul Pad
 *   stato                                                              a che file è arrivato
 *   ritira   --lavoro <cartella>                                       porta sul PC `esiti/` (TAP e tabella)
 *   confronta --lavoro <cartella> [--attese <file>]                    il verdetto; uscita 0 solo se il cancello è verde
 *   proponi  --lavoro <cartella> --pin <sha> --uscita <file>           l'elenco proposto da un giro, da leggere riga per riga
 * Il PC non tocca `/data/local/tmp/talos` se non per i SUOI due file; nel Pad scrive solo in `files/kernel-r4-prova` dell'app.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { confrontaAtteseR4, esitiDaTabellaR4, proponiAtteseR4 } from './confronta-attese-r4.mjs'

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')
const PACCHETTO = 'ai.talos.dev'
const CARTELLA_PAD = `/data/data/${PACCHETTO}/files/kernel-r4-prova`
const TMP_PAD = '/data/local/tmp/talos'
const NOME_ARCHIVIO = 'r4-prove-k4.tar'
const NOME_LANCIATORE = 'prove-r4-pad.sh'
const COMUNI_NPM = ['--os=linux', '--cpu=arm64', '--ignore-scripts', '--no-audit', '--no-fund']
/** Su Windows il `tar` nel PATH può essere quello GNU di Git, che legge «C:» come un host remoto: si usa il bsdtar di sistema. */
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar'

const adb = process.env.ADB || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', 'adb.exe')
function esegui(comando, argomenti, opzioni = {}) {
    const r = spawnSync(comando, argomenti, { encoding: 'utf8', maxBuffer: 1 << 28, ...opzioni })
    if (r.error) throw new Error(`${comando} non parte: ${r.error.message}`)
    if (r.status !== 0) throw new Error(`${comando} ${argomenti.slice(0, 3).join(' ')} … uscito ${r.status}: ${(r.stderr || r.stdout || '').trim().slice(-600)}`)
    return r.stdout
}
const shellPad = (comando) => esegui(adb, ['shell', comando])
const comeApp = (comando) => shellPad(`run-as ${PACCHETTO} sh -c '${comando.replaceAll("'", "'\\''")}'`)
const npm = (argomenti, cartella) => esegui(process.platform === 'win32' ? 'npm.cmd' : 'npm', argomenti, { cwd: cartella, shell: process.platform === 'win32' })

function prepara({ r4, commit, lavoro }) {
    const copia = join(lavoro, 'r4')
    rmSync(copia, { recursive: true, force: true })
    mkdirSync(lavoro, { recursive: true })
    esegui(process.execPath, [join(MOBILE, 'scripts', 'kernel-r4', 'copia-r4.mjs'), '--r4', r4, '--commit', commit, '--uscita', copia, '--con-prove'])
    // le prove vogliono anche le dipendenze di sviluppo; per linux-arm64 come il pacchetto dell'app (`prepara-pacchetto-r4.mjs`)
    npm(['ci', ...COMUNI_NPM], join(copia, 'harness-ui'))
    npm(['install', '--no-package-lock', ...COMUNI_NPM], join(copia, 'context-engine'))
    const archivio = join(lavoro, NOME_ARCHIVIO)
    esegui(TAR, ['-cf', archivio, '-C', copia, '.'])
    writeFileSync(join(lavoro, 'pin.txt'), `${commit}\n`)
    console.log(`archivio pronto: ${archivio}`)
}

function lancia({ lavoro }) {
    const archivio = join(lavoro, NOME_ARCHIVIO)
    if (!existsSync(archivio)) throw new Error(`manca ${archivio}: prima «prepara»`)
    // ⛔ 18/10: dopo `adb install` il collegamento `codice-r4/bin/node` punta ancora all'APK di prima finché r4 non riparte; il giro
    // lanciato così ha dato 20 rosse false (ogni `node` da una shell usciva -1). Prima si avvia r4 nell'app, poi si lancia.
    try {
        comeApp(`test -e /data/data/${PACCHETTO}/files/codice-r4/bin/node`)
    } catch {
        throw new Error('il node di r4 sul Pad non esiste (APK appena installato?): avvia r4 nell\'app (apri il Codice), poi rilancia')
    }
    shellPad(`mkdir -p ${TMP_PAD}`)
    esegui(adb, ['push', archivio, `${TMP_PAD}/${NOME_ARCHIVIO}`])
    esegui(adb, ['push', join(QUI, NOME_LANCIATORE), `${TMP_PAD}/${NOME_LANCIATORE}`])
    shellPad(`chmod 644 ${TMP_PAD}/${NOME_ARCHIVIO} ${TMP_PAD}/${NOME_LANCIATORE}`)
    comeApp(`rm -rf ${CARTELLA_PAD} && mkdir -p ${CARTELLA_PAD} && tar -xf ${TMP_PAD}/${NOME_ARCHIVIO} -C ${CARTELLA_PAD}`)
    // solo i NOSTRI file: la cartella condivisa resta
    shellPad(`rm -f ${TMP_PAD}/${NOME_ARCHIVIO}`)
    const apk = shellPad(`pm path ${PACCHETTO}`).trim().split(/\r?\n/u)[0].replace(/^package:/u, '')
    const librerie = `${dirname(apk)}/lib/arm64`
    comeApp(`cp ${TMP_PAD}/${NOME_LANCIATORE} ${CARTELLA_PAD}/${NOME_LANCIATORE} && setsid nohup sh ${CARTELLA_PAD}/${NOME_LANCIATORE} ${librerie} ${CARTELLA_PAD} > ${CARTELLA_PAD}/lancio.log 2>&1 < /dev/null &`)
    // ⛔ 17/10: con `nohup … &` soltanto, la shell di adb restava attaccata al giro e il comando tornava a prove finite: `setsid` lo
    // stacca in una sessione sua, `< /dev/null` gli toglie l'ingresso di adb.
    console.log(`partito sul Pad (librerie ${librerie}); «stato» per l'avanzamento`)
}

function stato() {
    console.log(comeApp(`cat ${CARTELLA_PAD}/esiti/avanzamento.txt 2>/dev/null || echo «non ancora partito»`).trim())
}

function ritira({ lavoro }) {
    const uscita = join(lavoro, 'esiti')
    rmSync(uscita, { recursive: true, force: true })
    mkdirSync(uscita, { recursive: true })
    const tar = execFileSync(adb, ['exec-out', 'run-as', PACCHETTO, 'tar', '-cf', '-', '-C', CARTELLA_PAD, 'esiti'], { maxBuffer: 1 << 30 })
    writeFileSync(join(lavoro, 'esiti.tar'), tar)
    esegui(TAR, ['-xf', join(lavoro, 'esiti.tar'), '-C', lavoro])
    console.log(`esiti in ${uscita}`)
}

function esitiDi(lavoro) {
    const cartella = join(lavoro, 'esiti')
    const leggi = (nome) => (existsSync(join(cartella, nome)) ? readFileSync(join(cartella, nome), 'utf8') : '')
    return esitiDaTabellaR4(leggi('tabella.txt'), leggi)
}

function confronta({ lavoro, attese }) {
    const elenco = JSON.parse(readFileSync(attese ?? join(QUI, 'attese-r4-pad.json'), 'utf8'))
    const verdetto = confrontaAtteseR4({ esiti: esitiDi(lavoro), attese: elenco })
    writeFileSync(join(lavoro, 'verdetto.json'), `${JSON.stringify(verdetto, null, 2)}\n`)
    console.log(JSON.stringify(verdetto.conti))
    for (const x of verdetto.inattese) console.log(`ROSSA NUOVA  ${x.file} › ${x.prova ?? '(tutto il file)'} [${x.motivo}]`)
    for (const x of verdetto.vecchie) console.log(`RIGA VECCHIA ${x.file} › ${x.prova ?? '(tutto il file)'} [${x.motivo}]`)
    console.log(verdetto.ok ? 'CANCELLO VERDE' : 'CANCELLO ROSSO')
    process.exitCode = verdetto.ok ? 0 : 1
}

function proponi({ lavoro, pin, uscita }) {
    const proposta = proponiAtteseR4({ esiti: esitiDi(lavoro), pin })
    writeFileSync(uscita, `${JSON.stringify(proposta, null, 2)}\n`)
    const perCausa = {}
    for (const v of proposta.voci) perCausa[v.causa] = (perCausa[v.causa] ?? 0) + 1
    console.log(JSON.stringify({ voci: proposta.voci.length, perCausa }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const arg = (nome) => { const i = process.argv.indexOf(`--${nome}`); return i > 0 ? process.argv[i + 1] : undefined }
    const opzioni = { r4: arg('r4'), commit: arg('commit'), lavoro: arg('lavoro') && resolve(arg('lavoro')), attese: arg('attese'), pin: arg('pin'), uscita: arg('uscita') }
    const comandi = { prepara, lancia, stato, ritira, confronta, proponi }
    const comando = comandi[process.argv[2]]
    if (!comando) { console.error(`sottocomando sconosciuto: ${process.argv[2] ?? '(nessuno)'} — ${Object.keys(comandi).join(', ')}`); process.exit(2) }
    try { comando(opzioni) } catch (e) { console.error(e.message); process.exit(1) }
}
