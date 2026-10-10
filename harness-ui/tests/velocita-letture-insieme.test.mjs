/*
 * ⭐⭐ VELOCITÀ DEGLI ATTREZZI (owner 27/09/2026: «DEVI CHIUDERLA TUTTA PRIMA DELLA RELEASE»; decisioni: shell in fila come
 * Hermes, letture in parallelo E partenza durante lo streaming).
 *
 * Dopo P18 partivano insieme solo le `cerca`. Qui si prova che partono insieme anche `leggi` (dentro il progetto, dove non
 * chiede niente), `elenca`, `web_search` e `naviga` — Hermes, `agent/tool_dispatch_helpers.py:31-45` `_PARALLEL_SAFE_TOOLS`
 * («read_file», «search_files», «web_extract», «web_search»…) — e che una lettura parte appena la sua chiamata è completa
 * nello stream, prima che il modello finisca la risposta — Codex, `core/src/stream_events_utils.rs:316-360`
 * (`handle_output_item_done` accoda il futuro dell'attrezzo appena l'elemento è chiuso).
 *
 * Stessa tecnica di `p18-cerca-insieme-desktop.test.mjs`, senza misurare tempi: l'hook `pre_tool_call` della PRIMA chiamata
 * aspetta e poi cambia il disco (o conta le richieste già partite). Partite insieme, le altre hanno già letto; in fila, no.
 */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as dormi } from 'node:timers/promises'
import { describe, it } from 'node:test'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
/* Un flusso SSE a pezzi: ogni elemento è un fotogramma, oppure una funzione che gira in quel punto del flusso (per
   cambiare il disco MENTRE il modello sta ancora rispondendo). */
const sse = (pezzi) => new Response(new ReadableStream({
  async start(c) {
    for (const p of pezzi) {
      if (typeof p === 'function') await p()
      else c.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`))
    }
    c.enqueue(enc.encode('data: [DONE]\n\n'))
    c.close()
  },
}))
const chiamate = (elenco) => sse([{ choices: [{ delta: { tool_calls: elenco.map(([nome, argomenti, id], index) => ({
  index, id: id ?? `call_${index}`, function: { name: nome, arguments: JSON.stringify(argomenti) },
})) } }] }])
const finale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }])
const cartella = (t, nome) => {
  const dir = mkdtempSync(join(tmpdir(), `velocita-${nome}-`))
  t.after(() => rimuoviCartellaDiProva(dir))
  return dir
}
const esitiTool = (esito) => esito.messaggiFinali.filter((m) => m.role === 'tool')
/* L'hook della PRIMA chiamata di quel nome: aspetta, poi fa `dopo()`. */
const hookSullaPrima = (azione, dopo) => {
  let prima = true
  return async (evento) => {
    if (evento?.tipo !== 'pre_tool_call' || evento.azione !== azione || !prima) return undefined
    prima = false
    await dormi(400)
    await dopo()
    return undefined
  }
}

describe('VELOCITÀ — le letture della stessa risposta partono insieme', () => {
  it('VEL-01 `leggi` ed `elenca` dopo la prima hanno già letto mentre il ciclo è ancora sulla prima', async (t) => {
    const dir = cartella(t, 'leggi')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'a.txt'), 'alfa\n')
    writeFileSync(join(dir, 'src', 'b.txt'), 'prima\n')
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0
        ? chiamate([['leggi', { percorso: 'src/a.txt' }], ['leggi', { percorso: 'src/b.txt' }], ['elenca', { percorso: 'src' }]])
        : finale()),
      hookFn: hookSullaPrima('leggi', () => {
        writeFileSync(join(dir, 'src', 'b.txt'), 'dopo\n')
        writeFileSync(join(dir, 'src', 'nuovo.txt'), 'x\n')
      }),
    })
    const risultati = esitiTool(esito)
    assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_0', 'call_1', 'call_2'], 'i risultati restano nell’ordine delle chiamate')
    assert.match(risultati[1].content, /prima/u, 'la seconda `leggi` aveva già letto prima che il file cambiasse')
    assert.doesNotMatch(risultati[2].content, /nuovo\.txt/u, '`elenca` aveva già elencato prima che il file nascesse')
  })

  it('VEL-02 una `leggi` che chiede il permesso (un segreto) NON parte in anticipo: si chiede in ordine, poi si legge', async (t) => {
    const dir = cartella(t, 'segreto')
    writeFileSync(join(dir, 'a.txt'), 'alfa\n')
    writeFileSync(join(dir, '.env'), 'CHIAVE=prima\n')
    const domande = []
    let n = 0
    let hookFinito = false
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0 ? chiamate([['leggi', { percorso: 'a.txt' }], ['leggi', { percorso: '.env' }]]) : finale()),
      chiediApprovazioneFn: async (azione) => { domande.push({ ...azione, dopoLHook: hookFinito }); return true },
      hookFn: hookSullaPrima('leggi', () => { writeFileSync(join(dir, '.env'), 'CHIAVE=dopo\n'); hookFinito = true }),
    })
    const risultati = esitiTool(esito)
    assert.equal(domande.length, 1, 'il segreto chiede, come sempre')
    assert.equal(domande[0].dopoLHook, true, 'e chiede DOPO la chiamata precedente, in ordine')
    assert.match(risultati[1].content, /CHIAVE=dopo/u, 'il file si legge DOPO il sì, non prima')
  })

  it('VEL-03 `web_search` della stessa risposta parte insieme', async (t) => {
    const dir = cartella(t, 'web')
    const richieste = []
    let partiteQuandoLaPrimaEraFerma = null
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'cerca sul web' }, modello: 'x', chiave: 'y', onDelta: () => {},
      strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
      richiediRicercaFn: async (_url, opzioni) => {
        richieste.push(opzioni.corpo.query)
        return { stato: 200, corpo: JSON.stringify({ results: [] }) }
      },
      fetchDiRete: async () => (n++ === 0 ? chiamate([['web_search', { query: 'uno' }], ['web_search', { query: 'due' }], ['web_search', { query: 'tre' }]]) : finale()),
      hookFn: hookSullaPrima('web_search', () => { partiteQuandoLaPrimaEraFerma = richieste.length }),
    })
    assert.equal(partiteQuandoLaPrimaEraFerma, 3, 'mentre il ciclo aspettava la prima, erano già partite tutte e tre')
    assert.deepEqual(esitiTool(esito).map((m) => m.content), ['No results for "uno".', 'No results for "due".', 'No results for "tre".'])
  })

  it('VEL-04 `naviga` della stessa risposta parte insieme (attraverso la cache della corsa, come sempre)', async (t) => {
    const dir = cartella(t, 'naviga')
    const aperte = []
    let apertteQuandoLaPrimaEraFerma = null
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'apri' }, modello: 'x', chiave: 'y', onDelta: () => {},
      cacheWeb: {
        around: async (descrittore) => {
          aperte.push(descrittore.url)
          return { value: { stato: 200, url: descrittore.url, corpo: `pagina ${descrittore.url}` }, fromCache: true }
        },
      },
      fetchDiRete: async () => (n++ === 0 ? chiamate([['naviga', { url: 'https://a.example/' }], ['naviga', { url: 'https://b.example/' }]]) : finale()),
      hookFn: hookSullaPrima('naviga', () => { apertteQuandoLaPrimaEraFerma = aperte.length }),
    })
    assert.equal(apertteQuandoLaPrimaEraFerma, 2)
    const risultati = esitiTool(esito)
    assert.match(risultati[0].content, /^HTTP 200 · https:\/\/a\.example\//u)
    assert.match(risultati[1].content, /^HTTP 200 · https:\/\/b\.example\//u)
  })
})

describe('VELOCITÀ — una lettura parte appena la sua chiamata è completa nello stream', () => {
  it('VEL-05 la prima `leggi` legge mentre il modello sta ancora scrivendo la seconda chiamata', async (t) => {
    const dir = cartella(t, 'stream')
    writeFileSync(join(dir, 'a.txt'), 'prima\n')
    writeFileSync(join(dir, 'b.txt'), 'beta\n')
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0
        ? sse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'leggi', arguments: '' } }] } }] },
          // il modello «pensa» ancora: intanto il file cambia. Una lettura partita a stream chiuso vedrebbe «dopo».
          async () => { await dormi(300); writeFileSync(join(dir, 'a.txt'), 'dopo\n') },
          { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"percorso":"b.txt"}' } }] } }] },
        ])
        : finale()),
    })
    const risultati = esitiTool(esito)
    assert.deepEqual(risultati.map((m) => m.tool_call_id), ['call_a', 'call_b'])
    assert.match(risultati[0].content, /prima/u, 'la prima lettura è partita durante lo stream')
    assert.match(risultati[1].content, /beta/u)
  })

  it('VEL-07 una chiamata che cambia DOPO essere partita (argomenti arrivati in ritardo) non usa la lettura anticipata', async (t) => {
    const dir = cartella(t, 'firma')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'dentro.txt'), 'x\n')
    writeFileSync(join(dir, 'radice.txt'), 'x\n')
    writeFileSync(join(dir, 'b.txt'), 'beta\n')
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0
        ? sse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'elenca', arguments: '{"percorso":"src"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', function: { name: 'leggi', arguments: '{"percorso":"b.txt"}' } }] } }] },
          // un fornitore che intreccia: altri argomenti per la PRIMA chiamata, dopo che la seconda è cominciata
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { arguments: '{"x":1}' } }] } }] },
        ])
        : finale()),
    })
    const risultati = esitiTool(esito)
    // gli argomenti arrivati non sono JSON: il ciclo li sostituisce con `{}` (la radice), come sempre. Si esegue QUELLA.
    assert.match(risultati[0].content, /radice\.txt/u, 'la chiamata arrivata non è quella partita: si esegue quella arrivata')
    assert.match(risultati[1].content, /beta/u)
  })

  it('VEL-08 il tetto: al massimo otto letture partono insieme, le altre al loro turno', async (t) => {
    const dir = cartella(t, 'tetto')
    const richieste = []
    let partite = null
    let n = 0
    await talosLavora({
      cartella: dir, task: { consegna: 'cerca sul web' }, modello: 'x', chiave: 'y', onDelta: () => {},
      strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
      richiediRicercaFn: async (_url, opzioni) => {
        richieste.push(opzioni.corpo.query)
        return { stato: 200, corpo: JSON.stringify({ results: [] }) }
      },
      fetchDiRete: async () => (n++ === 0 ? chiamate(Array.from({ length: 10 }, (_, i) => ['web_search', { query: `q${i}` }])) : finale()),
      hookFn: hookSullaPrima('web_search', () => { partite = richieste.length }),
    })
    assert.equal(partite, 8)
    assert.equal(richieste.length, 10, 'le due oltre il tetto partono al loro turno')
  })

  it('VEL-09 AL CONTRARIO sulla rete — dopo una scrittura nello stream, `web_search` non parte prima della scrittura', async (t) => {
    const dir = cartella(t, 'prefisso-rete')
    const richieste = []
    let primaDellaScrittura = null
    let n = 0
    await talosLavora({
      cartella: dir, task: { consegna: 'scrivi e cerca' }, modello: 'x', chiave: 'y', onDelta: () => {},
      strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
      richiediRicercaFn: async (_url, opzioni) => {
        richieste.push(opzioni.corpo.query)
        return { stato: 200, corpo: JSON.stringify({ results: [] }) }
      },
      fetchDiRete: async () => (n++ === 0
        ? sse([
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_s', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'x\n' }) } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_w1', function: { name: 'web_search', arguments: '{"query":"uno"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 2, id: 'call_w2', function: { name: 'web_search', arguments: '{"query":"due"}' } }] } }] },
        ])
        : finale()),
      hookFn: async (evento) => {
        if (evento?.tipo === 'pre_tool_call' && evento.azione === 'scrivi') primaDellaScrittura = richieste.length
        return undefined
      },
    })
    assert.equal(primaDellaScrittura, 0, 'nessuna richiesta di rete prima della scrittura che la precede')
    assert.deepEqual(richieste, ['uno', 'due'], 'e ciascuna una volta sola')
  })

  it('VEL-06 AL CONTRARIO — dopo una scrittura nella stessa risposta, la lettura aspetta il suo turno e vede il file nuovo', async (t) => {
    const dir = cartella(t, 'prefisso')
    writeFileSync(join(dir, 'a.txt'), 'vecchio\n')
    let n = 0
    const esito = await talosLavora({
      cartella: dir, task: { consegna: 'scrivi e leggi' }, modello: 'x', chiave: 'y', onDelta: () => {},
      fetchDiRete: async () => (n++ === 0
        ? sse([
          // T25/B09 (30/09): il modello legge prima di sostituire; la lettura anticipata vede ancora «vecchio», quelle DOPO la scrittura devono vedere «nuovo»
          // `offset:1` e non gli stessi argomenti delle due letture dopo: tre chiamate IDENTICHE fermano la risposta (RIPETIZIONI_IDENTICHE_MASSIME)
          { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_l0', function: { name: 'leggi', arguments: '{"percorso":"a.txt","offset":1}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_s', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'nuovo\n' }) } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 2, id: 'call_l', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 3, id: 'call_l2', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } }] },
          async () => { await dormi(100) },
        ])
        : finale()),
    })
    assert.equal(readFileSync(join(dir, 'a.txt'), 'utf8'), 'nuovo\n', 'la scrittura è avvenuta')
    const risultati = esitiTool(esito)
    assert.match(risultati[0].content, /vecchio/u, 'T25/B09: la lettura PRIMA della scrittura vede ancora il file vecchio')
    assert.match(risultati[1].content, /^written: a\.txt/u, 'la sostituzione passa: il file era stato letto per intero')
    assert.match(risultati[2].content, /nuovo/u, 'la lettura dopo la scrittura vede il file nuovo')
    assert.match(risultati[3].content, /nuovo/u, 'anche la seconda')
  })
})

/*
 * C20 (coda Codex, owner 10/10/2026), audit delle partenze anticipate: lo Stop della persona le ferma. Senza questi controlli, dopo
 *   «Ferma» partirebbero lo stesso letture, pagine e ricerche web (che il fornitore fa pagare) per una risposta che nessuno
 *   userà più: il ciclo esce allo Stop, ma una lettura già partita va avanti. Due porte, due prove: la chiamata che si completa
 *   nello stream DOPO lo Stop, e quella che il ciclo farebbe partire a flusso chiuso.
 */
describe('C20 — dopo lo Stop non parte niente in anticipo', () => {
  const ricercaContata = (richieste) => ({
    strumentiEstesi: ['web_search'], ricercaWeb: { provider: 'tavily', apiKey: 'k' },
    richiediRicercaFn: async (_url, opzioni) => {
      richieste.push(opzioni.corpo.query)
      return { stato: 200, corpo: JSON.stringify({ results: [] }) }
    },
  })
  const ricerca = (index, query) => ({ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}`, function: { name: 'web_search', arguments: JSON.stringify({ query }) } }] } }] })

  it('C20-STOP-01 nello stream: una chiamata che si completa DOPO lo Stop non fa partire la sua ricerca', async (t) => {
    const dir = cartella(t, 'stop-stream')
    const richieste = []
    const stop = new AbortController()
    let n = 0
    await talosLavora({
      cartella: dir, task: { consegna: 'cerca' }, modello: 'x', chiave: 'y', onDelta: () => {}, segnaleStop: stop.signal,
      ...ricercaContata(richieste),
      fetchDiRete: async () => (n++ === 0
        ? sse([
          ricerca(0, 'uno'),
          ricerca(1, 'due'), // l'inizio della seconda completa la prima: la prima parte
          async () => { await dormi(50); stop.abort() },
          ricerca(2, 'tre'), // l'inizio della terza completa la seconda, ma dopo lo Stop
          async () => { await dormi(50) },
        ])
        : finale()),
    }).catch(() => {})
    await dormi(100)
    assert.deepEqual(richieste, ['uno'], 'solo quella partita prima dello Stop')
  })

  /* ⛔ Lo Stop DOPO lo stream: la risposta è arrivata intera, e fra la sua fine e la partenza anticipata del ciclo ci sono gli
     `await` del motore del contesto (`captureProviderResponse`, `capture({ reason: 'response' })`). Uno Stop che cade lì è il
     caso che il controllo del ciclo ferma. Con `naviga`, che non guarda lo Stop da sé prima di aprire (la ricerca web sì):
     senza il controllo, l'ultima pagina si aprirebbe dopo «Ferma» (misurato col mutante B5). */
  it('C20-STOP-02 a flusso chiuso: uno Stop durante il salvataggio della risposta non fa aprire le pagine rimaste', async (t) => {
    const dir = cartella(t, 'stop-ciclo')
    const aperte = []
    const stop = new AbortController()
    let n = 0
    const naviga = (index, url) => ({ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}`, function: { name: 'naviga', arguments: JSON.stringify({ url }) } }] } }] })
    await talosLavora({
      cartella: dir, task: { consegna: 'apri' }, modello: 'x', chiave: 'y', onDelta: () => {}, segnaleStop: stop.signal,
      cacheWeb: {
        around: async (descrittore) => {
          aperte.push(descrittore.url)
          return { value: { stato: 200, url: descrittore.url, corpo: `pagina ${descrittore.url}` }, fromCache: true }
        },
      },
      /* `prepare` serve: senza, il giro muore subito («contextHooks.prepare is not a function») e la prova passerebbe a vuoto */
      contextHooks: { prepare: async ({ messages }) => ({ messages }), capture: async ({ reason }) => { if (reason === 'response') stop.abort() } },
      fetchDiRete: async () => (n++ === 0
        ? sse([
          naviga(0, 'https://a.example/'),
          naviga(1, 'https://b.example/'), // la prima parte nello stream; l'ultima, a flusso chiuso, la farebbe partire il ciclo
        ])
        : finale()),
    }).catch(() => {})
    await dormi(100)
    assert.deepEqual(aperte, ['https://a.example/'], 'la prima si è aperta nello stream (il giro è andato davvero); l\'ultima, che il ciclo farebbe partire insieme, no')
  })
})
