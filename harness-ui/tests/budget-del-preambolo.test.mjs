/*
 * #48, TETTO DEL PREAMBOLO («cricchetto»): ciò che TALOS manda al modello PRIMA del lavoro non cresce in silenzio.
 *   Forma: Downloads/TALOS/desktop/in-corso/performance-2026-10-29/PROPOSTA-48-TETTO-DEL-PREAMBOLO-2026-10-30.md, con gli OK di
 *   Desktop, CLI e Mobile (30/10) e le tre strette del 3/11 (OK del Desktop 21:42). Fonti: FONTI-48-TETTO-DEL-PREAMBOLO-2026-11-03.md.
 *   Concorrente: T3 Code `apps/server/src/provider/AgentContextBudget.test.ts:105-130` + `agentContextBudget.json`: il valore misurato
 *   deve essere UGUALE a quello del file, così ogni cambio del testo per il modello passa da una riga del file con la sua nota.
 *
 * COSA SI MISURA: la PRIMA richiesta vera, costruita dalla catena del server (registro → avviaSessione → nucleo) con un solo
 *   fornitore finto (`fetchDiRete`), mai la rete. Per profilo:
 *   · byteSistema  — i messaggi di sistema, TOLTA la nota «dove sei» (cambia con la macchina: si misura a parte, sotto);
 *   · byteNotaDoveSei — la stessa nota scritta da `notaDoveSei` con valori fissi (cartella e casa fittizie);
 *   · byteAttrezzi — JSON dei soli campi che il modello vede (name, description, parameters), come T3 Code (`mcpToolListJsonBytes`);
 *   · nAttrezzi, e tokenStimati (stimaToken del sistema + stimaDegliAttrezzi: la stima del nucleo, accanto ai byte).
 *
 * ⛔ VALORI FISSATI (condizione del Desktop, 3/11 21:42): nient'altro della macchina entra nel numero.
 *   · cartella: due cartelle di prova di nome diverso, e i numeri devono uguagliarsi (prova di controllo PB-02);
 *   · data: il sistema non ne porta (PB-03 lo controlla); il compito è fisso (`x`);
 *   · sistema operativo e WSL: vivono solo nella nota «dove sei», esclusa e rimisurata con valori fissi;
 *   · lingua: nessuna scelta di lingua passa al registro (la conversazione parte da `x`);
 *   · elenco degli attrezzi: il ponte (`attrezziDifferiti`) si passa esplicito per profilo, mai letto dall'ambiente; le funzioni
 *     dell'ospite che accendono attrezzi in più (`process_output`, `local_page`, `view_image`) NON si passano: il profilo è il registro
 *     più il ponte, e lo dice il nome;
 *   · memorie, note, attività, forge e fiducie: cartelle VUOTE e temporanee (di serie il registro legge `harness-ui/.memory-store/`);
 *   · variabili TALOS_*: tolte prima di caricare i moduli, rimesse alla fine;
 *   · fine riga: PB-03 vuole zero CR nel sistema.
 *
 * QUANDO DIVENTA ROSSA: il numero misurato è diverso da `budget-del-preambolo.json`. Se il cambio è voluto, si scrive il valore nuovo
 *   nel file, NELLO STESSO COMMIT, con la nota (data, motivo, di quanto). Più leggero ⇒ rossa anche lei: si abbassa il valore (cricchetto).
 *   Il profilo `cli` sta nel file ma lo misura la suite della CLI (decisione della CLI, 30/10): qui si salta e lo si dice.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ambienteSalvato = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('TALOS_')))
for (const k of Object.keys(ambienteSalvato)) delete process.env[k]
test.after(() => { Object.assign(process.env, ambienteSalvato) })

const { createSessionRegistry } = await import('../src/session-registry.mjs')
const { avviaSessione } = await import('../src/agent-service.mjs')
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs')
const { stimaToken } = await import('../src/kernel/talosHarness.mjs')
const { stimaDegliAttrezzi } = await import('../src/kernel/compattazione-desktop.mjs')
const { notaDoveSei, SEGNO_NOTA_DOVE } = await import('../src/kernel/dove-sei.mjs')
const { attendiScritture } = await import('../src/session-store.mjs')
const { cartellaDiProva } = await import('./aiuto/cartelle-di-prova.mjs')
const { rimuoviCartellaDiProvaAttesa } = await import('./aiuto/rimuovi-cartella-di-prova.mjs')

const BUDGET = JSON.parse(readFileSync(new URL('../budget-del-preambolo.json', import.meta.url), 'utf8'))
const CON_TEMPO = { timeout: 60_000 }

/** I profili misurati QUI: modello (che decide il fornitore) e ponte, esattamente come li sceglie il registro. */
const PROFILI = {
  desktop: { modello: 'z-ai/glm-5.3-flash', attrezziDifferiti: true }, // server.mjs: ponte acceso di serie
  'desktop-gemini': { modello: 'gemini:gemini-3.5-flash-lite', attrezziDifferiti: true }, // il registro lo spegne per Gemini (21/10)
}

const byte = (s) => Buffer.byteLength(s, 'utf8')
const testoDi = (m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p.text ?? '').join(''))
const visibili = (tools) => tools.map((t) => { const f = t.function ?? t; return { name: f.name, description: f.description, parameters: f.parameters ?? f.input_schema } })

/**
 * La prima richiesta CON attrezzi, come la manda il server, in `cartella`. La cartella di lavoro la rimuove QUI, dopo aver chiuso
 * il registro e atteso le scritture (revisione del Desktop 3/11, punto 3: rimossa prima, la sessione poteva essere ancora aperta —
 * la stessa corsa di SERVIZIO-GIRO-09). Il `t.after` si registra per primo, così pulisce anche se la costruzione lancia.
 */
export async function primaRichiesta(t, profilo, cartella) {
  const vuote = []
  let registry = null, cartellaStore = null
  t.after(async () => {
    await registry?.chiudi?.()
    if (cartellaStore) { try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } }
    for (const d of [...vuote, cartella]) await rimuoviCartellaDiProvaAttesa(d)
  })
  const vuota = () => { const d = mkdtempSync(join(tmpdir(), 'talos-pb-vuota-')); vuote.push(d); return d }
  cartellaStore = vuota()
  let corpo = null, fine
  const arrivata = new Promise((r) => { fine = r })
  const fetchDiRete = async (_url, init) => {
    const c = JSON.parse(init.body)
    if (!corpo && c.tools?.length) { corpo = c; fine() }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }
  registry = createSessionRegistry({ cartellaStore, modello: profilo.modello, chiave: 'finta', cartellaEsisteFn: () => true,
    attrezziDifferiti: profilo.attrezziDifferiti,
    cartellaMemoria: vuota(), cartellaNote: vuota(), cartellaAttivita: vuota(), cartellaForge: vuota(),
    cartellaTrustPlugin: vuota(), cartellaTrustHook: vuota(), cartellaTrustMcp: vuota(),
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (o) => talosLavora({ ...o, fetchDiRete }) }) })
  registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' })
  /* revisione del Desktop 3/11, punto 2: il timer si spegne appena la richiesta arriva, sennò tiene vivo il processo 30 s */
  let timer
  try { await Promise.race([arrivata, new Promise((_, ko) => { timer = setTimeout(() => ko(new Error('nessuna richiesta con attrezzi in 30 s')), 30_000) })]) }
  finally { clearTimeout(timer) }
  return corpo
}

/** I numeri del budget da un corpo di richiesta. */
export function misura(corpo) {
  const sistema = corpo.messages.filter((m) => m.role === 'system').map(testoDi)
  const senzaNota = sistema.filter((s) => !s.startsWith(SEGNO_NOTA_DOVE))
  assert.equal(sistema.length - senzaNota.length, 1, 'premessa: la nota «dove sei» è un messaggio di sistema a sé, uno solo')
  const testo = senzaNota.join('\n')
  return {
    byteSistema: byte(testo),
    byteNotaDoveSei: byte(notaDoveSei({ percorso: '<CARTELLA>', casa: 'windows', percorsoLinux: '<CARTELLA-LINUX>' })),
    byteAttrezzi: byte(JSON.stringify(visibili(corpo.tools))),
    nAttrezzi: corpo.tools.length,
    tokenStimati: stimaToken(testo) + stimaDegliAttrezzi(corpo.tools),
  }
}

const CAMPI = ['byteSistema', 'byteNotaDoveSei', 'byteAttrezzi', 'nAttrezzi', 'tokenStimati']
/** Il confronto col file: uguale, campo per campo. Il messaggio dice che cosa fare. */
export function confronta(nome, misurati, attesi = BUDGET.profili[nome]) {
  assert.ok(attesi, `il profilo «${nome}» manca da budget-del-preambolo.json: aggiungilo con i numeri misurati e la nota`)
  const diversi = CAMPI.filter((k) => misurati[k] !== attesi[k])
  if (diversi.length === 0) return
  const righe = diversi.map((k) => `${k}: file ${attesi[k]}, misurato ${misurati[k]} (${misurati[k] > attesi[k] ? '+' : ''}${misurati[k] - attesi[k]})`)
  const cresciuto = diversi.some((k) => misurati[k] > attesi[k])
  assert.fail(`il preambolo del profilo «${nome}» è cambiato:\n  ${righe.join('\n  ')}\n` + (cresciuto
    ? 'Se la crescita è voluta, scrivi i valori nuovi in budget-del-preambolo.json e il perché nella nota, nello stesso commit.'
    : 'È più leggero: abbassa i valori in budget-del-preambolo.json (il tetto scende con le cure) e scrivi perché nella nota.'))
}

for (const [nome, profilo] of Object.entries(PROFILI)) {
  test(`PB-01 [${nome}] — la prima richiesta pesa esattamente quanto dice budget-del-preambolo.json`, CON_TEMPO, async (t) => {
    const cartella = cartellaDiProva('talos-pb-') // la rimuove primaRichiesta, dopo il registro
    confronta(nome, misura(await primaRichiesta(t, profilo, cartella)))
  })
}

test('PB-02 — corsa di controllo (condizione del Desktop): due cartelle di nome diverso danno gli stessi numeri', CON_TEMPO, async (t) => {
  const a = cartellaDiProva('talos-pb-a-'), b = cartellaDiProva('talos-pb-cartella-con-un-nome-molto-piu-lungo-')
  assert.notEqual(a.length, b.length, 'premessa: le due cartelle hanno lunghezze diverse')
  const ma = misura(await primaRichiesta(t, PROFILI.desktop, a)), mb = misura(await primaRichiesta(t, PROFILI.desktop, b))
  assert.deepEqual(mb, ma)
})

test('PB-03 — nel sistema misurato non entrano cartella, data né CR', CON_TEMPO, async (t) => {
  const cartella = cartellaDiProva('talos-pb-') // la rimuove primaRichiesta, dopo il registro
  const corpo = await primaRichiesta(t, PROFILI.desktop, cartella)
  const testo = corpo.messages.filter((m) => m.role === 'system').map(testoDi).filter((s) => !s.startsWith(SEGNO_NOTA_DOVE)).join('\n')
  assert.equal(testo.includes(cartella), false, 'la cartella sta solo nella nota «dove sei»')
  assert.doesNotMatch(testo, /\b20\d\d-\d\d-\d\d\b/u, 'nessuna data nel sistema')
  assert.equal(testo.includes('\r'), false, 'nessun CR')
})

test('PB-04 — AL CONTRARIO: +15 token non dichiarati in una descrizione d\'attrezzo fanno cadere la prova, col messaggio che dice cosa fare', CON_TEMPO, async (t) => {
  const cartella = cartellaDiProva('talos-pb-') // la rimuove primaRichiesta, dopo il registro
  const corpo = await primaRichiesta(t, PROFILI.desktop, cartella)
  const giusto = misura(corpo)
  const f = corpo.tools[0].function ?? corpo.tools[0]
  f.description += ' Always double-check the result before you answer the person.' // 60 caratteri ≈ 15 token
  const gonfiato = misura(corpo)
  assert.ok(gonfiato.tokenStimati - giusto.tokenStimati >= 14, `premessa: la stima sale di ~15 token (${gonfiato.tokenStimati - giusto.tokenStimati})`)
  assert.throws(() => confronta('desktop', gonfiato, giusto), /cambiato[\s\S]*byteAttrezzi[\s\S]*scrivi i valori nuovi/u)
  assert.throws(() => confronta('desktop', giusto, gonfiato), /più leggero: abbassa i valori/u, 'anche più leggero è rosso (cricchetto)')
  confronta('desktop', giusto, giusto)
})

test('PB-05 — il file dichiara ogni profilo con una nota; `cli` lo misura la suite della CLI', () => {
  for (const [nome, voce] of Object.entries(BUDGET.profili)) assert.ok(typeof voce.nota === 'string' && voce.nota.length > 10, `${nome}: manca la nota`)
  for (const nome of Object.keys(PROFILI)) assert.ok(BUDGET.profili[nome], `${nome} manca dal file`)
  assert.match(BUDGET.profili.cli?.misurataDa ?? '', /CLI/u, 'la voce cli dice chi la misura')
})

/*
 * PB-06 — il KERNEL NUDO (`talosLavora` senza registro, come lo chiamano E-NONENTRA-01 e ZK3-01): quanto pesano gli schemi che i loro
 *   fornitori finti contano (`stimaDegliAttrezzi`). Quelle prove leggono `kernel-nudo` da questo file e spostano la scena di quanto gli
 *   schemi si sono spostati dalla loro taratura (OK del Desktop, 3/11 22:33): prima ogni crescita degli schemi le faceva cadere e si
 *   ritaravano a mano (R-24/R-25 il 29/10, R-33 il 30/10).
 */
const CAMPI_NUDO = ['nAttrezzi', 'caratteriSchemi', 'tokenAttrezzi']
export async function richiestaDelKernelNudo(t) {
  const cartella = cartellaDiProva('talos-pb-nudo-')
  t.after(() => rimuoviCartellaDiProvaAttesa(cartella))
  let corpo = null
  const fetchDiRete = async (_url, init) => {
    const c = JSON.parse(init.body)
    if (!corpo && c.tools?.length) corpo = c
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
  }
  await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [{ role: 'user', content: 'x' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access' })
  assert.ok(corpo, 'premessa: il kernel ha mandato una richiesta con attrezzi')
  return { nAttrezzi: corpo.tools.length, caratteriSchemi: JSON.stringify(corpo.tools).length, tokenAttrezzi: stimaDegliAttrezzi(corpo.tools) }
}

test('PB-06 [kernel-nudo] — gli schemi del kernel senza registro pesano esattamente quanto dice il file (li leggono E-NONENTRA-01 e ZK3-01)', CON_TEMPO, async (t) => {
  const misurati = await richiestaDelKernelNudo(t)
  const attesi = BUDGET.profili['kernel-nudo']
  assert.ok(attesi, 'il profilo «kernel-nudo» manca da budget-del-preambolo.json')
  const diversi = CAMPI_NUDO.filter((k) => misurati[k] !== attesi[k])
  assert.deepEqual(diversi, [], `kernel-nudo è cambiato: ${diversi.map((k) => `${k} file ${attesi[k]}, misurato ${misurati[k]}`).join('; ')}. `
    + 'Scrivi i valori nuovi nel file con la nota, nello stesso commit: E-NONENTRA-01 e ZK3-01 si spostano da sole di altrettanto.')
})
