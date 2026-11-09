/*
 * Fase 8, cura 1 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §1, domanda 2 del Frontend) — IL NOME DELLA VOCE DA UNA FONTE SOLA.
 *   Prima il catalogo portava parole sue, e due voci si chiamavano diversamente dalle Impostazioni («Fonte» contro «Origine della ricerca
 *   web»; «Dove girano i comandi delle conversazioni nuove» contro «Dove girano i comandi»). Ora ogni voce porta la CHIAVE del dizionario
 *   del campo che la persona vede, e il nome si risolve una volta al caricamento del catalogo.
 *   · CAT-03: ogni voce ha una chiave che esiste nelle due lingue del dizionario, e le sue parole sono QUELLE del dizionario;
 *   · CAT-04: la carta porta la chiave (la finestra la dice nella lingua della persona), il modello legge l'inglese;
 *   · CAT-05 (Performance 1): `list` resta sotto i 2 KB per ogni sezione e per le ricerche, anche coi nomi nuovi;
 *   · CAT-06: il catalogo del server NON importa niente da `frontend/` (il pacchetto dell'app installata lo esclude:
 *     `desktop/scripts/prepara-pacchetto.mjs:38`, e il 28/09 un modulo escluso ha fatto cadere il server installato);
 *   · CAT-07: una chiave senza nome nella copia ferma il caricamento.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TESTI } from '../frontend/src/i18n/testi/index.js'
import { CATALOGO_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI, catalogoPubblico, voceDelCatalogo } from '../src/impostazioni/catalogo-impostazioni.mjs'
import { nomeDalDizionario } from '../src/impostazioni/nomi-impostazioni.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'

function servizio() {
  const stato = {
    contesto: { motore: 'engine', modelloDelRiassunto: null, riservaDelRiassunto: null }, comandi: { doveDiSerie: null },
    finestraLocale: { scelta: 'allarga' }, wsl: { usaUtenteNormale: true }, ricerca: { source: 'duckduckgo' },
  }
  const fonti = Object.fromEntries(Object.keys(stato).map((n) => [n, { leggi: async () => ({ ...stato[n] }), scrivi: async (p) => { Object.assign(stato[n], p) } }]))
  const s = { modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: { effort: 'high' }, fasciaVeloce: false, permessi: 'Workspace write',
    permessiPerAttrezzo: {}, doveGiranoIComandi: null, comandiNellaConversazione: false }
  const registro = { impostazioniCorrenti: () => structuredClone(s), aggiornaImpostazioni: async (id, patch) => { Object.assign(s, patch); return { aggiornate: true } },
    doveGiranoIComandi: async (id, dove) => { s.doveGiranoIComandi = dove; return { ok: true } }, comandiNellaConversazione: async (id, a) => { s.comandiNellaConversazione = a; return { ok: true } } }
  return creaServizioImpostazioni({ fonti: { ...fonti, sessione: creaFonteSessione(() => registro) }, copiaFinestra: creaCopiaFinestra(), attesaFinestraMs: 50 })
}

test('CAT-03: ogni voce porta la chiave del dizionario, esistente in EN e IT, e il suo nome è quello del dizionario', () => {
  for (const v of CATALOGO_IMPOSTAZIONI) {
    /* cura 6 (forma §5): un nome può essere COMPOSTO da più chiavi; `chiavi` le porta tutte, `chiave` solo se è una */
    const chiavi = v.testo?.chiavi ?? []
    assert.ok(chiavi.length >= 1, `${v.chiave}: nessuna chiave del dizionario`)
    for (const chiave of chiavi) {
      assert.equal(typeof TESTI.en[chiave], 'string', `${v.chiave}: ${chiave} manca in inglese`)
      assert.equal(typeof TESTI.it[chiave], 'string', `${v.chiave}: ${chiave} manca in italiano`)
    }
    assert.equal(v.testo.en, composto(chiavi, 'en'), `${v.chiave}: il nome inglese non è quello del dizionario (${chiavi})`)
    assert.equal(v.testo.it, composto(chiavi, 'it'), `${v.chiave}: il nome italiano non è quello del dizionario (${chiavi})`)
    assert.ok(Object.isFrozen(v.testo) && Object.isFrozen(v.testo.chiavi), v.chiave)
  }
  /* il caso che ha fatto nascere la cura (domanda 2 del Frontend) */
  assert.equal(voceDelCatalogo('tools.webSearchSource').testo.it, 'Origine della ricerca web')
})

/* La regola dei nomi COMPOSTI (forma §5): le parti dopo la prima cominciano minuscole, unite da « · ». */
function minuscolaIniziale(s, lingua) { return s.charAt(0).toLocaleLowerCase(lingua) + s.slice(1) }
function composto(chiavi, lingua) { return chiavi.map((k, i) => (i === 0 ? TESTI[lingua][k] : minuscolaIniziale(TESTI[lingua][k], lingua))).join(' · ') }

test('CAT-08 (forma §5, i nomi decisi dal Frontend): i due «Where commands run» col loro ambito, «Animated background», i nomi composti col dizionario vero', () => {
  const nome = (k) => voceDelCatalogo(k).testo
  assert.deepEqual([nome('tools.defaultCommandShell').en, nome('tools.defaultCommandShell').it], ['Where commands run · new conversations', 'Dove girano i comandi · conversazioni nuove'])
  assert.deepEqual([nome('conversation.commandShell').en, nome('conversation.commandShell').it], ['Where commands run · this conversation', 'Dove girano i comandi · questa conversazione'])
  assert.deepEqual([nome('motion.animatedBackground').en, nome('motion.animatedBackground').it], ['Animated background', 'Sfondo animato'])
  /* il velo dei permessi della SESSIONE usa ancora `modello.permissions.whereCommandsRun` («vale per questa sessione»): non cambia */
  assert.deepEqual([TESTI.en['modello.permissions.whereCommandsRun'], TESTI.it['modello.permissions.whereCommandsRun']], ['Where commands run', 'Dove girano i comandi'])
  /* la riserva dei riassunti: la pagina NON cambia, il nome si compone (titolo della riga · etichetta) */
  const riserva = nome('context.summaryFallback')
  assert.deepEqual(riserva.chiavi, ['varie.compaction.card.modelLabel', 'varie.compaction.card.backupLabel'])
  assert.equal(riserva.chiave, null, 'un nome composto non ha UNA chiave: la finestra lo compone da `chiavi`')
  assert.equal(riserva.en, 'Compaction model · if it does not answer')
  assert.equal(riserva.it, 'Modello della compattazione · se non risponde')
  assert.deepEqual([TESTI.en['varie.compaction.card.backupLabel'], TESTI.it['varie.compaction.card.backupLabel']], ['If it does not answer', 'Se non risponde'], 'la pagina non cambia')
  /* l'uscita dei comandi «!»: la frase intera dei lettori di schermo; il titolo minuscolo della riga l'ha curato il blocco 26 */
  assert.equal(nome('conversation.bangCommandsInChat').chiave, 'app.sheets.permissions.commandOutputAriaList')
  assert.equal(TESTI.it['app.sheets.permissions.commandOutputTitle'], 'Uscita dei comandi che lanci tu con !')
  const pubblica = catalogoPubblico().find((v) => v.key === 'context.summaryFallback')
  assert.deepEqual(pubblica.textKeys, ['varie.compaction.card.modelLabel', 'varie.compaction.card.backupLabel'])
  assert.equal(pubblica.textKey, null)
  assert.deepEqual(pubblica.text, { en: riserva.en, it: riserva.it })
})

test('CAT-04: la carta porta la chiave e le due lingue del dizionario; «pick» dice al modello il nome inglese; il catalogo pubblico tiene «text»', async () => {
  const fn = servizio().perLaSessione({ sessionId: 'sess-1' })
  const rev = Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'tools' }, { fase: 'esegui' })).testo)[1])
  const anteprima = await fn('app_settings', { action: 'set', expected_revision: rev, changes: [{ key: 'tools.webSearchSource', value: 'off' }] }, { fase: 'anteprima' })
  assert.equal(anteprima.carta, true)
  assert.deepEqual(anteprima.azione.cambi[0].nome, { chiave: 'modello.frammenti.impostazioni.webSearchSource', chiavi: ['modello.frammenti.impostazioni.webSearchSource'], en: TESTI.en['modello.frammenti.impostazioni.webSearchSource'], it: 'Origine della ricerca web' })
  const scelta = await fn('app_settings', { action: 'pick', key: 'appearance.theme' }, { fase: 'esegui' })
  assert.match(scelta.testo, new RegExp(`^appearance\\.theme \\(${TESTI.en['impostazioni.field.themePresetSelect.title']}\\) is`, 'u'))
  const pubblica = catalogoPubblico().find((v) => v.key === 'tools.webSearchSource')
  assert.deepEqual(pubblica.text, { en: 'Web search source', it: 'Origine della ricerca web' }, 'la forma di «text» per il Mobile non cambia')
  assert.equal(pubblica.textKey, 'modello.frammenti.impostazioni.webSearchSource')
})

test('CAT-05 (Performance 1): coi nomi del dizionario «list» resta ≤ 15 voci e < 2 KB, per sezione e per ricerca', async () => {
  const fn = servizio().perLaSessione({ sessionId: 'sess-1' })
  const domande = [...SEZIONI_IMPOSTAZIONI.map((section) => ({ section })), ...['theme', 'model', 'language', 'on', 'co', 'te', 'commands', 'run', 'web', 'origine', 'modalità', 'the'].map((query) => ({ query }))]
  for (const d of domande) {
    const r = await fn('app_settings', { action: 'list', ...d }, { fase: 'esegui' })
    assert.ok(r.testo.split('\n').filter((l) => l.startsWith('- ')).length <= 15, JSON.stringify(d))
    assert.ok(Buffer.byteLength(r.testo) < 2048, `${JSON.stringify(d)}: ${Buffer.byteLength(r.testo)} byte`)
  }
  /* il nome italiano del dizionario si trova con la ricerca */
  const origine = await fn('app_settings', { action: 'list', query: 'origine' }, { fase: 'esegui' })
  assert.match(origine.testo, /^- tools\.webSearchSource = /mu)
})

test('CAT-07: una chiave senza nome nella copia FERMA il caricamento (mai un nome vuoto a schermo o al modello)', () => {
  assert.throws(() => nomeDalDizionario('varie.localWindow.card.titolo'), /no name for "varie\.localWindow\.card\.titolo"/u)
  assert.throws(() => nomeDalDizionario(undefined), /no name for null/u)
  assert.throws(() => nomeDalDizionario('hasOwnProperty'), /no name/u, 'una proprietà ereditata non è un nome')
  assert.deepEqual(nomeDalDizionario('app.fastMode.label'), { chiave: 'app.fastMode.label', chiavi: ['app.fastMode.label'], en: TESTI.en['app.fastMode.label'], it: TESTI.it['app.fastMode.label'] })
})

test('CAT-06:il catalogo del server non importa niente da frontend/ (il pacchetto installato non lo porta)', () => {
  for (const f of ['../src/impostazioni/catalogo-impostazioni.mjs', '../src/impostazioni/nomi-impostazioni.mjs']) {
    const sorgente = readFileSync(new URL(f, import.meta.url), 'utf8')
    assert.doesNotMatch(sorgente, /^\s*import[^;]*frontend\//mu, f)
    assert.doesNotMatch(sorgente, /import\(\s*['"`][^'"`]*frontend\//u, f)
  }
})
