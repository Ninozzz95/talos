#!/usr/bin/env node
/**
 * ⛔ K4-E (ledger `LEDGER-K4E-R4-NELLA-RELEASE-2026-10-17.md`; owner 17/10 «r4 al posto, il vecchio come ripiego»): l'APK FIRMATO della
 * release porta il server r4, al commit del tag. Gira nel workflow dopo la firma, come `verify-release-plugin-classes.mjs`: un APK
 * senza r4 aprirebbe a tutti il Codice vecchio in silenzio (il ripiego è per un guasto sul telefono, non per una release sbagliata).
 *
 * Uso da mobile/: node scripts/r4-mobile/verifica-r4-nell-apk.mjs <apk> <commit del tag>
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leggiUstar } from './archivio-r4.mjs'

export const ARCHIVIO_NELL_APK = 'assets/talos-r4/r4.tar'
export const PORTACHIAVI_NELL_APK = 'assets/talos-r4/portachiavi-android.mjs'
const MANIFESTO = 'manifesto-pacchetto-r4.json'
const SCHEMA = 'talos.mobile.kernel-r4-pacchetto.v1'

/**
 * `elenco`: i nomi dentro l'APK; `leggi(nome)`: i byte di uno; `commit`: quello del tag (anche abbreviato).
 * Torna `{ ok, errori, manifesto }`; ogni errore dice che cosa manca o non torna.
 */
export function verificaR4NellApk({ elenco, leggi, commit }) {
    const errori = []
    let manifesto = null
    if (!elenco.includes(PORTACHIAVI_NELL_APK)) errori.push(`manca ${PORTACHIAVI_NELL_APK}`)
    if (!elenco.includes(ARCHIVIO_NELL_APK)) {
        errori.push(`manca ${ARCHIVIO_NELL_APK}: la release è senza r4 (-PtalosR4Archivio)`)
    } else {
        const primo = leggiUstar(leggi(ARCHIVIO_NELL_APK)).find((v) => v.tipo === 'file')
        if (primo?.nome !== MANIFESTO) errori.push(`il primo file dell'archivio non è ${MANIFESTO}`)
        else {
            try { manifesto = JSON.parse(primo.dati.toString('utf8')) } catch { errori.push(`${MANIFESTO} non è JSON`) }
        }
    }
    if (manifesto) {
        if (manifesto.schema !== SCHEMA) errori.push(`schema del pacchetto «${manifesto.schema}», atteso ${SCHEMA}`)
        const atteso = String(commit ?? '').trim()
        if (!atteso) errori.push('commit atteso non dato')
        else if (typeof manifesto.commit !== 'string' || !manifesto.commit.startsWith(atteso)) {
            errori.push(`r4 è al commit ${String(manifesto.commit).slice(0, 12)} invece di ${atteso}`)
        }
        if (!manifesto.ptyAndroid?.sha256) errori.push('manca il pty per Android (ptyAndroid) nel manifesto')
        if (!Array.isArray(manifesto.file) || !manifesto.file.some((f) => f?.percorso === 'harness-ui/server.mjs')) errori.push('il manifesto non elenca harness-ui/server.mjs')
    }
    return { ok: errori.length === 0, errori, manifesto }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [apk, commit] = process.argv.slice(2)
    if (!apk || !commit) { console.error('uso: node scripts/r4-mobile/verifica-r4-nell-apk.mjs <apk> <commit del tag>'); process.exit(2) }
    const elenco = execFileSync('unzip', ['-Z1', apk], { encoding: 'utf8', maxBuffer: 1 << 26 }).split(/\r?\n/u).filter(Boolean)
    const leggi = (nome) => execFileSync('unzip', ['-p', apk, nome], { maxBuffer: 1 << 30 })
    const esito = verificaR4NellApk({ elenco, leggi, commit })
    if (!esito.ok) { for (const e of esito.errori) console.error(`::error::${e}`); process.exit(1) }
    console.log(`✓ r4 nell'APK al commit ${esito.manifesto.commit.slice(0, 12)} (pty ${esito.manifesto.ptyAndroid.sha256.slice(0, 12)})`)
}
