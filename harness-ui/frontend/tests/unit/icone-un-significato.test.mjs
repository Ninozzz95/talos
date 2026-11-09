import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * FE-015 (owner 31/10/2026): un significato, un disegno. Queste prove tengono le scelte che un nome di simbolo non dice da solo:
 * il fulmine sta solo sul chip del modello, perché segna la modalità veloce; lo Stop pieno sta solo sul gesto; «In corso» gira
 * ovunque nasca l'icona, e col movimento ridotto si calma senza fermarsi.
 */
const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const leggi = (p) => readFileSync(path.join(radice, p), 'utf8');
const template = leggi('index.template.html');
const css = leggi('src/styles/index.css');

function sorgenti(dir, fuori = []) {
  for (const voce of readdirSync(path.join(radice, dir), { withFileTypes: true })) {
    const p = `${dir}/${voce.name}`;
    if (voce.isDirectory()) sorgenti(p, fuori);
    else if (/\.(js|ts)$/u.test(voce.name)) fuori.push(p);
  }
  return fuori;
}

/* Tutte le righe di codice, senza i commenti: `icone` conta gli usi, non le righe, e vede anche i nomi senza `i-` davanti. */
const righeDiCodice = (p) => leggi(p).split('\n').filter((r) => !/^\s*(\/\/|\*|\/\*)/u.test(r));
const tutti = () => [...sorgenti('src'), 'index.template.html', 'src/legacy/frammenti.html'].filter((p) => !p.includes('/assets/'));
const usiDi = (nome, testo) => [...testo.matchAll(new RegExp(`(?:#i-|['"\`]i-|['"\`])${nome}['"\`]`, 'gu'))].length;

test('ICONE-01 il fulmine sta solo sul chip del modello: i due compositori, più il segno della modalità veloce sullo stesso chip', () => {
  const nelTemplate = template.split('\n').filter((r) => r.includes('#i-bolt"'));
  const usi = (r) => r.split('#i-bolt"').length - 1;
  assert.equal(nelTemplate.reduce((n, r) => n + usi(r), 0), 3, 'i due compositori e il segno della modalità veloce, contati per uso');
  for (const riga of nelTemplate) assert.match(riga, /data-open-sheet="model"|talos-badge--lg/u, 'il chip del modello');
  /* 01/11/2026 (FE-047, strada A dell'owner): il terzo uso non è un posto nuovo. Sta sullo stesso chip, e solo nel segno che nasce nascosto. */
  const delChip = nelTemplate.find((r) => r.includes('data-open-sheet="model"'));
  assert.equal(usi(delChip), 2, 'sul chip vero: l\'icona di partenza e il segno');
  assert.match(delChip, /<span class="talos-chip__veloce" hidden><svg class="i" aria-hidden="true"><use href="#i-bolt"\/><\/svg><\/span>/u, 'il segno della modalità veloce');
  const altrove = tutti().filter((p) => p !== 'index.template.html').filter((p) => righeDiCodice(p).some((r) => usiDi('bolt', r) > 0));
  assert.deepEqual(altrove, []);
});

/* Il difetto della revisione del 31/10: `icona(doc, 'files')` non contiene `i-`, e il cancello guardava solo i nomi con `i-`. */
export function nomiNudi(testo) {
  const trovati = new Set();
  for (const espr of [/\bicona\(\s*(?:[a-zA-Z]+\s*,\s*)?'([a-z][a-z0-9-]*)'/gu, /\bicona\s*:\s*'([a-z][a-z0-9-]*)'/gu, /\bicon\s*:\s*'([a-z][a-z0-9-]*)'/gu, /\bglifo\s*:\s*'([a-z][a-z0-9-]*)'/gu]) {
    for (const m of testo.matchAll(espr)) trovati.add(m[1].replace(/^i-/u, ''));
  }
  return trovati;
}

test('ICONE-07 ogni nome di icona, anche senza `i-` davanti, ha il suo simbolo', () => {
  const simboli = new Set([...template.matchAll(/<symbol id="i-([a-z0-9-]+)"/gu)].map((m) => m[1]));
  const sezioni = /SPRITE_SEZIONE[^=]*=\s*\{([^}]*)\}/u.exec(leggi('src/features/settings/settings-view.ts'))?.[1] ?? '';
  const mappa = Object.fromEntries([...sezioni.matchAll(/(\w+):\s*'([a-z0-9-]+)'/gu)].map((m) => [m[1], m[2]]));
  const morti = [];
  let visti = 0;
  for (const p of sorgenti('src').filter((f) => !f.includes('/assets/'))) {
    for (const nome of nomiNudi(righeDiCodice(p).join('\n'))) {
      visti += 1;
      const vero = p.endsWith('schema.ts') ? (mappa[nome] ?? nome) : nome;
      if (!simboli.has(vero)) morti.push(`${p}: ${nome}`);
    }
  }
  assert.ok(visti > 60, `la prova guarda davvero i sorgenti: ${visti} nomi`);
  assert.deepEqual(morti, []);
  assert.equal(nomiNudi("x = icona(doc, 'files'); y = { icona: 'doc' }").has('files'), true, 'al contrario: la forma del difetto si vede');
});

test('ICONE-08 un significato, un disegno: i punti che uno scambio avrebbe rotto', () => {
  const app = leggi('src/legacy/app.js');
  assert.match(app, /chiave: 'allega'[^\n]*icona: 'i-paperclip'/u);
  assert.match(app, /chiave: 'copia'[^\n]*icona: 'i-copy'/u);
  assert.match(leggi('src/components/pannello/agenti.js'), /running:[^\n]*icona: 'i-loader'/u);
  assert.match(leggi('src/components/pannello/agenti.js'), /'agenti\.agent\.status(?:Cancelled|Canceled|Stopped)'[^\n]*icona: 'i-quadrato'/u);
  assert.match(leggi('src/components/scheda-github.js'), /annullato: 'i-quadrato'/u);
  assert.match(leggi('src/components/inspector.js'), /'in-corso':[^\n]*icona: 'i-loader'/u);
  assert.match(leggi('src/features/navigation/workspace-chrome.ts'), /\['home\.research',[^\n]*'i-telescope'/u);
  const cervello = tutti().filter((p) => righeDiCodice(p).some((r) => usiDi('brain', r) > 0)).sort();
  assert.deepEqual(cervello, ['index.template.html', 'src/components/attivita-segmento.js'].sort(), 'il cervello è del Ragionamento');
  // unione del 03/11: le parole del computer use («send» come azione protetta, e il suo testo inglese) non sono icone
  const parole = (p) => p === 'src/components/computer-use/parole.js' || p.startsWith('src/i18n/');
  assert.equal(usiDi('send', tutti().filter((p) => !parole(p)).map((p) => righeDiCodice(p).join('\n')).filter((_, i, l) => l.length).join('\n').replace(/data-[a-z-]*="send"/gu, '')), 0, 'l\'aeroplanino non c\'è più');
  assert.equal(usiDi('send', "x = icona(doc, 'send')"), 1, 'al contrario: un\'icona vera si conta ancora');
  const memoria = leggi('src/components/memoria.js');
  assert.equal(new Set([...memoria.matchAll(/icona:'([a-z-]+)'/gu)].map((m) => m[1])).size, 1, 'una sola icona per tutti i generi');
});

test('ICONE-02 Stop pieno solo nel simbolo del gesto: gli stati tengono il quadrato vuoto', () => {
  assert.match(template, /<symbol id="i-stop"[^>]*><rect[^>]*fill="currentColor"/u);
  assert.doesNotMatch(/<symbol id="i-quadrato"[^>]*>.*?<\/symbol>/u.exec(template)?.[0] ?? 'manca fill', /fill/u);
  const inspector = leggi('src/components/inspector.js');
  assert.match(inspector, /stateCancelled[^\n]*'i-quadrato'/u);
  assert.match(inspector, /stateKilled[^\n]*'i-quadrato'/u);
});

test('ICONE-03 «In corso» gira, e col movimento ridotto si calma senza fermarsi', () => {
  const regola = 'svg:has(> use[href="#i-loader"])';
  assert.ok(css.includes(`${regola}{animation:talos-orb-spin 1500ms linear infinite}`));
  assert.ok(css.includes(`body.reduce-motion ${regola}{animation-duration:3000ms}`));
  assert.ok(css.includes(`@media (prefers-reduced-motion: reduce){${regola}{animation-duration:3000ms}}`));
  assert.ok(leggi('src/styles/segnavia-mobile.css').includes('@keyframes talos-orb-spin'), 'i fotogrammi esistono');
});

test('ICONE-04 la barra di sinistra disegna ogni voce col suo simbolo, nel template e nel componente', () => {
  const nav = leggi('src/components/nav-item.js');
  for (const [vaia, icona] of [['note', 'i-sticky-note'], ['attivita', 'i-list-todo'], ['libreria', 'i-library'], ['memoria', 'i-book-marked'], ['ricerca', 'i-telescope'],
    ['modelli', 'i-cpu'], ['capability', 'i-blocks'], ['officina', 'i-wrench'], ['automazioni', 'i-calendar-clock'], ['doctor', 'i-stethoscope']]) {
    assert.match(nav, new RegExp(`vaia: '${vaia}'[^\\n]*icona: '${icona}'`, 'u'), `${vaia} nel componente`);
    const riga = template.split('\n').find((r) => r.includes(`data-vaia="${vaia}"`));
    assert.ok(riga?.includes(`#${icona}"`), `${vaia} nel template`);
  }
});

test('ICONE-05 nessun disegno sotto i 12 px nelle regole che erano più piccole', () => {
  const foglio = leggi('src/styles/foglio-monolite.css');
  for (const nome of ['composer-resize-handle', 'ft-outside-zone-close', 'ft-chevron']) {
    const riga = foglio.split('\n').find((r) => r.startsWith(`dialog.sheet-dialog .${nome} svg`));
    assert.match(riga, /width: 12px; height: 12px/u, nome);
  }
  assert.match(leggi('src/styles/grafo-workflow.css'), /\.talos-wfg__pill-icona \{ width: 12px !important; height: 12px !important;/u);
});

test('ICONE-06 l\'avviso di licenza di Lucide accompagna i disegni copiati', () => {
  const avvisi = readFileSync(path.join(radice, '..', 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(avvisi, /Copyright \(c\) 2026 Lucide Icons and Contributors/u);
  assert.match(avvisi, /Copyright \(c\) 2013-present Cole Bemis/u);
  assert.match(avvisi, /Permission to use, copy, modify, and\/or distribute this software/u, 'il testo ISC, non solo i nomi');
});
