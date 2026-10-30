/*
 * «Segnala un problema», revisione D del 29/10/2026 (F3): la finestra avvisa (senza riscrivere) quando ciò che la persona scrive ha la
 *   forma di una chiave o di un percorso assoluto. Le forme del frontend (`frontend/src/components/segnala-forme.js`) sono riscritte da
 *   quelle del server (`src/segnalazione-problema.mjs`): qui lo stesso campionario passa dai due lati e la risposta deve essere la
 *   stessa — il server lo CAMBIA ⇔ il frontend lo SEGNALA. Una forma aggiunta da una parte sola fa diventare rossa questa prova.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ripulisciTestoSegnalazione } from '../src/segnalazione-problema.mjs'
import { sembraChiaveOPercorso } from '../frontend/src/components/segnala-forme.js'

/* i campioni si compongono, come in forme-di-segreto-oscura.test.mjs: un gettone finto intero nel sorgente lo ferma la protezione dei
   segreti di GitHub (il push dell'export pubblico del 29/10/2026 è stato rifiutato per il campione GitLab) */
const a = (...pezzi) => pezzi.join('')

const SEGRETI = [
  a('sk-or-v1-', '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f'),
  a('ghp_', '0123456789abcdefABCDEF0123456789abcd'),
  a('github_pat_', '0123456789abcdefABCDEF0123456789'),
  a('glpat-', '0123456789abcdefABCD'),
  a('xoxb-', '0123456789-abcdef'),
  a('AIza', 'SyA0123456789abcdefghijklmnopqrstuvw'),
  'AKIAIOSFODNN7EXAMPLE',
  a('hf_', '0123456789abcdefghijklmnopqrstuvwx'),
  'Bearer abcdefghijklmnopqrstu12345',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijklmnopqrstuv',
  'gsk_0123456789abcdefghijkl',
  'sk_live_0123456789abcd',
  'xai-0123456789abcdefghijklmnopqrstuvwxyz',
  '-----BEGIN RSA PRIVATE KEY-----',
  'https://utente:password@example.com/x',
  '0123456789abcdef0123456789abcdef.AbCdEfGhIjKlMnOp',
  'OPENROUTER_API_KEY=abc123secret',
  'ANTHROPIC_API_KEY = "sk-ant-api03-xyz"',
  "export ZAI_API_KEY='x'",
  'password: hunter2',
  "export X_TOKEN='abc'",
  'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
  'db-password=hunter2',
]
const PERCORSI = ['C:\\Users\\Mario\\x.txt', 'D:/lavoro/x', '\\\\server\\share\\x', '/home/mario/x.py', '~/note/a.md', 'file:///C:/x', 'Users\\Mario\\Desktop']
const PULITI = [
  'Il terminale si blocca con npm test',
  'z-ai/glm-5.3-flash via openrouter',
  'vedi https://github.com/Ninozzz95/talos/issues/1',
  'src/kernel/a.mjs riga 12',
  'press the key to continue',
  'the key: Enter',
  'token budget is 4000',
  'MAX_TOKENS=4096',
  'total_tokens: 1234',
  'max_output_tokens=10',
  `commit ${'a'.repeat(40)}.`,
  'TALOS desktop 0.1.38 (Windows 11, x64)',
  'Ultimi errori: SHELL_TIMEOUT ×2 (11:42, 11:47)',
  'Il file [path] e la chiave [redacted]',
]

test('SEGN-PARITA-01 — il server cambia ⇔ la finestra avvisa, su tutto il campionario', () => {
  for (const voce of [...SEGRETI, ...PERCORSI]) {
    assert.notEqual(ripulisciTestoSegnalazione(`prima ${voce} dopo`, { nomi: {} }), `prima ${voce} dopo`, `il server non toglie: ${voce}`)
    assert.equal(sembraChiaveOPercorso(`prima ${voce} dopo`), true, `la finestra non avvisa: ${voce}`)
  }
  for (const voce of PULITI) {
    assert.equal(ripulisciTestoSegnalazione(voce, { nomi: {} }), voce, `il server cambia un testo pulito: ${voce}`)
    assert.equal(sembraChiaveOPercorso(voce), false, `la finestra avvisa su un testo pulito: ${voce}`)
  }
  assert.equal(sembraChiaveOPercorso(''), false)
  assert.equal(sembraChiaveOPercorso(null), false)
})
