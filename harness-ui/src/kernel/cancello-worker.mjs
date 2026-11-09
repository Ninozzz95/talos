/*
 * R-39 (Performance, 30/10/2026; forma chiusa con Desktop, CLI e Mobile, PROPOSTA-CANCELLO-CALDO-2026-10-30.md) — il lavoro del
 *   cancello delle scritture su un filo a parte. Il compilatore TypeScript è lavoro SINCRONO: sul filo principale fermava il processo
 *   1,4–1,5 s alla prima scrittura di un sorgente e ~0,4 s alle altre (misurato su harness-ui vero, due strumenti concordi), e in quel
 *   tempo la TUI, il flusso del modello e i timer non giravano. Qui gira la STESSA funzione sugli STESSI dati del disco: il filo
 *   principale manda solo `{ radice, percorso, contenuto }` e riceve l'esito.
 *
 * ⛔ È un ingresso a sé (`PERCORSO_DEL_CANCELLO_WORKER` in `cancello-in-worker.mjs`): chi impacchetta il nucleo (la CLI, esbuild) lo
 *   dichiara come ingresso suo, o il worker non parte e la prova `CW-02` lo dice.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { discoNode, fontiDaDisco, cancelloSemantico, libreriaStandard } from './dist/kernelPerIlBanco.js'

/* Le cartelle dei `lib.*.d.ts`, nell'ordine di `leggiLibreriaStandardTs` (talosHarness.mjs): il percorso fisso, poi quello risolto. */
const cartelleLib = Array.isArray(workerData?.cartelleLib) ? workerData.cartelleLib.filter((c) => typeof c === 'string' && c) : []
async function leggiLibreria(nome) {
    for (const cartella of cartelleLib) {
        try { return await readFile(join(cartella, nome), 'utf8') }
        catch { /* la prossima */ }
    }
    return null
}

/* Lo stesso corpo di `premessaDellaScrittura` fra la lettura dello spazio e il verdetto. `scalda`: il «prima» dello stato attuale,
   cioè prima = dopo (il cancello calcola e ricorda; il verdetto non serve a nessuno). */
async function giudica({ radice, percorso, contenuto, scalda = false }) {
    const spazio = await fontiDaDisco(discoNode({ radice })).leggiSpazio()
    const prima = spazio.sorgenti
    const dopo = scalda ? prima
        : prima.some((s) => s.percorso === percorso)
            ? prima.map((s) => (s.percorso === percorso ? { ...s, testo: contenuto } : s))
            : [...prima, { percorso, testo: contenuto }]
    let libreria
    try { libreria = await libreriaStandard(leggiLibreria) }
    catch (e) { throw Object.assign(e instanceof Error ? e : new Error(String(e)), { codiceCancello: 'libreria-assente' }) }
    return cancelloSemantico(prima, dopo, libreria)
}

parentPort?.on('message', (richiesta) => {
    giudica(richiesta).then(
        (esito) => parentPort.postMessage({ id: richiesta.id, esito }),
        (rotta) => parentPort.postMessage({ id: richiesta.id, rotta: { message: rotta instanceof Error ? rotta.message : String(rotta), codiceCancello: rotta?.codiceCancello ?? null } }),
    )
})
