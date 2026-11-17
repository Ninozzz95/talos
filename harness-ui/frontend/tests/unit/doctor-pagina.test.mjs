/*
 * 023 passo 2 (owner 10/11/2026 21:47, registro 436): la PAGINA del Doctor a «Elenco e pannello», su un DOM finto.
 * Verdetto in testa (l'unico `role=status`), quattro filtri sempre presenti, elenco `listbox` con `aria-activedescendant`,
 * pannello a destra con «Cosa non prova questo controllo» e «Cosa puoi fare» (B2: mai solo «Ricontrolla»), menu «⋯» + tasto destro.
 * ⛔ Non prova: un lettore di schermo vero, il browser vero (foto e prove parity), l'app installata.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { aggiornaDoctor, controlliDoctor } from '../../src/components/doctor.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento, clic, spento } from './aiuto-dom-blocchi.mjs';

const base = { chiaveApi: false, shell: 'desktop', git: true, naviga: true };
const riga = (id, label, extra = {}) => ({ id, label, requiresKey: true, keyConfigured: false, origineChiave: null, execution: 'collegato', ...extra });
const fornitori = (...sopra) => ({ storeAvailable: true, items: [
  riga('openai', 'OpenAI'), riga('openrouter', 'OpenRouter'), riga('anthropic', 'Anthropic'),
  riga('ollama', 'Ollama Local', { requiresKey: false, execution: 'runtime locale' }),
].map((p) => ({ ...p, ...(sopra.find((s) => s.id === p.id) || {}) })) });
const piano = (collegato, pianoAbilitato, extra = {}) => ({ accessoPiano: { chatgpt: { collegato, pianoAbilitato, ...extra } } });
const PIANO = { ...base, providers: fornitori(), ...piano(true, true) };
const UN_AVVISO = { ...PIANO, git: false };
const NIENTE = { ...base, providers: fornitori(), ...piano(false, false) };

/* La testata la dà chi ospita (il modello della pagina); il corpo lo costruisce `aggiornaDoctor`. */
function schermo({ vecchio = false } = {}) {
  const d = documento();
  const s = d.createElement('section'); s.id = 'schermoDoctor'; d.body.append(s);
  const barra = d.createElement('div'); barra.className = 'talos-topbar';
  const tempo = d.createElement('span'); tempo.dataset.doctorTempo = '';
  const esporta = d.createElement('button'); esporta.dataset.doctorExport = '';
  const ricontrolla = d.createElement('button'); ricontrolla.dataset.doctorRefresh = '';
  barra.append(tempo, esporta, ricontrolla);
  const pagina = d.createElement('div'); pagina.className = 'talos-page';
  if (vecchio) {
    /* il segno di prima (`mockup/talos-mockup.html`, che il Laboratorio carica ancora): due paragrafi, i contatori, le carte */
    const esito = d.createElement('p'); esito.setAttribute('role', 'status'); esito.dataset.doctorEsito = '';
    const errore = d.createElement('p'); errore.setAttribute('role', 'alert'); errore.dataset.doctorErrore = '';
    const conti = d.createElement('div'); conti.dataset.doctorCounts = '';
    const lista = d.createElement('div'); lista.dataset.doctorList = '';
    const carta = d.createElement('div'); carta.dataset.doctorId = 'chiave'; carta.dataset.c = 'CheckCard'; lista.append(carta);
    pagina.append(esito, errore, conti, lista);
  } else pagina.dataset.doctorPage = '';
  s.append(barra, pagina);
  return { d, s, q: (sel) => s.querySelector(sel), tutti: (sel) => s.querySelectorAll(sel) };
}
const tasto = (n, key, extra = {}) => { const e = new Event('keydown', { bubbles: true, cancelable: true }); Object.assign(e, { key, ...extra }); n.dispatchEvent(e); return e; };
const ids = (p) => p.tutti('[data-doctor-list] [role=option]').map((n) => n.dataset.doctorId);
const scelta = (p) => p.tutti('[data-doctor-list] [aria-selected=true]').map((n) => n.dataset.doctorId);

test.beforeEach(() => impostaLingua('it'));

test('DOCTOR-PAGINA-01 — elenco e pannello: un solo stato, un solo allarme, le righe sono opzioni e la prima è scelta', () => {
  const p = schermo();
  aggiornaDoctor(p.s, UN_AVVISO, { ricevutoAlle: '2026-11-10T20:12:00.000Z', adesso: '2026-11-10T21:00:00.000Z' });
  assert.equal(p.tutti('[role=status]').length, 1);
  assert.equal(p.tutti('[role=alert]').length, 1);
  assert.equal(p.q('[role=alert]').hidden, true);
  assert.equal(p.q('[data-doctor-list]').getAttribute('role'), 'listbox');
  assert.equal(p.q('[data-doctor-list]').getAttribute('tabindex'), '0');
  assert.deepEqual(ids(p), controlliDoctor(UN_AVVISO).map((v) => v.id), 'una riga per controllo, nello stesso ordine di gravità');
  assert.equal(ids(p)[0], 'git', 'il più grave in testa');
  assert.deepEqual(scelta(p), ['git']);
  const attivo = p.q('[data-doctor-list]').getAttribute('aria-activedescendant');
  assert.equal(p.q('#' + attivo).dataset.doctorId, 'git', '`aria-activedescendant` punta a una riga che esiste');
  assert.equal(p.q('[data-doctor-panel] h3').textContent, 'Git');
  assert.equal(p.q('[data-doctor-panel] h3').getAttribute('tabindex'), '-1');
  /* l'esito si legge da una PAROLA in ogni riga, non solo dal colore o dalla forma */
  for (const r of p.tutti('[data-doctor-list] [role=option]')) assert.match(r.querySelector('.talos-doctor__word').textContent, /^(OK|Nota|Avviso|Guasto)$/u, r.dataset.doctorId);
  assert.equal(p.q('[data-doctor-tempo]').textContent, 'Controllato oggi alle 21:12 · 10 controlli', 'ora di Roma, non quella della macchina');
  assert.match(p.q('[data-doctor-esito]').textContent, /Puoi lavorare\. 1 cosa da rivedere/u);
  assert.equal(p.q('[data-doctor-verdict]').dataset.g, 'warning');
  assert.doesNotMatch(p.s.textContent, /varie\.|modello\./u, 'nessuna chiave del dizionario a schermo');
});

test('DOCTOR-PAGINA-02 — sul segno di prima (le carte) la pagina si ricostruisce da sola e la testata resta', () => {
  const p = schermo({ vecchio: true });
  aggiornaDoctor(p.s, PIANO, {});
  assert.equal(p.q('[data-doctor-id=chiave]'), null, 'la carta «Chiave API» di prima non resta sotto');
  assert.ok(p.q('[data-doctor-panel]'));
  assert.equal(p.tutti('[role=status]').length, 1);
  assert.equal(p.tutti('[data-doctor-list]').length, 1);
  assert.ok(p.q('.talos-topbar [data-doctor-refresh]'), 'la testata non si tocca');
  aggiornaDoctor(p.s, UN_AVVISO, {});
  assert.equal(p.tutti('[data-doctor-panel]').length, 1, 'un secondo giro non costruisce due volte');
  assert.equal(p.tutti('[data-doctor-filter]').length, 4);
});

test('DOCTOR-PAGINA-03 — tastiera: frecce che girano, Inizio e Fine, Invio porta al pannello, Esc riporta all’elenco', () => {
  const p = schermo();
  aggiornaDoctor(p.s, UN_AVVISO, {});
  const lista = p.q('[data-doctor-list]'), tutte = ids(p);
  tasto(lista, 'ArrowDown');
  assert.deepEqual(scelta(p), [tutte[1]]);
  assert.equal(lista.getAttribute('aria-activedescendant'), p.q('[aria-selected=true]').id);
  assert.equal(p.q('[data-doctor-panel] h3').textContent, controlliDoctor(UN_AVVISO)[1].titolo, 'il pannello segue la riga');
  tasto(lista, 'ArrowUp'); tasto(lista, 'ArrowUp');
  assert.deepEqual(scelta(p), [tutte.at(-1)], 'dalla prima, su = l’ultima');
  tasto(lista, 'ArrowDown');
  assert.deepEqual(scelta(p), [tutte[0]], 'dall’ultima, giù = la prima');
  tasto(lista, 'End'); assert.deepEqual(scelta(p), [tutte.at(-1)]);
  tasto(lista, 'Home'); assert.deepEqual(scelta(p), [tutte[0]]);
  assert.equal(tasto(lista, 'ArrowDown').defaultPrevented, true, 'la pagina non scorre sotto le frecce');
  tasto(lista, 'Enter');
  assert.equal(p.d.activeElement, p.q('[data-doctor-panel] h3'));
  tasto(p.q('[data-doctor-panel] h3'), 'Escape');
  assert.equal(p.d.activeElement, lista);
});

test('DOCTOR-PAGINA-04 — filtri: quattro esiti sempre presenti, si accendono e si spengono, la scelta cade sulla prima riga visibile', () => {
  const p = schermo();
  aggiornaDoctor(p.s, UN_AVVISO, {});
  assert.deepEqual(p.tutti('[data-doctor-filter]').map((b) => b.dataset.doctorFilter), ['danger', 'warning', 'info', 'success']);
  assert.deepEqual(p.tutti('[data-doctor-filter]').map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'false', 'false']);
  assert.equal(p.q('[data-doctor-filter=info]').getAttribute('aria-label'), '8 note: mostra solo questi');
  assert.equal(p.q('[data-doctor-count=warning]').textContent, '1');
  assert.equal(p.q('[data-doctor-count=danger]').textContent, '0', 'un esito a zero resta, non sparisce');
  assert.equal(p.q('[data-doctor-filter-clear]').hidden, true);
  clic(p.q('[data-doctor-filter=success]'));
  assert.equal(p.q('[data-doctor-filter=success]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(ids(p), ['fornitori']);
  assert.deepEqual(scelta(p), ['fornitori'], 'la riga scelta era Git, che il filtro nasconde');
  assert.equal(p.q('[data-doctor-panel] h3').textContent, 'Modelli e accessi');
  assert.equal(p.q('[data-doctor-filter-clear]').hidden, false);
  assert.equal(p.q('[data-doctor-filter-clear]').textContent, 'Mostra tutti');
  clic(p.q('[data-doctor-filter=danger]'));
  assert.deepEqual(ids(p), []);
  assert.match(p.q('[data-doctor-list]').textContent, /Nessun controllo con questo esito/u);
  assert.equal(p.q('[data-doctor-list]').hasAttribute('aria-activedescendant'), false, 'niente riga, niente puntatore a una riga');
  clic(p.q('[data-doctor-filter=danger]'));
  assert.equal(ids(p).length, 10, 'lo stesso filtro due volte = tutti');
  clic(p.q('[data-doctor-filter=info]'));
  clic(p.q('[data-doctor-filter-clear]'));
  assert.equal(ids(p).length, 10);
  assert.equal(p.d.activeElement, p.q('[data-doctor-list]'));
});

test('DOCTOR-PAGINA-05 — pannello dei modelli: tabella dei fornitori, «Pronti» di serie se ce n’è almeno uno, «Tutti» a richiesta', () => {
  const p = schermo();
  aggiornaDoctor(p.s, PIANO, {});
  clic(p.q('[data-doctor-id=fornitori]'));
  const radio = () => p.tutti('[data-doctor-panel] [role=radio]');
  assert.deepEqual(radio().map((b) => [b.textContent, b.getAttribute('aria-checked')]), [['Pronti (1)', 'true'], ['Tutti (4)', 'false']]);
  assert.deepEqual(p.tutti('[data-doctor-provider]').map((r) => r.dataset.doctorProvider), ['openai']);
  assert.match(p.q('[data-doctor-provider=openai]').textContent, /OpenAI.*Piano ChatGPT collegato.*la chiave API non serve/u);
  clic(radio()[1]);
  assert.equal(p.tutti('[data-doctor-provider]').length, 4);
  assert.equal(radio()[1].getAttribute('aria-checked'), 'true');
  assert.equal(p.d.activeElement, radio()[1], 'il fuoco resta sulla scelta fatta');
  assert.match(p.q('[data-doctor-panel]').textContent, /Cosa non prova questo controllo.*non che una chiamata al modello riesca/u);
  /* nessun fornitore pronto: «Pronti (0)» è spento e si vedono tutti */
  const vuoto = schermo();
  aggiornaDoctor(vuoto.s, NIENTE, {});
  assert.equal(vuoto.q('[data-doctor-panel] h3').textContent, 'Modelli e accessi');
  const scelte = vuoto.tutti('[data-doctor-panel] [role=radio]');
  assert.equal(spento(scelte[0]), true);
  assert.equal(scelte[1].getAttribute('aria-checked'), 'true');
  assert.equal(vuoto.tutti('[data-doctor-provider]').length, 4);
});

test('DOCTOR-PAGINA-06 (B2) — «Cosa puoi fare»: al massimo due tasti, mai «Ricontrolla»; senza azione vera c’è la frase', () => {
  for (const dati of [UN_AVVISO, NIENTE, { chiaveApi: false, shell: 'none', git: false, naviga: false, providers: fornitori(), ownerRuntime: { configurato: true, pronto: false }, catalogoTask: { disponibile: false } }]) {
    const p = schermo();
    aggiornaDoctor(p.s, dati, {});
    for (const v of controlliDoctor(dati)) {
      clic(p.q('[data-doctor-id=' + v.id + ']'));
      const azioni = p.tutti('[data-doctor-panel] [data-doctor-action]');
      assert.ok(azioni.length <= 2, v.id);
      for (const b of azioni) assert.notEqual(b.textContent, 'Ricontrolla', v.id);
      assert.equal(p.tutti('[data-doctor-panel] [data-doctor-action=ricontrolla]').length, 0, v.id);
      if (v.gravita === 'warning' || v.gravita === 'danger') {
        if (azioni.length) assert.match(azioni[0].className, /talos-button--primary/u, v.id + ': la prima azione di un avviso è quella in evidenza');
        else assert.match(p.q('[data-doctor-panel] .talos-doctor__nothing').textContent, /^Da qui non si può fare niente/u, v.id);
      } else for (const b of azioni) assert.doesNotMatch(b.className, /talos-button--primary/u, v.id + ': su un controllo a posto nessun tasto grida');
      assert.equal(p.tutti('[data-doctor-panel] [data-doctor-more]').length, 1, v.id + ': il menu «⋯» c’è sempre');
    }
  }
});

test('DOCTOR-PAGINA-07 — le azioni: «vai» resta nella pagina, il resto lo fa chi ospita; menu dal tasto «⋯», dal tasto destro e da Maiusc+F10', () => {
  const p = schermo();
  const fatte = [], menu = [];
  const dati = { ...PIANO, catalogoTask: { disponibile: false }, ownerRuntime: { configurato: true, pronto: false } };
  aggiornaDoctor(p.s, dati, { onAzione: (a, v) => fatte.push([a.tipo, a.dove || a.id || '', v.id]), onMenu: (v, punto) => menu.push([v.id, typeof punto.x, Boolean(punto.ancora)]) });
  clic(p.q('[data-doctor-filter=warning]'));
  clic(p.q('[data-doctor-id=catalogo]'));
  clic(p.q('[data-doctor-panel] [data-doctor-action=vai]'));
  assert.deepEqual(scelta(p), ['runtime'], '«Vai a Servizio agente» sceglie quel controllo');
  assert.equal(p.q('[data-doctor-filter=warning]').getAttribute('aria-pressed'), 'false', 'e toglie il filtro, che potrebbe nasconderlo');
  assert.equal(p.d.activeElement, p.q('[data-doctor-panel] h3'));
  assert.deepEqual(fatte, [], '«vai» non esce dalla pagina');
  clic(p.q('[data-doctor-id=fornitori]'));
  clic(p.q('[data-doctor-panel] [data-doctor-action=apri]'));
  assert.deepEqual(fatte, [['apri', 'provider', 'fornitori']]);
  clic(p.q('[data-doctor-panel] [data-doctor-more]'));
  assert.deepEqual(menu, [['fornitori', 'number', true]]);
  assert.equal(p.q('[data-doctor-more]').getAttribute('aria-haspopup'), 'menu');
  assert.equal(p.q('[data-doctor-more]').getAttribute('aria-label'), 'Altre azioni: Modelli e accessi');
  const riga = p.q('[data-doctor-id=shell]');
  const destro = new Event('contextmenu', { bubbles: true, cancelable: true }); Object.assign(destro, { clientX: 300, clientY: 200 });
  riga.dispatchEvent(destro);
  assert.equal(destro.defaultPrevented, true, 'il menu del browser non si apre sopra il nostro');
  assert.deepEqual(scelta(p), ['shell'], 'il tasto destro sceglie la riga su cui apre il menu');
  assert.deepEqual(menu.at(-1), ['shell', 'number', true]);
  tasto(p.q('[data-doctor-list]'), 'F10', { shiftKey: true });
  assert.deepEqual(menu.at(-1), ['shell', 'number', true]);
  assert.equal(menu.length, 3);
  /* il verdetto: con un avviso porta al controllo peggiore */
  assert.match(p.q('[data-doctor-verdict-action]').textContent, /^Guarda «/u);
  clic(p.q('[data-doctor-id=git]'));
  assert.equal(p.tutti('[data-doctor-verdict-action]').length, 1, 'un tasto solo nel verdetto, anche dopo più giri');
  clic(p.q('[data-doctor-verdict-action]'));
  assert.deepEqual(scelta(p), [controlliDoctor(dati)[0].id]);
});

test('DOCTOR-PAGINA-08 — mentre controlla, senza risultato e dopo un errore: lo dice lo stato, e l’ultimo risultato resta', () => {
  const p = schermo();
  let ricontrolli = 0, esportazioni = 0;
  const opzioni = { onRicontrolla: () => { ricontrolli++; }, onEsporta: () => { esportazioni++; } };
  aggiornaDoctor(p.s, null, { ...opzioni, caricamento: true });
  assert.equal(p.q('[data-doctor-refresh]').disabled, true);
  assert.equal(p.q('[data-doctor-refresh]').textContent, 'Controllo…');
  assert.equal(p.q('[data-doctor-export]').disabled, true);
  assert.equal(p.q('[data-doctor-esito]').textContent, 'Controllo in corso…');
  assert.equal(p.q('[data-doctor-list]').getAttribute('aria-busy'), 'true');
  assert.equal(p.q('[data-doctor-counts]').hidden, true, 'senza risultato i filtri non mostrano quattro zeri');
  assert.equal(p.q('[data-doctor-panel]').hidden, true);
  assert.equal(p.q('[data-doctor-tempo]').textContent, 'Controllo non eseguito');
  clic(p.q('[data-doctor-export]'));
  assert.equal(esportazioni, 0, 'niente da esportare');
  aggiornaDoctor(p.s, null, { ...opzioni, errore: 'Servizio temporaneamente non disponibile' });
  assert.equal(p.q('[role=alert]').hidden, false);
  assert.match(p.q('[role=alert]').textContent, /temporaneamente/u);
  assert.equal(p.q('[data-doctor-esito]').textContent, 'Nessun risultato disponibile.');
  assert.equal(p.q('[data-doctor-export]').disabled, true, 'finita la corsa senza risultato, «Esporta» resta spento');
  assert.equal(p.q('[data-doctor-refresh]').disabled, false);
  aggiornaDoctor(p.s, UN_AVVISO, { ...opzioni, ricevutoAlle: '2026-11-10T20:12:00.000Z' });
  assert.equal(p.q('[role=alert]').hidden, true);
  assert.equal(p.q('[data-doctor-refresh]').textContent, 'Ricontrolla');
  clic(p.q('[data-doctor-refresh]')); clic(p.q('[data-doctor-export]'));
  assert.deepEqual([ricontrolli, esportazioni], [1, 1]);
  aggiornaDoctor(p.s, UN_AVVISO, { ...opzioni, errore: 'Servizio temporaneamente non disponibile' });
  assert.match(p.q('[role=status]').textContent, /ultimo risultato conservato/u);
  assert.equal(ids(p).length, 10, 'l’elenco di prima resta leggibile');
  assert.equal(p.q('[data-doctor-export]').disabled, false);
  assert.equal(p.tutti('[role=status]').length, 1);
});

test('DOCTOR-PAGINA-09 — la riga scelta, il filtro e «Tutti» restano dopo un ricontrollo; la lingua segue a ogni giro', () => {
  const p = schermo();
  aggiornaDoctor(p.s, UN_AVVISO, {});
  clic(p.q('[data-doctor-filter=info]'));
  clic(p.q('[data-doctor-id=shell]'));
  aggiornaDoctor(p.s, UN_AVVISO, { caricamento: true });
  aggiornaDoctor(p.s, { ...UN_AVVISO, naviga: false }, {});
  assert.deepEqual(scelta(p), ['shell'], 'ricontrollare non riporta in cima');
  assert.equal(p.q('[data-doctor-filter=info]').getAttribute('aria-pressed'), 'true');
  assert.equal(p.q('[data-doctor-count=warning]').textContent, '2');
  impostaLingua('en');
  aggiornaDoctor(p.s, UN_AVVISO, {});
  assert.equal(p.q('[data-doctor-filter=info]').getAttribute('aria-label'), '8 notes: show only these');
  assert.equal(p.q('[data-doctor-filter-clear]').textContent, 'Show all');
  assert.equal(p.q('[data-doctor-refresh]').textContent, 'Check again');
  assert.doesNotMatch(p.s.textContent, /varie\.|modello\./u);
});

test('DOCTOR-PAGINA-10 (E1) — dal piano arrivano alla pagina solo due booleani: email, scadenza e token non sono nel segno', () => {
  const p = schermo();
  aggiornaDoctor(p.s, { ...base, providers: fornitori(), ...piano(true, true, { email: 'persona@esempio.test', scadeAlle: '2026-12-01T10:00:00Z', refreshToken: 'rt-finto-123' }) }, {});
  clic(p.q('[data-doctor-id=fornitori]'));
  clic(p.tutti('[data-doctor-panel] [role=radio]')[1]);
  const attributi = [...p.s.discendenti()].flatMap((n) => [...n.attributes.values(), ...Object.values(n.dataset)]).join(' ');
  assert.doesNotMatch(p.s.textContent + ' ' + attributi, /persona@esempio\.test|2026-12-01|rt-finto-123/u);
  /* campo assente: la parola «collegato» non compare da nessuna parte nella pagina */
  const senza = schermo();
  aggiornaDoctor(senza.s, { ...base, providers: fornitori() }, {});
  clic(senza.q('[data-doctor-id=fornitori]'));
  assert.doesNotMatch(senza.s.textContent, /collegato/iu);
  assert.match(senza.s.textContent, /non misurato/u);
  assert.match(senza.q('[data-doctor-esito]').textContent, /non (è )?misurato/u);
});

test('DOCTOR-PAGINA-11 — il conto di uno si dice al singolare: «1 avviso», mai «1 avvisi»; zero e più di uno restano al plurale', () => {
  const p = schermo();
  aggiornaDoctor(p.s, UN_AVVISO, {});
  const parola = (g) => p.q('[data-doctor-count=' + g + ']').textContent + ' ' + p.q('[data-doctor-kind=' + g + ']').textContent;
  assert.equal(parola('warning'), '1 avviso');
  assert.equal(parola('danger'), '0 guasti');
  assert.match(p.q('[data-doctor-filter=warning]').getAttribute('aria-label'), /1 avviso\b(?!i)/u);
  assert.match(parola('info'), /^(1 nota|[02-9]\d* note)$/u);
  aggiornaDoctor(p.s, NIENTE, {});
  assert.match(parola('danger'), /^(1 guasto|[2-9] guasti)$/u);
  impostaLingua('en');
  try {
    aggiornaDoctor(p.s, UN_AVVISO, {});
    assert.equal(parola('warning'), '1 warning');
    assert.equal(parola('danger'), '0 failures');
  } finally { impostaLingua('it'); }
});

/* Giudice v1393, punto 17 (c): nel carattere a spaziatura fissa lo zero ha la barra e nelle fiche si leggeva «θ» (foto del giro 3).
   Il numero delle fiche usa il carattere dell'interfaccia con le cifre a larghezza fissa: niente barra, e le fiche non ballano. */
test('DOCTOR-PAGINA-12 — il numero delle fiche non usa il carattere a spaziatura fissa (lo zero barrato si leggeva «θ»)', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../../src/styles/doctor.css', import.meta.url), 'utf8');
  const regola = css.match(/\.talos-doctor__chip b\s*\{([^}]*)\}/u);
  assert.ok(regola, 'la regola del numero delle fiche esiste');
  assert.doesNotMatch(regola[1], /font-mono/u);
  assert.match(regola[1], /font-variant-numeric:\s*tabular-nums/u);
  assert.doesNotMatch(regola[1], /slashed-zero/u);
});
