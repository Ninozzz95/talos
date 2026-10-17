/*
 * ⭐⭐⭐ /goal G6 — LA CARTA DI CONFERMA DEI CONTROLLI (C1), owner 15/10/2026: «così com'è» sul mockup `mockup-goal-2026-10-15/`
 * (scene C1-C2): titolo, una frase su che cosa succede, un controllo per riga (tipo · frase · come lo prova TALOS), i limiti e il
 * revisore sotto, poi «Avvia l'obiettivo» · «Modifica i controlli» · ⋯ (Avvia senza controlli, Scarta).
 *
 * Due strade la aprono (owner 15/10, «tutte e due» + chat nuova ferma):
 *   · la PERSONA scrive `/goal <testo>` o sceglie «Imposta un obiettivo…» dal «+»: la proposta la fa il modello della sessione
 *     (`POST /goal/proposta`, G2c); «Avvia» salva coi controlli e manda il testo come suo messaggio (parte subito);
 *   · il MODELLO chiama `goal_create` nel giro della persona: è una carta di approvazione (`tipo: 'goal_create'`), tranne in
 *     Accesso pieno. «Avvia» approva, «Scarta» rifiuta.
 * ⛔ Il testo dell'obiettivo e le frasi dei controlli vengono da un MODELLO o dalla persona: sempre `textContent`, mai markup.
 * ⛔ Nessun controllo nativo disegnato dal sistema (owner 13/09): i `<select>` della modifica stanno sotto `data-calm-controls`,
 *   come il foglio delle automazioni (`automazione-foglio.js`).
 */
import { t, tn, linguaCorrenteDiT } from './lingua.js';
/* 17/10/2026: i numeri nella lingua dell'interfaccia, letta a ogni uso — `Intl.NumberFormat()` senza lingua prendeva quella del SISTEMA
   (sul runner inglese «2,000,000» dentro una frase italiana, GOAL-CARD-02 rossa nella CI della 0.1.31). Come attivita.js. */
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
import { senzaInganni, senzaInganniSuPiuRighe } from './testo-a-schermo.js'; // testi di un modello o della persona: niente controlli né inversioni

const TIPI = Object.freeze({ comando: { icona: 'i-terminal', chiave: 'chat.goal.kind.command' }, file: { icona: 'i-file', chiave: 'chat.goal.kind.file' }, giudizio: { icona: 'i-eye', chiave: 'chat.goal.kind.judgement' } });
const FATTI = Object.freeze(['esiste', 'non-esiste', 'contiene', 'non-contiene']);
const CHIAVI_DEI_FATTI = Object.freeze({ esiste: 'chat.goal.fact.exists', 'non-esiste': 'chat.goal.fact.notExists', contiene: 'chat.goal.fact.contains', 'non-contiene': 'chat.goal.fact.notContains' });
const intero = (v) => Number.isSafeInteger(v) && v > 0;

/** Come TALOS prova un controllo, in parole: il comando com'è, il fatto sul file, o il giudice. */
export function provaInParole(verifica) {
  if (verifica?.tipo === 'comando') return String(verifica.comando ?? '');
  if (verifica?.tipo === 'file') {
    const fatto = CHIAVI_DEI_FATTI[verifica.fatto] ? t(CHIAVI_DEI_FATTI[verifica.fatto]) : String(verifica.fatto ?? '');
    return typeof verifica.testo === 'string' ? `${verifica.percorso} ${fatto} «${verifica.testo}»` : `${verifica.percorso} ${fatto}`;
  }
  return t('chat.goal.card.judgeDecides');
}

/** Le righe della carta: una per controllo, nella forma del contratto (`{testo, verifica}`). */
export function righeDellaCarta(criteri) {
  return (Array.isArray(criteri) ? criteri : []).map((c) => {
    const tipo = TIPI[c?.verifica?.tipo] ? c.verifica.tipo : 'giudizio';
    return { tipo, icona: TIPI[tipo].icona, tipoTesto: t(TIPI[tipo].chiave), testo: String(c?.testo ?? ''), prova: provaInParole(c?.verifica), mono: tipo !== 'giudizio' };
  });
}

/** I limiti e il revisore, coi tetti VERI del ciclo (quelli che il server applica). Senza tetti noti, solo il revisore. */
export function frasiDeiLimiti(tetti) {
  const giri = intero(tetti?.giri) ? tetti.giri : null;
  const token = intero(tetti?.token) ? tetti.token : null;
  const limite = giri && token ? tn('chat.goal.card.limitsTurnsTokensOne', 'chat.goal.card.limitsTurnsTokensMany', giri, { giri, token: new Intl.NumberFormat(localeUI()).format(token) })
    : giri ? tn('chat.goal.card.limitsTurnsOne', 'chat.goal.card.limitsTurnsMany', giri, { giri }) : '';
  return [limite, t('chat.goal.card.reviewer')].filter(Boolean).join(' ');
}

/** Un criterio scritto nella modifica, nella forma del contratto; `null` se la riga è vuota (si ignora). */
/* `uscita`: il codice d'uscita atteso del controllo ORIGINALE (la riga se lo ricorda: il modulo non ha un campo per dirlo). Senza, un
   controllo del modello con uscita ≠ 0 tornava 0 in silenzio dopo «Modifica» (revisione del bugfixer, 15/10/2026). */
export function criterioDalModulo({ testo = '', tipo = 'giudizio', comando = '', percorso = '', fatto = 'esiste', cerca = '', uscita = 0 } = {}) {
  const frase = String(testo).trim();
  if (!frase && !String(comando).trim() && !String(percorso).trim()) return null;
  if (tipo === 'comando') return { testo: frase, verifica: { tipo: 'comando', comando: String(comando).trim(), ...(Number.isInteger(uscita) && uscita !== 0 ? { uscita } : {}) } };
  if (tipo === 'file') {
    const f = FATTI.includes(fatto) ? fatto : 'esiste';
    return { testo: frase, verifica: { tipo: 'file', percorso: String(percorso).trim(), fatto: f, ...(f === 'contiene' || f === 'non-contiene' ? { testo: String(cerca) } : {}) } };
  }
  return { testo: frase, verifica: { tipo: 'giudizio' } };
}

/*
 * G6UI-REV-03 (revisione del bugfixer, 15/10/2026) — se i controlli che la persona avvia sono QUELLI proposti dal modello. I criteri
 *   del modello arrivano dal contratto normalizzato (un comando porta `uscita: 0`, un file `fatto: 'esiste'`), quelli del modulo no:
 *   un confronto del JSON grezzo diceva «modificati» a chi aveva solo aperto e chiuso la modifica, e il modello leggeva «the person
 *   edited». Si confronta la forma canonica: testo e campi senza spazi ai bordi, l'uscita di serie 0, il fatto di serie «esiste».
 *   Un'uscita diversa da 0 resta diversa: il modulo non la sa dire, e perderla È una modifica.
 */
function controlloCanonico(c) {
  const v = c?.verifica ?? {};
  const testo = String(c?.testo ?? '').trim();
  if (v.tipo === 'comando') return { testo, tipo: 'comando', comando: String(v.comando ?? '').trim(), uscita: v.uscita ?? 0 };
  if (v.tipo === 'file') {
    const fatto = v.fatto ?? 'esiste';
    return { testo, tipo: 'file', percorso: String(v.percorso ?? '').trim(), fatto, ...(fatto === 'contiene' || fatto === 'non-contiene' ? { cerca: String(v.testo ?? '') } : {}) };
  }
  return { testo, tipo: String(v.tipo ?? 'giudizio') };
}
export function stessiControlli(a, b) {
  const x = Array.isArray(a) ? a : []; const y = Array.isArray(b) ? b : [];
  return x.length === y.length && x.every((c, i) => JSON.stringify(controlloCanonico(c)) === JSON.stringify(controlloCanonico(y[i])));
}

/* ─────────────────────────────────────────────────────────────── la superficie */

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
const bottone = (doc, classe, testo, azione) => { const b = el(doc, 'button', classe, testo); b.type = 'button'; b.dataset.cartaObiettivo = azione; return b; };
function selettore(doc, voci, valore, nome) {
  const s = el(doc, 'select', 'sheet-input');
  for (const [v, testo] of voci) { const o = el(doc, 'option', undefined, testo); o.value = v; s.append(o); }
  s.value = valore; s.dataset.campo = nome; s.dataset.calmControls = '';
  return s;
}
function campoTesto(doc, valore, nome, etichetta, { mono = false } = {}) {
  const i = el(doc, 'input', `sheet-input${mono ? ' talos-mono' : ''}`); i.type = 'text'; i.value = senzaInganni(valore ?? ''); i.dataset.campo = nome; // S5 (revisione 15/10): pulito come in lettura
  i.setAttribute('aria-label', etichetta); i.placeholder = etichetta;
  return i;
}

/**
 * La carta. `dati`: `{testo, criteri, tetti, pavimento?, fonte:'persona'|'modello'}`. Callback: `onAvvia(criteri|null)` (null = senza
 * controlli), `onScarta()`, `onMenu(voci, posizione)` (il menu condiviso dell'app).
 * Torna l'elemento; `carta.chiudi(esito)` la congela con una riga d'esito (avviato, scartato), come le carte di approvazione.
 */
export function creaCartaObiettivo(dati, { document: doc = globalThis.document, onAvvia, onScarta, onMenu } = {}) {
  const carta = el(doc, 'section', 'talos-card talos-carta-obiettivo');
  carta.dataset.c = 'GoalConfirmCard';
  carta.dataset.fonte = dati.fonte === 'modello' ? 'modello' : 'persona';
  carta.setAttribute('aria-label', t('chat.goal.card.title'));
  let criteri = Array.isArray(dati.criteri) ? dati.criteri.map((c) => ({ testo: c.testo, verifica: { ...c.verifica } })) : [];
  let modifica = false;
  let inAttesa = dati.inAttesa === true; // la proposta del modello della sessione non è ancora arrivata

  const testa = el(doc, 'header', 'talos-carta-obiettivo__testa');
  const ico = el(doc, 'span', 'talos-carta-obiettivo__icona'); ico.append(icona(doc, 'i-check-sq', 'i'));
  testa.append(ico, el(doc, 'h3', 'talos-carta-obiettivo__titolo', t('chat.goal.card.title')));
  const obiettivo = el(doc, 'p', 'talos-carta-obiettivo__obiettivo', senzaInganniSuPiuRighe(dati.testo));
  const guida = el(doc, 'p', 'talos-carta-obiettivo__guida');
  /* S5 (revisione del bugfixer, 15/10/2026): `/goal` in una chat con un obiettivo NON finito lo sostituisce (`impostaObiettivo`
     sostituisce sempre). Prima succedeva senza dirlo: ora la carta lo nomina prima di «Avvia». */
  const sostituisce = typeof dati.sostituisce === 'string' && dati.sostituisce.trim()
    ? el(doc, 'p', 'talos-carta-obiettivo__sostituisce', t('chat.goal.card.replaces', { obiettivo: senzaInganni(dati.sostituisce.trim()) })) : null;
  const lista = el(doc, 'div', 'talos-carta-obiettivo__controlli'); lista.setAttribute('role', 'list');
  const limiti = el(doc, 'p', 'talos-carta-obiettivo__limiti', frasiDeiLimiti(dati.tetti));
  const errore = el(doc, 'p', 'talos-carta-obiettivo__errore'); errore.hidden = true; errore.setAttribute('role', 'alert');
  const azioni = el(doc, 'div', 'talos-carta-obiettivo__azioni');
  const avvia = bottone(doc, 'talos-button talos-button--primary talos-button--sm', t('chat.goal.card.start'), 'avvia');
  const cambia = bottone(doc, 'talos-button talos-button--secondary talos-button--sm', t('chat.goal.card.edit'), 'modifica');
  const altro = bottone(doc, 'talos-button talos-button--ghost talos-button--sm talos-icon-button', undefined, 'menu');
  altro.setAttribute('aria-haspopup', 'menu'); altro.setAttribute('aria-label', t('chat.goal.more')); altro.title = t('chat.goal.more'); altro.append(icona(doc, 'i-more'));
  azioni.append(avvia, cambia, altro);
  const esito = el(doc, 'p', 'talos-carta-obiettivo__esito'); esito.hidden = true; esito.setAttribute('role', 'status');
  carta.append(testa, obiettivo, ...(sostituisce ? [sostituisce] : []), guida, lista, limiti, errore, azioni, esito);

  const leggiModulo = () => [...lista.querySelectorAll('[data-riga-modifica]')].map((riga) => {
    const v = (nome) => riga.querySelector(`[data-campo="${nome}"]`)?.value ?? '';
    return criterioDalModulo({ testo: v('testo'), tipo: v('tipo'), comando: v('comando'), percorso: v('percorso'), fatto: v('fatto'), cerca: v('cerca'), uscita: Number(riga.dataset.uscita ?? 0) });
  }).filter(Boolean);

  function rigaModifica(c) {
    const riga = el(doc, 'div', 'talos-carta-obiettivo__riga talos-carta-obiettivo__riga--modifica'); riga.dataset.rigaModifica = ''; riga.setAttribute('role', 'listitem');
    if (Number.isInteger(c?.verifica?.uscita) && c.verifica.uscita !== 0) riga.dataset.uscita = String(c.verifica.uscita); // si ricorda l'uscita attesa
    const tipo = TIPI[c?.verifica?.tipo] ? c.verifica.tipo : 'giudizio';
    const sTipo = selettore(doc, Object.entries(TIPI).map(([k, v]) => [k, t(v.chiave)]), tipo, 'tipo');
    const frase = campoTesto(doc, c?.testo ?? '', 'testo', t('chat.goal.card.field.sentence'));
    const comando = campoTesto(doc, c?.verifica?.comando ?? '', 'comando', t('chat.goal.card.field.command'), { mono: true });
    const percorso = campoTesto(doc, c?.verifica?.percorso ?? '', 'percorso', t('chat.goal.card.field.path'), { mono: true });
    const sFatto = selettore(doc, FATTI.map((f) => [f, t(CHIAVI_DEI_FATTI[f])]), FATTI.includes(c?.verifica?.fatto) ? c.verifica.fatto : 'esiste', 'fatto');
    const cerca = campoTesto(doc, c?.verifica?.testo ?? '', 'cerca', t('chat.goal.card.field.search'), { mono: true });
    const togli = bottone(doc, 'talos-icon-button', undefined, 'togli-riga'); togli.setAttribute('aria-label', t('chat.goal.card.removeCheck')); togli.title = t('chat.goal.card.removeCheck'); togli.append(icona(doc, 'i-trash'));
    const prova = el(doc, 'div', 'talos-carta-obiettivo__prova-modifica');
    const mostra = () => {
      const k = sTipo.value; const f = sFatto.value;
      comando.hidden = k !== 'comando'; percorso.hidden = k !== 'file'; sFatto.hidden = k !== 'file';
      cerca.hidden = !(k === 'file' && (f === 'contiene' || f === 'non-contiene'));
    };
    sTipo.addEventListener('change', mostra); sFatto.addEventListener('change', mostra);
    prova.append(comando, percorso, sFatto, cerca);
    riga.append(sTipo, frase, togli, prova);
    mostra();
    return riga;
  }

  function disegna() {
    carta.dataset.modo = inAttesa ? 'attesa' : modifica ? 'modifica' : 'lettura';
    for (const b of azioni.querySelectorAll('button')) b.disabled = inAttesa;
    if (inAttesa) { guida.textContent = t('chat.goal.card.proposing'); lista.replaceChildren(); return; }
    guida.textContent = criteri.length === 0 ? (dati.pavimento ? t('chat.goal.card.leadNoProposal') : t('chat.goal.card.leadNone'))
      : carta.dataset.fonte === 'modello' ? t('chat.goal.card.leadModel') : t('chat.goal.card.lead');
    if (modifica) {
      lista.replaceChildren(...(criteri.length ? criteri : [{ testo: '', verifica: { tipo: 'comando', comando: '' } }]).map(rigaModifica));
      const aggiungi = bottone(doc, 'talos-button talos-button--ghost talos-button--sm', t('chat.goal.card.addCheck'), 'aggiungi');
      aggiungi.prepend(icona(doc, 'i-plus'));
      lista.append(aggiungi);
      cambia.textContent = t('chat.goal.card.doneEditing');
    } else {
      lista.replaceChildren(...righeDellaCarta(criteri).map((r) => {
        const riga = el(doc, 'div', 'talos-carta-obiettivo__riga'); riga.setAttribute('role', 'listitem'); riga.dataset.tipo = r.tipo;
        const tipo = el(doc, 'span', 'talos-carta-obiettivo__tipo'); tipo.append(icona(doc, r.icona), el(doc, 'span', '', r.tipoTesto));
        const corpo = el(doc, 'div', 'talos-carta-obiettivo__corpo');
        corpo.append(el(doc, 'p', 'talos-carta-obiettivo__frase', senzaInganni(r.testo)), el(doc, 'p', `talos-carta-obiettivo__prova${r.mono ? ' talos-mono' : ''}`, senzaInganni(r.prova)));
        riga.append(tipo, corpo);
        return riga;
      }));
      cambia.textContent = t('chat.goal.card.edit');
    }
    avvia.textContent = criteri.length > 0 || modifica ? t('chat.goal.card.start') : t('chat.goal.card.startWithoutChecks');
  }

  const vociMenu = () => [
    ...(criteri.length > 0 ? [{ chiave: 'senza', etichetta: t('chat.goal.card.startWithoutChecks'), icona: 'i-play', aziona: () => avviaCon(null) }] : []),
    { chiave: 'scarta', etichetta: t('chat.goal.card.discard'), icona: 'i-trash', pericolo: true, separaPrima: criteri.length > 0, aziona: () => onScarta?.() },
  ];
  async function avviaCon(scelti) {
    errore.hidden = true;
    for (const b of azioni.querySelectorAll('button')) b.disabled = true;
    try {
      const fatto = await onAvvia?.(scelti && scelti.length ? scelti : null);
      if (fatto === false) for (const b of azioni.querySelectorAll('button')) b.disabled = false;
    } catch (e) {
      errore.textContent = String(e?.message ?? e); errore.hidden = false;
      for (const b of azioni.querySelectorAll('button')) b.disabled = false;
    }
  }
  carta.addEventListener('click', (evento) => {
    const azione = evento.target.closest?.('[data-carta-obiettivo]')?.dataset.cartaObiettivo;
    if (!azione || carta.dataset.chiusa) return;
    if (azione === 'avvia') { if (modifica) { criteri = leggiModulo(); modifica = false; disegna(); } void avviaCon(criteri); }
    else if (azione === 'modifica') { if (modifica) criteri = leggiModulo(); modifica = !modifica; disegna(); }
    else if (azione === 'aggiungi') { criteri = leggiModulo(); criteri.push({ testo: '', verifica: { tipo: 'comando', comando: '' } }); disegna(); lista.querySelectorAll('[data-campo="testo"]').item(criteri.length - 1)?.focus(); }
    else if (azione === 'togli-riga') { evento.target.closest('[data-riga-modifica]')?.remove(); }
    else if (azione === 'menu') onMenu?.(vociMenu(), { ancora: altro });
  });
  carta.addEventListener('contextmenu', (evento) => {
    if (carta.dataset.chiusa) return;
    evento.preventDefault?.();
    const daTastiera = !evento.clientX && !evento.clientY;
    onMenu?.(vociMenu(), daTastiera ? { ancora: altro } : { x: evento.clientX, y: evento.clientY });
  });
  carta.chiudi = (chiave) => {
    carta.dataset.chiusa = chiave;
    azioni.hidden = true; errore.hidden = true;
    if (modifica) { criteri = leggiModulo(); modifica = false; disegna(); }
    esito.textContent = t(chiave === 'avviato' ? 'chat.goal.card.started' : chiave === 'senza' ? 'chat.goal.card.startedWithout' : 'chat.goal.card.discarded');
    esito.hidden = false;
  };
  /** La proposta è arrivata (`{criteri, pavimento}` da `POST /goal/proposta`): la carta si riempie e si sblocca. */
  carta.riempi = (proposta, tetti = null) => {
    inAttesa = false;
    if (tetti) limiti.textContent = frasiDeiLimiti(tetti); // i tetti arrivano col flusso: in una chat appena nata, dopo la carta
    dati.pavimento = proposta?.pavimento === true;
    criteri = Array.isArray(proposta?.criteri) ? proposta.criteri.map((c) => ({ testo: c.testo, verifica: { ...c.verifica } })) : [];
    disegna();
  };
  carta.mostraErrore = (testo) => { errore.textContent = testo; errore.hidden = false; for (const b of azioni.querySelectorAll('button')) b.disabled = false; };
  disegna();
  return carta;
}

/* ─────────────────────────────────────────────────────── il comando nel compositore */

/**
 * `/goal <testo>` scritto nel compositore (owner 15/10/2026: «/goal nel compositore» + la voce nel «+»). Come Hermes desktop e
 * Codex (`goal_display.rs:5`, `Usage: /goal [<objective>|…]`), ma SENZA sottocomandi: pausa, ripresa e «togli» stanno nella fascia,
 * e una parola come «pausa» resta un testo che la carta fa confermare. `null` se il testo non è il comando (anche «/goals»).
 * @returns {{tipo:'imposta', testo:string}|{tipo:'mostra'}|null}
 */
export function comandoObiettivo(testo) {
  const m = /^\/goal(?:\s+([\s\S]*))?$/u.exec(String(testo ?? '').trim());
  if (!m) return null;
  const resto = (m[1] ?? '').trim();
  return resto ? { tipo: 'imposta', testo: resto } : { tipo: 'mostra' };
}

/** Se il compositore deve suggerire `/goal`: testo che comincia con «/», una parola sola ancora, prefisso di «goal». */
export function suggerisciComando(testo) {
  const s = String(testo ?? '');
  if (!s.startsWith('/') || /\s/u.test(s)) return false;
  return 'goal'.startsWith(s.slice(1).toLowerCase());
}
