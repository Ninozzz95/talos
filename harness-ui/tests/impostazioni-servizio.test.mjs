/*
 * Fase 8 «Impostazioni dalla chat» (owner 01/11/2026) — il CATALOGO e il SERVIZIO del server, con fonti in memoria.
 *   · CAT: chiavi stabili (contratto col Mobile), niente segreti/account/distruttive/riserve;
 *   · Performance 3, 4, 5: `list` vuoto = sole sezioni; al più 15 voci e < 2 KB; < 5 ms al 95° percentile; una riga per cambio;
 *   · revisione attesa, cambio fra la carta e il sì, tutto o niente, ricevute e Annulla;
 *   · Mobile 1, 2, 5: destinatario «finestre-pc», `dove`, l'origine col dispositivo.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { CATALOGO_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI, controllaValore, voceDelCatalogo } from '../src/impostazioni/catalogo-impostazioni.mjs'
import { creaServizioImpostazioni, DESTINATARIO_FINESTRE_PC, EVENTO_IMPOSTAZIONI_FINESTRA } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione, creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* Il contratto col Mobile (sua condizione 4): una chiave che cambia qui passa da lui. */
const CHIAVI_DEL_CONTRATTO = [
  'appearance.theme', 'appearance.colorMode', 'appearance.density', 'appearance.interfaceSize', 'appearance.chatTextSize', 'appearance.newSessionView', 'appearance.messageStyle',
  'appearance.streamingAnimation', 'appearance.chatFullWidth', 'appearance.userBubbleFullWidth', 'appearance.immersiveHeader',
  'language.interface', 'language.replies', 'motion.animatedBackground', 'motion.interfaceMotion', 'motion.reduced',
  'chat.questionTimeout', 'chat.stopWithAgents', 'chat.windowPresentation', 'chat.liveBlocks', 'updates.automatic',
  'conversation.model', 'conversation.planModel', 'conversation.reasoningEffort', 'conversation.fastModeRequested', 'conversation.permissions',
  'conversation.coordination', 'conversation.folderTrust', 'conversation.commandShell', 'conversation.bangCommandsInChat',
  'context.engine', 'context.summaryModel', 'context.summaryFallback', 'models.localWindowFull', 'tools.defaultCommandShell', 'tools.wslNormalUser', 'tools.computerUse', 'tools.webSearchSource',
]

/** Fonti in memoria con la stessa forma di quelle vere; `rompi` fa fallire la scrittura di una fonte. */
function fontiFinte({ rompi = null } = {}) {
  const stato = {
    contesto: { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null },
    comandi: { doveDiSerie: null },
    finestraLocale: { scelta: 'allarga' },
    wsl: { usaUtenteNormale: true },
    ricerca: { source: 'duckduckgo' },
  }
  const scritture = []
  const fonte = (nome) => ({
    leggi: async () => ({ ...stato[nome] }),
    scrivi: async (patch, contesto) => {
      scritture.push({ nome, patch, origine: contesto?.origine ?? null })
      if (rompi === nome) throw Object.assign(new Error(`${nome} refused it`), { code: 'X' })
      Object.assign(stato[nome], patch)
    },
  })
  return { fonti: Object.fromEntries(Object.keys(stato).map((n) => [n, fonte(n)])), stato, scritture }
}

/** Un registro finto con la forma di `impostazioniCorrenti`/`aggiornaImpostazioni`/le due scelte sui comandi. */
function registroFinto() {
  const s = { modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: { effort: 'high' }, fasciaVeloce: false, permessi: 'Workspace write',
    permessiPerAttrezzo: {}, doveGiranoIComandi: null, comandiNellaConversazione: false }
  const chiamate = []
  return {
    chiamate, s,
    impostazioniCorrenti: (id) => (id === 'sess-1' ? structuredClone(s) : null),
    aggiornaImpostazioni: async (id, patch, opzioni) => {
      chiamate.push({ tipo: 'aggiorna', id, patch, origine: opzioni?.origine })
      if (patch.unisciPermessiPerAttrezzo) { s.permessiPerAttrezzo = { ...s.permessiPerAttrezzo, ...patch.unisciPermessiPerAttrezzo }; delete patch.unisciPermessiPerAttrezzo }
      Object.assign(s, patch)
      return { aggiornate: true }
    },
    doveGiranoIComandi: async (id, dove, opzioni) => { chiamate.push({ tipo: 'dove', dove, origine: opzioni?.origine }); s.doveGiranoIComandi = dove; return { ok: true } },
    comandiNellaConversazione: async (id, acceso, opzioni) => { chiamate.push({ tipo: 'comandi', acceso, origine: opzioni?.origine }); s.comandiNellaConversazione = acceso; return { ok: true } },
  }
}

function servizio(extra = {}) {
  const f = fontiFinte(extra)
  const registro = registroFinto()
  const copia = creaCopiaFinestra()
  let n = 0
  const s = creaServizioImpostazioni({ fonti: { ...f.fonti, sessione: creaFonteSessione(() => registro) }, copiaFinestra: copia, idFn: () => `id-${++n}`,
    prezzoDelModelloFn: (id) => ({ 'z-ai/glm-5.3-flash': { in: 0.1, out: 0.4 }, 'openai/gpt-6': { in: 5, out: 20 } })[id] ?? null, attesaFinestraMs: 200, ...extra.opzioni })
  return { s, f, registro, copia }
}
const revisione = (testo) => Number(/Revision (\d+)/u.exec(testo)?.[1])

test('CAT-01: chiavi uniche, senza trattino, nell\'ordine del contratto col Mobile; sezioni note; ogni voce ha EN e IT', () => {
  assert.deepEqual(CATALOGO_IMPOSTAZIONI.map((v) => v.chiave), CHIAVI_DEL_CONTRATTO)
  for (const v of CATALOGO_IMPOSTAZIONI) {
    assert.doesNotMatch(v.chiave, /-/u, v.chiave)
    assert.ok(SEZIONI_IMPOSTAZIONI.includes(v.sezione), v.chiave)
    assert.ok(v.testo.en && v.testo.it, v.chiave)
    assert.ok(['app', 'conversazione'].includes(v.ambito) && ['server', 'finestra'].includes(v.dove), v.chiave)
    assert.ok([null, 'sicurezza', 'costo', 'aggiornamenti'].includes(v.gruppo), v.chiave)
  }
})

test('CAT-02: fuori segreti, account, fiducia di ganci e connettori, distruttive, riserve dei fornitori e dimensioni', () => {
  /* Forma permessi 2 §5 (decisioni 173, 189, 196): la fiducia della CARTELLA entra (`conversation.folderTrust`, gruppo sicurezza); quella
     dei singoli ganci, server MCP e plugin resta fuori. Tolta la sua voce, nessun'altra parla di fiducia. */
  const fiducia = CATALOGO_IMPOSTAZIONI.filter((v) => /trust/iu.test(JSON.stringify(v)))
  assert.deepEqual(fiducia.map((v) => [v.chiave, v.gruppo]), [['conversation.folderTrust', 'sicurezza']])
  const tutto = JSON.stringify(CATALOGO_IMPOSTAZIONI.filter((v) => v.chiave !== 'conversation.folderTrust')).toLowerCase()
  for (const vietata of ['apikey', 'api key', 'token', 'secret', 'password', 'fallbackproviders', 'trust', 'hook', 'mcp', 'plugin', 'delete', 'export', 'import', 'restore', 'panelwidth', 'modalsize', 'signin', 'login'])
    assert.equal(tutto.includes(vietata), false, vietata)
  /* i gruppi delle decisioni: D3 sicurezza, D4 costo, D7 aggiornamenti */
  const gruppo = (k) => voceDelCatalogo(k).gruppo
  assert.deepEqual(['conversation.permissions', 'conversation.coordination', 'tools.wslNormalUser', 'tools.computerUse'].map(gruppo), ['sicurezza', 'sicurezza', 'sicurezza', 'sicurezza'])
  assert.deepEqual(['conversation.model', 'conversation.reasoningEffort', 'conversation.fastModeRequested', 'context.summaryModel'].map(gruppo), ['costo', 'costo', 'costo', 'costo'])
  assert.equal(gruppo('updates.automatic'), 'aggiornamenti')
  assert.deepEqual(controllaValore(voceDelCatalogo('appearance.theme'), 'neon'), { ok: false, motivo: `appearance.theme is one of: ${voceDelCatalogo('appearance.theme').valori.join(', ')}.` })
  assert.deepEqual(controllaValore(voceDelCatalogo('chat.questionTimeout'), 60), { ok: true, valore: '60' })
})

test('SRV-01 (Performance 3): list senza parole né sezione dà le sole sezioni col numero; con sezione o parole ≤ 15 voci e < 2 KB', async () => {
  const { s } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const vuoto = await fn('app_settings', { action: 'list' }, { fase: 'esegui' })
  assert.match(vuoto.testo, /^TALOS settings by section: appearance \(11\), language \(2\), motion \(3\), chat \(3\), conversation \(8\), context \(3\), models \(1\), tools \(3\), updates \(1\)\./u)
  assert.doesNotMatch(vuoto.testo, /\n/u, 'una riga sola, nessuna voce')
  for (const section of SEZIONI_IMPOSTAZIONI) {
    const r = await fn('app_settings', { action: 'list', section }, { fase: 'esegui' })
    const voci = r.testo.split('\n').filter((l) => l.startsWith('- '))
    assert.ok(voci.length >= 1 && voci.length <= 15, section)
    assert.ok(Buffer.byteLength(r.testo) < 2048, `${section}: ${Buffer.byteLength(r.testo)} byte`)
  }
  for (const query of ['theme', 'model', 'language', 'on', 'co', 'te', 'commands']) {
    const r = await fn('app_settings', { action: 'list', query }, { fase: 'esegui' })
    assert.ok(r.testo.split('\n').filter((l) => l.startsWith('- ')).length <= 15, query)
    assert.ok(Buffer.byteLength(r.testo) < 2048, `${query}: ${Buffer.byteLength(r.testo)} byte`)
  }
  /* «on» tocca 26 voci (24 prima dei nomi della forma §5: «conversations» nel nome della scelta di serie dei comandi; 26 con
     `appearance.newSessionView`, 03/11): se ne mostrano 15 e si dice quante restano (prova che il tetto morde davvero) */
  const molte = await fn('app_settings', { action: 'list', query: 'on' }, { fase: 'esegui' })
  assert.equal(molte.testo.split('\n').filter((l) => l.startsWith('- ')).length, 15)
  assert.match(molte.testo, /^11 more match: narrow the query\.$/mu)
  const tema = await fn('app_settings', { action: 'list', query: 'appearance.theme' }, { fase: 'esegui' })
  assert.match(tema.testo, /^- appearance\.theme = "forge"; one of forge, paper, terminal, aurora, glacier, ember, atlas, noir, signal, violet, claudius, basicus, telemetry, calm; app/u)
  const fornitori = await fn('app_settings', { action: 'list', query: 'excluded providers' }, { fase: 'esegui' })
  assert.match(fornitori.testo, /use provider_exclusions_list/u, 'il rimando all\'attrezzo di dominio')
  assert.equal((await fn('app_settings', { action: 'list', section: 'nope' }, { fase: 'esegui' })).ok, false)
})

test('SRV-02 (Performance 4): list resta sotto i 5 ms al 95° percentile', async () => {
  const { s } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const tempi = []
  for (let i = 0; i < 300; i++) {
    const t0 = performance.now()
    await fn('app_settings', { action: 'list', ...(i % 3 === 0 ? {} : i % 3 === 1 ? { section: 'appearance' } : { query: 'model' }) }, { fase: 'esegui' })
    tempi.push(performance.now() - t0)
  }
  tempi.sort((a, b) => a - b)
  const p95 = tempi[Math.floor(tempi.length * 0.95)]
  assert.ok(p95 < 5, `p95 ${p95.toFixed(3)} ms`)
})

test('SRV-03 (Performance 5, Mobile 2 e 5): set con la carta, poi una riga per cambio, la ricevuta e l\'origine col dispositivo', async () => {
  const { s, f, registro } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1', dispositivoFn: () => 'pad-7' })
  const rev = revisione((await fn('app_settings', { action: 'list', section: 'conversation' }, { fase: 'esegui' })).testo)
  const arg = { action: 'set', expected_revision: rev, changes: [{ key: 'conversation.model', value: 'openai/gpt-6' }, { key: 'context.engine', value: 'legacy' }, { key: 'conversation.coordination', value: true }] }
  const anteprima = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: 'c1' })
  assert.equal(anteprima.carta, true)
  assert.equal(anteprima.azione.tipo, 'app_settings')
  assert.equal(anteprima.azione.dove, 'pc')
  assert.deepEqual(anteprima.azione.cambi.map((c) => [c.chiave, c.prima, c.dopo, c.gruppo]),
    [['conversation.model', 'z-ai/glm-5.3-flash', 'openai/gpt-6', 'costo'], ['context.engine', 'engine', 'legacy', null], ['conversation.coordination', false, true, 'sicurezza']])
  assert.deepEqual(anteprima.azione.cambi[0].prezzo, { prima: { in: 0.1, out: 0.4 }, dopo: { in: 5, out: 20 } }, 'D4: la carta dice il prezzo prima → dopo')
  const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: 'c1' })
  assert.equal(fatto.ok, true)
  const righe = fatto.testo.split('\n')
  assert.equal(righe.length, 3, 'una riga per cambio')
  assert.match(righe[0], /^conversation\.model: "z-ai\/glm-5\.3-flash" → "openai\/gpt-6" \(this conversation; \$0\.10\/\$0\.40 per million tokens in\/out → \$5\.00\/\$20 per million tokens in\/out\)\.$/u)
  assert.match(righe[2], /Receipt set-/u)
  assert.equal(f.stato.contesto.motore, 'legacy')
  assert.equal(registro.s.modello, 'openai/gpt-6')
  assert.equal(registro.s.permessiPerAttrezzo.delega_sottotask, 'sempre')
  const aggiorna = registro.chiamate.find((c) => c.tipo === 'aggiorna')
  assert.deepEqual(aggiorna.origine, { tipo: 'modello', sessionId: 'sess-1', dispositivoId: 'pad-7' }, 'Mobile 5: l\'origine «modello» col dispositivo')
  const [ricevuta] = await s.ricevute()
  assert.deepEqual(ricevuta.origine, { tipo: 'modello', sessionId: 'sess-1', dispositivoId: 'pad-7' })
  assert.equal(ricevuta.cambi.length, 3)
})

test('SRV-04: revisione attesa — rifiuta se la persona ha cambiato la stessa voce dopo list, e se l\'ha cambiata fra la carta e il sì', async () => {
  const { s, f } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const rev = revisione((await fn('app_settings', { action: 'list', section: 'context' }, { fase: 'esegui' })).testo)
  f.stato.contesto.motore = 'legacy' // la persona, dalle Impostazioni
  const dopoList = await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'anteprima', toolCallId: 'a' })
  assert.equal(dopoList.ok, false)
  assert.match(dopoList.messaggio, /changed after revision/u)
  /* un'altra voce cambiata dalla persona non blocca questa (la revisione è per voce) */
  const rev2 = revisione((await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' })).testo)
  f.stato.comandi.doveDiSerie = 'wsl2'
  await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' })
  const altra = await fn('app_settings', { action: 'set', expected_revision: rev2, changes: [{ key: 'tools.wslNormalUser', value: false }] }, { fase: 'anteprima', toolCallId: 'b' })
  assert.equal(altra.ok, true)
  /* fra la carta e il sì */
  const rev3 = revisione((await fn('app_settings', { action: 'list', section: 'models' }, { fase: 'esegui' })).testo)
  const arg = { action: 'set', expected_revision: rev3, changes: [{ key: 'models.localWindowFull', value: 'ask' }] }
  assert.equal((await fn('app_settings', arg, { fase: 'anteprima', toolCallId: 'c' })).carta, true)
  f.stato.finestraLocale.scelta = 'riassumi'
  const esegui = await fn('app_settings', arg, { fase: 'esegui', toolCallId: 'c' })
  assert.equal(esegui.ok, false)
  assert.equal(f.stato.finestraLocale.scelta, 'riassumi', 'non ha scritto sopra la persona')
  /* una revisione che TALOS non ha dato, o mancante */
  assert.match((await fn('app_settings', { action: 'set', expected_revision: rev3 + 10_000, changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'anteprima' })).messaggio, /not one TALOS gave/u)
  assert.match((await fn('app_settings', { action: 'set', changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'anteprima' })).messaggio, /expected_revision/u)
  /* Prova dal vivo del Desktop (01/11 sera): glm-5.3-flash ricopiava una revisione di 13 cifre troncata a 5, e il rifiuto diceva
     «someone else changed it», falso. La revisione ora è corta (5 cifre) e una troncata o di prima del riavvio dice il suo motivo. */
  assert.ok(rev3 < 100_000, `la revisione è corta da ricopiare: ${rev3}`)
  const troncata = Math.floor(rev3 / 1000)
  const msgTroncata = (await fn('app_settings', { action: 'set', expected_revision: troncata, changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'anteprima' })).messaggio
  assert.match(msgTroncata, /before TALOS restarted, or was copied wrong/u)
  assert.doesNotMatch(msgTroncata, /someone else/u)
})

test('SRV-05: tutto o niente — se una fonte rifiuta, ciò che era già scritto torna com\'era', async () => {
  const { s, f } = servizio({ rompi: 'comandi' })
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const rev = revisione((await fn('app_settings', { action: 'list', query: 'commands' }, { fase: 'esegui' })).testo)
  const r = await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'legacy' }, { key: 'tools.defaultCommandShell', value: 'wsl2' }] }, { fase: 'esegui' })
  assert.equal(r.ok, false)
  assert.match(r.messaggio, /nothing was changed: comandi refused it/u)
  assert.equal(f.stato.contesto.motore, 'engine', 'il motore è tornato com\'era')
  assert.deepEqual(f.scritture.filter((w) => w.nome === 'contesto').map((w) => w.patch.motore), ['legacy', 'engine'])
  assert.equal((await s.ricevute()).length, 0, 'nessuna ricevuta per un cambio non fatto')
})

test('SRV-06 (Mobile 1, D2): la preferenza della finestra va nella copia, l\'evento porta il destinatario «finestre-pc», e la prima finestra che risponde vince', async () => {
  const { s, copia } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1', dispositivoFn: () => null })
  const eventi = []
  const smetti = s.finestra.ascolta((e) => {
    eventi.push(e)
    setTimeout(() => s.finestra.risposta({ richiestaId: e.richiestaId, applicati: { themePreset: 'paper' } }), 5)
    setTimeout(() => assert.deepEqual(s.finestra.risposta({ richiestaId: e.richiestaId, applicati: {} }), { accettata: false }), 30)
  })
  const rev = revisione((await fn('app_settings', { action: 'list', section: 'appearance' }, { fase: 'esegui' })).testo)
  const r = await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'appearance.theme', value: 'paper' }] }, { fase: 'esegui' })
  assert.match(r.testo, /^appearance\.theme: "forge" → "paper" \(this app, window preference\)\. The open window applied it\./u)
  assert.equal(eventi.length, 1)
  assert.equal(eventi[0].type, EVENTO_IMPOSTAZIONI_FINESTRA)
  assert.equal(eventi[0].destinatario, DESTINATARIO_FINESTRE_PC)
  assert.deepEqual(eventi[0].valori, { themePreset: 'paper' })
  assert.equal((await copia.leggi()).valori.themePreset, 'paper')
  smetti()
  /* senza finestre aperte non si aspetta nessuno: vale alla prossima apertura */
  const t0 = Date.now()
  const rev2 = revisione((await fn('app_settings', { action: 'list', section: 'motion' }, { fase: 'esegui' })).testo)
  const chiusa = await fn('app_settings', { action: 'set', expected_revision: rev2, changes: [{ key: 'motion.reduced', value: true }] }, { fase: 'esegui' })
  assert.match(chiusa.testo, /No TALOS window is open: it applies when one opens\./u)
  assert.ok(Date.now() - t0 < 150, 'nessuna attesa senza finestre')
  /* la finestra che non risponde: il tetto, poi lo si dice */
  s.finestra.ascolta(() => {})
  const rev3 = revisione((await fn('app_settings', { action: 'list', section: 'chat' }, { fase: 'esegui' })).testo)
  const muta = await fn('app_settings', { action: 'set', expected_revision: rev3, changes: [{ key: 'chat.stopWithAgents', value: 'all' }] }, { fase: 'esegui' })
  assert.match(muta.testo, /Saved; no window confirmed it yet\./u)
  assert.equal((await copia.leggi()).valori.stopWithAgents, 'tutte', 'nella copia col valore interno')
})

test('SRV-07: undo con la ricevuta — dalla stessa conversazione, mai sopra una scelta più nuova; e l\'Annulla della persona', async () => {
  const { s, f } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const rev = revisione((await fn('app_settings', { action: 'list', section: 'context' }, { fase: 'esegui' })).testo)
  const set = await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'legacy' }] }, { fase: 'esegui' })
  const id = /Receipt (set-\w+)/u.exec(set.testo)[1]
  const altra = s.perLaSessione({ sessionId: 'sess-2' })
  assert.match((await altra('app_settings', { action: 'undo', receipt_id: id }, { fase: 'anteprima' })).messaggio, /another conversation/u)
  const carta = await fn('app_settings', { action: 'undo', receipt_id: id }, { fase: 'anteprima' })
  assert.equal(carta.carta, true)
  assert.deepEqual(carta.azione.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['context.engine', 'legacy', 'engine']])
  const fatto = await fn('app_settings', { action: 'undo', receipt_id: id }, { fase: 'esegui' })
  assert.match(fatto.testo, /^context\.engine: "legacy" → "engine" \(undone\)\./u)
  assert.equal(f.stato.contesto.motore, 'engine')
  assert.match((await fn('app_settings', { action: 'undo', receipt_id: id }, { fase: 'anteprima' })).messaggio, /already undone/u)
  /* mai sopra una scelta più nuova */
  const rev2 = revisione((await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' })).testo)
  const set2 = await fn('app_settings', { action: 'set', expected_revision: rev2, changes: [{ key: 'tools.defaultCommandShell', value: 'windows' }] }, { fase: 'esegui' })
  const id2 = /Receipt (set-\w+)/u.exec(set2.testo)[1]
  f.stato.comandi.doveDiSerie = 'wsl2'
  assert.match((await fn('app_settings', { action: 'undo', receipt_id: id2 }, { fase: 'anteprima' })).messaggio, /changed again since/u)
  /* l'Annulla della persona sulla riga dell'esito */
  f.stato.comandi.doveDiSerie = 'windows'
  const persona = await s.annullaDallaPersona({ receiptId: id2, origine: { tipo: 'pc' } })
  assert.equal(persona.annullata, id2)
  assert.equal(f.stato.comandi.doveDiSerie, null)
  const [ultima] = await s.ricevute()
  assert.deepEqual(ultima.origine, { tipo: 'pc' })
  assert.equal(ultima.annulla, id2)
})

test('SRV-08: «nothing to change», pick, valori e chiavi sbagliate si rifiutano subito, senza carta', async () => {
  const { s } = servizio()
  const fn = s.perLaSessione({ sessionId: 'sess-1' })
  const rev = revisione((await fn('app_settings', { action: 'list', section: 'context' }, { fase: 'esegui' })).testo)
  assert.deepEqual(await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'anteprima' }), { ok: true, carta: false })
  assert.match((await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'engine' }] }, { fase: 'esegui' })).testo, /^Nothing to change/u)
  assert.match((await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'openrouter.apiKey', value: 'x' }] }, { fase: 'anteprima' })).messaggio, /unknown setting/u)
  assert.match((await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'context.engine', value: 'turbo' }] }, { fase: 'anteprima' })).messaggio, /one of: engine, legacy/u)
  assert.match((await fn('app_settings', { action: 'set', expected_revision: rev, scope: 'app', changes: [{ key: 'conversation.model', value: 'a/b' }] }, { fase: 'anteprima' })).messaggio, /applies to this conversation/u)
  assert.match((await fn('app_settings', { action: 'pick', key: 'appearance.colorMode' }, { fase: 'esegui' })).testo, /Choices: system, dark, light\. Ask the person with ask_user_question/u)
  assert.match((await fn('app_settings', { action: 'boh' }, { fase: 'anteprima' })).messaggio, /needs action/u)
})

test('SRV-09: le fonti del server — la ricerca rifiuta una fonte senza chiave; senza magazzini le voci non si offrono', async () => {
  const salvate = []
  const fonti = creaFontiDelServer({ searchSourceStore: {
    fonte: () => 'duckduckgo',
    listPublic: () => ({ source: 'duckduckgo', endpoint: '', fonti: [{ id: 'duckduckgo', needsKey: false, needsEndpoint: false, keyConfigured: false }, { id: 'tavily', needsKey: true, needsEndpoint: false, keyConfigured: false }, { id: 'searxng', needsKey: false, needsEndpoint: true, keyConfigured: false }] }),
    setSource: (x) => salvate.push(x),
  } })
  await assert.rejects(fonti.ricerca.scrivi({ source: 'tavily' }), /needs its key/u)
  await assert.rejects(fonti.ricerca.scrivi({ source: 'searxng' }), /needs its address/u)
  await fonti.ricerca.scrivi({ source: 'off' })
  assert.deepEqual(salvate, [{ source: 'off' }])
  assert.deepEqual(Object.keys(fonti), ['ricerca'])
  const solo = creaServizioImpostazioni({ fonti })
  assert.deepEqual(solo.voci().map((v) => v.chiave), ['tools.webSearchSource'])
  assert.equal(creaServizioImpostazioni({}).pronto(), false, 'senza fonti il servizio non è pronto: l\'attrezzo non si offre')
})

test('SRV-10: la copia della finestra — la revisione avanza solo se cambia qualcosa, e sopravvive su file', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-imp-copia-'))
  t.after(() => rimuoviCartellaDiProva(cartella))
  const file = join(cartella, 'copia.json')
  const copia = creaCopiaFinestra({ file })
  assert.deepEqual(await copia.leggi(), { revisione: 0, valori: {} })
  assert.equal((await copia.dallaFinestra({ themePreset: 'calm', motionSpeed: 100, colpa: { no: 1 } })).revisione, 1)
  assert.equal((await copia.dallaFinestra({ themePreset: 'calm' })).revisione, 1, 'uguale: la revisione non si muove')
  assert.equal((await copia.scriviCampi({ themePreset: 'paper' })).revisione, 2)
  const riletta = creaCopiaFinestra({ file })
  assert.deepEqual(await riletta.leggi(), { revisione: 2, valori: { themePreset: 'paper', motionSpeed: 100 } })
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).schema, 'talos.window-preferences.v1')
})
