/**
 * Dalle righe grezze alla tabella — e senza perdere per strada la dispersione.
 *
 * Legge `runs.jsonl` e produce il riassunto per configurazione. ⛔ Non lo
 * SOSTITUISCE: le righe restano, e questo file non le tocca. Una mediana senza
 * i giri che l'hanno prodotta non si può rileggere, e su un telefono la
 * dispersione **è** il dato — un backend che vince in mediana e ha la coda
 * lunga è un backend che a volte fa aspettare.
 *
 * ## Perché mediana e MAD, non media e deviazione standard
 *
 * Su un telefono un giro può essere colpito da un'altra applicazione, dal
 * gestore termico o da una migrazione fra core. Sono eventi rari e grandi:
 * esattamente ciò che sposta una media e lascia ferma una mediana. La MAD
 * (deviazione assoluta mediana) è la stessa idea applicata alla dispersione.
 *
 * ⛔ E la regola del brief: se la dispersione relativa supera il **10%** fra i
 * giri validi, cinque giri non bastano — se ne fanno nove e si riporta
 * mediana + MAD + minimo + massimo. Qui la soglia non si applica in silenzio:
 * si SEGNALA, perché la decisione di rifare la corsa è di chi misura.
 *
 * ## Uso
 *
 *     node scripts/research/analyze-local-backend-matrix.mjs
 *     node scripts/research/analyze-local-backend-matrix.mjs percorso/runs.jsonl
 *     node scripts/research/analyze-local-backend-matrix.mjs --json
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(QUI, '..', '..')

const argomenti = process.argv.slice(2)
const comeJson = argomenti.includes('--json')
const percorso = resolve(
    MOBILE,
    argomenti.find((a) => !a.startsWith('--')) ?? '.tmp-research/local-backend/runs.jsonl')

if (!existsSync(percorso)) {
    process.stderr.write(
        `⛔ nessun file di misure in ${percorso}\n`
        + '   Lancia prima:  node scripts/research/run-device-tests.mjs '
        + 'ai.talos.TalosLocalBaselineDeviceTest\n')
    process.exit(1)
}

/**
 * ⛔ Una riga illeggibile si CONTA, non si salta in silenzio.
 *
 * Un file troncato a metà di una scrittura è normale se la corsa è stata
 * interrotta; fingere che non sia successo trasforma una corsa incompleta in
 * una corsa completa più piccola, che è la stessa cosa che mentire sul numero
 * dei giri.
 */
const righe = []
let illeggibili = 0
for (const testo of readFileSync(percorso, 'utf8').split('\n')) {
    const pulita = testo.trim()
    if (!pulita) continue
    try {
        righe.push(JSON.parse(pulita))
    } catch {
        illeggibili += 1
    }
}

const mediana = (valori) => {
    if (valori.length === 0) return null
    const ordinati = [...valori].sort((a, b) => a - b)
    const mezzo = Math.floor(ordinati.length / 2)
    return ordinati.length % 2 ? ordinati[mezzo] : (ordinati[mezzo - 1] + ordinati[mezzo]) / 2
}

/** Deviazione assoluta mediana: la dispersione che un giro storto non gonfia. */
const mad = (valori) => {
    const centro = mediana(valori)
    if (centro === null) return null
    return mediana(valori.map((v) => Math.abs(v - centro)))
}

const arrotonda = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100)

// ⛔ I giri di riscaldamento restano nel file e NON entrano nel riassunto.
// Sono la ragione per cui il file conserva `warmup`: escluderli senza dirlo
// renderebbe il conteggio dei giri diverso da quello del file.
const misurati = righe.filter((r) => r.warmup !== true)
const scartati = righe.length - misurati.length

/*
 * ⛔ Le righe `-summary` NON sono giri: sono aggregati che il test ha gia'
 * calcolato. Contarle come misure gonfia il numero dei giri e mescola una
 * mediana dentro l'insieme da cui e' stata ricavata.
 */
const aggregati = misurati.filter((r) => String(r.config ?? '').endsWith('-summary'))
const giri = misurati.filter((r) => !String(r.config ?? '').endsWith('-summary'))

const gruppi = new Map()
for (const riga of giri) {
    // ⛔ `phase` entra nella chiave: L0 e L1 sono due domande diverse, e
    // metterle nello stesso insieme produce una dispersione che descrive la
    // differenza fra le due invece del rumore dentro ciascuna.
    const fase = riga.phase ? `/${riga.phase}` : ''
    const chiave = `${riga.candidate ?? '?'}/${riga.backendRequested ?? '?'}/`
        + `${riga.config ?? '?'}${fase}`
    if (!gruppi.has(chiave)) gruppi.set(chiave, [])
    gruppi.get(chiave).push(riga)
}

const CAMPI = [
    ['wallMs', 'muro ms'],
    ['ttftMs', 'TTFT ms'],
    ['promptTokensPerSecond', 'prompt tok/s'],
    ['decodeTokensPerSecond', 'decode tok/s'],
    ['openMs', 'apertura ms'],
    ['stopLatencyMs', 'stop ms'],
]

const riassunto = []
for (const [chiave, insieme] of [...gruppi.entries()].sort()) {
    const voce = { key: chiave, runs: insieme.length, metrics: {} }

    // ⛔ La prova che il prefisso non ha aiutato. Se non fosse zero, ogni
    // confronto costruito su queste righe sarebbe falso — e sarebbe falso in
    // modo invisibile, perché i numeri sembrerebbero solo «migliori».
    const riusati = insieme.map((r) => r.reusedTokens).filter((v) => typeof v === 'number')
    if (riusati.length > 0) {
        voce.reusedTokensMax = Math.max(...riusati)
        if (voce.reusedTokensMax > 0) voce.warning = 'prefisso RIUSATO: misure non confrontabili'
    }

    /*
     * ⛔ L'ARCO DI TEMPO, perche' il file si ACCUMULA.
     *
     * `runs.jsonl` vive sul telefono e ogni corsa ci scrive in coda: due
     * campagne a ore diverse finiscono nello stesso insieme senza dirlo, e la
     * dispersione che ne esce non descrive nessuna delle due. Mostrare l'arco
     * rende il miscuglio visibile; `--fresh` sul runner lo evita a monte.
     */
    const istanti = insieme.map((r) => r.atMs).filter((v) => typeof v === 'number')
    if (istanti.length > 0) {
        const arco = Math.max(...istanti) - Math.min(...istanti)
        voce.spanMinutes = arrotonda(arco / 60000)
        const motori = new Set(insieme.map((r) => r.engineBuild).filter(Boolean))
        if (motori.size > 1) voce.mixedEngineBuilds = [...motori]
    }

    const termici = new Set(insieme.map((r) => r?.deviceAfter?.thermal).filter(Boolean))
    if (termici.size > 0) voce.thermal = [...termici]
    // Uno stato termico che cambia dentro un insieme vuol dire due telefoni
    // diversi nello stesso confronto.
    if (termici.size > 1) voce.thermalDrift = true

    for (const [campo, etichetta] of CAMPI) {
        const valori = insieme.map((r) => r[campo]).filter((v) => typeof v === 'number')
        if (valori.length === 0) continue
        const centro = mediana(valori)
        const dispersione = mad(valori)
        const minimo = Math.min(...valori)
        const massimo = Math.max(...valori)
        // Dispersione relativa sul RANGE, che è la forma in cui il brief la
        // dichiara: «relative spread exceeds 10% between valid runs».
        const relativa = centro > 0 ? (massimo - minimo) / centro : 0
        voce.metrics[campo] = {
            label: etichetta,
            median: arrotonda(centro),
            mad: arrotonda(dispersione),
            min: arrotonda(minimo),
            max: arrotonda(massimo),
            spread: arrotonda(relativa * 100),
            needsMoreRuns: relativa > 0.10 && valori.length < 9,
        }
    }
    riassunto.push(voce)
}

if (comeJson) {
    process.stdout.write(JSON.stringify({
        source: percorso,
        rows: righe.length,
        measured: giri.length,
        aggregateRows: aggregati.length,
        warmupsExcluded: scartati,
        unreadableLines: illeggibili,
        groups: riassunto,
    }, null, 2) + '\n')
    process.exit(0)
}

const scrivi = (t) => process.stdout.write(t + '\n')

scrivi('')
scrivi(`  MISURE — ${percorso}`)
scrivi(`  ${righe.length} righe · ${giri.length} giri · ${aggregati.length} riassunti`
    + ` · ${scartati} di riscaldamento`
    + (illeggibili > 0 ? ` · ⛔ ${illeggibili} illeggibili` : ''))
scrivi('  ' + '─'.repeat(94))

for (const voce of riassunto) {
    scrivi('')
    scrivi(`  ${voce.key}   (${voce.runs} giri`
        + (voce.thermal ? ` · termico ${voce.thermal.join('→')}` : '') + ')')
    if (voce.warning) scrivi(`    ⛔ ${voce.warning}`)
    if (voce.thermalDrift) {
        scrivi('    ⛔ lo stato termico è CAMBIATO dentro l\'insieme: due telefoni diversi')
    }
    if (voce.mixedEngineBuilds) {
        scrivi(`    ⛔ MOTORI DIVERSI nello stesso insieme: ${voce.mixedEngineBuilds.join(', ')}`)
    }
    if (voce.spanMinutes > 60) {
        scrivi(`    ⛔ i giri sono sparsi su ${voce.spanMinutes} minuti: campagne diverse mescolate`)
    }
    for (const m of Object.values(voce.metrics)) {
        const allarme = m.needsMoreRuns ? '  ⛔ dispersione >10%: servono 9 giri' : ''
        scrivi(`    ${m.label.padEnd(14)} mediana ${String(m.median).padStart(9)}`
            + `   MAD ${String(m.mad).padStart(7)}`
            + `   [${m.min} … ${m.max}]`
            + `   ±${m.spread}%${allarme}`)
    }
}

scrivi('')
const daRifare = riassunto.filter((v) => Object.values(v.metrics).some((m) => m.needsMoreRuns))
if (daRifare.length > 0) {
    scrivi(`  ⛔ ${daRifare.length} configurazioni hanno dispersione oltre il 10%.`)
    scrivi('     Il brief chiede 9 giri e mediana + MAD + min/max:')
    scrivi('     node scripts/research/run-device-tests.mjs '
        + 'ai.talos.TalosLocalBaselineDeviceTest talosRuns=9')
}
const sporche = riassunto.filter((v) => v.warning || v.thermalDrift)
if (sporche.length > 0) {
    scrivi(`  ⛔ ${sporche.length} configurazioni sono da rifare: `
        + 'prefisso riusato o deriva termica.')
}
if (daRifare.length === 0 && sporche.length === 0) {
    scrivi('  ✓ Nessuna configurazione da rifare: dispersione sotto il 10%, '
        + 'prefisso freddo, termico stabile.')
}
scrivi('')
