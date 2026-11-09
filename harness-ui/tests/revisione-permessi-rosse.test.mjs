/*
 * Revisione avversaria del blocco permessi (04/11/2026). Prove ROSSE dei reperti, da copiare nel giro di cure.
 * ⛔ Nessun comando si esegue: la persona (finta) risponde sempre NO, la cartella è temporanea, la casa è finta.
 * Da mettere in harness-ui/tests/ (gli import sono relativi a quella cartella).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs'

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-rev-perm-')))
const casa = join(radice, 'casa')
mkdirSync(casa, { recursive: true })
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
process.env.USERPROFILE = casa
process.env.HOME = casa
test.after(() => { for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
let n = 0
const progetto = () => { n += 1; const c = join(radice, 'lavoro', `p${n}`); mkdirSync(c, { recursive: true }); return c }

/* il giro vero del nucleo: il modello chiede UNA shell, l'ospite risponde NO e si guarda la carta */
async function cartaDelNucleo({ livelloAccesso, comando, accessoPienoDellOspite, cartella = progetto() }) {
  const carte = []
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'k0', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] }]
  let i = 0
  const fetchDiRete = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(i++, 1)] }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' })
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete, livelloAccesso, consensiSessione: {},
    chiediApprovazioneFn: async (a) => { carte.push(a); return false },
    ...(accessoPienoDellOspite ? { accessoPienoDellOspite } : {}),
  })
  return carte
}

test('REPERTO CLI (ALTO) ROSSA — l\'ospite in Accesso pieno (CLI: gates «On request» + accessoPienoDellOspite) riceve la carta di `rm -rf .` CON `cancellazioneCritica`', async () => {
  const carte = await cartaDelNucleo({ livelloAccesso: 'su-richiesta', comando: 'rm -rf .', accessoPienoDellOspite: () => true })
  const shell = carte.filter((c) => c.tipo === 'shell')
  assert.equal(shell.length, 1, 'una carta per la shell')
  assert.equal(shell[0].cancellazioneCritica?.perche, 'progetto', `la carta deve dire la cancellazione critica, altrimenti il bypass della CLI risponde sì: ${JSON.stringify(Object.keys(shell[0]))}`)
})

test('REPERTO CLI — stesso caso a livello del cancello: `verificaPermessoScrittura` con l\'ospite in Accesso pieno mette `cancellazioneCritica` sulla carta', async () => {
  const carte = []
  await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf ..' }, {
    livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite: () => true,
    chiediApprovazioneFn: async (a) => { carte.push(a); return false },
  })
  assert.equal(carte[0]?.cancellazioneCritica?.perche, 'sopra-il-progetto')
})

test('GUARDIA DEL MOBILE (deve restare VERDE prima e dopo la cura A) — livello «accesso-pieno» senza ospite: la critica si calcola nel ramo accessoPieno', async () => {
  const carte = await cartaDelNucleo({ livelloAccesso: 'accesso-pieno', comando: 'rm -rf .' })
  assert.equal(carte.length, 1)
  assert.equal(carte[0].cancellazioneCritica?.perche, 'progetto')
  const nessuna = await cartaDelNucleo({ livelloAccesso: 'accesso-pieno', comando: 'rm -rf build' })
  assert.equal(nessuna.length, 0, 'il lavoro di ogni giorno non chiede')
})

test('REPERTO MOBILE (BASSO) ROSSA — le altre grafie della memoria condivisa del telefono sono la radice del telefono', () => {
  dimenticaPercorsiVeri()
  const a = { cartella: '/storage/emulated/0/Progetti/orca', home: '/data/user/0/ai.talos.dev/files/home', piattaforma: 'android', ambiente: {}, realpathFn: (p) => p }
  for (const comando of ['rm -rf /mnt/user/0/emulated/0/*', 'rm -rf /storage/emulated/10/*', 'rm -rf /storage/emulated/10']) {
    assert.ok(cancellazioneCritica(comando, a), comando)
  }
})

test('REPERTI DEL PARSER ROSSE — grafie che la funzione di decisione non vede (Windows, solo decisione, niente esecuzione)', () => {
  dimenticaPercorsiVeri()
  const w = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p }
  const casi = [
    'rm -rf C:\\Users\\NINO~1', // 8.3 della casa (Claude Code CHANGELOG.md:1319 lo copre)
    'Remove-Item -Recurse -Force -Path:C:\\Users\\nino', // -Path:valore di PowerShell
    'powershell -Com "Remove-Item -Recurse C:\\Users"', // -Command abbreviato
    'cd C:\\Users && rm -rf nino', // cd prima del bersaglio relativo
    "r''m -rf ..", // apici dentro il nome del comando
    'sudo -u root rm -rf ..', // opzione di sudo con valore
    'timeout 5 rm -rf ..', // involucro non elencato
    'eval "rm -rf .."', // eval
    'rm -rf ../prog*', // glob parziale sul progetto
    'cmd /c cmd /c cmd /c cmd /c cmd /c cmd /c rd /s /q ..', // oltre il tetto di annidamento: fallisce APERTO
  ]
  for (const comando of casi) assert.ok(cancellazioneCritica(comando, w), comando)
})

/* ── Giro di cure 04/11/2026 (sezione 7, punto 5): A2 nel nucleo ─────────────────────────────────────────────────────────── */

test('REPERTO A2 (ALTO) — l\'ospite in Accesso pieno: leggere la chiave dei biglietti porta `credenzialeDellaCasa` sulla carta (161)', async () => {
  const prove = [
    { tipo: 'shell', comando: 'cat ~/.talos-biglietti/4174.chiave' },
    { tipo: 'shell', comando: 'cat ~/.talos-bigli*/4174.chiave' },
    { tipo: 'leggi', percorso: join(casa, '.talos-biglietti', 'x.chiave') },
    { tipo: 'shell', comando: 'cat ~/.ssh/id_ed25519' },
  ]
  for (const azione of prove) {
    const carte = []
    const esito = await verificaPermessoScrittura(azione, {
      livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite: () => true,
      chiediApprovazioneFn: async (a) => { carte.push(a); return false },
    })
    assert.equal(esito.consentito, false, JSON.stringify(azione))
    assert.equal(carte.length, 1, JSON.stringify(azione))
    assert.equal(carte[0].segreto?.credenzialeDellaCasa, true, `${JSON.stringify(azione)}: ${JSON.stringify(carte[0].segreto)}`)
  }
})

test('A2 AL CONTRARIO — senza l\'ospite in pieno («On request» vero della CLI e del desktop) la stessa carta NON cambia forma', async () => {
  const carte = []
  await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf .' }, {
    livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite: () => false,
    chiediApprovazioneFn: async (a) => { carte.push(a); return false },
  })
  assert.equal(carte.length, 1)
  /* ⛔ Decisione 208 (owner 04/11/2026 sera) ha deciso M2: la cancellazione critica porta il suo segno in OGNI modo, pieno o no
     (`cura-208-ogni-modo.test.mjs`). Il contrario di A2 si prova quindi sull'altra carta del pieno, la credenziale di casa (161). */
  assert.equal(carte[0].cancellazioneCritica?.perche, 'progetto', '208: anche fuori dal pieno la carta critica ha il segno')
  for (const [nome, accessoPienoDellOspite] of [['ospite non in pieno', () => false], ['ospite che lancia', () => { throw new Error('ospite rotto') }]]) {
    const lancia = []
    await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat ~/.ssh/id_ed25519' }, {
      livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite,
      chiediApprovazioneFn: async (a) => { lancia.push(a); return false },
    })
    assert.equal(lancia.length, 1, nome)
    assert.notEqual(lancia[0].segreto?.credenzialeDellaCasa, true, `${nome}: vale «no», la carta non prende il segno del pieno`)
  }
  const sempre = []
  const passa = await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf build' }, {
    livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite: () => true, permessiPerAttrezzo: { shell: 'sempre' },
    chiediApprovazioneFn: async (a) => { sempre.push(a); return false },
  })
  assert.equal(passa.consentito, true, 'il lavoro di ogni giorno col pieno dell\'ospite e shell: sempre non chiede')
  const critica = await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf .' }, {
    livelloAccesso: 'su-richiesta', cartella: progetto(), consensiSessione: {}, accessoPienoDellOspite: () => true, permessiPerAttrezzo: { shell: 'sempre' },
    chiediApprovazioneFn: async (a) => { sempre.push(a); return false },
  })
  assert.equal(critica.via, 'cancellazione-critica', 'anche con shell: sempre la critica chiede')
  assert.equal(sempre.length, 1)
})

test('A1 IL FILO — `avviaSessione` porta il pieno dell\'ospite fino a `talosLavora` (la lezione: un\'opzione nuova si prova lungo tutto il filo)', async () => {
  const { avviaSessione } = await import('../src/agent-service.mjs')
  const visti = []
  const kernel = async (input) => { visti.push(input.accessoPienoDellOspite); return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], usage: {} } }
  let chiamate = 0
  await avviaSessione({ cartella: progetto(), task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernel,
    livelloAccesso: 'su-richiesta', accessoPienoDellOspite: () => { chiamate += 1; return true } })
  assert.equal(typeof visti[0], 'function', 'il kernel riceve la funzione dell\'ospite')
  assert.equal(visti[0](), true)
  assert.ok(chiamate >= 1, 'letta viva, non fotografata')
  await avviaSessione({ cartella: progetto(), task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: kernel, livelloAccesso: 'su-richiesta' })
  assert.equal(visti[1], undefined, 'AL CONTRARIO: senza l\'opzione non arriva niente')
})
