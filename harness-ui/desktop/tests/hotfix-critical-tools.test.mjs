import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  HOTFIX_CRITICAL_TOOLS_ID,
  trasformaKernelCriticalTools,
} from '../scripts/applica-hotfix-critical-tools.mjs'

const kernelUrl = new URL('../../src/kernel/talosHarness.mjs', import.meta.url)

test('hotfix desktop: i quattro finding HIGH vengono applicati al kernel reale', async () => {
  const originale = await readFile(kernelUrl, 'utf8')
  const corretto = trasformaKernelCriticalTools(originale)

  // T-01: se un tetto rende la ricerca incompleta, zero match non viene piu presentato come fatto esaustivo.
  assert.match(corretto, /inconclusive search: no match was found in the files actually inspected, but the search was not exhaustive\./)

  // T-02: i file > limite vengono registrati per percorso e l'avviso entra nella coda di incompletezza.
  assert.match(corretto, /const fileTroppoGrandi = \[\]/)
  assert.match(corretto, /fileTroppoGrandi\.push\(p\)/)
  assert.match(corretto, /file\(s\) were skipped because they exceed/)
  assert.match(corretto, /Inspect those paths directly or narrow the search\./)

  // T-03: nessun slice silenzioso a 8k; si riusa il troncamento testa+coda che dichiara i caratteri omessi.
  assert.doesNotMatch(corretto, /String\(esito\)\.slice\(0, 8_000\)/)
  assert.match(corretto, /uscitaUtile\(String\(esito\), 8_000, 0\.5\)/)

  // T-04: il rifiuto di codice arbitrario sta all'inizio della catena di dispatch,
  // quindi il ramo prova legacy non puo materializzare un probe prima del rifiuto.
  const guardia = corretto.indexOf(`/* ${HOTFIX_CRITICAL_TOOLS_ID} */`)
  const ramoProvaLegacy = corretto.indexOf("else if (nome === 'prova')")
  assert.ok(guardia >= 0, 'firma hotfix assente')
  assert.ok(ramoProvaLegacy > guardia, 'la guardia deve precedere il ramo prova legacy')
  assert.match(corretto.slice(guardia, ramoProvaLegacy), /codice_prova/)
  assert.match(corretto.slice(guardia, ramoProvaLegacy), /\['libera', 'path'\]/)
  assert.match(corretto.slice(guardia, ramoProvaLegacy), /no probe file was created or executed/)

  // Il trasformatore deve essere idempotente: una seconda preparazione non accumula patch.
  assert.equal(trasformaKernelCriticalTools(corretto), corretto)
})

test('hotfix desktop: se il kernel cambia forma, il build fallisce invece di spedire una falsa correzione', () => {
  assert.throws(
    () => trasformaKernelCriticalTools('export const kernel = true\n'),
    /marker assente/,
  )
})
