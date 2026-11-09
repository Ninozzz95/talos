import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { impostaLingua } from '../../src/components/lingua.js';
import * as bacheca from '../../src/components/board.js';
import * as voci from '../../src/components/nav-item.js';
import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Decisioni 186 e 187 dell'owner (04/11/2026), scelte provando i bozzetti della Frontend:
 *   186 (N7, `variante-n7-agente-diagnostica.html`, variante A): la sezione «Diagnosi e configurazione» delle Impostazioni porta lo
 *       stetoscopio di «Doctor» invece della persona; le grandezze dei «Dati locali del browser» passano da 10 a 12 pixel.
 *   187 (N3b, `variante-n3-bacheca-conto.html`, variante C): sotto «Bacheca» nella barra la riga «di cui N di sotto-agenti», le parole
 *       della testa della Bacheca; la voce diventa alta due righe; testo visibile, quindi si legge anche al tocco.
 * Scritta rossa sulla candidata c45b49fbb, prima della cura. Le misure a schermo: `cure-ux-21-27.spec.mjs`, UX186-* e UX187-*.
 * Le funzioni si chiamano dal modulo (`bacheca.x(...)`), non con un import per nome: sulla candidata la prova cade su «non è una
 * funzione», non su un import rotto che fermerebbe tutto il file.
 */
const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sessione = (sessionId, extra = {}) => ({ sessionId, padreId: null, profonditaDelega: 0, ...extra });
const cinque = [sessione('r1'), sessione('r2'), sessione('r3'), sessione('f1', { padreId: 'r1', profonditaDelega: 1 }), sessione('o1', { profonditaDelega: 1 })];

test('UX186-1 — «Diagnosi e configurazione» porta lo stetoscopio di «Doctor», non la persona', () => {
  const schema = leggi('../../src/features/settings/schema.ts');
  const icona = /\baccount:\s*\{[^\n]*\bicon:\s*'([a-z-]+)'/u.exec(schema)?.[1];
  const mappa = /SPRITE_SEZIONE[^=]*=\s*\{([^}]*)\}/u.exec(leggi('../../src/features/settings/settings-view.ts'))?.[1] ?? '';
  const sprite = Object.fromEntries([...mappa.matchAll(/(\w+):\s*'([a-z0-9-]+)'/gu)].map((m) => [m[1], m[2]]));
  const disegnata = sprite[icona] ?? icona;
  assert.equal(disegnata, 'stethoscope', `la sezione disegna «${disegnata}»`);
  assert.match(leggi('../../src/components/nav-item.js'), /vaia: 'doctor'[^\n]*icona: 'i-stethoscope'/u, 'lo stesso segno di «Doctor» negli Strumenti');
  // verso contrario: la persona resta il segno di «aspetta te» (agenti, grafo), non sparisce dal progetto
  assert.match(leggi('../../src/components/pannello/agenti.js'), /waiting_human:[^\n]*icona: 'i-user'/u);
});

test('UX186-2 — le grandezze dei dati locali sono a 12 px, non più a 10', () => {
  const css = leggi('../../src/styles/index.css');
  const regola = /#settingsPrivacyList \[data-dato-locale\] \.muted-copy\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(regola, /font-size:calc\(12px \* var\(--talos-ui-font-scale, 1\)\)/u);
  assert.match(leggi('../../src/legacy/app.js'), /li\.dataset\.datoLocale = ''; li\.append\(textElement\('span', '', nome\), textElement\('span', 'muted-copy'/u,
    'la riga che la regola colpisce è quella della grandezza');
});

test('UX187-1 — la frase dei sotto-agenti è una sola, per la Bacheca e per la barra, nelle due lingue', () => {
  impostaLingua('en');
  try {
    assert.equal(bacheca.sottoAgentiDellaBacheca(cinque), '2 of them from sub-agents');
    assert.equal(bacheca.contoDellaBacheca(cinque), '5 sessions, 2 of them from sub-agents');
  } finally { impostaLingua('it'); }
  assert.equal(bacheca.sottoAgentiDellaBacheca(cinque), 'di cui 2 di sotto-agenti');
  assert.equal(bacheca.sottoAgentiDellaBacheca(cinque.slice(0, 4)), 'di cui 1 di un sotto-agente');
  assert.equal(bacheca.contoDellaBacheca(cinque), '5 sessioni, di cui 2 di sotto-agenti', 'la testa della Bacheca dice le stesse parole');
  // verso contrario: senza sotto-agenti niente riga (e niente coda nella testa)
  assert.equal(bacheca.sottoAgentiDellaBacheca(cinque.slice(0, 3)), '');
  assert.equal(bacheca.sottoAgentiDellaBacheca(null), '');
  assert.equal(bacheca.contoDellaBacheca(cinque.slice(0, 3)), '3 sessioni');
});

test('UX187-2 — la riga sotto la voce: compare, il numero resta sulla prima riga, e se ne va col testo vuoto', () => {
  const doc = documento();
  const voce = voci.creaNavItem({ vaia: 'board', icona: 'i-grid', etichetta: 'Bacheca' }, { document: doc });
  voci.impostaSottoNav(voce, 'di cui 2 di sotto-agenti');
  voci.impostaConteggioNav(voce, 5); // il badge arriva DOPO la riga: deve comunque stare prima
  const classi = voce.children.map((n) => n.className || n.getAttribute('class'));
  assert.deepEqual(classi, ['i', 'talos-nav-item__label', 'talos-nav-item__count', 'talos-nav-item__sub']);
  assert.equal(voce.querySelector('.talos-nav-item__sub').textContent, 'di cui 2 di sotto-agenti');
  assert.ok('sotto' in voce.dataset, 'la voce si segna alta due righe');
  voci.impostaSottoNav(voce, 'di cui 3 di sotto-agenti');
  assert.equal(voce.querySelectorAll('.talos-nav-item__sub').length, 1, 'una riga sola, riscritta');
  voci.impostaSottoNav(voce, '');
  assert.equal(voce.querySelector('.talos-nav-item__sub'), null);
  assert.ok(!('sotto' in voce.dataset), 'e torna alta una riga');
  assert.equal(voce.querySelector('.talos-nav-item__count').textContent, '5', 'il numero non si tocca');
});

test('UX187-3 — la voce alta due righe e la riga piccola: le misure del bozzetto, e la barra a sole icone la nasconde', () => {
  const css = leggi('../../src/styles/index.css');
  assert.match(css, /\.talos-nav-item\[data-sotto\]\{[^}]*flex-wrap:wrap/u);
  const riga = /\.talos-nav-item__sub\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(riga, /font-size:12px/u);
  assert.match(riga, /line-height:1\.3/u);
  assert.match(riga, /color:var\(--talos-muted\)/u);
  assert.match(riga, /flex:1 0 100%/u, 'va a capo sotto il nome');
  assert.match(css, /:root\[data-sidebar="icone"\] \.talos-nav-item__sub,/u);
  const app = leggi('../../src/legacy/app.js');
  assert.match(app, /aggiornaConteggiNav\(radice, \{ board: numeroSessioni \}\);\n\s*scriviSottoDellaBacheca\(\);/u, 'scritta col numero');
  assert.match(app, /EVENTO_LINGUA, \(\) => \{[\s\S]{0,400}scriviSottoDellaBacheca\(\)/u, 'e riscritta al cambio di lingua');
});
