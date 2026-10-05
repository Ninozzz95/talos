import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PROTEZIONI_KERNEL, verificaProtezioniKernel } from '../scripts/verifica-protezioni-kernel.mjs'

const kernelUrl = new URL('../../src/kernel/talosHarness.mjs', import.meta.url)

test('protezioni del kernel: il kernel vero le ha tutte', async () => {
  const kernel = await readFile(kernelUrl, 'utf8')
  assert.deepEqual(verificaProtezioniKernel(kernel), ['T-01', 'T-02', 'RG', 'T-03', 'T-04'])
})

/* Ogni guasto riporta il kernel VERO alla forma di prima della protezione (o aggiunge a `prova` l'argomento che il
   rattoppo del 15/09 rifiutava): il controllo deve fermarsi e nominare QUELLA protezione, non un'altra. */
const guasti = {
  'T-01': (k) => k.replace("const RICERCA_NON_CONCLUSIVA = 'inconclusive search:", "const RICERCA_NON_CONCLUSIVA = 'no file matches:"),
  'T-02': (k) => k.replace('fileTroppoGrandi.push(p)', 'void p'),
  RG: (k) => k.replace("'--max-columns-preview', '-e', testo", "'--max-columns-preview', '--max-filesize', String(MAX_BYTE_FILE), '-e', testo"),
  'T-03': (k) => k.replace('uscitaUtile(String(esito), 8_000, 0.5)', 'String(esito).slice(0, 8_000)'),
  'T-04': (k) => {
    const prova = k.indexOf("name: 'prova',")
    const proprietà = k.indexOf('properties: {', prova)
    const punto = k.indexOf('timeout: {', proprietà)
    return k.slice(0, punto) + "codice_prova: { type: 'string' },\n                " + k.slice(punto)
  },
}

test('protezioni del kernel: se il kernel ne perde una, il pacchetto si ferma e nomina quella', async () => {
  const kernel = await readFile(kernelUrl, 'utf8')
  assert.deepEqual(Object.keys(guasti), PROTEZIONI_KERNEL.map((p) => p.id))
  for (const [id, guasta] of Object.entries(guasti)) {
    const rotto = guasta(kernel)
    assert.notEqual(rotto, kernel, `il guasto ${id} non ha trovato il suo punto nel kernel: la prova sarebbe vuota`)
    assert.throws(() => verificaProtezioniKernel(rotto), (errore) => {
      const nominate = PROTEZIONI_KERNEL.map((p) => p.id).filter((altro) => errore.message.includes(`${altro} (`))
      assert.deepEqual(nominate, [id], errore.message)
      return true
    })
  }
})

test('protezioni del kernel: un kernel di altra forma non passa, e le nomina tutte', () => {
  assert.throws(() => verificaProtezioniKernel('export const kernel = true\n'), /T-01 .*T-02 .*RG .*T-03 .*T-04 /)
})
