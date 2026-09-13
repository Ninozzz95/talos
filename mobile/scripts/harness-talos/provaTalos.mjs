import { mkdtempSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { talosLavora } from './talosHarness.mjs'

const B = 'C:/Users/Antonino/Desktop/projects/TALOS-BANCO'
const dove = mkdtempSync(join(tmpdir(), 'talos-prova-'))
cpSync(join(B, 'progetti', 'listino'), dove, { recursive: true })
cpSync(join(B, 'prove', 'sconto-a-scaglioni.test.mjs'), join(dove, 'test', 'sconto-a-scaglioni.test.mjs'))

const cred = async () => {
    const r = await fetch('https://openrouter.ai/api/v1/credits',
        { headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } })
    const d = (await r.json()).data
    return d.total_credits - d.total_usage
}
const consegna = 'Aggiungi a src/prezzo.mjs una funzione `scontoAScaglioni(centesimi, scaglioni)` '
    + 'dove `scaglioni` e un array di {da, percento} ordinato per `da` crescente: si applica la '
    + 'percentuale dello scaglione piu alto il cui `da` non supera `centesimi`. Se nessuno si '
    + 'applica, nessuno sconto. Esportala.'

const p = await cred()
const t0 = Date.now()
const esito = await talosLavora({
    cartella: dove, task: { consegna },
    modello: 'qwen/qwen3.7-flash', chiave: process.env.OPENROUTER_API_KEY,
})
const secondi = Math.round((Date.now() - t0) / 1000)
await new Promise((r) => setTimeout(r, 5000))
const q = await cred()

const scritto = existsSync(join(dove, 'src', 'prezzo.mjs'))
    && readFileSync(join(dove, 'src', 'prezzo.mjs'), 'utf8').includes('scontoAScaglioni')
const { spawnSync } = await import('node:child_process')
const test = spawnSync('npm test', { cwd: dove, shell: true, windowsHide: true })

console.log('')
console.log('  scritto      :', scritto ? 'SI' : 'no')
console.log('  npm test     :', test.status === 0 ? 'VERDE' : 'rosso (exit ' + test.status + ')')
console.log('  premesse neg.:', esito.premesseNegate)
console.log('  tempo        :', secondi + 's')
console.log('  costo        : $' + (p - q).toFixed(6))
console.log('  detto        :', JSON.stringify(String(esito.detto).slice(0, 140)))
rmSync(dove, { recursive: true, force: true })
