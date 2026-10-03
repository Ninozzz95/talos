/*
 * ⭐ Refactor dei grafi (decisioni owner 24 e 29, 26/09/2026) — la vista TEMPO (Gantt coi tempi morti compressi), portata dal
 *   prototipo approvato (`prototypes/grafi-v2/tempo.js`) sui dati veri.
 *
 * Righe per fase che si aprono e si chiudono, una barra per TENTATIVO sull'asse di `tempo-modello.js`: i buchi in cui nessuno
 * lavorava diventano una fascia stretta con la loro durata vera scritta sopra (Temporal UI `collapseIdleTime`; righe
 * riciclate a finestra come `timeline-row-pool.ts`). Colore + icona + parola dello stato, mai il colore da solo.
 * Fonti: i tentativi vengono dalla STORIA degli stati (decisione 29) — l'ultimo pieno, i precedenti in trasparenza (nel
 * prototipo c'era solo il primo, ricostruito); il nome del passo dalla sua riga, che arriva con la sua pagina: finché non
 * c'è, la riga lo dice. Un passo mai partito non ha barra: il suo stato sta scritto nella riga.
 */
import { formattaDurata, iconaDellaFase, STATI_PASSO } from './comuni.js';
import { linguaCorrenteDiT, t as tr } from '../lingua.js';

/*
 * ⛔ Gli AIUTI DI LINGUA dei grafi (owner 03/10/2026, «ogni singola parola nella app deve essere sia in inglese che in italiano»).
 *   Stanno qui, nella foglia della catena di import (`tela.js`, `grafo-workflow.js` e `rail-workflow.js` importano da qui, mai
 *   il contrario), perché `comuni.js` tiene i numeri/orari in `it-IT` fissi: chi disegna non usa `cifra` né `ora` di là, ma
 *   queste, che seguono la lingua corrente AL MOMENTO DELL'USO. (Dal 03/10/2026 anche `STATI_PASSO[…].parola` legge il dizionario.)
 */
const CHIAVE_PAROLA_PASSO = Object.freeze({
  planned: 'agenti.stepState.planned', pending: 'agenti.stepState.waiting', blocked: 'agenti.stepState.waiting', ready: 'agenti.stepState.ready',
  leased: 'agenti.stepState.starting', running: 'agenti.stepState.running', retry_wait: 'agenti.stepState.retryWait',
  waiting_human: 'agenti.stepState.waitingForYou', reconciling: 'agenti.stepState.verifying', uncertain: 'agenti.stepState.toVerify',
  succeeded: 'agenti.stepState.done', failed: 'agenti.stepState.failed', cancelled: 'agenti.stepState.cancelled',
  skipped: 'agenti.stepState.skipped', superseded: 'agenti.stepState.superseded',
});
/** Lo stato di un passo IN PAROLE, nella lingua corrente (le stesse parole di `STATI_PASSO`, che restano la fonte dei toni). */
export const parolaDelPasso = (stato) => tr(CHIAVE_PAROLA_PASSO[stato] ?? 'agenti.stepState.unknown');
/** Il locale dei numeri e quello degli orari (24 ore anche in inglese, come l'asse e le righe del contesto). */
export const localeNumeri = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
export const localeOra = () => (linguaCorrenteDiT() === 'en' ? 'en-GB' : 'it-IT');
const FORMATI_CIFRE = new Map();
/** Un numero col raggruppamento SEMPRE (5.000 / 5,000), nella lingua corrente. */
export function cifra(n) {
  const locale = localeNumeri();
  if (!FORMATI_CIFRE.has(locale)) FORMATI_CIFRE.set(locale, new Intl.NumberFormat(locale, { useGrouping: 'always' }));
  return FORMATI_CIFRE.get(locale).format(n);
}
/** Ore e minuti di un istante (numero, data o ISO), nella lingua corrente; `null` se non è una data (mai l'epoca per un `null`). */
export function oraBreve(valore) {
  const ms = typeof valore === 'number' ? valore : valore instanceof Date ? valore.getTime() : Date.parse(valore ?? '');
  return Number.isFinite(ms) ? new Date(ms).toLocaleTimeString(localeOra(), { hour: '2-digit', minute: '2-digit' }) : null;
}

const ALTEZZA_RIGA = 30;
const LARGHEZZA_NOMI = 248;
const SCORTA = 8;
const TROPPE_RIGHE = 400;
const tonoDi = (stato) => STATI_PASSO[stato]?.tono ?? 'neutro';
const parolaDi = parolaDelPasso;
const ora = (istante) => new Date(istante).toLocaleTimeString(localeOra(), { hour: '2-digit', minute: '2-digit' });
const INTERVALLI_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 240];

export function creaTempo(host, { icona, onSeleziona, onZoom }) {
  const d = host.ownerDocument;
  const finestra = d.defaultView;
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const radice = el('div', 'gv-tempo');
  const testa = el('div', 'gv-tempo-testa');
  const testaNomi = el('div', 'gv-tempo-testa-nomi', tr('agenti.timeline.agentColumn'));
  const asse = el('div', 'gv-tempo-asse');
  testa.append(testaNomi, asse);
  const corpo = el('div', 'gv-tempo-corpo');
  corpo.tabIndex = 0;
  corpo.setAttribute('role', 'list');
  corpo.setAttribute('aria-label', tr('agenti.timeline.listLabel'));
  const spazio = el('div', 'gv-tempo-spazio');
  const sfondo = el('div', 'gv-tempo-sfondo');
  const righeHost = el('div', 'gv-tempo-righe');
  spazio.append(sfondo, righeHost);
  corpo.append(spazio);
  radice.append(testa, corpo);
  host.append(radice);

  let dati = null;
  let righe = [];
  const chiuse = new Set();
  let pxMs = 0;
  let pxMsAdatta = 0;
  let montate = new Map();
  let richiesta = null;
  let primaVolta = true;

  const larghezzaAsse = () => Math.max(200, radice.clientWidth - LARGHEZZA_NOMI - 28);
  function adatta() {
    if (!dati) return;
    pxMsAdatta = larghezzaAsse() / Math.max(1, dati.asse().lunghezza);
    pxMs = pxMsAdatta;
    onZoom?.(1);
    ridisegna();
  }
  const x = (t) => LARGHEZZA_NOMI + dati.asse().versoAsse(t) * pxMs;

  function costruisciRighe() {
    righe = [];
    for (const g of dati.panoramica.groups) {
      righe.push({ tipo: 'fase', g });
      if (chiuse.has(g.phaseId)) continue;
      for (let i = 0; i < g.total; i += 1) righe.push({ tipo: 'passo', g, indice: i });
    }
    spazio.style.height = `${righe.length * ALTEZZA_RIGA + 12}px`;
  }
  function disegnaAsse() {
    asse.replaceChildren();
    sfondo.replaceChildren();
    const a = dati.asse();
    const larghezza = a.lunghezza * pxMs;
    spazio.style.width = `${LARGHEZZA_NOMI + larghezza + 28}px`;
    asse.style.width = `${larghezza + 28}px`;
    const minuti = INTERVALLI_MIN.find((m) => m * 60_000 * pxMs >= 72) ?? 240;
    const passo = minuti * 60_000;
    for (const s of a.segmenti) {
      if (s.compresso) {
        const x0 = s.asseDa * pxMs, x1 = s.asseA * pxMs;
        const vuoto = el('div', 'gv-tempo-vuoto');
        vuoto.style.transform = `translateX(${x0}px)`; vuoto.style.width = `${Math.max(6, x1 - x0)}px`;
        vuoto.title = tr('agenti.timeline.idleTitle', { da: ora(s.da), a: ora(s.a) });
        vuoto.append(el('span', 'gv-tempo-vuoto-etichetta', tr('agenti.timeline.idleLabel', { durata: formattaDurata(s.a - s.da) })));
        asse.append(vuoto);
        const fascia = el('div', 'gv-tempo-fascia');
        fascia.style.transform = `translateX(${LARGHEZZA_NOMI + x0}px)`; fascia.style.width = `${Math.max(6, x1 - x0)}px`;
        sfondo.append(fascia);
        continue;
      }
      for (let t = Math.ceil(s.da / passo) * passo; t < s.a; t += passo) {
        const tacca = el('span', 'gv-tempo-tacca', ora(t));
        tacca.style.transform = `translateX(${a.versoAsse(t) * pxMs}px)`;
        asse.append(tacca);
        const linea = el('div', 'gv-tempo-griglia');
        linea.style.transform = `translateX(${LARGHEZZA_NOMI + a.versoAsse(t) * pxMs}px)`;
        sfondo.append(linea);
      }
    }
    const adesso = el('div', 'gv-tempo-adesso');
    adesso.style.transform = `translateX(${x(a.t1)}px)`;
    adesso.append(el('span', null, tr('agenti.timeline.now', { ora: ora(a.t1) })));
    sfondo.append(adesso);
    const t = dati.tempoCorrente();
    if (t !== null) {
      const rip = el('div', 'gv-tempo-rip');
      rip.style.transform = `translateX(${x(t)}px)`;
      rip.append(el('span', null, ora(t)));
      sfondo.append(rip);
    }
  }
  function barra(n, da, a, { tono, classe = '', titolo, cliccabile = null }) {
    const b = el(cliccabile ? 'button' : 'span', `gv-tempo-barra ${classe}`.trim());
    if (cliccabile) { b.type = 'button'; b.tabIndex = -1; b.dataset.nodoId = cliccabile; b.addEventListener('click', () => onSeleziona?.(cliccabile)); }
    b.dataset.tono = tono;
    b.style.transform = `translateX(${x(da)}px)`;
    const w = Math.max(classe ? 3 : 4, x(a) - x(da));
    b.style.width = `${w}px`;
    b.title = titolo;
    if (cliccabile) b.setAttribute('aria-label', titolo);
    n.append(b);
    return { b, w };
  }
  function riga(i) {
    const voce = righe[i];
    const n = el('div', `gv-tempo-riga gv-tempo-riga--${voce.tipo}`);
    n.style.transform = `translateY(${i * ALTEZZA_RIGA}px)`;
    n.setAttribute('role', 'listitem');
    const t = dati.tempoCorrente();
    const fine = t ?? dati.asse().t1;
    if (voce.tipo === 'fase') {
      const b = el('button', 'gv-tempo-nome gv-tempo-nome--fase');
      b.type = 'button';
      b.dataset.phaseId = voce.g.phaseId;
      b.setAttribute('aria-expanded', String(!chiuse.has(voce.g.phaseId)));
      b.append(icona('i-chevron', chiuse.has(voce.g.phaseId) ? 'gv-gira-giu' : ''), icona(iconaDellaFase(voce.g)));
      const c = dati.conteggi(voce.g.phaseId) ?? { terminated: 0, attention: 0 };
      b.append(el('span', 'gv-tempo-nome-testo', voce.g.label), el('span', 'gv-tempo-nome-conto', `${cifra(c.terminated)}/${cifra(voce.g.total)}`));
      b.addEventListener('click', () => { if (chiuse.has(voce.g.phaseId)) chiuse.delete(voce.g.phaseId); else chiuse.add(voce.g.phaseId); costruisciRighe(); disegnaRighe(true); });
      n.append(b);
      // la campata della fase: dal primo inizio all'ultima fine (o adesso), col tono di chi c'è dentro
      const campata = dati.campata(voce.g.phaseId);
      if (campata && campata.da < fine) {
        const s = el('span', 'gv-tempo-campata');
        s.dataset.tono = c.attention ? 'errore' : c.terminated === voce.g.total ? 'ok' : 'corso';
        s.style.transform = `translateX(${x(campata.da)}px)`;
        s.style.width = `${Math.max(3, x(Math.min(campata.a ?? dati.asse().t1, fine)) - x(campata.da))}px`;
        n.append(s);
      }
      return n;
    }
    const r = dati.cella(voce.g.phaseId, voce.indice);
    if (!r) {
      n.dataset.carica = 'true';
      n.append(el('span', 'gv-tempo-nome gv-tempo-nome--carica', tr('agenti.timeline.loading')));
      return n;
    }
    const stato = dati.statoDi(r.nodeId) ?? r.state;
    const tono = tonoDi(stato);
    const nome = el('button', 'gv-tempo-nome');
    nome.type = 'button';
    nome.dataset.nodoId = r.nodeId;
    nome.setAttribute('aria-pressed', String(dati.selezionato() === r.nodeId));
    const punto = el('span', 'talos-wfg__punto'); punto.dataset.tono = tono;
    nome.append(punto, el('span', 'gv-tempo-nome-testo', r.label));
    const tentativi = (dati.tentativi().get(r.nodeId) ?? []).filter((x0) => x0.da <= fine);
    if (!tentativi.length) nome.append(el('span', 'gv-tempo-nome-stato', parolaDi(stato)));
    nome.setAttribute('aria-label', `${r.label}, ${parolaDi(stato)}`);
    nome.addEventListener('click', () => onSeleziona?.(r.nodeId));
    n.append(nome);
    n.dataset.spento = String(dati.spento(r.nodeId));
    tentativi.forEach((tt, k) => {
      const ultimo = k === tentativi.length - 1;
      const finito = tt.a !== null && tt.a <= fine;
      const a = finito ? tt.a : fine;
      if (!ultimo) {
        barra(n, tt.da, a, { tono: 'errore', classe: 'gv-tempo-barra--primo',
          titolo: tr('agenti.timeline.attemptFailed', { n: k + 1, da: ora(tt.da), a: finito ? ora(tt.a) : tr('agenti.timeline.stillRunning') }) });
        return;
      }
      const durata = formattaDurata(a - tt.da);
      const titolo = `${r.label} · ${parolaDi(stato)} · ${ora(tt.da)} → ${finito ? ora(tt.a) : tr('agenti.timeline.stillRunning')} · ${durata}`;
      const { b, w } = barra(n, tt.da, a, { tono, titolo, cliccabile: r.nodeId });
      b.dataset.stato = stato;
      if (w > 64) b.append(el('span', 'gv-tempo-barra-testo', durata));
    });
    if (dati.selezionato() === r.nodeId) n.dataset.scelto = 'true';
    return n;
  }
  function disegnaRighe(forza = false) {
    const primo = Math.max(0, Math.floor(corpo.scrollTop / ALTEZZA_RIGA) - SCORTA);
    const ultimo = Math.min(righe.length - 1, Math.ceil((corpo.scrollTop + corpo.clientHeight) / ALTEZZA_RIGA) + SCORTA);
    if (forza) { righeHost.replaceChildren(); montate = new Map(); }
    for (const [i, n] of montate) if (i < primo || i > ultimo) { n.remove(); montate.delete(i); }
    const mancano = new Map();
    for (let i = primo; i <= ultimo; i += 1) {
      const voce = righe[i];
      if (voce?.tipo === 'passo' && !dati.cella(voce.g.phaseId, voce.indice)) {
        const m = mancano.get(voce.g.phaseId) ?? [Infinity, -Infinity];
        mancano.set(voce.g.phaseId, [Math.min(m[0], voce.indice), Math.max(m[1], voce.indice)]);
      }
      if (montate.has(i)) continue;
      const n = riga(i);
      montate.set(i, n);
      righeHost.append(n);
    }
    for (const [phaseId, [da, a]] of mancano) dati.chiedi(phaseId, da, a);
  }
  function ridisegna() { if (!dati) return; costruisciRighe(); disegnaAsse(); disegnaRighe(true); }
  corpo.addEventListener('scroll', () => {
    asse.style.transform = `translateX(${-corpo.scrollLeft}px)`;
    if (richiesta) return;
    richiesta = (finestra?.requestAnimationFrame ?? setTimeout)(() => { richiesta = null; if (dati) disegnaRighe(); });
  }, { passive: true });
  corpo.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const passi = righe.map((v, i) => [v, i]).filter(([v]) => v.tipo === 'passo' && dati.cella(v.g.phaseId, v.indice));
    const qui = passi.findIndex(([v]) => dati.cella(v.g.phaseId, v.indice).nodeId === dati.selezionato());
    const prossimo = passi[Math.max(0, Math.min(passi.length - 1, qui + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (prossimo) { const id = dati.cella(prossimo[0].g.phaseId, prossimo[0].indice).nodeId; onSeleziona?.(id); api.vaiA(id); }
  });

  const api = {
    elemento: radice,
    imposta(nuovi) {
      dati = nuovi;
      if (primaVolta) {
        primaVolta = false;
        // a 5.000 passi si apre solo la fase dove si lavora; sotto le 400 righe tutto aperto
        if (dati.panoramica.total > TROPPE_RIGHE) {
          const piena = [...dati.panoramica.groups].sort((a, b) => ((dati.conteggi(b.phaseId)?.counts.running ?? 0) - (dati.conteggi(a.phaseId)?.counts.running ?? 0)))[0];
          for (const g of dati.panoramica.groups) if (g.phaseId !== piena?.phaseId) chiuse.add(g.phaseId);
        }
      }
      if (!pxMsAdatta) adatta(); else ridisegna();
    },
    aggiorna() { if (dati) { disegnaAsse(); disegnaRighe(true); } },
    adatta,
    passo(verso) {
      if (!dati) return;
      const k = pxMs / pxMsAdatta;
      const n = verso > 0 ? Math.floor(k * 10 + 1e-6) + 1 : Math.ceil(k * 10 - 1e-6) - 1;
      const nuovo = Math.min(40, Math.max(0.5, n / 10));
      const centro = (corpo.scrollLeft + corpo.clientWidth / 2 - LARGHEZZA_NOMI) / pxMs;
      pxMs = pxMsAdatta * nuovo;
      onZoom?.(nuovo);
      ridisegna();
      corpo.scrollLeft = Math.max(0, centro * pxMs + LARGHEZZA_NOMI - corpo.clientWidth / 2);
    },
    get zoom() { return pxMsAdatta ? pxMs / pxMsAdatta : 1; },
    vaiA(nodeId) {
      if (!dati) return;
      const posto = dati.posto(nodeId);
      if (!posto) return;
      if (chiuse.has(posto.phaseId)) { chiuse.delete(posto.phaseId); costruisciRighe(); }
      const i = righe.findIndex((v) => v.tipo === 'passo' && v.g.phaseId === posto.phaseId && v.indice === posto.indice);
      if (i < 0) return;
      const y = i * ALTEZZA_RIGA;
      if (y < corpo.scrollTop || y > corpo.scrollTop + corpo.clientHeight - ALTEZZA_RIGA * 2) corpo.scrollTop = Math.max(0, y - corpo.clientHeight / 3);
      const primo = dati.tentativi().get(nodeId)?.at(-1);
      if (primo) {
        const xx = x(primo.da);
        if (xx < corpo.scrollLeft + LARGHEZZA_NOMI || xx > corpo.scrollLeft + corpo.clientWidth - 40) corpo.scrollLeft = Math.max(0, xx - LARGHEZZA_NOMI - 80);
      }
      disegnaRighe(true);
    },
    distruggi() { osservatore?.disconnect?.(); radice.remove(); },
  };
  const Osservatore = finestra?.ResizeObserver;
  const osservatore = Osservatore ? new Osservatore(() => {
    if (!dati || radice.hidden) return;
    const nuovo = larghezzaAsse() / Math.max(1, dati.asse().lunghezza);
    if (Math.abs(pxMsAdatta - nuovo) > 1e-9) { const k = api.zoom; pxMsAdatta = nuovo; pxMs = pxMsAdatta * k; ridisegna(); }
  }) : null;
  osservatore?.observe(radice);
  return api;
}
