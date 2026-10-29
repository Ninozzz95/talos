/*
 * Revisione avversaria del blocco 14 (28/10/2026), la parte della lingua dei messaggi scritti (rapporto `REVISIONE-BLOCCO-14-2026-10-28.md`,
 * RIV14-1 S1 e S4-2). Prove del revisore (`zz-riv14.test.mjs`), ROSSE sulla candidata 66b5d1d2f e verdi con la cura; più S4-2.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { linguaDelTesto, _dimenticaRilevatore } from '../src/lingua-del-testo.mjs'
import { notaLinguaDelMessaggio } from '../src/kernel/talosHarness.mjs'

/* RIV14-1 — S1: una lingua SBAGLIATA detta al modello. Messaggi veri di chi programma in italiano: gergo inglese, una parola citata in un
   altro alfabeto, un errore incollato senza recinto. La regola del modulo è «meglio nessuna nota che una sbagliata». */
test('RIV14-1 — il riconoscitore non dice MAI una lingua sbagliata sui messaggi misti di chi programma', async () => {
  const casi = [
    ['it', 'refactor del componente Sidebar'],
    ['it', 'implementa la feature dark mode nel frontend'],
    ['it', "come si dice 'گربه' in italiano? spiegami la differenza fra le due parole"],
    ['it', 'aggiungi la traduzione russa «Сохранить всё» al file locales/ru.json'],
    ['it', 'la parola Київ va scritta così nel titolo della pagina, correggi'],
    ['it', "Spiegami la frase 'Как дела? Всё хорошо' in italiano"],
    ['en', "add the Persian label 'ذخیره' to the save button in fa.json"],
    ['it', "perché fallisce? Error: Cannot find module 'express' at Object.<anonymous> (/app/index.js:3:9) at Module._compile (node:internal/modules/cjs/loader:1256:14)"],
    ['it', 'SELECT * FROM users WHERE id = 1; questa query è lenta'],
    ['ar', 'مرحبا، اقرأ هذا الملف وأخبرني لماذا یفشل الاختبار'], // arabo con una sola ی (tastiera persiana)
    ['ps', 'سلام، دا فایل ولولئ او ووایه چې ولې ټیسټ ناکامیږي'], // pashto
  ]
  const sbagliate = []
  for (const [atteso, frase] of casi) {
    const detta = await linguaDelTesto(frase)
    if (detta !== null && detta !== atteso) sbagliate.push(`${detta} invece di ${atteso}: ${frase.slice(0, 50)}`)
  }
  assert.deepEqual(sbagliate, [])
})

test('RIV14-1b — la conseguenza: un italiano che scrive «refactor del componente Sidebar» riceve la nota «reply in Spanish»', async () => {
  const nota = notaLinguaDelMessaggio([], { lingua: null, linguaDelMessaggio: await linguaDelTesto('refactor del componente Sidebar') })
  assert.ok(nota === null || /Italian/u.test(nota), `nota: ${nota}`)
})

test('RIV14-S4-2 — un primo caricamento fallito del riconoscitore non resta «nessuna lingua» per sempre: al messaggio dopo si ritenta', async () => {
  _dimenticaRilevatore()
  assert.equal(await linguaDelTesto('ciao, come stai oggi amico mio?', { importaEld: async () => { throw new Error('assente') } }), null)
  assert.equal(await linguaDelTesto('ciao, come stai oggi amico mio?'), 'it', 'il secondo tentativo carica il pacchetto vero')
  _dimenticaRilevatore()
})

test('RIV14-1c — pashto SENZA lettere solo arabe: non è persiano (decide la regola del pashto); e un italiano che incolla uno stack resta italiano', async () => {
  const pashto = await linguaDelTesto('سلام، دا فایل ولوله او ووایه چې ټیسټ ولې ناکامیږی')
  assert.ok(pashto === null || pashto === 'ps', `pashto: ${pashto}`)
  const stack = 'perché esplode?\n' + Array.from({ length: 8 }, (_, i) => `    at run (index.js:${i}:1)`).join('\n')
  assert.equal(await linguaDelTesto(stack), 'it', 'le righe «at …» non sono lingua')
})
