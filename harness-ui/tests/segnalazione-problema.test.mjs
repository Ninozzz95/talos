/*
 * «Segnala un problema» (owner 29/10/2026, bozzetto approvato) — la parte del SERVER: la pulizia che vale per la diagnostica E per
 *   titolo e descrizione scritti dal modello (nota (a) della CLI, 29/10), e la diagnostica costruita da fatti già ripuliti.
 *   ⛔ Mai percorsi di cartelle o file, testo dei messaggi, chiavi o gettoni, nomi utente o nome del PC.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ripulisciTestoSegnalazione, costruisciDiagnosticaSegnalazione, nomeDelSistema, raccogliDiagnosticaSegnalazione,
  normalizzaBozzaSegnalazione, TIPI_DI_SEGNALAZIONE,
} from '../src/segnalazione-problema.mjs'

const CHIAVE_FINTA = ['sk-or-v1-', '0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f'].join('') // composta: un gettone finto intero lo ferma la protezione dei segreti di GitHub
const NOMI = { utente: 'Mario', pc: 'STUDIO-DESKTOP' }

test('SEGN-S-01 — una chiave, un gettone, un percorso Windows, un percorso POSIX, il nome utente e il nome del PC non passano', () => {
  const sporco = [
    `la mia chiave ${CHIAVE_FINTA} non va`,
    `gettone ${['ghp_', '0123456789abcdefABCDEF0123456789abcd'].join('')} e Bearer abcdefghijklmnopqrstu12345`,
    'il file C:\\Users\\Mario\\Desktop\\progetto\\segreto.txt e \\\\server\\condivisa\\x',
    'su linux /home/mario/lavoro/app.py e ~/note/diario.md e file:///C:/Users/x/y.txt',
    'ciao sono Mario, il pc si chiama studio-desktop, scrivimi a mario.rossi@example.com',
    'api_key=abc123segreto e password: hunter2',
  ].join('\n')
  const pulito = ripulisciTestoSegnalazione(sporco, { nomi: NOMI })
  for (const vietato of [CHIAVE_FINTA, 'ghp_0123', 'abcdefghijklmnopqrstu12345', 'Users', 'segreto.txt', '\\\\server', '/home/mario',
    '~/note', 'file:///', 'Mario', 'studio-desktop', 'STUDIO-DESKTOP', 'mario.rossi@example.com', 'abc123segreto', 'hunter2']) {
    assert.ok(!pulito.toLowerCase().includes(vietato.toLowerCase()), `«${vietato}» è passato: ${pulito}`)
  }
  assert.match(pulito, /\[redacted\]/u)
  assert.match(pulito, /\[path\]/u)
  assert.match(pulito, /\[user\]/u)
  assert.match(pulito, /\[pc\]/u)
  assert.match(pulito, /\[email\]/u)
  // un nome con lo spazio dentro un percorso: tolti i due pezzi, e la frase dopo resta
  assert.equal(ripulisciTestoSegnalazione('Users\\Mario Rossi\\Documenti e cartella', { nomi: NOMI }), '[path] [path] e cartella')
})

test('SEGN-S-02 — al contrario: il testo normale resta com\'è (nomi di modello, indirizzi web, percorsi relativi del progetto, prosa)', () => {
  const normale = 'Con z-ai/glm-5.3-flash via OpenRouter il terminale si blocca su npm test; vedi https://github.com/Ninozzz95/talos/issues/1 e src/kernel/a.mjs. 2/3 volte.'
  assert.equal(ripulisciTestoSegnalazione(normale, { nomi: NOMI }), normale)
  assert.equal(ripulisciTestoSegnalazione('the bearer of bad news', { nomi: NOMI }), 'the bearer of bad news')
  // un nome troppo corto non si cerca: «al» spezzerebbe ogni parola
  assert.equal(ripulisciTestoSegnalazione('also also', { nomi: { utente: 'al', pc: 'x' } }), 'also also')
  assert.equal(ripulisciTestoSegnalazione(null, { nomi: NOMI }), '')
})

test('SEGN-S-03 — la bozza del modello: tipo valido, titolo ≤ 120 e descrizione ≤ 4000, ripuliti; un tipo o un titolo storti si rifiutano', () => {
  assert.deepEqual(TIPI_DI_SEGNALAZIONE, ['bug', 'wrong_answer', 'idea'])
  const ok = normalizzaBozzaSegnalazione({ kind: 'bug', title: `Errore con ${CHIAVE_FINTA}`, description: 'In C:\\Users\\Mario\\x.txt succede' }, { nomi: NOMI })
  assert.equal(ok.ok, true)
  assert.equal(ok.bozza.kind, 'bug')
  assert.doesNotMatch(ok.bozza.title, /sk-or/u)
  assert.doesNotMatch(ok.bozza.description, /Users|Mario/u)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'crash', title: 'x', description: '' }).ok, false)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'idea', title: '   ', description: '' }).ok, false)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'idea', title: 'a'.repeat(121), description: '' }).ok, false)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'idea', title: 'ok', description: 'd'.repeat(4001) }).ok, false)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'idea', title: 'ok', description: 42 }).ok, false)
  assert.equal(normalizzaBozzaSegnalazione({ kind: 'idea', title: 'ok' }).ok, true, 'la descrizione può mancare')
})

test('SEGN-S-04 — la diagnostica: solo campi noti e valori dalle loro forme; percorsi e nomi dentro un campo non passano', () => {
  const d = costruisciDiagnosticaSegnalazione({
    versione: '0.1.38', installata: true,
    sistema: { piattaforma: 'win32', release: '10.0.26200', arch: 'x64' },
    sessione: { modello: 'C:\\Users\\Mario\\modelli\\Qwen3-8B-Q4_K_M.gguf', provider: 'locale', reasoning: 'high', permessi: 'Full access' },
    terminale: true,
    errori: [{ codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:42:00.000Z' }, { codice: 'non un codice', alle: 'x' }, { codice: 'RUNTIME_UNREACHABLE', alle: null }],
    motoreLocale: false, remoto: true,
  }, { nomi: NOMI })
  assert.deepEqual(d, {
    schema: 'talos.segnalazione-diagnostica.v1',
    versione: '0.1.38', installata: true,
    sistema: { piattaforma: 'windows', nome: 'Windows 11', arch: 'x64' },
    sessione: { modello: 'Qwen3-8B-Q4_K_M.gguf', fornitore: 'locale', sforzo: 'high', permesso: 'Full access', terminale: true },
    errori: [{ codice: 'SHELL_TIMEOUT', alle: '2026-10-29T10:42:00.000Z' }, { codice: 'RUNTIME_UNREACHABLE', alle: null }],
    motoreLocale: false, remoto: true,
  })
  const vuota = costruisciDiagnosticaSegnalazione({}, { nomi: NOMI })
  assert.deepEqual(vuota, { schema: 'talos.segnalazione-diagnostica.v1', versione: null, installata: false, sistema: { piattaforma: 'altro', nome: null, arch: null },
    sessione: null, errori: [], motoreLocale: null, remoto: null })
  const storta = costruisciDiagnosticaSegnalazione({ versione: '../../etc', sessione: { modello: 'mario-model', provider: 'a b', reasoning: 'MOLTO', permessi: 'Boh' } }, { nomi: NOMI })
  assert.equal(storta.versione, null)
  assert.deepEqual(storta.sessione, { modello: '[user]-model', fornitore: null, sforzo: null, permesso: null, terminale: null })
  // al più cinque errori, i più recenti per primi
  const tanti = costruisciDiagnosticaSegnalazione({ errori: Array.from({ length: 8 }, (_, i) => ({ codice: `E_${i}`, alle: `2026-10-29T10:0${i}:00.000Z` })) })
  assert.deepEqual(tanti.errori.map((e) => e.codice), ['E_7', 'E_6', 'E_5', 'E_4', 'E_3'])
  assert.ok(!JSON.stringify(d).includes('Users'))
})

test('SEGN-S-05 — il nome del sistema: Windows 11 dal numero di build, 10 sotto; gli altri dalla loro forma', () => {
  assert.equal(nomeDelSistema('win32', '10.0.22000'), 'Windows 11')
  assert.equal(nomeDelSistema('win32', '10.0.19045'), 'Windows 10')
  assert.equal(nomeDelSistema('darwin', '24.1.0'), 'macOS (Darwin 24.1.0)')
  assert.equal(nomeDelSistema('linux', '6.8.0-45-generic'), 'Linux 6.8.0-45-generic')
  assert.equal(nomeDelSistema('linux', 'pc di mario'), 'Linux')
})

test('SEGN-S-06 — la raccolta: ogni fonte che cade diventa «non si sa», mai un errore; il terminale acceso se una scheda è viva', async () => {
  const d = await raccogliDiagnosticaSegnalazione({
    sessionId: 's1',
    versione: () => ({ versione: '0.1.38', installata: false }),
    sistema: () => ({ piattaforma: 'linux', release: '6.8.0', arch: 'arm64' }),
    riga: () => ({ modelId: 'z-ai/glm-5.3-flash', provider: 'openrouter', reasoning: 'medium', permessi: 'Workspace write' }),
    schede: () => [{ attiva: false }, { attiva: true }],
    errori: () => { throw new Error('C:\\Users\\Mario rotto') },
    motoreLocale: async () => { throw new Error('giù') },
    remoto: async () => ({ acceso: false }),
    nomi: NOMI,
  })
  assert.equal(d.sessione.terminale, true)
  assert.equal(d.sessione.modello, 'z-ai/glm-5.3-flash')
  assert.deepEqual(d.errori, [])
  assert.equal(d.motoreLocale, null)
  assert.equal(d.remoto, false)
  const senzaSessione = await raccogliDiagnosticaSegnalazione({ sessionId: null, riga: () => { throw new Error('non chiamare') }, nomi: NOMI })
  assert.equal(senzaSessione.sessione, null)
})

/* Revisione D del 29/10/2026 (F1, F2): segreti che passavano. Misurati dal revisore con la pulizia vera. */
test('SEGN-S-07 (F1) — un nome di variabile che FINISCE in key/token/secret/password: il valore non passa, con o senza virgolette', () => {
  const righe = [
    'OPENROUTER_API_KEY=abc123secret',
    'ANTHROPIC_API_KEY = "sk-ant-api03-xyz"',
    "export ZAI_API_KEY='x'",
    'GITHUB_TOKEN: ghs_short',
    'db-password=hunter2',
  ]
  for (const riga of righe) {
    const pulita = ripulisciTestoSegnalazione(riga, { nomi: NOMI })
    assert.match(pulita, /\[redacted\]/u, riga)
    for (const valore of ['abc123secret', 'sk-ant-api03-xyz', "'x'", 'ghs_short', 'hunter2']) assert.equal(pulita.includes(valore), false, `${riga} → ${pulita}`)
  }
  // AL CONTRARIO: la prosa con la parola «key» resta com'è
  for (const prosa of ['press the key to continue', 'the key: Enter', 'premi il tasto, la key: Invio', 'token budget is 4000']) {
    assert.equal(ripulisciTestoSegnalazione(prosa, { nomi: NOMI }), prosa)
  }
})

test('SEGN-S-08 (F2) — la chiave di Z.AI (32 esadecimali, un punto, 16+ caratteri) e la chiave d\'accesso AWS non passano', () => {
  const zai = '0123456789abcdef0123456789abcdef.AbCdEfGhIjKlMnOp'
  const aws = 'AKIAIOSFODNN7EXAMPLE'
  const pulita = ripulisciTestoSegnalazione(`zai ${zai} e aws ${aws} fine`, { nomi: NOMI })
  assert.equal(pulita, 'zai [redacted] e aws [redacted] fine')
  // AL CONTRARIO: un hash git o uno sha256 da solo non è una chiave
  const sha = 'a'.repeat(40)
  assert.equal(ripulisciTestoSegnalazione(`commit ${sha}.`, { nomi: NOMI }), `commit ${sha}.`)
})
