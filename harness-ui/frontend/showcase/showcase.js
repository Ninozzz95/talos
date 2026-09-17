const $ = id => document.getElementById(id);
const version = new URL(location.href).searchParams.get('version') === 'before' ? 'before' : 'after';
const base = version === 'before' ? './baseline/' : '../src/components/';

try {
  const [connection, dialogs, movement] = await Promise.all([
    import(`${base}connessione.js`), import(`${base}dialoghi.js`), import(`${base}motion-mockup.js`),
  ]);
  document.querySelector(`[data-version="${version}"]`).setAttribute('aria-current', 'page');
  $('version-label').textContent = version === 'before' ? 'PRIMA · sorgenti 13f65c1' : 'DOPO · correzioni UI';
  $('theme-toggle').addEventListener('click', () => {
    const light = document.documentElement.dataset.talosMode !== 'light';
    document.documentElement.dataset.talosMode = light ? 'light' : 'dark';
    $('theme-toggle').setAttribute('aria-pressed', String(light));
    $('theme-toggle').textContent = light ? 'Tema scuro' : 'Tema chiaro';
  });
  let noticeTimer;
  function notice(text) {
    clearTimeout(noticeTimer); $('demo-notice').textContent = text;
    noticeTimer = setTimeout(() => { $('demo-notice').textContent = ''; }, 4500);
  }
  let monitor, healthy = true, recoveries = 0, pendingPing = null;
  const log = text => {
    const row = document.createElement('li'); row.textContent = `${String($('event-log').children.length + 1).padStart(2, '0')}  ${text}`;
    $('event-log').append(row);
    while ($('event-log').children.length > 10) $('event-log').firstElementChild.remove();
  };
  function paint(state, details = {}) {
    connection.aggiornaStatoConnessione($('runtime'), state, details);
    $('healthy').hidden = state !== 'collegato';
    $('state-label').textContent = state;
    log(state + (details.tentativi ? ` · tentativo ${details.tentativi}` : ''));
  }
  function reset() {
    monitor?.ferma(); pendingPing?.resolve(false); pendingPing = null;
    healthy = true; recoveries = 0; $('recoveries').value = '0'; $('event-log').replaceChildren();
    monitor = connection.creaSorveglianzaConnessione({
      ping: () => {
        if (pendingPing) { pendingPing.started(); return pendingPing.promise; }
        return Promise.resolve(healthy);
      },
      suCambio: paint,
      suRicollegato: () => { recoveries++; $('recoveries').value = String(recoveries); },
    });
    paint('collegato');
  }
  reset();
  $('reset').addEventListener('click', reset);
  $('disconnect').addEventListener('click', () => { healthy = false; monitor.segnalaRete(false); });
  $('retry').addEventListener('click', () => monitor.riprova());
  document.querySelector('[data-runtime-riprova]').addEventListener('click', () => monitor.riprova());
  $('recover').addEventListener('click', () => { healthy = true; monitor.segnalaEventoVivo(); });
  $('burst').addEventListener('click', () => {
    reset(); monitor.segnalaRete(false);
    for (let i = 0; i < 5; i++) monitor.segnalaEventoVivo();
    log(`5 eventi ricevuti · ${recoveries} callback di ripresa`);
  });
  $('late').addEventListener('click', async () => {
    reset(); $('late').disabled = true;
    let resolvePing, markStarted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const promise = new Promise(resolve => { resolvePing = resolve; });
    pendingPing = { promise, resolve: resolvePing, started: markStarted };
    monitor.segnalaRete(false); monitor.riprova();
    try {
      await started;
      monitor.segnalaEventoVivo(); log('Lo stream conferma la ripresa');
      pendingPing = null; resolvePing(false);
      await Promise.resolve(); await Promise.resolve();
      log('Arriva il vecchio ping negativo');
    } finally { $('late').disabled = false; }
  });

  const prefix = `talos-ui-showcase-${version}/`;
  const storage = {
    getItem: key => localStorage.getItem(prefix + key),
    setItem: (key, value) => localStorage.setItem(prefix + key, value),
  };
  const dialog = $('veloModello'); const box = dialog.querySelector('.talos-dialog');
  let opener;
  function openDialog(large = false) {
    opener = document.activeElement;
    if (large) dialogs.salvaMisura('sheet:model', { width: 1000, height: 700 }, storage);
    dialog.showModal();
    dialogs.preparaMisuraDialogo(dialog, { storage, finestra: window });
    dialogs.collegaRidimensionamentoDialoghi(dialog, { storage, finestra: window });
    $('session-name').focus({ preventScroll: true });
  }
  $('open-dialog').addEventListener('click', () => openDialog());
  $('open-large').addEventListener('click', () => openDialog(true));
  for (const id of ['close-dialog', 'cancel-dialog']) $(id).addEventListener('click', () => dialog.close());
  $('save-demo').addEventListener('click', () => {
    dialog.close(); notice('Confermato solo nel banco. Nessuna sessione è stata creata.');
  });
  dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
  // Confine di Tab del solo host dimostrativo, distinto dalla regia modale della app.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const items = [...dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault(); items.at(-1).focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault(); items[0].focus();
    }
  });

  const ro = new ResizeObserver(() => {
    const rect = box.getBoundingClientRect();
    $('dialog-size').value = `${Math.round(rect.width)} × ${Math.round(rect.height)} px`;
  });
  ro.observe(box);
  const onResize = () => { $('viewport-label').textContent = window.innerWidth; };
  onResize(); window.addEventListener('resize', onResize);
  $('reduce').addEventListener('change', () => document.body.classList.toggle('reduce-motion', $('reduce').checked));
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const showMedia = () => { $('system-motion').textContent = media.matches ? 'Sistema: movimento ridotto attivo.' : 'Sistema: movimento standard. La durata del caso è amplificata per osservare l’interruzione.'; };
  showMedia(); media.addEventListener('change', showMedia);
  $('animate').addEventListener('click', () => {
    const el = $('motion-object');
    const distance = Math.max(0, Math.min(190, el.parentElement.clientWidth - 140));
    const animation = movement.motion(el, [{ transform: 'translateX(0)', opacity: .35 }, { transform: `translateX(${distance}px)`, opacity: 1 }],
      { token: 'surface-enter', fattore: 10, leva: 'motion-navigation-off', document });
    $('motion-status').textContent = animation ? 'Transizione in corso. Puoi interromperla con la preferenza.' : 'Nessuna transizione: movimento disattivato.';
    animation?.finished.then(() => { $('motion-status').textContent = 'Transizione completata.'; }, () => { $('motion-status').textContent = 'Transizione interrotta.'; });
  });
  // Porta di prova del SOLO showcase; non viene inclusa nel bundle di produzione.
  window.__uiDemo = { version, connection, dialogs, movement, openDialog, storage, get monitor() { return monitor; } };
  $('ready').textContent = 'Moduli caricati · pronto alla verifica';
  document.documentElement.dataset.showcaseReady = 'true';
  window.addEventListener('pagehide', () => {
    monitor.ferma(); movement.fermaTutto(); ro.disconnect(); clearTimeout(noticeTimer);
    media.removeEventListener('change', showMedia); window.removeEventListener('resize', onResize);
  }, { once: true });
} catch (error) {
  $('ready').textContent = `Banco non avviato: ${error.message}`;
  $('ready').setAttribute('role', 'alert');
  document.documentElement.dataset.showcaseReady = 'error';
}
