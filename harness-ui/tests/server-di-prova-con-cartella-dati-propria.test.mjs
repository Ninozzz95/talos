/*
 * ⛔ 01/10/2026 — UN SERVER DI PROVA NON USA LE CARTELLE DATI DEL 4174. Segnalato dalla CLI (review della lane R: «the backend
 *   suite writes harness-ui/.process-output/output.sqlite into the repo tree») e misurato qui: due test lanciavano
 *   `server.mjs` senza `TALOS_DESKTOP_DATA_DIR`, e `percorsoDatiDesktop` (server.mjs) cade allora sulle cartelle accanto a
 *   server.mjs — le stesse del 4174, che gira da questa cartella: memorie, note, attività, Forge, automazioni, modelli
 *   locali, configurazione dei fornitori, archivio dell'output dei comandi. Il WAL di quest'ultimo è cambiato durante la
 *   suite (01/10, 06:21). Regola dell'owner: una prova non tocca MAI il 4174.
 * ⇒ Ogni test che avvia `server.mjs` gli dà una cartella dati propria. La guardia è sul sorgente dei test, perché il
 *   prossimo test che lancia il server non deve dipendere dal ricordarsene.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cartellaTest = fileURLToPath(new URL('.', import.meta.url))
const LANCIA_IL_SERVER = /spawn\([^)]*\[\s*['"](?:[^'"]*[\\/])?server\.mjs['"]/u

test('SERVER-DI-PROVA-01: ogni test che lancia server.mjs gli dà TALOS_DESKTOP_DATA_DIR', () => {
    const lanciano = readdirSync(cartellaTest).filter((f) => f.endsWith('.test.mjs'))
        .map((f) => ({ f, s: readFileSync(join(cartellaTest, f), 'utf8') }))
        .filter(({ s }) => LANCIA_IL_SERVER.test(s))
    // al contrario: la guardia deve VEDERE i test che lanciano il server, o non controlla niente
    assert.ok(lanciano.length >= 4, `trovati ${lanciano.length}: ${lanciano.map((x) => x.f).join(', ')}`)
    const senza = lanciano.filter(({ s }) => !/TALOS_DESKTOP_DATA_DIR\s*:/u.test(s)).map((x) => x.f)
    assert.deepEqual(senza, [], 'questi avviano un server sulle cartelle dati del 4174')
})
