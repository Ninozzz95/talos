import test from 'node:test';
import assert from 'node:assert/strict';
import { raggruppa, impacchetta, impacchettaAnnotazione, percorsoContenitore } from '../../src/components/annotazioni.js';

// Browser oltre Hermes (06/09) — il pacchetto delle annotazioni per l'agente.

const fatto = (selettore, extra = {}) => ({ selettore, tag: selettore.split(' > ').pop().replace(/[#.:].*$/, ''), testo: 'Un pulsante', rect: { x: 10, y: 20, larghezza: 100, altezza: 30 }, stili: { color: 'rgb(1, 2, 3)', 'font-size': '14px' }, antenati: ['body', 'main'], html: '<button>Un pulsante</button>', ...extra });

test('ANNOTA-GRUPPI: si raggruppa per contenitore, non per selettore intero', () => {
  const a = [
    { nota: 'più grande', fatto: fatto('main > section.hero > h1') },
    { nota: 'colore', fatto: fatto('main > section.hero > p') },
    { nota: 'via', fatto: fatto('main > footer > a:nth-of-type(2)') },
  ];
  const g = raggruppa(a);
  assert.deepEqual(g.map((x) => [x.contenitore, x.voci.length]), [['main > section.hero', 2], ['main > footer', 1]]);
  assert.deepEqual(percorsoContenitore('h1'), ['h1']);
  assert.deepEqual(raggruppa([]), []);
});

test('ANNOTA-PACCHETTO: ogni riga è un fatto; senza sorgente niente riga «Sorgente»; gli errori di console in coda', () => {
  const una = impacchettaAnnotazione({ nota: 'più grande', fatto: fatto('main > h1', { sorgente: { componente: 'Hero', file: 'src/Hero.vue:12', framework: 'Vite' } }) }, 0);
  assert.match(una, /^#1 — più grande\nElemento: main > h1\nTag: <h1> · testo: «Un pulsante»\nSorgente: Hero · src\/Hero\.vue:12\nPosizione: x 10, y 20, 100×30 px\nStili: color: rgb\(1, 2, 3\); font-size: 14px\nDentro: body > main\nHTML:\n```html\n<button>Un pulsante<\/button>\n```$/);
  const senza = impacchettaAnnotazione({ nota: '', fatto: fatto('main > h1', { sorgente: {} }) }, 3);
  assert.ok(senza.startsWith('#4 — (senza commento)') && !senza.includes('Sorgente:'));
  const tutto = impacchetta({ url: 'http://localhost:5173/', titolo: 'Dev' }, [{ nota: 'x', fatto: fatto('main > h1') }, { nota: 'y', fatto: fatto('footer > a') }], [{ tipo: 'console', testo: 'boom' }]);
  assert.ok(tutto.startsWith('Annotazioni sulla pagina http://localhost:5173/ («Dev») — 2 commenti.'));
  assert.ok(tutto.includes('## Zona: main') && tutto.includes('## Zona: footer'));
  assert.ok(tutto.includes('Errori di console della pagina (1):\n- [console] boom'));
  assert.ok(tutto.trim().endsWith('verifica nella pagina.'));
});
