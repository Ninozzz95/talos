/*
 * Revisione D del 29/10/2026 («Segnala un problema»), concordata con la CLI: la pulizia CONDIVISA `oscuraFormeDiSegreto` (riassunto di
 *   ripiego, segnalazione) misurata FORMA PER FORMA. Il revisore e la CLI hanno visto passare `AKIAIOSFODNN7EXAMPLE` (da solo e dopo
 *   `AWS_ACCESS_KEY_ID=`), la chiave di Z.AI e `OPENROUTER_API_KEY=…`.
 *   La causa vera di AKIA: non la regola (riga 32 giusta, `g` aggiunto a ogni giro), ma l'ECCEZIONE dei segnaposto della documentazione
 *   (`SEGNAPOSTO_NOTI`, `eUnSegnapostoNoto`) applicata anche all'oscuramento. Ha senso per DOMANDARE (un `.env.example` non deve far
 *   chiedere), non per OSCURARE: oscurare un segnaposto non costa niente, e la CLI (`redact.ts`, SECRET_VALUE_PATTERNS) non lo esclude.
 *   La stessa misura ha trovato una seconda forma che non oscurava davvero: il blocco PEM — si toglieva la riga BEGIN e il corpo base64
 *   restava. Ora il blocco intero, come la CLI (`redact.ts`, le due forme PEM).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { FORME_DI_SEGRETO, oscuraFormeDiSegreto, formaDiSegretoNelTesto } from '../src/forme-di-segreto.mjs'

const a = (...pezzi) => pezzi.join('') // i campioni si compongono: un segreto finto intero nel sorgente farebbe chiedere chi lo legge
/* Un campione per OGNI forma, nell'ordine dell'elenco: una forma nuova senza campione fa diventare rossa la prova */
const CAMPIONI = [
  a('-----BEGIN RSA ', 'PRIVATE KEY-----'),
  a('eyJhbGciOiJIUzI1NiJ9', '.eyJ1c2VyIjoiYWxpY2UiLCJyb2xlIjoiYWRtaW4ifQ', '.c2lnbmF0dXJlLWZhbHNhLTEyMzQ1Njc4'),
  a('sk-or-v1-', '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f'),
  a('ghp_', '0123456789abcdefABCDEF0123456789abcd'),
  a('glpat-', '0123456789abcdefABCD'),
  a('xoxb-', '0123456789-abcdef'),
  a('AIza', 'SyA0123456789abcdefghijklmnopqrstuvw'),
  a('AKIA', 'IOSFODNN7EXAMPLE'),
  a('hf_', '0123456789abcdefghijklmnopqrstuvwx'),
  a('Bearer ', 'abcdefghijklmnopqrstu12345'),
  a('gsk_', '0123456789abcdefghijkl'),
  a('sk_live_', '0123456789abcd'),
  a('xai-', '0123456789abcdefghijklmnopqrstuvwxyz'),
  a('0123456789abcdef0123456789abcdef', '.AbCdEfGhIjKlMnOp'),
]

test('OSCURA-01 — ogni forma dell\'elenco si oscura davvero, con un campione suo (anche i segnaposto della documentazione)', () => {
  assert.equal(CAMPIONI.length, FORME_DI_SEGRETO.length, 'una forma senza campione: aggiungerlo qui')
  for (const [i, campione] of CAMPIONI.entries()) {
    assert.ok(FORME_DI_SEGRETO[i].test(campione), `il campione ${i} non è della forma ${FORME_DI_SEGRETO[i].source.slice(0, 30)}`)
    const fuori = oscuraFormeDiSegreto(`prima ${campione} dopo`)
    assert.match(fuori, /\[redacted\]/u, campione.slice(0, 12))
    const corpo = campione.replace(/^Bearer /u, '').replace(/^-----BEGIN /u, '')
    assert.equal(fuori.includes(corpo), false, `${campione.slice(0, 12)} → ${fuori}`)
  }
  // il segnaposto di AWS: da solo e dopo il suo nome
  assert.equal(oscuraFormeDiSegreto('AKIAIOSFODNN7EXAMPLE'), '[redacted]')
  assert.doesNotMatch(oscuraFormeDiSegreto('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE'), /AKIA/u)
  // ⛔ per DOMANDARE l'eccezione resta: un file d'esempio col segnaposto non fa chiedere (esempi-nei-segreti)
  assert.equal(formaDiSegretoNelTesto('aws_access_key_id = AKIAIOSFODNN7EXAMPLE'), null)
})

test('OSCURA-02 — il blocco PEM privato si toglie INTERO (anche tagliato prima della fine), non solo la riga BEGIN', () => {
  const corpo = 'MIIEpAIBAAKCAQEA1234567890abcdefABCDEF\nQWERTYUIOPasdfghjklZXCVBNM0987654321'
  const intero = a('-----BEGIN RSA ', `PRIVATE KEY-----\n${corpo}\n-----END RSA `, 'PRIVATE KEY-----')
  const fuori = oscuraFormeDiSegreto(`chiave:\n${intero}\nfine`)
  assert.equal(fuori.includes('MIIEpAIB'), false, fuori)
  assert.equal(fuori.includes('QWERTYUIOP'), false, fuori)
  assert.match(fuori, /^chiave:\n\[redacted\]\nfine$/u)
  const tagliato = oscuraFormeDiSegreto(a('-----BEGIN ', `PRIVATE KEY-----\n${corpo}\nil resto del messaggio`))
  assert.equal(tagliato.includes('MIIEpAIB') || tagliato.includes('QWERTYUIOP'), false, tagliato)
  assert.match(tagliato, /il resto del messaggio$/u)
})

test('OSCURA-03 — la chiave di Z.AI: 32 esadecimali, un punto, 16-64 caratteri; oltre i 64 o con meno di 16 non è quella forma', () => {
  const zai = (coda) => `0123456789abcdef0123456789abcdef.${coda}`
  assert.equal(oscuraFormeDiSegreto(`k=${zai('A'.repeat(16))}`).includes('AAAA'), false)
  assert.equal(oscuraFormeDiSegreto(zai('A'.repeat(64))), '[redacted]')
  assert.equal(oscuraFormeDiSegreto(`hash ${zai('A'.repeat(15))} x`), `hash ${zai('A'.repeat(15))} x`)
  assert.equal(oscuraFormeDiSegreto(`commit ${'a'.repeat(40)}.`), `commit ${'a'.repeat(40)}.`)
})

test('OSCURA-04 — il valore dopo un NOME di segreto (anche con un prefisso, come `OPENROUTER_API_KEY`), con o senza virgolette', () => {
  for (const [riga, valore] of [
    ['OPENROUTER_API_KEY=abc123secret', 'abc123secret'],
    ['ANTHROPIC_API_KEY = "sk-ant-api03-xyz"', 'sk-ant-api03-xyz'],
    ["export ZAI_API_KEY='x'", "'x'"],
    ["export X_TOKEN='abc'", 'abc'],
    ['GITHUB_TOKEN: ghs_short', 'ghs_short'],
    ['db-password=hunter2', 'hunter2'],
    ['OPENAI_KEY=abc', 'abc'],
    ['api_key=abc', 'abc'],
  ]) {
    const fuori = oscuraFormeDiSegreto(riga)
    assert.match(fuori, /\[redacted\]/u, riga)
    assert.equal(fuori.includes(valore), false, `${riga} → ${fuori}`)
  }
  // ⛔ i CONTATORI restano leggibili (la CLI, `redact.ts:3`, COUNTER_KEY: un `tokens` al plurale è un contatore)
  for (const contatore of ['MAX_TOKENS=4096', 'total_tokens: 1234', 'prompt_tokens: 5', 'max_output_tokens=10', 'inputTokens: 7']) {
    assert.equal(oscuraFormeDiSegreto(contatore), contatore)
  }
  // ⛔ e la prosa
  for (const prosa of ['press the key to continue', 'the key: Enter', 'token budget is 4000', 'the bearer of bad news', 'sk-your-key-here']) {
    assert.equal(oscuraFormeDiSegreto(prosa), prosa)
  }
})
