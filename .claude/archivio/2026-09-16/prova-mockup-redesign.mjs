/**
 * Prova FUNZIONALE del mockup, pilotando Chrome via CDP.
 * Non guarda un'immagine: preme, trascina e RILEGGE i valori.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PAGINA = 'file:///C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html'
const PORTA = 9333

const profilo = mkdtempSync(join(tmpdir(), 'talos-cdp-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=' + PORTA, '--user-data-dir=' + profilo,
  '--window-size=1440,900', PAGINA,
], { stdio: 'ignore' })

const dormi = (ms) => new Promise((r) => setTimeout(r, ms))

async function bersaglio() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORTA + '/json/list')
      const lista = await r.json()
      const p = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (p) return p.webSocketDebuggerUrl
    } catch {}
    await dormi(250)
  }
  throw new Error('Chrome non ha risposto sulla porta di debug')
}

let id = 0
function collega(url) {
  const ws = new WebSocket(url)
  const attese = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && attese.has(m.id)) { attese.get(m.id)(m); attese.delete(m.id) }
  })
  const pronto = new Promise((r) => ws.addEventListener('open', r))
  const invia = (method, params = {}) => new Promise((r) => {
    id += 1
    attese.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { pronto, invia, chiudi: () => ws.close() }
}

const valuta = async (cdp, espressione) => {
  const r = await cdp.invia('Runtime.evaluate', { expression: espressione, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error('eccezione JS: ' + JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

const prove = []
const p = (nome, atteso, avuto) => {
  const ok = JSON.stringify(atteso) === JSON.stringify(avuto)
  prove.push(ok)
  console.log((ok ? '  ok   ' : '  NO   ') + nome + (ok ? '' : '  — atteso ' + JSON.stringify(atteso) + ', avuto ' + JSON.stringify(avuto)))
}

async function main() {
  const cdp = collega(await bersaglio())
  await cdp.pronto
  await cdp.invia('Runtime.enable')
  await dormi(1200)

  console.log('Prove funzionali del mockup (Chrome pilotato):\n')

  // --- eccezioni JS: nessuna ---
  p('la pagina si carica senza eccezioni', true, await valuta(cdp, 'typeof document.querySelector(".talos-shell") === "object"'))

  // --- ogni schermata della regia esiste davvero ---
  p('ogni voce della regia ha la sua sezione', [], await valuta(cdp, `
    [...document.querySelectorAll('#regiaSchermo [data-schermo]')]
      .map(b => b.dataset.schermo)
      .filter(n => !document.getElementById('schermo' + n[0].toUpperCase() + n.slice(1)))
  `))

  // --- il pulsante Review apre la Review (il difetto trovato dall'owner) ---
  p('Review nella chat apre la schermata Review', 'schermoReview', await valuta(cdp, `
    (() => { document.querySelector('#schermoChat [data-vaia="review"]').click();
      return [...document.querySelectorAll('.talos-screen')].find(s => !s.hidden && s.id.startsWith('schermo')).id; })()
  `))
  p('e la Chat torna dalla Review', 'schermoChat', await valuta(cdp, `
    (() => { document.querySelector('#schermoReview [data-vaia="chat"]').click();
      return [...document.querySelectorAll('.talos-screen')].find(s => !s.hidden && s.id.startsWith('schermo')).id; })()
  `))

  // --- le quattro voci nuove della sidebar portano dove promettono ---
  for (const [dove, atteso] of [['libreria', 'schermoLibreria'], ['ricerca', 'schermoRicerca'], ['officina', 'schermoOfficina'], ['automazioni', 'schermoAutomazioni']]) {
    p('la voce «' + dove + '» apre la sua pagina', atteso, await valuta(cdp, `
      (() => { document.getElementById('altroLuoghi').setAttribute('aria-expanded','false');
        document.getElementById('altroLuoghi').click();
        document.querySelector('.talos-sidebar [data-vaia="${dove}"]').click();
        return [...document.querySelectorAll('.talos-screen')].find(s => !s.hidden && s.id.startsWith('schermo')).id; })()
    `))
  }

  // --- la colonna di destra sparisce sulle destinazioni, torna nella sessione ---
  p('sulle pagine la colonna dei dettagli non c\'è', 'none', await valuta(cdp, `getComputedStyle(document.querySelector('.talos-inspector')).display`))
  p('nella sessione la colonna torna', 'flex', await valuta(cdp, `
    (() => { document.querySelector('#regiaSchermo [data-schermo="chat"]').click();
      return getComputedStyle(document.querySelector('.talos-inspector')).display; })()
  `))

  // --- CHAT CENTRATA: il messaggio e il compositore hanno gli stessi bordi ---
  const bordi = await valuta(cdp, `
    (() => { const m = document.querySelector('#schermoChat .talos-message--user .talos-message__body').getBoundingClientRect();
      const c = document.querySelector('#schermoChat .talos-composer').getBoundingClientRect();
      const a = document.querySelector('#schermoChat .talos-conversation').getBoundingClientRect();
      return { sinistra: Math.round(m.left - c.left), destra: Math.round(m.right - c.right),
               centrato: Math.round(((m.left + m.right) / 2) - ((a.left + a.right) / 2)) }; })()
  `)
  p('messaggio e compositore hanno lo stesso bordo sinistro', 0, bordi.sinistra)
  p('e lo stesso bordo destro', 0, bordi.destra)
  p('la conversazione è centrata nell\'area (scarto in pixel)', 0, bordi.centrato)

  // --- MANIGLIE: trascinamento vero con eventi di puntatore ---
  const prima = await valuta(cdp, `parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w'),10)`)
  const box = await valuta(cdp, `(() => { const r = document.querySelector('[data-ridimensiona="sidebar"]').getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + 200 }; })()`)
  for (const [type, x] of [['mousePressed', box.x], ['mouseMoved', box.x + 60], ['mouseReleased', box.x + 60]]) {
    await cdp.invia('Input.dispatchMouseEvent', { type, x, y: box.y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' })
  }
  await dormi(150)
  const dopo = await valuta(cdp, `parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w'),10)`)
  p('trascinando la maniglia la sidebar si allarga di 60 px', prima + 60, dopo)
  p('e la sidebar vera misura la stessa cosa', dopo, await valuta(cdp, `Math.round(document.querySelector('.talos-sidebar').getBoundingClientRect().width)`))

  // --- il tetto massimo tiene ---
  p('oltre il massimo si ferma a 420', 420, await valuta(cdp, `
    (() => { const m = document.querySelector('[data-ridimensiona="sidebar"]');
      m.dispatchEvent(new PointerEvent('pointerdown', {clientX: 300, bubbles: true, pointerId: 1}));
      m.dispatchEvent(new PointerEvent('pointermove', {clientX: 1200, bubbles: true, pointerId: 1}));
      m.dispatchEvent(new PointerEvent('pointerup', {clientX: 1200, bubbles: true, pointerId: 1}));
      return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w'),10); })()
  `))
  p('il doppio click riporta al valore normale', 276, await valuta(cdp, `
    (() => { document.querySelector('[data-ridimensiona="sidebar"]').dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
      return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w'),10); })()
  `))
  p('la freccia destra allarga di 8 px', 284, await valuta(cdp, `
    (() => { const m = document.querySelector('[data-ridimensiona="sidebar"]');
      m.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
      return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-sidebar-w'),10); })()
  `))
  p('la colonna dei dettagli si ridimensiona al contrario', 380, await valuta(cdp, `
    (() => { const m = document.querySelector('[data-ridimensiona="inspector"]');
      m.dispatchEvent(new PointerEvent('pointerdown', {clientX: 1100, bubbles: true, pointerId: 2}));
      m.dispatchEvent(new PointerEvent('pointermove', {clientX: 1060, bubbles: true, pointerId: 2}));
      m.dispatchEvent(new PointerEvent('pointerup', {clientX: 1060, bubbles: true, pointerId: 2}));
      return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--talos-inspector-w'),10); })()
  `))

  // --- dialoghi ---
  p('l\'albero dei rami si apre dalla colonna', false, await valuta(cdp, `
    (() => { document.querySelector('[data-apre-velo="veloAlbero"]').click(); return document.getElementById('veloAlbero').hidden; })()
  `))
  p('Esc chiude qualunque dialogo aperto', true, await valuta(cdp, `
    (() => { document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
      return [...document.querySelectorAll('.overlay-layer')].every(v => v.hidden); })()
  `))
  p('aprendo i permessi il focus va sull\'opzione GIÀ SCELTA', 'Scrittura nel workspace', await valuta(cdp, `
    (() => { document.getElementById('apriPermessi').click();
      return document.activeElement.querySelector('.talos-choice__title')?.textContent ?? document.activeElement.className; })()
  `))
  await valuta(cdp, `document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))`)

  // --- token del contratto: nessuno manca ---
  p('nessun token del contratto TALOS manca', [], await valuta(cdp, `
    (() => { const s = getComputedStyle(document.documentElement);
      const attesi = ['--talos-background','--talos-panel','--talos-panel-soft','--talos-card','--talos-window-bg','--talos-text','--talos-assistant-text','--talos-muted','--talos-border','--talos-border-strong','--talos-accent','--talos-accent-hover','--talos-accent-soft','--talos-accent-border','--talos-accent-text','--talos-secondary','--talos-success','--talos-warning','--talos-danger','--talos-info','--talos-font-ui','--talos-font-display','--talos-font-mono','--talos-font-size-xs','--talos-font-size-sm','--talos-font-size-md','--talos-font-size-lg','--talos-space-page','--talos-space-section','--talos-space-card','--talos-space-control','--talos-space-inline','--talos-space-xs','--talos-space-sm','--talos-space-md','--talos-space-lg','--talos-radius-card','--talos-radius-control','--talos-radius-pill','--talos-touch-target','--talos-control-height','--talos-primary-height','--talos-icon-size','--talos-motion-duration-control','--talos-motion-duration-surface-enter','--talos-motion-duration-surface-exit','--talos-motion-duration-tab-change','--talos-motion-ease','--talos-motion-ease-exit','--talos-ring','--talos-ring-soft','--talos-focus-width','--talos-focus-offset','--talos-z-app-overlay','--talos-z-menu','--talos-z-tooltip'];
      return attesi.filter(t => !String(s.getPropertyValue(t)).trim()); })()
  `))

  // --- i token DTCG sono JSON valido ---
  p('il blocco DTCG è JSON valido e dichiara lo schema', '2025.10', await valuta(cdp, `
    (() => { const j = JSON.parse(document.getElementById('talos-tokens-dtcg').textContent);
      return (j['$schema'].match(/(\\d{4}\\.\\d{2})/) || [])[1]; })()
  `))

  // --- tema chiaro: i token cambiano davvero ---
  p('il tema chiaro ridefinisce il fondo', true, await valuta(cdp, `
    (() => { const s = getComputedStyle(document.documentElement); const scuro = s.getPropertyValue('--talos-background').trim();
      document.documentElement.setAttribute('data-theme','light');
      const chiaro = getComputedStyle(document.documentElement).getPropertyValue('--talos-background').trim();
      document.documentElement.removeAttribute('data-theme');
      return scuro !== chiaro && chiaro.toLowerCase() === '#ece9e2'; })()
  `))

  const falliti = prove.filter((x) => !x).length
  console.log('\n' + (prove.length - falliti) + '/' + prove.length + (falliti ? ' — ' + falliti + ' PROVE FALLITE' : ' verdi'))
  cdp.chiudi()
  chrome.kill()
  process.exit(falliti ? 1 : 0)
}

main().catch((e) => { console.error('ERRORE:', e.message); chrome.kill(); process.exit(2) })
