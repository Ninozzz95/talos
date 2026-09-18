// R06: riuso dei blocchi del mockup senza sostituire ID, controlli o rotte native.
export function etichettaRuntimeLaboratorio(runtimes = [], {caricamento = false, errore = null} = {}) {
  if (caricamento) return 'Verifica in corso…';
  if (errore) return 'Verifica non riuscita';
  const osservati = runtimes.filter(runtime => runtime?.state === 'observed');
  const pronti = osservati.filter(runtime => Array.isArray(runtime.models) && runtime.models.length > 0).length;
  return pronti ? pronti + (pronti === 1 ? ' runtime disponibile' : ' runtime disponibili') : osservati.length ? 'Nessun modello disponibile' : 'Nessun runtime raggiunto';
}
export function aggiornaStatoCorniceModelLab(card, runtimes, opzioni) {
  const badge = card?.querySelector('#modelLabRuntimeBadge');
  if (badge) badge.textContent = etichettaRuntimeLaboratorio(runtimes, opzioni);
}
/*
 * 18/09/2026, corsia 2 — la striscia delle schede si avvolge UNA volta sola.
 * Era dentro `montaCorniceModelLab`; il guscio a quattro schede
 * (`lab-cornice-v3.js`) ha bisogno dello stesso avvolgimento, e due copie
 * della stessa riga sono due posti da tenere allineati. Il wrapper è
 * `.talos-tabs--underline`, il blocco del design system (`controls.css:42`):
 * il guscio non porta classi sue.
 * @returns {Element|null} il wrapper `.talos-tabs`.
 */
export function avvolgiStrisciaSchede(card, list) {
  if (!list) return null;
  const esistente = list.closest('.talos-tabs');
  if (esistente) { list.classList.add('talos-tabs__list'); return esistente; }
  const wrapper = list.ownerDocument.createElement('div');
  wrapper.className = 'talos-tabs talos-tabs--underline'; wrapper.dataset.c = 'Tabs';
  list.before(wrapper); wrapper.append(list); list.classList.add('talos-tabs__list');
  return wrapper;
}
export function montaCorniceModelLab(card) {
  if (!card || card.dataset.corniceMontata) return;
  card.dataset.corniceMontata = 'true'; card.classList.add('talos-model-lab');
  const heading = card.querySelector('.settings-card-heading');
  heading?.classList.add('talos-page__head');
  /*
   * ⛔⛔ 18/09/2026 — QUI L'EYEBROW VENIVA NASCOSTO, e il titolo della sezione veniva RISCRITTO.
   *   Il confronto testa a testa col mockup (`prototypes/calm-lab`, foto in
   *   `artifacts/parita-mockup-2026-09-18/`) mostra che il mockup ha UNA sola intestazione —
   *   eyebrow «INTELLIGENZA, SOTTO CONTROLLO» + titolo «Laboratorio modelli» + sottotitolo — e
   *   la carta sotto NON ha un titolo proprio. Da noi le intestazioni erano DUE e dicevano la
   *   stessa cosa a 100 px di distanza: quella della sezione (`features/settings/schema.ts:21`,
   *   scritta per esteso) e questa, riscritta qui. ⇒ l'eyebrow si mostra col suo testo, e il
   *   titolo della carta si nasconde: il titolo buono è quello della sezione, che è anche quello
   *   che il lettore di schermo annuncia aprendo il pannello (`aria-labelledby`).
   *   La NOTA resta la nostra: dice che lo stato viene letto dal server, e il mockup al suo posto
   *   ha uno slogan («Il modello giusto. La scelta resta tua.»). Uno slogan non è un'informazione:
   *   se l'owner lo vuole, si aggiunge — non si sostituisce l'unica frase che dice da dove
   *   vengono i numeri.
   */
  const eyebrow = heading?.querySelector('.eyebrow');
  if (eyebrow) { eyebrow.removeAttribute('hidden'); eyebrow.textContent = 'Intelligenza, sotto controllo'; }
  const title = heading?.querySelector('h3'); if (title) title.setAttribute('hidden', '');
  const note = heading?.querySelector('p'); if (note) note.textContent = 'Modelli sul computer, cataloghi e accessi ai fornitori. Lo stato viene letto dal server.';
  const ledger = card.querySelector('.model-lab-ledger');
  const badge = card.querySelector('#modelLabRuntimeBadge');
  const rows = [...(ledger?.children || [])];
  for (const [i, row] of rows.entries()) {
    row.classList.add('talos-kv'); row.dataset.c = 'KeyValue';
    const label = row.querySelector('span'); let value = row.querySelector('strong');
    if (i === 3 && badge && value) { value.replaceWith(badge); value = badge; value.textContent = 'Verifica in corso…'; }
    if (label) { label.className = 'talos-kv__k'; row.prepend(label); }
    if (value) value.className = 'talos-kv__v talos-badge talos-badge--sm';
  }
  const list = card.querySelector('[role=tablist]'); if (!list) return;
  // ⛔ Se il guscio a quattro schede è già montato, la tastiera e le classi
  // delle schede sono sue (`lab-cornice-v3.js`): qui non si rimette mano.
  if (card.dataset.labGuscio === 'v3') return;
  avvolgiStrisciaSchede(card, list);
  const tabs = [...list.querySelectorAll('[data-model-lab-tab]')];
  for (const tab of tabs) { tab.classList.add('talos-tabs__tab'); tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; }
  list.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target); if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => { tab.tabIndex = i === next ? 0 : -1; }); tabs[next].focus();
  });
}
