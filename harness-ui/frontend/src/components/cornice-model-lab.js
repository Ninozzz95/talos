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
export function montaCorniceModelLab(card) {
  if (!card || card.dataset.corniceMontata) return;
  card.dataset.corniceMontata = 'true'; card.classList.add('talos-model-lab');
  const heading = card.querySelector('.settings-card-heading');
  heading?.classList.add('talos-page__head');
  heading?.querySelector('.eyebrow')?.setAttribute('hidden', '');
  const title = heading?.querySelector('h3'); if (title) title.textContent = 'Laboratorio modelli';
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
  const wrapper = document.createElement('div'); wrapper.className = 'talos-tabs talos-tabs--underline'; wrapper.dataset.c = 'Tabs';
  list.before(wrapper); wrapper.append(list); list.classList.add('talos-tabs__list');
  const tabs = [...list.querySelectorAll('[data-model-lab-tab]')];
  for (const tab of tabs) { tab.classList.add('talos-tabs__tab'); tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; }
  list.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target); if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => { tab.tabIndex = i === next ? 0 : -1; }); tabs[next].focus();
  });
}
