/*
 * Scene 1 (FE-081, G-B, 05/11/2026): «Bars ↔ Table» — the same data seen the other way, on the PC, with no call to the network and
 * no model. A bar chart becomes a table (one row per category, one column per series) and a table with a text column and number
 * columns becomes a bar chart. The result is a new version of the block (origine 'vista'), so «Back to v1» always brings the
 * original back: nothing is lost in the switch, even the fields one view has and the other doesn't (a chart's description).
 * Every result is checked by the reader (`leggi(scriviSorgente(…))`): a switch that would give a block the catalog refuses is not offered.
 */
import { leggi } from '../../../../src/blocchi/lettore.mjs';
import { scriviSorgente } from '../../../../src/blocchi/versioni.mjs';
import { t } from '../lingua.js';

const NUMERICI = new Set(['numero', 'soldi']);
const valido = (b) => { const r = leggi(scriviSorgente(b)); return r.stato === 'completo' ? r.blocco : null; }; // leggi never throws: a Rotto, not an Error

/** A bar chart → a table. Categories in order of first appearance; a series with no value for a category gets an empty cell. */
export function graficoInTabella(g) {
  if (g?.tipo !== 'grafico' || g.forma !== 'barre' || !Array.isArray(g.serie) || !g.serie.length) return null;
  const categorie = [];
  for (const s of g.serie) for (const p of s.punti ?? []) if (!categorie.includes(String(p.x))) categorie.push(String(p.x));
  const tipo = g.unita === '€' ? 'soldi' : 'numero';
  return valido({
    tipo: 'tabella', id: g.id, titolo: g.titolo,
    colonne: [{ id: 'categoria', titolo: t('blocchi.view.category'), tipo: 'testo' }, ...g.serie.map((s, i) => ({
      /* a unit that is not money has no column type: it stays visible in the column title, not dropped */
      id: `s${i + 1}`, titolo: g.unita && tipo !== 'soldi' ? `${s.nome} (${g.unita})` : s.nome, tipo,
    }))],
    righe: categorie.map((x) => [x, ...g.serie.map((s) => s.punti.find((p) => String(p.x) === x)?.y ?? null)]),
    ordinabile: true,
  });
}

/** A table whose first column is text and the others are numbers → a bar chart; empty cells are left out of their series. */
export function tabellaInGrafico(tab) {
  if (tab?.tipo !== 'tabella' || !Array.isArray(tab.colonne) || tab.colonne.length < 2) return null;
  const [prima, ...numeri] = tab.colonne;
  if (prima.tipo !== 'testo' || !numeri.every((c) => NUMERICI.has(c.tipo))) return null;
  const righe = (tab.righe ?? []).filter((r) => r[0] !== null && r[0] !== undefined && r[0] !== '');
  if (!righe.length) return null;
  const serie = numeri.map((c, i) => ({
    nome: c.titolo,
    punti: righe.filter((r) => Number.isFinite(r[i + 1])).map((r) => ({ x: String(r[0]), y: r[i + 1] })),
  })).filter((s) => s.punti.length);
  if (!serie.length) return null;
  return valido({
    tipo: 'grafico', id: tab.id, titolo: tab.titolo, forma: 'barre',
    descrizione: t('blocchi.view.asBars', { title: tab.titolo }),
    serie,
    ...(numeri.every((c) => c.tipo === 'soldi') ? { unita: '€' } : {}),
  });
}

/** The other view of a block, or null when it has none (the menu then has no «Bars ↔ Table»). */
export function altraVista(blocco) {
  if (blocco?.tipo === 'grafico') return graficoInTabella(blocco);
  if (blocco?.tipo === 'tabella') return tabellaInGrafico(blocco);
  return null;
}
