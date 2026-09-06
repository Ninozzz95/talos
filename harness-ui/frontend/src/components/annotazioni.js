/*
 * Le annotazioni del Browser (oltre Hermes, 06/09): gli spilli che la persona mette sugli elementi
 * di una pagina viva (proxata) e il pacchetto che arriva all'agente nel composer — mai inviato da
 * solo (Hermes `lib/preview-annotate/flush.ts`: «saving / flushing never submits a turn»).
 *
 * Cosa porta ogni annotazione, oltre a Hermes (selettore, testo, ritaglio): l'HTML dell'elemento,
 * gli stili calcolati che contano, la posizione, la catena degli antenati, gli indizi sul sorgente
 * quando esistono (Vue: file del componente; React ≤18: `_debugSource`; nome del componente;
 * framework), e gli errori di console della pagina. Le annotazioni si raggruppano per contenitore
 * (Hermes `group.ts`: si confrontano i percorsi degli ANTENATI, non i selettori interi).
 */

export const MASSIMO_ANNOTAZIONI = 24;

/** Il percorso del contenitore: il selettore meno l'ultimo segmento. */
export function percorsoContenitore(selettore) {
  const parti = String(selettore || '').split(' > ').filter(Boolean);
  return parti.length <= 1 ? parti : parti.slice(0, -1);
}

/** Raggruppa per contenitore comune alla profondità in cui i gruppi diventano più di uno (o restano uno). */
export function raggruppa(annotazioni) {
  if (annotazioni.length === 0) return [];
  const percorsi = annotazioni.map((a) => percorsoContenitore(a.fatto?.selettore));
  const massima = Math.max(...percorsi.map((p) => p.length));
  let scelta = 1;
  for (let d = 1; d <= massima; d += 1) {
    const chiavi = new Set(percorsi.map((p) => p.slice(0, d).join(' > ')));
    scelta = d;
    if (chiavi.size > 1) break;
  }
  const gruppi = new Map();
  annotazioni.forEach((a, i) => {
    const chiave = percorsi[i].slice(0, scelta).join(' > ') || a.fatto?.tag || 'pagina';
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave).push(a);
  });
  return [...gruppi.entries()].map(([contenitore, voci]) => ({ contenitore, voci }));
}

function stiliInRiga(stili) {
  const voci = Object.entries(stili || {}).slice(0, 10).map(([k, v]) => `${k}: ${v}`);
  return voci.join('; ');
}

/** Una annotazione → le righe per l'agente (etichette fisse, niente di inventato: le righe vuote non compaiono). */
export function impacchettaAnnotazione(a, indice) {
  const f = a.fatto || {};
  const righe = [`#${indice + 1} ${a.nota ? `— ${a.nota}` : '— (senza commento)'}`];
  if (f.selettore) righe.push(`Elemento: ${f.selettore}`);
  if (f.tag) righe.push(`Tag: <${f.tag}>${f.testo ? ` · testo: «${f.testo}»` : ''}`);
  if (f.sorgente?.file || f.sorgente?.componente) righe.push(`Sorgente: ${[f.sorgente.componente, f.sorgente.file].filter(Boolean).join(' · ')}`);
  if (f.rect) righe.push(`Posizione: x ${f.rect.x}, y ${f.rect.y}, ${f.rect.larghezza}×${f.rect.altezza} px`);
  if (f.stili && Object.keys(f.stili).length) righe.push(`Stili: ${stiliInRiga(f.stili)}`);
  if (f.antenati?.length) righe.push(`Dentro: ${f.antenati.join(' > ')}`);
  if (f.html) righe.push('HTML:', '```html', f.html, '```');
  return righe.join('\n');
}

/**
 * Il pacchetto intero per il composer: pagina, gruppi, errori di console. Testo, non JSON: lo
 * legge un modello e lo legge una persona.
 * @param {{url:string, titolo?:string}} pagina
 * @param {Array<{nota:string, fatto:object}>} annotazioni
 * @param {Array<{tipo:string, testo:string}>} errori
 */
export function impacchetta(pagina, annotazioni, errori = []) {
  const n = annotazioni.length;
  const testa = [`Annotazioni sulla pagina ${pagina.url}${pagina.titolo ? ` («${pagina.titolo}»)` : ''} — ${n} ${n === 1 ? 'commento' : 'commenti'}.`];
  const gruppi = raggruppa(annotazioni);
  if (gruppi.length > 1) testa.push(`Sono raggruppati per zona della pagina (${gruppi.length} zone): zone diverse toccano probabilmente file diversi.`);
  const corpo = [];
  let indice = 0;
  for (const g of gruppi) {
    if (gruppi.length > 1) corpo.push(`\n## Zona: ${g.contenitore}`);
    for (const a of g.voci) { corpo.push(impacchettaAnnotazione(a, indice)); indice += 1; }
  }
  const coda = [];
  if (errori.length) {
    coda.push(`\nErrori di console della pagina (${errori.length}):`);
    for (const e of errori.slice(0, 10)) coda.push(`- [${e.tipo}] ${e.testo}`);
  }
  coda.push('\nPer ogni commento: trova il codice che produce quell’elemento, applica la modifica e verifica nella pagina.');
  return [...testa, ...corpo, ...coda].join('\n');
}

/** Il pannello degli spilli sotto la cornice: riempie `#browserAnnotazioni` (mockup) dai dati. */
export function renderizzaAnnotazioni(pannello, { annotazioni, attivo, onNota, onTogli, onSvuota, onInvia, onAttiva }) {
  if (!pannello) return;
  pannello.hidden = !attivo && annotazioni.length === 0;
  const lista = pannello.querySelector('[data-annotazioni-lista]');
  const conteggio = pannello.querySelector('[data-annotazioni-conteggio]');
  const bottoneAttiva = pannello.querySelector('[data-annotazioni-attiva]');
  const bottoneInvia = pannello.querySelector('[data-annotazioni-invia]');
  const bottoneSvuota = pannello.querySelector('[data-annotazioni-svuota]');
  if (conteggio) conteggio.textContent = annotazioni.length === 0 ? (attivo ? 'Clicca un elemento nella pagina' : 'Nessun commento') : `${annotazioni.length} ${annotazioni.length === 1 ? 'commento' : 'commenti'}`;
  if (bottoneAttiva) { bottoneAttiva.setAttribute('aria-pressed', String(attivo)); bottoneAttiva.textContent = attivo ? 'Smetti di annotare' : 'Annota un elemento'; bottoneAttiva.onclick = () => onAttiva?.(!attivo); }
  if (bottoneInvia) { bottoneInvia.disabled = annotazioni.length === 0; bottoneInvia.onclick = () => onInvia?.(); }
  if (bottoneSvuota) { bottoneSvuota.disabled = annotazioni.length === 0; bottoneSvuota.onclick = () => onSvuota?.(); }
  if (!lista) return;
  lista.replaceChildren();
  annotazioni.forEach((a, i) => {
    const li = document.createElement('li');
    li.className = 'talos-annotazione';
    const testa = document.createElement('div'); testa.className = 'talos-annotazione__testa';
    const num = document.createElement('span'); num.className = 'talos-badge talos-badge--accent talos-badge--sm'; num.textContent = String(i + 1);
    const sel = document.createElement('code'); sel.className = 'talos-mono talos-annotazione__selettore'; sel.textContent = a.fatto?.selettore || a.fatto?.tag || 'elemento'; sel.title = a.fatto?.html || '';
    const togli = document.createElement('button'); togli.type = 'button'; togli.className = 'talos-button talos-button--ghost talos-button--sm'; togli.textContent = 'Togli'; togli.addEventListener('click', () => onTogli?.(i));
    testa.append(num, sel, togli);
    const meta = document.createElement('p'); meta.className = 'talos-muted talos-browser__meta';
    const pezzi = [a.fatto?.testo ? `«${a.fatto.testo.slice(0, 80)}»` : '', a.fatto?.sorgente?.componente || '', a.fatto?.sorgente?.file || ''].filter(Boolean);
    meta.textContent = pezzi.join(' · ');
    const nota = document.createElement('textarea'); nota.className = 'talos-field__input'; nota.rows = 2; nota.placeholder = 'Cosa deve cambiare qui?'; nota.value = a.nota || '';
    nota.addEventListener('input', () => onNota?.(i, nota.value));
    li.append(testa, meta, nota);
    lista.append(li);
  });
}
