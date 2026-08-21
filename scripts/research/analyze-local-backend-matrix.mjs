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

/*
 * ⛔⛔ `--zone <file>` — LA TEMPERATURA CHE L'APP NON PUO' LEGGERE.
 *
 * MISURATO il 2026-08-20 in dieci minuti di carico: la velocita' oscillava fra
 * 19,3 e 13,6 tok/s e i due segnali che l'app registra non se ne accorgevano —
 * `thermal` era «moderate» dal secondo 46 e la batteria stava ferma a 33,6 C.
 * Le zone termiche del SoC, nello stesso momento, dicevano **88 C**.
 *
 * Sysfs e' negato a un'applicazione da SELinux ⇒ si campiona dall'HOST, con
 * `adb`, in un file di tre colonne — `epoch  millesimi_di_grado  thermal` — e
 * si correla qui per tempo. Il segnale sbagliato non si aggiusta: si sostituisce.
 */
const indiceZone = argomenti.indexOf('--zone')
const fileZone = indiceZone >= 0 ? argomenti[indiceZone + 1] : null
const posizionali = argomenti.filter((a, i) => !a.startsWith('--') && argomenti[i - 1] !== '--zone')
const percorso = resolve(MOBILE, posizionali[0] ?? '.tmp-research/local-backend/runs.jsonl')

/** I campioni dell'host: epoch in secondi → gradi. */
const zone = []
if (fileZone) {
    const dove = resolve(MOBILE, fileZone)
    if (!existsSync(dove)) {
        process.stderr.write(`⛔ --zone indicato ma il file non c'e': ${dove}\n`)
        process.exit(1)
    }
    for (const riga of readFileSync(dove, 'utf8').split('\n')) {
        const [t, milli] = riga.trim().split(/\s+/)
        const secondi = Number(t), gradi = Number(milli) / 1000
        if (Number.isFinite(secondi) && Number.isFinite(gradi)) zone.push({ secondi, gradi })
    }
    zone.sort((a, b) => a.secondi - b.secondi)
}

/** Il campione piu' vicino nel tempo, e quanto era lontano. */
const zonaVicina = (atMs) => {
    if (zone.length === 0 || !Number.isFinite(atMs)) return null
    const secondi = atMs / 1000
    let migliore = zone[0]
    for (const c of zone) {
        if (Math.abs(c.secondi - secondi) < Math.abs(migliore.secondi - secondi)) migliore = c
    }
    // ⛔ Oltre mezzo minuto non e' piu' «lo stesso istante»: meglio niente che
    // una temperatura presa da un'altra corsa.
    return Math.abs(migliore.secondi - secondi) <= 30 ? migliore.gradi : null
}

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
    /*
     * ⛔⛔ E ci entrano anche MICROBATCH e FLASH ATTENTION, per la stessa
     * ragione — con una prova, non con un'intuizione.
     *
     * MISURATO il 2026-08-20 sul Pad: a parita' di tutto il resto, il
     * microbatch sposta il prefill da 307 a 225 tok/s, e la Flash Attention
     * sposta la decodifica dopo un prompt lungo da 8,1 a 15,9 tok/s. Due
     * campagne cosi' nello stesso file darebbero una dispersione del 90% che
     * non descrive nessuna delle due: descrive la manopola.
     *
     * ⛔ Compaiono nella chiave SOLO quando non sono il predefinito, cosi' le
     * righe di sempre restano leggibili e la distinzione appare esattamente
     * quando serve.
     */
    const ub = riga.microBatch ? `/ub${riga.microBatch}` : ''
    const fa = riga.flashAttn && riga.flashAttn !== 'default' ? `/fa-${riga.flashAttn}` : ''
    const chiave = `${riga.candidate ?? '?'}/${riga.backendRequested ?? '?'}/`
        + `${riga.config ?? '?'}${fase}${ub}${fa}`
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
    /*
     * Uno stato termico che cambia dentro un insieme vuol dire due telefoni
     * diversi nello stesso confronto.
     *
     * ⛔ TRANNE per G5, dove la deriva termica NON e' il guasto: e' la misura.
     * Segnalarla li' come contaminazione insegnerebbe a ignorare l'avviso
     * proprio nel posto in cui e' il risultato — e un avviso che si impara a
     * ignorare non protegge piu' niente altrove.
     */
    voce.sostenuto = String(insieme[0]?.config ?? '').startsWith('G5-')
    if (termici.size > 1 && !voce.sostenuto) voce.thermalDrift = true

    // Per una corsa sostenuta la domanda e' un'altra: QUANTO e' scesa, e da
    // quando. Il primo terzo contro l'ultimo, mai due giri singoli agli estremi.
    if (voce.sostenuto) {
        const tassi = insieme
            .filter((r) => !r.warmup && typeof r.decodeTokensPerSecond === 'number')
            .sort((a, b) => (a.elapsedMs ?? 0) - (b.elapsedMs ?? 0))
        if (tassi.length >= 3) {
            const terzo = Math.floor(tassi.length / 3)
            const mediaDi = (righe) => righe.reduce((t, r) => t + r.decodeTokensPerSecond, 0) / righe.length
            const primi = mediaDi(tassi.slice(0, terzo))
            const ultimi = mediaDi(tassi.slice(-terzo))
            voce.sustained = {
                firstThird: arrotonda(primi),
                lastThird: arrotonda(ultimi),
                driftPercent: primi > 0 ? arrotonda((ultimi - primi) * 100 / primi) : 0,
                minutes: arrotonda((tassi[tassi.length - 1].elapsedMs ?? 0) / 60000),
            }
            /*
             * ⛔⛔ E NON basta «quando e' caduta», perche' su questo telefono
             * non cade: OSCILLA.
             *
             * MISURATO il 2026-08-20, dieci minuti su OpenCL: la decodifica
             * salta fra ~19,3 e ~13,6 tok/s NOVE volte, avanti e indietro. Un
             * campione ogni dieci giri legge uno scalino che non c'e', e
             * «prima caduta al minuto 1,59» e' vero e fuorviante insieme,
             * perche' il sistema poi risale.
             *
             * ⇒ Si contano i salti e si descrivono i due livelli. Una media
             * fra due stati stabili non e' un valore che il telefono abbia mai
             * avuto.
             */
            const valori = tassi.map((r) => r.decodeTokensPerSecond)
            let salti = 0
            for (let i = 1; i < valori.length; i += 1) {
                if (Math.abs(valori[i] - valori[i - 1]) / valori[i - 1] > 0.15) salti += 1
            }
            voce.sustained.transitions = salti
            if (salti >= 2) {
                const soglia = (Math.min(...valori) + Math.max(...valori)) / 2
                const basso = valori.filter((v) => v < soglia)
                const alto = valori.filter((v) => v >= soglia)
                voce.sustained.bimodal = {
                    high: arrotonda(mediana(alto)),
                    low: arrotonda(mediana(basso)),
                    lowSharePercent: arrotonda(basso.length * 100 / valori.length),
                }
            }
            /*
             * ⛔ E se ci sono i campioni dell'host, si dice a QUALE temperatura
             * sta ciascuno dei due livelli. E' l'unico modo per rispondere alla
             * domanda che conta — «e' il calore o e' altro?» — invece di
             * dedurla da uno stato che satura in quarantasei secondi.
             */
            if (zone.length > 0 && voce.sustained.bimodal) {
                const soglia = (Math.min(...valori) + Math.max(...valori)) / 2
                const gradiDi = (filtro) => {
                    const g = tassi.filter(filtro).map((r) => zonaVicina(r.atMs)).filter((v) => v !== null)
                    return g.length ? arrotonda(mediana(g)) : null
                }
                voce.sustained.socCelsius = {
                    high: gradiDi((r) => r.decodeTokensPerSecond >= soglia),
                    low: gradiDi((r) => r.decodeTokensPerSecond < soglia),
                }
            }
            const caduta = tassi.find((r) => r.decodeTokensPerSecond < primi * 0.9)
            if (caduta) voce.sustained.firstDropAtMinute = arrotonda((caduta.elapsedMs ?? 0) / 60000)
        }
    }

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
    if (voce.sustained) {
        const d = voce.sustained
        scrivi(`    tenuta su ${d.minutes} min — primo terzo ${d.firstThird} tok/s`
            + ` -> ultimo terzo ${d.lastThird} tok/s (${d.driftPercent > 0 ? '+' : ''}${d.driftPercent}%)`)
        if (d.bimodal) {
            scrivi(`    ⛔ NON e' una discesa: OSCILLA fra ${d.bimodal.high} e ${d.bimodal.low} tok/s`
                + ` — ${d.transitions} salti, ${d.bimodal.lowSharePercent}% del tempo nello stato basso.`)
            scrivi('       ⇒ la media fra due stati stabili non è un valore che il telefono abbia mai avuto.')
            const g = d.socCelsius
            if (g && g.high !== null && g.low !== null) {
                scrivi(`       SoC: ${g.high} °C nello stato alto · ${g.low} °C nel basso`
                    + `  (la batteria, nello stesso momento, non si muove)`)
            }
        } else if (d.firstDropAtMinute !== undefined) {
            scrivi(`    ⛔ prima caduta sotto il −10%: al minuto ${d.firstDropAtMinute}`)
        }
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
/*
 * ⛔ La riga finale non deve dire piu' di quanto sia vero.
 *
 * Diceva «dispersione sotto il 10%» anche quando una configurazione ne aveva il
 * 380% — semplicemente perche' aveva gia' i nove giri e non c'era altro
 * rimedio da proporre. «Niente da rifare» e «tutto stretto» sono due frasi
 * diverse, e la seconda, detta al posto della prima, e' il modo in cui un
 * riassunto rassicura su una cosa che non ha guardato.
 */
const larghe = riassunto.filter((v) => Object.values(v.metrics).some((m) => m.spread > 10))
if (daRifare.length === 0 && sporche.length === 0) {
    scrivi('  ✓ Niente da rifare: prefisso freddo, termico stabile, '
        + 'e ogni configurazione ha i giri che le servono.')
    if (larghe.length > 0) {
        scrivi(`  ⚠ ${larghe.length} configurazioni restano LARGHE oltre il 10% pur avendo`)
        scrivi('    i nove giri. Non è un errore da correggere con altri giri: è una')
        scrivi('    proprietà della misura, e va riportata come tale.')
        for (const v of larghe) {
            const peggiore = Object.values(v.metrics)
                .sort((a, b) => b.spread - a.spread)[0]
            scrivi(`      ${v.key}  ${peggiore.label} ±${peggiore.spread}% `
                + `[${peggiore.min} … ${peggiore.max}]`)
        }
    }
}
scrivi('')
