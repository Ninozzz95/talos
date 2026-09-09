/**
 * ⭐⭐⭐ IL METRO CHE MANCAVA ALLA RIMISURA.
 *
 * ⛔ Memoria: «Sotto carico non CALA: OSCILLA — 19,3 <-> 13,6 tok/s, 9 salti in
 * 10 minuti, 55,7% in basso. Ne' `thermal` ne' la batteria lo vedono: il
 * segnale e' la zona termica del SoC, e si campiona DALL'HOST.»
 *
 * Sul OnePlus Pad 3 le zone sono 121, e quelle che contano sono otto per la
 * GPU (`gpuss-0..7`) piu' i cluster CPU (`cpuss-*`). Questo campiona dall'host
 * mentre una corsa gira sul dispositivo, e stampa una riga per campione.
 *
 * Uso:  node termica.mjs [secondi] [millisecondi-fra-campioni]
 * L'uscita e' TSV: si incolla accanto ai tok/s e si stratifica per banda.
 */
import { execFileSync } from 'node:child_process'

const ADB = 'C:/Users/Antonino/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const DURATA = Number(process.argv[2] ?? 60) * 1000
const PASSO = Number(process.argv[3] ?? 1000)

/* Una sola chiamata adb per campione: 121 letture in un giro di shell. */
const COMANDO = 'for z in /sys/class/thermal/thermal_zone*; do'
    + ' t=$(cat $z/type 2>/dev/null);'
    + ' case "$t" in gpuss*|cpuss*|skin*|shell*) echo "$t=$(cat $z/temp 2>/dev/null)";; esac;'
    + ' done'

const campiona = () => {
    const fuori = execFileSync(ADB, ['shell', COMANDO], { encoding: 'utf8', timeout: 8000 })
    const zone = {}
    for (const r of fuori.split('\n')) {
        const [n, v] = r.trim().split('=')
        if (n && v) zone[n] = Number(v) / 1000
    }
    return zone
}

const primo = campiona()
const nomi = Object.keys(primo).sort()
const gpu = nomi.filter((n) => n.startsWith('gpuss'))
const cpu = nomi.filter((n) => n.startsWith('cpuss'))

/* ⛔ Il tempo viene dall'orologio MONOTONO dell'host, non da Date.now(). */
const t0 = process.hrtime.bigint()
console.log(['ms', 'gpu_max', 'gpu_med', 'cpu_max', ...nomi].join('\t'))

const righe = []
const giro = () => {
    const ms = Number((process.hrtime.bigint() - t0) / 1000000n)
    let z
    try { z = campiona() } catch { return }
    const g = gpu.map((n) => z[n]).filter(Number.isFinite)
    const c = cpu.map((n) => z[n]).filter(Number.isFinite)
    const gMax = Math.max(...g)
    const gMed = g.reduce((a, b) => a + b, 0) / g.length
    righe.push(gMax)
    console.log([ms, gMax.toFixed(1), gMed.toFixed(1), Math.max(...c).toFixed(1),
        ...nomi.map((n) => (z[n] ?? NaN).toFixed(1))].join('\t'))
    if (ms < DURATA) setTimeout(giro, PASSO)
    else {
        const min = Math.min(...righe)
        const max = Math.max(...righe)
        console.error('')
        console.error('  campioni: ' + righe.length + ' · GPU min ' + min.toFixed(1)
            + ' °C · max ' + max.toFixed(1) + ' °C · escursione ' + (max - min).toFixed(1) + ' °C')
        console.error('  ⇒ ogni numero di prestazione va etichettato con la banda in cui e stato preso.')
    }
}
giro()
