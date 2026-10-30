// 28/10/2026 (cache dei prompt, punto 1): il nucleo mette fino a quattro marcatori di cache, e un messaggio marcato diventa una lista di
// pezzi (`[{ type: 'text', text, cache_control }]`). Le prove con un fornitore finto che leggono il corpo come testo (stime, prefissi,
// «il risultato dice…») lo leggono qui com'era prima del marcatore: è il corpo che vede un fornitore che non onora la cache.
// Le prove che guardano i marcatori leggono il corpo grezzo (`cache-piu-punti-28-10.test.mjs`).
// ⛔ Questo file NON importa il nucleo: alcune prove installano le loro finte (git, motore) prima di caricarlo, e un import statico qui
//    lo caricava prima di loro — VERDETTO-CLI-GIT contava zero letture di git perché andavano al git vero. La logica è quella di
//    `senzaMarcatoriDiCache` del nucleo (`talosHarness.mjs`), e `cache-piu-punti-28-10.test.mjs` controlla che restino uguali.

export function senzaMarcatori(m) {
  if (!m || typeof m !== 'object') return m;
  const { cache_control: _tolto, ...base } = m;
  if (!Array.isArray(base.content) || !base.content.some((p) => p && typeof p === 'object' && Object.hasOwn(p, 'cache_control'))) return Object.hasOwn(m, 'cache_control') ? base : m;
  const parti = base.content.map((p) => (p && typeof p === 'object' && Object.hasOwn(p, 'cache_control') ? (({ cache_control: _c, ...r }) => r)(p) : p));
  const unTesto = parti.length === 1 && parti[0]?.type === 'text' && typeof parti[0].text === 'string' && Object.keys(parti[0]).length === 2;
  return { ...base, content: unTesto ? parti[0].text : parti };
}

export function corpoSenzaMarcatori(corpoJson) {
  const corpo = JSON.parse(corpoJson);
  return Array.isArray(corpo?.messages) ? { ...corpo, messages: corpo.messages.map(senzaMarcatori) } : corpo;
}
