/*
 * ⭐⭐⭐ /goal G6 — LA FASCIA DELL'OBIETTIVO sopra il compositore (owner 15/10/2026, mockup `mockup-goal-2026-10-15/`, scene
 * A0-A4m approvate: «variante A, nella chat»).
 *
 * Da chi l'abbiamo presa, letto nel loro codice il 15/10/2026:
 *   · Hermes desktop `apps/desktop/src/app/chat/composer/status-stack/session-control-goal.tsx:148-230` — la fascia nella pila
 *     sopra il compositore: stato + giro nella testata, il testo, il motivo della pausa, «⋯» e tasto destro con la STESSA lista
 *     (Maiusc+F10 la apre da tastiera), «Togli» che chiede conferma;
 *   · Codex `codex-rs/tui/src/goal_display.rs:33-60` — la riga corta: stato e conti («Tokens: 63.9K/50K»), poi l'obiettivo.
 * Decisioni dell'owner: forma MINIMA di serie (una riga: stato · controlli superati · giro · token, poi il testo troncato), la
 *   freccia la apre e «Riduci» la richiude, la scelta si ricorda PER CONVERSAZIONE; si apre DA SOLA solo quando l'obiettivo si
 *   ferma (pausa, bloccato, tetto) o finisce, dove c'è un motivo da leggere — una volta per stato: richiusa, resta richiusa.
 *
 * ⛔ Ogni pezzo legge un campo VERO dell'obiettivo del server (`src/obiettivo/stato.mjs`), mai una cifra inventata:
 *   stato/motivo · `ciclo.giri`/`ciclo.token` · i tetti che il registro applica (`tettiDellObiettivo`) · `verifica.verdetti` per
 *   criterio · `giudizioDelTesto` senza contratto. Il dettaglio del modello («bloccato»), del giudice e del revisore è TESTO DI
 *   UN MODELLO: entra sempre come `textContent`, con chi l'ha detto davanti, mai come markup.
 * ⛔ Non collegato, e riportato all'owner: «Alza il tetto» del mockup (nessuna porta del server la fa oggi).
 * Disclosure: `aria-expanded` sul pulsante sempre allineato allo stato (W3C, «Using aria-expanded to indicate the state of a
 *   collapsible element», letto il 15/10/2026).
 */
import { t, tn, linguaCorrenteDiT } from './lingua.js';
/* revisione G6 del bugfixer (15/10/2026): nel motivo del modello restano NUL, ESC e U+202E — a schermo un'inversione bidirezionale
   capovolge il testo. Ogni testo che viene da un modello o dalla persona passa dal filtro di casa (`testo-a-schermo.js`). */
import { senzaInganni, senzaInganniSuPiuRighe } from './testo-a-schermo.js';

export const STATI_FERMI = Object.freeze(['in-pausa', 'bloccato', 'tetto', 'fatto']);
const CHIAVE_SCELTE = 'talos.obiettivo.fascia.v1';
const SCELTE_MASSIME = 200;

const inglese = () => linguaCorrenteDiT() === 'en';
const intero = (v) => Number.isSafeInteger(v) && v >= 0;

/** Un numero di token corto, come Codex («182k», «2M»): la cifra intera la dice il titolo. */
export function tokenCorti(n) {
  if (!intero(n)) return '';
  return new Intl.NumberFormat(inglese() ? 'en-US' : 'it-IT', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** Lo stato che la fascia mostra. Una pausa col motivo «bloccato» (il modello, G6) si mostra come «bloccato». */
export function statoVisibile(obiettivo) {
  if (!obiettivo || typeof obiettivo !== 'object') return null;
  if (obiettivo.stato === 'in-pausa' && obiettivo.motivo?.tipo === 'bloccato') return 'bloccato';
  return ['attivo', 'in-pausa', 'bloccato', 'tetto', 'fatto'].includes(obiettivo.stato) ? obiettivo.stato : null;
}

/** Quanti controlli sono superati, sul contratto; `null` senza contratto (il pavimento) o prima della prima verifica. */
export function controlliSuperati(obiettivo) {
  const criteri = obiettivo?.contratto?.criteri;
  if (!Array.isArray(criteri) || criteri.length === 0) return null;
  const verdetti = Array.isArray(obiettivo.verifica?.verdetti) ? obiettivo.verifica.verdetti : [];
  if (verdetti.length === 0) return { superati: null, totale: criteri.length };
  const verdi = new Set(verdetti.filter((v) => v?.esito === 'verde').map((v) => v.id));
  return { superati: criteri.filter((c) => verdi.has(c.id)).length, totale: criteri.length };
}

/* ⛔ una chiave col trattino esce GREZZA (`lingua.js` FORMA_DELLA_CHIAVE, lezione dell'08/10): gli stati del server si mappano */
const CHIAVI_DEGLI_STATI = Object.freeze({ attivo: 'chat.goal.state.active', 'in-pausa': 'chat.goal.state.paused', bloccato: 'chat.goal.state.blocked', tetto: 'chat.goal.state.atLimit', fatto: 'chat.goal.state.reached' });

/** I pezzi della testata, nell'ordine di Codex: stato, controlli, giro, token. Solo quelli che hanno un numero vero. */
export function pezziDellaTestata(obiettivo, tetti = null) {
  const stato = statoVisibile(obiettivo);
  if (!stato) return [];
  const pezzi = [t(CHIAVI_DEGLI_STATI[stato])];
  const controlli = controlliSuperati(obiettivo);
  // il plurale segue il TOTALE («1 di 3 controlli superati»), il numero mostrato è quello dei superati
  if (controlli && controlli.superati !== null) pezzi.push(tn('chat.goal.head.checksOne', 'chat.goal.head.checksMany', controlli.totale, { n: controlli.superati, totale: controlli.totale }));
  else if (controlli) pezzi.push(tn('chat.goal.head.checksNotYetOne', 'chat.goal.head.checksNotYetMany', controlli.totale, { totale: controlli.totale }));
  const giri = obiettivo.ciclo?.giri;
  if (intero(giri) && giri > 0) {
    pezzi.push(intero(tetti?.giri) && tetti.giri > 0 ? t('chat.goal.head.turnOf', { n: giri, totale: tetti.giri }) : t('chat.goal.head.turn', { n: giri }));
  }
  const token = obiettivo.ciclo?.token;
  if (intero(token) && token > 0) {
    pezzi.push(intero(tetti?.token) && tetti.token > 0
      ? tn('chat.goal.head.tokensOfOne', 'chat.goal.head.tokensOfMany', tetti.token, { n: tokenCorti(token), totale: tokenCorti(tetti.token) })
      : tn('chat.goal.head.tokensOne', 'chat.goal.head.tokensMany', token, { n: tokenCorti(token) }));
  }
  return pezzi;
}

const FRASI_DEI_MOTIVI = Object.freeze({
  persona: 'chat.goal.why.person', riavvio: 'chat.goal.why.restart', 'prove-rosse': 'chat.goal.why.failingChecks',
  'nessun-progresso': 'chat.goal.why.noProgress', errore: 'chat.goal.why.error', 'da-giudicare': 'chat.goal.why.toJudge',
  'non-verificabile': 'chat.goal.why.notVerifiable', 'cartella-occupata': 'chat.goal.why.folderBusy', 'giudice-guasto': 'chat.goal.why.judgeBroken',
  'fatto-smentito': 'chat.goal.why.doneRefutedMany', 'confutatore-guasto': 'chat.goal.why.reviewerBroken', bloccato: 'chat.goal.why.blocked',
  giri: 'chat.goal.why.capTurns', token: 'chat.goal.why.capTokens',
});
/* I codici con cui TALOS (non il modello) dice perché il revisore non ha un esito: `src/obiettivo/confutatore.mjs` e il registro. */
const FRASI_DEL_REVISORE = Object.freeze({
  'refuter-no-model': 'chat.goal.reviewer.noModel', 'refuter-not-started': 'chat.goal.reviewer.notStarted',
  'refuter-failed': 'chat.goal.reviewer.failed', 'refuter-timeout': 'chat.goal.reviewer.timeout',
  'refuter-unreadable': 'chat.goal.reviewer.unreadable', 'refuter-undecided': 'chat.goal.reviewer.undecided',
  'refutation-without-evidence': 'chat.goal.reviewer.noEvidence',
});

/**
 * Perché l'obiettivo è fermo, o com'è finito: `{testo, citazione?}`. `citazione` è testo di un MODELLO (il modello che si dice
 * bloccato, il revisore che ha smentito, il revisore che non c'è riuscito) con chi l'ha detto: va a schermo come testo.
 * @returns {{testo:string, citazione?:{chi:string, testo:string}}|null}
 */
export function motivoDaLeggere(obiettivo) {
  const stato = statoVisibile(obiettivo);
  if (!stato || stato === 'attivo') return null;
  if (stato === 'fatto') {
    const guardare = intero(obiettivo.daGuardare) && obiettivo.daGuardare > 0 ? obiettivo.daGuardare : 0;
    const testo = guardare > 0 ? tn('chat.goal.done.toReviewOne', 'chat.goal.done.toReviewMany', guardare) : t('chat.goal.done.plain');
    const parole = typeof obiettivo.confutazione?.motivo === 'string' ? obiettivo.confutazione.motivo.trim() : '';
    return parole ? { testo, citazione: { chi: t('chat.goal.who.reviewer'), testo: parole } } : { testo };
  }
  const tipo = obiettivo.motivo?.tipo;
  const chiave = FRASI_DEI_MOTIVI[tipo];
  const dettaglio = typeof obiettivo.motivo?.dettaglio === 'string' ? obiettivo.motivo.dettaglio.trim() : '';
  if (tipo === 'bloccato') return { testo: t(chiave), ...(dettaglio ? { citazione: { chi: t('chat.goal.who.model'), testo: dettaglio } } : {}) };
  if (tipo === 'fatto-smentito') {
    const parole = typeof obiettivo.confutazione?.motivo === 'string' ? obiettivo.confutazione.motivo.trim() : '';
    const volte = intero(Number(dettaglio)) && Number(dettaglio) > 0 ? Number(dettaglio) : 2;
    return { testo: tn('chat.goal.why.doneRefutedOne', 'chat.goal.why.doneRefutedMany', volte), ...(parole ? { citazione: { chi: t('chat.goal.who.reviewer'), testo: parole } } : {}) };
  }
  /* C-4 (indagine del 21/10/2026, /goal in pausa dal vivo «The reviewer could not reach a verdict»): la frase unica nascondeva PERCHÉ.
     Il server manda l'esito del revisore in `confutazione.motivo` (`src/obiettivo/stato.mjs` `conConfutazione`): o un codice di
     TALOS (`src/obiettivo/confutatore.mjs` `esitoDelConfutatore`, il registro `confutaObiettivo`), che diventa una frase, o le
     PAROLE del revisore (`refuted: null` col suo motivo), che vanno a schermo come citazione con chi le ha dette. */
  if (tipo === 'confutatore-guasto') {
    const parole = typeof obiettivo.confutazione?.motivo === 'string' ? obiettivo.confutazione.motivo.trim() : '';
    const codice = Object.hasOwn(FRASI_DEL_REVISORE, parole) ? FRASI_DEL_REVISORE[parole] : null;
    if (codice) return { testo: `${t(chiave)} ${t(codice)}` };
    return { testo: t(chiave), ...(parole ? { citazione: { chi: t('chat.goal.who.reviewer'), testo: parole } } : {}) };
  }
  if (tipo === 'prove-rosse') return { testo: t(chiave, { criteri: dettaglio || '—' }) };
  /* 15/10/2026 (visto dal vivo): il primo giro rifiutato perché manca la chiave non «è finito con un errore» — non è partito, e la
     persona sa che cosa fare */
  if (tipo === 'errore' && (dettaglio === 'provider-key-missing' || dettaglio === 'provider-key-missing-named')) return { testo: t('chat.goal.why.keyMissing') };
  if (chiave) return { testo: t(chiave) };
  return { testo: t('chat.goal.why.other', { tipo: String(tipo ?? '') }) };
}

const FRASI_DEI_ROSSI = Object.freeze({
  'exit-code': 'chat.goal.fail.exitCode', 'timed-out': 'chat.goal.fail.timedOut', 'file-missing': 'chat.goal.fail.fileMissing',
  'file-present': 'chat.goal.fail.filePresent', 'text-missing': 'chat.goal.fail.textMissing', 'text-present': 'chat.goal.fail.textPresent',
  'judge-not-met': 'chat.goal.fail.judgeNotMet', 'judge-undecided': 'chat.goal.fail.judgeUndecided', 'no-evidence': 'chat.goal.fail.noEvidence',
  'evidence-stale': 'chat.goal.fail.evidenceStale', 'judge-skipped': 'chat.goal.fail.judgeSkipped', 'judge-verdict-invalid': 'chat.goal.fail.judgeInvalid',
  'command-not-found': 'chat.goal.fail.commandNotFound', stopped: 'chat.goal.fail.stopped', 'could-not-run': 'chat.goal.fail.couldNotRun',
  'workspace-missing': 'chat.goal.fail.workspaceMissing', 'workspace-not-here': 'chat.goal.fail.workspaceNotHere', 'plan-mode': 'chat.goal.fail.planMode',
});

const TIPI = Object.freeze({ comando: { icona: 'i-terminal', chiave: 'chat.goal.kind.command' }, file: { icona: 'i-file', chiave: 'chat.goal.kind.file' }, giudizio: { icona: 'i-eye', chiave: 'chat.goal.kind.judgement' } });

/** Una riga per criterio: il suo testo, come lo controlla TALOS, l'ultimo esito e perché. Senza verifica: «non ancora controllato». */
export function righeDeiControlli(obiettivo) {
  const criteri = Array.isArray(obiettivo?.contratto?.criteri) ? obiettivo.contratto.criteri : [];
  const perId = new Map((Array.isArray(obiettivo?.verifica?.verdetti) ? obiettivo.verifica.verdetti : []).map((v) => [v?.id, v]));
  return criteri.map((criterio) => {
    const v = perId.get(criterio.id) ?? null;
    const tipo = TIPI[criterio.verifica?.tipo] ? criterio.verifica.tipo : 'giudizio';
    const esito = v?.esito ?? null;
    const secondi = intero(v?.durataMs) && v.durataMs >= 1000 ? Math.round(v.durataMs / 1000) : null;
    const etichetta = esito === 'verde' ? (secondi !== null && tipo === 'comando' ? t('chat.goal.result.passedIn', { s: secondi }) : t('chat.goal.result.passed'))
      : esito === 'rosso' ? t('chat.goal.result.failed')
        : esito === 'non-verificabile' ? t('chat.goal.result.notVerifiable')
          : esito === 'da-giudicare' ? t('chat.goal.result.toJudge') : t('chat.goal.result.notYet');
    const codice = v?.motivo?.tipo;
    let perche = '';
    if (esito === 'rosso' || esito === 'non-verificabile') {
      perche = FRASI_DEI_ROSSI[codice] ? t(FRASI_DEI_ROSSI[codice], { codice: intero(v?.uscita?.codice) ? v.uscita.codice : '?' }) : '';
    }
    const delGiudice = typeof v?.giudizio?.motivo === 'string' ? v.giudizio.motivo.trim() : '';
    return { id: criterio.id, testo: String(criterio.testo ?? ''), tipo, icona: TIPI[tipo].icona, tipoTesto: t(TIPI[tipo].chiave), esito: esito ?? 'mai', etichetta, perche,
      ...(delGiudice ? { citazione: { chi: t('chat.goal.who.judge'), testo: delGiudice } } : {}) };
  });
}

/**
 * Le azioni possibili DA questo stato (le stesse nel «⋯» e col tasto destro). ⛔ «Riprendi» NON è nel menu: in pausa e bloccato è
 * il pulsante della riga, sempre visibile — riga e menu hanno intersezione vuota e unione completa (owner 13/09/2026, regola dei
 * menu); da «tetto» e da «fatto» non c'è affatto.
 */
export function vociDelMenu(obiettivo) {
  const stato = statoVisibile(obiettivo);
  if (!stato) return [];
  const voci = [];
  if (stato === 'attivo') voci.push({ chiave: 'pausa', etichetta: t('chat.goal.menu.pause'), icona: 'i-pausa' });
  if (stato !== 'fatto' && Array.isArray(obiettivo.contratto?.criteri) && obiettivo.contratto.criteri.length > 0) {
    voci.push({ chiave: 'verifica', etichetta: t('chat.goal.menu.checkNow'), icona: 'i-check-sq' });
  }
  voci.push({ chiave: 'togli', etichetta: t('chat.goal.menu.remove'), icona: 'i-trash', pericolo: true, separaPrima: voci.length > 0 });
  return voci;
}

/** La chiave dello stato che la persona ha visto: richiudere la fascia vale per QUESTO stato, non per il prossimo arresto. */
export const chiaveDelloStato = (obiettivo) => `${obiettivo?.id ?? ''}:${statoVisibile(obiettivo) ?? ''}:${obiettivo?.motivo?.tipo ?? ''}`;

/**
 * Aperta o minima. Di serie MINIMA (owner 15/10); la scelta della persona vale per la conversazione; uno stato fermo o finito
 * che la persona non ha ancora visto la apre da sola.
 * @param {{aperta:boolean, chiave:string}|null} scelta
 */
export function fasciaAperta(obiettivo, scelta) {
  const stato = statoVisibile(obiettivo);
  if (!stato) return false;
  if (STATI_FERMI.includes(stato) && scelta?.chiave !== chiaveDelloStato(obiettivo)) return true;
  return scelta?.aperta === true;
}

/* ── la memoria per conversazione: `localStorage` è una comodità di chi guarda, e senza si torna alla forma di serie ── */
function scelteSalvate(memoria) {
  try {
    const v = JSON.parse(memoria?.getItem(CHIAVE_SCELTE) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
export function sceltaPer(sessionId, memoria = globalThis.localStorage) {
  const v = scelteSalvate(memoria)[sessionId];
  return v && typeof v === 'object' && typeof v.aperta === 'boolean' && typeof v.chiave === 'string' ? v : null;
}
export function ricordaScelta(sessionId, scelta, memoria = globalThis.localStorage) {
  if (!sessionId) return;
  const tutte = scelteSalvate(memoria);
  delete tutte[sessionId];
  tutte[sessionId] = { aperta: scelta.aperta === true, chiave: String(scelta.chiave ?? '') };
  const chiavi = Object.keys(tutte);
  for (const vecchia of chiavi.slice(0, Math.max(0, chiavi.length - SCELTE_MASSIME))) delete tutte[vecchia];
  try { memoria?.setItem(CHIAVE_SCELTE, JSON.stringify(tutte)); } catch { /* resta per questa volta */ }
}

/* ────────────────────────────────────────────────────────────────────────────── la superficie */

const icona = (doc, nome, classe = 'i i--sm') => {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe); svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`); svg.append(use);
  return svg;
};
const el = (doc, tag, classe, testo) => {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined) n.textContent = testo;
  return n;
};
function citazione(doc, c) {
  const p = el(doc, 'p', 'talos-fascia-obiettivo__citazione');
  p.append(el(doc, 'span', 'talos-fascia-obiettivo__chi', `${c.chi}: `), el(doc, 'span', '', `«${senzaInganni(c.testo)}»`));
  return p;
}

/**
 * Monta (una volta) la fascia prima di `riferimento`. `onAzione(chiave)` riceve 'pausa' | 'riprendi' | 'verifica' | 'togli';
 * `onMenu(voci, posizione)` apre il menu condiviso dell'app ({x,y} dal tasto destro, {ancora} da tastiera e dal «⋯»).
 */
export function montaFasciaObiettivo({ document: doc = globalThis.document, riferimento = null, onAzione, onMenu, onCambioForma } = {}) {
  const esistente = doc.getElementById('fasciaObiettivo');
  if (esistente) return esistente;
  const fascia = el(doc, 'div', 'talos-avviso-piano talos-fascia-obiettivo');
  fascia.id = 'fasciaObiettivo';
  fascia.dataset.c = 'GoalStrip';
  fascia.setAttribute('role', 'group');
  fascia.setAttribute('aria-label', t('chat.goal.ariaLabel'));
  fascia.hidden = true;

  const riga = el(doc, 'div', 'talos-fascia-obiettivo__riga');
  const ico = el(doc, 'span', 'talos-avviso-piano__icona'); ico.setAttribute('aria-hidden', 'true'); ico.append(icona(doc, 'i-check-sq', 'i'));
  const testata = el(doc, 'p', 'talos-avviso-piano__testo talos-fascia-obiettivo__testata'); testata.setAttribute('role', 'status');
  const forte = el(doc, 'span', 'talos-fascia-obiettivo__stato');
  const corto = el(doc, 'span', 'talos-fascia-obiettivo__corto');
  testata.append(forte, corto);
  const azioni = el(doc, 'div', 'talos-avviso-piano__azioni');
  const riprendi = el(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', t('chat.goal.menu.resume')); riprendi.type = 'button'; riprendi.dataset.fasciaObiettivo = 'riprendi';
  const forma = el(doc, 'button', 'talos-icon-button talos-fascia-obiettivo__forma'); forma.type = 'button'; forma.dataset.fasciaObiettivo = 'forma';
  /* ⛔ niente `aria-controls`: l'app tratta ogni `[aria-expanded][aria-controls]` come una disclosure sua (`app.js`, la regia dei
     disclosure) e rifaceva lo scambio nello stesso clic — misurato dal vivo il 15/10: `data-forma` «intera» con `aria-expanded`
     false e il corpo nascosto. Stessa scelta delle card del contesto e del campanello. */
  forma.append(icona(doc, 'i-chevron-right'));
  const altro = el(doc, 'button', 'talos-icon-button'); altro.type = 'button'; altro.dataset.fasciaObiettivo = 'menu';
  altro.setAttribute('aria-haspopup', 'menu'); altro.setAttribute('aria-label', t('chat.goal.more')); altro.title = t('chat.goal.more'); altro.append(icona(doc, 'i-more'));
  azioni.append(riprendi, forma, altro);
  riga.append(ico, testata, azioni);

  const corpo = el(doc, 'div', 'talos-fascia-obiettivo__corpo'); corpo.id = 'fasciaObiettivoCorpo';
  fascia.append(riga, corpo);

  const apriMenu = (posizione) => {
    const voci = vociDelMenu(fascia.obiettivo).map((v) => ({ ...v, aziona: () => onAzione?.(v.chiave) }));
    if (voci.length) onMenu?.(voci, posizione);
  };
  fascia.addEventListener('click', (evento) => {
    const azione = evento.target.closest?.('[data-fascia-obiettivo]')?.dataset.fasciaObiettivo;
    if (azione === 'riprendi') onAzione?.('riprendi');
    else if (azione === 'menu') apriMenu({ ancora: altro });
    else if (azione === 'forma') {
      const aperta = fascia.dataset.forma !== 'intera';
      onCambioForma?.({ aperta, chiave: chiaveDelloStato(fascia.obiettivo) });
      disegnaForma(fascia, aperta);
    }
  });
  /* come l'inspector (C1): il tasto «Menu» della tastiera manda un `contextmenu` senza coordinate ⇒ il menu si attacca al «⋯» */
  fascia.addEventListener('contextmenu', (evento) => {
    if (!fascia.obiettivo) return;
    evento.preventDefault?.();
    const daTastiera = !evento.clientX && !evento.clientY;
    apriMenu(daTastiera ? { ancora: altro } : { x: evento.clientX, y: evento.clientY });
  });
  fascia.addEventListener('keydown', (evento) => {
    if (evento.key === 'F10' && evento.shiftKey) { evento.preventDefault?.(); apriMenu({ ancora: altro }); } // Hermes, session-control-goal.tsx
  });
  Object.assign(fascia, { forte, corto, corpo, riprendiEl: riprendi, formaEl: forma, obiettivo: null });
  if (riferimento?.parentNode) riferimento.parentNode.insertBefore(fascia, riferimento);
  else doc.body?.append(fascia);
  return fascia;
}

function disegnaForma(fascia, aperta) {
  fascia.dataset.forma = aperta ? 'intera' : 'minima';
  fascia.corpo.hidden = !aperta;
  fascia.formaEl.setAttribute('aria-expanded', aperta ? 'true' : 'false');
  const etichetta = aperta ? t('chat.goal.collapse') : t('chat.goal.expand');
  fascia.formaEl.setAttribute('aria-label', etichetta); fascia.formaEl.title = etichetta;
}

/**
 * Disegna l'obiettivo (o nasconde la fascia con `null`). Torna se è visibile.
 * @param {{obiettivo:object|null, tetti?:object|null, scelta?:{aperta:boolean, chiave:string}|null}} dati
 */
export function aggiornaFasciaObiettivo(fascia, { obiettivo, tetti = null, scelta = null } = {}) {
  if (!fascia) return false;
  const stato = statoVisibile(obiettivo);
  fascia.obiettivo = stato ? obiettivo : null;
  if (!stato) { fascia.hidden = true; fascia.corpo.replaceChildren(); delete fascia.dataset.stato; return false; }
  const doc = fascia.ownerDocument;
  fascia.dataset.stato = stato;
  const [primo, ...resto] = pezziDellaTestata(obiettivo, tetti);
  fascia.forte.textContent = [primo, ...resto].join(' · ');
  fascia.corto.textContent = senzaInganni(obiettivo.testo);
  fascia.corto.title = senzaInganni(obiettivo.testo);
  fascia.riprendiEl.hidden = !(stato === 'in-pausa' || stato === 'bloccato');

  const pezzi = [el(doc, 'p', 'talos-fascia-obiettivo__obiettivo', senzaInganniSuPiuRighe(obiettivo.testo))];
  const motivo = motivoDaLeggere(obiettivo);
  if (motivo) {
    const box = el(doc, 'div', 'talos-fascia-obiettivo__motivo');
    box.append(el(doc, 'p', '', motivo.testo));
    if (motivo.citazione) box.append(citazione(doc, motivo.citazione));
    pezzi.push(box);
  }
  const righe = righeDeiControlli(obiettivo);
  if (righe.length) {
    const lista = el(doc, 'ul', 'talos-fascia-obiettivo__controlli'); lista.setAttribute('aria-label', t('chat.goal.checksLabel'));
    for (const r of righe) {
      const li = el(doc, 'li', 'talos-fascia-obiettivo__controllo'); li.dataset.esito = r.esito; li.dataset.criterio = r.id;
      const pallino = el(doc, 'span', 'talos-fascia-obiettivo__pallino'); pallino.setAttribute('aria-hidden', 'true');
      const tipo = el(doc, 'span', 'talos-fascia-obiettivo__tipo'); tipo.title = r.tipoTesto; tipo.append(icona(doc, r.icona));
      const testo = el(doc, 'span', 'talos-fascia-obiettivo__ctesto', senzaInganni(r.testo));
      const esito = el(doc, 'span', 'talos-fascia-obiettivo__esito', r.etichetta);
      li.append(pallino, tipo, testo, esito);
      if (r.perche) li.append(el(doc, 'p', 'talos-fascia-obiettivo__perche', r.perche));
      if (r.citazione) li.append(citazione(doc, r.citazione));
      lista.append(li);
    }
    pezzi.push(lista);
  } else {
    const g = obiettivo.giudizioDelTesto;
    const box = el(doc, 'p', 'talos-fascia-obiettivo__pavimento', t('chat.goal.floor'));
    pezzi.push(box);
    if (typeof g?.motivo === 'string' && g.motivo.trim()) pezzi.push(citazione(doc, { chi: t('chat.goal.who.judge'), testo: g.motivo.trim() }));
  }
  fascia.corpo.replaceChildren(...pezzi);
  disegnaForma(fascia, fasciaAperta(obiettivo, scelta));
  fascia.hidden = false;
  return true;
}
