/*
 * ⭐ L'ASSISTENTE (owner 11/11/2026: 16:45, 16:55, 17:12, 17:13, 17:17; giudice v1500-v1502) — la scheda che fino al 10/11 si chiamava «A lato»
 *   (FE-010, owner 31/10; forma del 03/11). Legge la chat e i suoi file in SOLA LETTURA e risponde quando la persona gli scrive. Disegno: il
 *   bozzetto firmato `giudice/corsie/bozzetto-assistente-laterale/index.html` (testa con stato, regola, cosa ha letto, domande pronte, campo,
 *   modello e spesa sempre in vista, «Cosa può leggere», privacy e spesa, spento e primo avvio, sbirciata di un file).
 * ⛔ Domande e risposte si SALVANO con la chat (owner 17:17, supera il «non si salva» del 31/10): il filo si carica dal server (`carica`), e
 *   dopo una ricarica, un cambio di sessione o un riavvio torna com'era.
 * ⛔ La risposta passa dal disegnatore della chat (`disegnaTesto`, in app `renderizzaMarkdownSemplice`): mai innerHTML. La domanda resta testo.
 * Un errore si dice nel filo e la domanda torna nel campo. Con un modello locale al lavoro la domanda aspetta il giro, coi secondi, e parte da sola.
 * Fuori da questo pezzo (tabella dell'indice): avvisi, proposte, «Manda all'agente», domande dell'Assistente, riepiloghi, pallini, ritmo.
 */
import { t as traduci, tn, linguaCorrenteDiT } from '../lingua.js';
import { formattaDollari, sommaDollari } from '../../../../src/kernel/costo-in-dollari.mjs';

/* Decisioni 57 e 144 (04/11/2026): `dollari` è la somma dei costi delle risposte detti dal server; basta una risposta senza costo (prezzo ignoto,
   server di prima) perché la riga dica solo il lavoro, come prima: una somma parziale si leggerebbe come il totale.
   Giro di cura A+B+C (11/11/2026): `altrove` è la domanda in corso fatta da un'altra finestra (o da questa prima di una ricarica), `carta` la
   carta di un indirizzo che aspetta la persona; tutte e due sono stato del server (`GET …/a-lato` e i due eventi effimeri), mai storia. */
const statoVuoto = () => ({ scambi: [], consumo: { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 }, dollari: 0, spesa: null, letture: null, modello: null,
  conStrumenti: null, caricato: false, inVolo: null, inAttesa: null, altrove: null, carta: null, nota: '' });

/* I due eventi effimeri del registro (`session-registry.mjs`, EVENTO_STATO_ASSISTENTE e EVENTO_CARTA_ASSISTENTE) e lo scambio salvato. */
export const EVENTI_DELL_ASSISTENTE = Object.freeze({ stato: 'talos.assistente-stato', carta: 'talos.assistente-carta', scambio: 'assistente-scambio' });

/** L'ora LOCALE di un istante del server (revisore C: `at.slice(11, 16)` era l'ora di Greenwich). */
export function oraLocale(iso) {
  const quando = new Date(iso);
  if (typeof iso !== 'string' || Number.isNaN(quando.getTime())) return '';
  try { return new Intl.DateTimeFormat(linguaCorrenteDiT() || 'it', { hour: '2-digit', minute: '2-digit' }).format(quando); } catch { return ''; }
}

/* Il diario a parole semplici (revisore C, giudice v1564: «parole semplici e ora locale»), come il bozzetto: «ha letto …, righe 1-60». */
const FRASI_DEL_DIARIO = Object.freeze({ elenca: 'list', git_stato: 'status', git_storia: 'history', trascritto_leggi: 'transcript', uscita_strumento: 'output',
  contesto_stato: 'context', spesa_sessione: 'costs', time_now: 'time', tool_search: 'tools', tool_describe: 'tools' });
/** Una voce del diario di uno scambio, detta come la direbbe una persona: mai il nome dell'attrezzo. */
export function fraseDelDiario(d) {
  const cosa = typeof d?.cosa === 'string' ? d.cosa : '';
  let frase;
  if (d?.nome === 'leggi') frase = typeof d.righe === 'string' && d.righe ? traduci('sezioni.aLato.did.readLines', { cosa, righe: d.righe }) : traduci('sezioni.aLato.did.read', { cosa });
  else if (d?.nome === 'cerca') frase = traduci('sezioni.aLato.did.search', { cosa });
  else if (d?.nome === 'git_diff') frase = cosa ? traduci('sezioni.aLato.did.diffOf', { cosa }) : traduci('sezioni.aLato.did.diff');
  else if (d?.nome === 'naviga') frase = traduci(d.rifiutato ? 'sezioni.aLato.did.pageRefused' : 'sezioni.aLato.did.page', { cosa });
  else if (d?.nome === 'web_search') frase = traduci(d.rifiutato ? 'sezioni.aLato.did.webRefused' : 'sezioni.aLato.did.web');
  else if (FRASI_DEL_DIARIO[d?.nome]) frase = traduci(`sezioni.aLato.did.${FRASI_DEL_DIARIO[d.nome]}`, { cosa: cosa || '.' });
  else frase = traduci('sezioni.aLato.did.other');
  /* il perché di un rifiuto prima della carta (giudice v1584 punto 1, v1596 punto 4): la persona sa cosa non è partito e perché */
  if (d?.motivo === 'troppo-lungo') return `${frase} · ${traduci('sezioni.aLato.did.tooLong')}`;
  if (d?.motivo === 'senza-fornitore') return `${frase} · ${traduci('sezioni.aLato.did.noSearch')}`;
  if (d?.carta === 'no') return `${frase} · ${traduci('sezioni.aLato.did.saidNo')}`;
  if (d?.carta === 'nessuna') return `${frase} · ${traduci('sezioni.aLato.did.needsPc')}`;
  if (d?.rifiutato && d?.nome !== 'naviga' && d?.nome !== 'web_search') return `${frase} · ${traduci('sezioni.aLato.refused')}`;
  return frase;
}

/**
 * I file che l'Assistente ha letto davvero (niente rifiuti), una volta ciascuno: LA fonte del conteggio dei file, per la testata («Ha letto …»)
 *   e per «Ultimo giro guardato» (revisore C: la testata contava ciò che aveva letto l'agente della chat, e le due righe si contraddicevano).
 */
export function fileLettiDallAssistente(scambi) {
  const file = new Set();
  for (const s of Array.isArray(scambi) ? scambi : []) {
    for (const d of Array.isArray(s?.diario) ? s.diario : []) if (d && !d.rifiutato && d.nome === 'leggi' && typeof d.cosa === 'string' && d.cosa) file.add(d.cosa);
  }
  return file;
}

/** Ciò che ha guardato l'ultima domanda, come il bozzetto («3 file, le differenze, 2 comandi»); vuoto se non ha letto niente. */
export function ultimoGiroGuardato(scambio) {
  const diario = (Array.isArray(scambio?.diario) ? scambio.diario : []).filter((d) => d && !d.rifiutato);
  const file = fileLettiDallAssistente([scambio]).size;
  const uscite = diario.filter((d) => d.nome === 'uscita_strumento').length;
  const pezzi = [];
  if (file) pezzi.push(tn('sezioni.aLato.filesOne', 'sezioni.aLato.filesMany', file));
  if (diario.some((d) => d.nome === 'git_diff')) pezzi.push(traduci('sezioni.aLato.lastTurnDiff'));
  if (uscite) pezzi.push(tn('sezioni.aLato.outputsOne', 'sezioni.aLato.outputsMany', uscite));
  if (diario.some((d) => d.nome === 'trascritto_leggi')) pezzi.push(traduci('sezioni.aLato.lastTurnChat'));
  if (diario.some((d) => d.nome === 'naviga' || d.nome === 'web_search')) pezzi.push(traduci('sezioni.aLato.lastTurnWeb'));
  return pezzi.length ? traduci('sezioni.aLato.lastTurn', { ora: oraLocale(scambio.at) || '—', cosa: pezzi.join(', ') }) : '';
}

/** Il perché di un file che non si apre (revisore C: la busta d'errore dice solo «non si apre da qui»): segreto o fuori, nella lingua. */
export function testoRifiutoFile(errore) {
  const motivo = errore?.problem?.reason ?? errore?.reason ?? null;
  return motivo === 'assistant-file-secret' || motivo === 'assistant-file-outside' ? traduci(`errori.ASSISTANT_FILE_REFUSED.${motivo.replace(/-/gu, '_')}`) : '';
}

/** Quante cose ha speso il filo: si somma l'`usage` vero. */
function sommaUsage(consumo, usage) {
  return { prompt_tokens: consumo.prompt_tokens + (usage?.prompt_tokens ?? 0), completion_tokens: consumo.completion_tokens + (usage?.completion_tokens ?? 0), cached_tokens: consumo.cached_tokens + (usage?.cached_tokens ?? 0) };
}

const motivoDi = (errore) => errore?.problem?.reason ?? errore?.reason ?? null;
/** Una carta che si può mostrare: id e indirizzo veri; altrimenti nessuna. */
const cartaValida = (c) => (c && typeof c.id === 'string' && typeof c.indirizzo === 'string'
  ? { id: c.id, nome: c.nome === 'web_search' ? 'web_search' : 'naviga', indirizzo: c.indirizzo, contieneLetto: c.contieneLetto === true } : null);

/* Le tre domande pronte del bozzetto (17:12, scelta 4): un clic le manda. */
export const DOMANDE_PRONTE = Object.freeze(['q1', 'q2', 'q3']);
/* «Cosa può leggere»: gli strumenti di lettura del bozzetto e gli attrezzi veri che li contano (dal diario degli scambi salvati). */
const STRUMENTI = Object.freeze([
  ['files', ['leggi']], ['search', ['cerca', 'elenca']], ['gitDiff', ['git_diff', 'git_stato']], ['gitHistory', ['git_storia']],
  ['transcript', ['trascritto_leggi']], ['outputs', ['uscita_strumento']], ['context', ['contesto_stato']], ['costs', ['spesa_sessione']],
  ['network', ['naviga', 'web_search']],
]);
const NON_PUO = Object.freeze(['write', 'run', 'sendContents', 'message', 'stop', 'secrets']);
const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {{ document: Document, sessione: () => (string|null), chiedi: Function, trasforma: Function, apriSessione: Function, durata?: Function,
 *           quandoCorre?: Function, testoConsumo: (usage: object) => string, testoErrore: (errore: unknown) => string,
 *           disegnaTesto?: (testo: string) => Node, carica?: (id: string) => Promise<object>, apriFile?: (id: string, percorso: string) => Promise<{ testo: string }>,
 *           nomeSessione?: () => string, memoria?: { leggi: (k: string) => (string|null), scrivi: (k: string, v: string) => void } }} o
 */
export function creaChatALato(o) {
  const doc = o.document;
  const crea = (tag, classe, testo) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; };
  const bottone = (classe, testo) => { const b = crea('button', classe, testo); b.type = 'button'; return b; };
  const stati = new Map();
  const statoDi = (id) => { if (!stati.has(id)) stati.set(id, statoVuoto()); return stati.get(id); };
  const memoria = { leggi: (k) => { try { return o.memoria?.leggi?.(k) ?? null; } catch { return null; } }, scrivi: (k, v) => { try { o.memoria?.scrivi?.(k, v); } catch { /* niente memoria del browser: resta com'è */ } } };
  let acceso = memoria.leggi('talos.assistente.acceso') !== 'no';
  let primo = false;
  let vista = 'filo';
  let sbirciata = null;

  const segno = () => {
    const s = crea('span', 'al-segno');
    const svg = doc.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const p = doc.createElementNS(SVG, 'path');
    p.setAttribute('d', 'M13.2 2 4.5 13.4h6.3L9.9 22l8.7-11.5h-6.4z');
    svg.append(p);
    s.append(svg);
    return s;
  };

  /* ---------------------------------------------------------------- lo scheletro ---------------------------------------------------------- */
  const nodo = crea('div', 'lato al');
  /* la riga di oggi: resta, ed è quella che si vede a pannello spento */
  const avviso = crea('p', 'talos-inspector__hint', traduci('sezioni.aLato.hint'));
  const testa = crea('div', 'al-testa');
  const riga = crea('div', 'al-riga');
  const nomi = crea('div', 'al-nomi');
  const nomeChat = crea('small', '');
  nomi.append(crea('b', '', traduci('sezioni.aLato.watching')), nomeChat);
  const sola = crea('span', 'al-sola', traduci('sezioni.aLato.readOnly'));
  const interruttore = bottone('talos-switch');
  interruttore.setAttribute('role', 'switch');
  interruttore.setAttribute('aria-label', traduci('sezioni.aLato.switchAria'));
  interruttore.append(crea('span', 'talos-switch__thumb'));
  riga.append(segno(), nomi, sola, interruttore);
  const regola = crea('p', 'al-regola', traduci('sezioni.aLato.rule'));
  const legge = bottone('al-legge');
  testa.append(riga, regola, legge);

  const spentoBox = crea('div', 'al-accendi');
  const rigaSpento = crea('div', 'al-riga');
  rigaSpento.append(segno(), crea('p', '', traduci('sezioni.aLato.offSentence')));
  const accendi = bottone('talos-button talos-button--primary talos-button--sm', traduci('sezioni.aLato.turnOn'));
  const cosaCosta = bottone('al-link', traduci('sezioni.aLato.whatItCosts'));
  spentoBox.append(rigaSpento, accendi, cosaCosta);

  const flusso = crea('div', 'al-flusso');
  const indietro = bottone('talos-button talos-button--ghost talos-button--sm al-indietro', traduci('sezioni.aLato.back'));
  const vistaAltra = crea('div', 'al-vista');
  const quieto = crea('div', 'al-quieto');
  quieto.append(crea('p', '', traduci('sezioni.aLato.quiet')), crea('p', '', traduci('sezioni.aLato.wakes')));
  const primoBox = crea('div', 'carta-al al-primo');
  const rigaPrimo = crea('div', 'al-riga');
  rigaPrimo.append(segno(), crea('p', '', traduci('sezioni.aLato.firstOn')));
  const cosaPuo = bottone('al-link', traduci('sezioni.aLato.whatItReads'));
  primoBox.append(rigaPrimo, cosaPuo);
  const filo = crea('div', 'lato-filo');
  const onesta = crea('p', 'al-onesta', traduci('sezioni.aLato.honest'));
  /* il bozzetto, casella quieta: «Ultimo giro guardato: 3 file, le differenze, 2 comandi.» — qui ciò che ha guardato l'ultima domanda */
  const ultimo = crea('p', 'al-ultimo');
  flusso.append(indietro, vistaAltra, primoBox, quieto, filo, ultimo, onesta);

  const piede = crea('div', 'lato-piede al-piede');
  const pronte = crea('div', 'al-pronte');
  const modulo = crea('form', 'lato-campo');
  const campo = crea('input', 'talos-field__input');
  campo.placeholder = traduci('sezioni.aLato.placeholder');
  campo.setAttribute('aria-label', traduci('sezioni.aLato.placeholder'));
  const chiedi = crea('button', 'talos-button talos-button--primary talos-button--sm', traduci('sezioni.aLato.ask'));
  chiedi.type = 'submit';
  /* revisore B, GIALLO-2: lo Stop del pannello, al posto di «Chiedi» mentre risponde (anche a una domanda di un'altra finestra) */
  const ferma = bottone('talos-button talos-button--secondary talos-button--sm al-ferma', traduci('sezioni.aLato.stop'));
  modulo.append(campo, chiedi, ferma);
  const conto = crea('div', 'al-conto');
  /* Revisione d'uso della candidata 04/11/2026, reperto 10: la «~» la disegna lo stile delle stime anche su un testo vuoto. Vuoto ⇒ nascosto. */
  const costo = crea('span', 'talos-mono talos-measure--estimate');
  const lavoro = crea('span', 'al-lavoro');
  const inTutto = crea('span', 'al-in-tutto');
  const modello = bottone('al-mod');
  conto.append(costo, lavoro, inTutto, crea('span', 'talos-grow'), modello);
  const azioniPiede = crea('div', 'al-azioni-piede');
  const trasforma = bottone('talos-button talos-button--secondary talos-button--sm al-trasforma', traduci('sezioni.aLato.transform'));
  azioniPiede.append(trasforma);
  piede.append(pronte, modulo, conto, azioniPiede);

  const sbircia = crea('div', 'sbircia');
  sbircia.setAttribute('role', 'dialog');
  sbircia.hidden = true;
  nodo.append(testa, avviso, spentoBox, flusso, piede, sbircia);

  /* ------------------------------------------------------------------ disegno ------------------------------------------------------------- */
  const testoRisposta = (testo) => {
    const corpo = crea('div', 'al-md assistant-copy');
    let disegnato = null;
    try { disegnato = typeof o.disegnaTesto === 'function' ? o.disegnaTesto(String(testo ?? '')) : null; } catch { disegnato = null; }
    corpo.append(disegnato ?? crea('p', '', String(testo ?? '')));
    return corpo;
  };
  const messaggio = (chi, testo, classe, markdown = false) => {
    const m = crea('div', `lato-msg${markdown ? '' : ' lato-msg--tu'}`);
    m.append(crea('span', `talos-message__who${classe ? ` ${classe}` : ''}`, chi), markdown ? testoRisposta(testo) : crea('p', '', testo));
    return m;
  };
  const dollari = (v) => (typeof v === 'number' && Number.isFinite(v) ? formattaDollari(v) : null);

  /* Il bozzetto, `rifHTML`: sotto la risposta i riferimenti a ciò che ha guardato — «messaggio 2» e «passo 7» portano alla chat e la fanno
     lampeggiare, un file apre la sbirciata alle righe lette. Li scrive il server (`riferimentiDelloScambio`), al massimo 12. */
  function riferimenti(lista) {
    const voci = (Array.isArray(lista) ? lista : []).filter((r) => r && typeof r === 'object').slice(0, 12);
    if (!voci.length) return null;
    const riga = crea('div', 'rifs');
    for (const r of voci) {
      let b = null;
      if (r.tipo === 'messaggio' && Number.isInteger(r.n)) {
        b = bottone('rif rif--m', traduci('sezioni.aLato.ref.message', { n: r.n }));
        if (Number.isInteger(r.giro)) b.dataset.rifGiro = String(r.giro);
      } else if (r.tipo === 'passo' && Number.isInteger(r.n) && typeof r.id === 'string') {
        b = bottone('rif rif--p', traduci('sezioni.aLato.ref.step', { n: r.n }));
        b.dataset.rifPasso = r.id;
      } else if (r.tipo === 'file' && typeof r.percorso === 'string' && r.percorso) {
        const [da, a] = String(r.righe ?? '').split('-');
        const righe = typeof r.righe === 'string' && r.righe ? `:${da === a ? da : r.righe}` : '';
        b = bottone('rif rif--f', `${r.percorso.split(/[\\/]/u).pop()}${righe}`);
        b.dataset.rifFile = r.percorso;
        if (typeof r.righe === 'string') b.dataset.rifRighe = r.righe;
        b.title = r.percorso;
      }
      if (b) { b.dataset.azione = 'rif'; riga.append(b); }
    }
    return riga.childNodes.length ? riga : null;
  }

  /* Owner 11/11/2026 21:40, «carta per ogni indirizzo dopo una lettura»: l'indirizzo INTERO (è la persona che decide), l'avviso se sembra portare
     testo letto, «Apri»/«Cerca» e «No». Si risponde solo dalla finestra del PC (la rotta rifiuta l'origine remota). */
  function cartaDellIndirizzo(id, carta) {
    const ricerca = carta.nome === 'web_search';
    const c = crea('div', 'al-carta');
    c.setAttribute('role', 'group');
    c.setAttribute('aria-label', traduci(ricerca ? 'sezioni.aLato.card.search' : 'sezioni.aLato.card.open'));
    c.append(crea('b', 'al-carta-titolo', traduci(ricerca ? 'sezioni.aLato.card.search' : 'sezioni.aLato.card.open')), crea('code', 'al-carta-indirizzo', String(carta.indirizzo ?? '')));
    if (carta.contieneLetto === true) c.append(crea('p', 'al-carta-avviso', traduci('sezioni.aLato.card.carries')));
    c.append(crea('p', 'al-nota', traduci('sezioni.aLato.card.why')));
    const azioni = crea('div', 'al-carta-azioni');
    const si = bottone('talos-button talos-button--primary talos-button--sm', traduci(ricerca ? 'sezioni.aLato.card.yesSearch' : 'sezioni.aLato.card.yesOpen'));
    si.dataset.carta = 'si';
    const no = bottone('talos-button talos-button--secondary talos-button--sm', traduci('sezioni.aLato.card.no'));
    no.dataset.carta = 'no';
    const rispondi = async (approvato) => {
      const stato = statoDi(id);
      if (stato.carta?.id !== carta.id) return;
      stato.carta = null;
      if (o.sessione() === id) disegna();
      try { await o.rispondiCarta?.(id, { id: carta.id, approvato }); } catch (errore) { stato.nota = o.testoErrore(errore); if (o.sessione() === id) disegna(); }
    };
    si.addEventListener('click', () => { void rispondi(true); });
    no.addEventListener('click', () => { void rispondi(false); });
    azioni.append(si, no);
    c.append(azioni);
    return c;
  }

  function disegnaStrumenti(stato) {
    const conti = new Map();
    for (const s of stato.scambi) for (const d of Array.isArray(s.diario) ? s.diario : []) if (d && !d.rifiutato) conti.set(d.nome, (conti.get(d.nome) ?? 0) + 1);
    const grande = crea('div', 'regola-grande');
    grande.append(crea('b', '', traduci('sezioni.aLato.rule')), crea('span', '', traduci('sezioni.aLato.wakes')));
    const puo = crea('div', 'carta-al');
    const lista = crea('ul', 'strum');
    for (const [chiave, nomiAttrezzi] of STRUMENTI) {
      const li = crea('li');
      const segnoOk = crea('span', 'ok', '✓');
      segnoOk.setAttribute('aria-hidden', 'true');
      const nome = crea('span', 'nome', traduci(`sezioni.aLato.tool.${chiave}`));
      nome.append(crea('small', '', traduci(`sezioni.aLato.tool.${chiave}Note`)));
      const quante = nomiAttrezzi.reduce((s, n) => s + (conti.get(n) ?? 0), 0);
      li.append(segnoOk, nome, crea('span', 'quante', tn('sezioni.aLato.timesOne', 'sezioni.aLato.timesMany', quante)));
      lista.append(li);
    }
    puo.append(crea('h3', '', traduci('sezioni.aLato.canDo')), lista);
    const nonPuo = crea('div', 'carta-al');
    const listaNo = crea('ul', 'strum');
    for (const chiave of NON_PUO) {
      const li = crea('li');
      const segnoNo = crea('span', 'no', '✕');
      segnoNo.setAttribute('aria-hidden', 'true');
      li.append(segnoNo, crea('span', 'nome', traduci(`sezioni.aLato.cannot.${chiave}`)));
      listaNo.append(li);
    }
    nonPuo.append(crea('h3', '', traduci('sezioni.aLato.cannotDo')), listaNo);
    const letto = crea('div', 'carta-al');
    const diario = crea('ul', 'strum diario');
    for (const s of stato.scambi) {
      const ora = oraLocale(s.at);
      for (const d of Array.isArray(s.diario) ? s.diario : []) {
        if (!d || typeof d !== 'object') continue;
        const li = crea('li');
        const nome = crea('span', 'nome');
        const quando = crea('time', '', ora);
        if (typeof s.at === 'string') quando.setAttribute('datetime', s.at);
        nome.append(quando, doc.createTextNode(fraseDelDiario(d)));
        li.append(nome);
        diario.append(li);
      }
    }
    if (!diario.childNodes.length) diario.append(crea('li', 'al-nota', traduci('sezioni.aLato.nothingRead')));
    letto.append(crea('h3', '', traduci('sezioni.aLato.readSoFar')), diario);
    vistaAltra.replaceChildren(grande, puo, nonPuo, letto);
  }

  function disegnaPrivacy(stato) {
    const sezione = (titolo, ...figli) => { const c = crea('div', 'carta-al priv'); c.append(crea('h4', '', titolo), ...figli); return c; };
    const diSerie = stato.modello?.diSerie !== false;
    /* decisione 1645 punto 2, giudice v1564: di serie il modello della chat, cambiabile con qualunque altro — le tre scelte del bozzetto. La chat
       si salva da qui; un altro modello si sceglie dall'elenco intero delle Impostazioni (Memoria e contesto → Assistente), dove porta il clic. */
    const tipo = diSerie ? 'chat' : stato.modello?.locale === true ? 'locale' : 'cloud';
    const scelta = crea('div', 'scelte-mod');
    scelta.setAttribute('role', 'radiogroup');
    scelta.setAttribute('aria-label', traduci('sezioni.aLato.thinksWith'));
    for (const [valore, chiave] of [['chat', 'modelChat'], ['cloud', 'modelCloud'], ['locale', 'modelLocal']]) {
      const b = bottone('', traduci(`sezioni.aLato.${chiave}`));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(tipo === valore));
      b.dataset.modello = valore;
      if (valore === 'chat') b.append(crea('small', '', traduci('sezioni.aLato.byDefault')));
      else if (tipo === valore && stato.modello?.id) b.append(crea('small', 'talos-mono', String(stato.modello.id)));
      scelta.append(b);
    }
    const cifre = crea('div', 'cifre');
    const cifra = (valore, etichetta) => { const d = crea('div'); d.append(crea('b', '', dollari(valore) ?? '—'), crea('span', '', etichetta)); return d; };
    cifre.append(cifra(stato.spesa ? stato.spesa.chat : 0, traduci('sezioni.aLato.inThisChat')), cifra(stato.spesa ? stato.spesa.inTutto : 0, traduci('sezioni.aLato.inAllChats')));
    vistaAltra.replaceChildren(
      sezione(traduci('sezioni.aLato.thinksWith'), scelta, crea('p', 'al-nota', `${traduci(diSerie ? 'sezioni.aLato.modelChatNote' : 'sezioni.aLato.modelOtherNote')} ${traduci('sezioni.aLato.changeHere')}`)),
      sezione(traduci('sezioni.aLato.sees'), crea('p', '', traduci('sezioni.aLato.seesText'))),
      sezione(traduci('sezioni.aLato.secrets'), crea('p', '', traduci('sezioni.aLato.secretsText'))),
      sezione(traduci('sezioni.aLato.network'), crea('p', '', traduci('sezioni.aLato.networkText'))),
      sezione(traduci('sezioni.aLato.leaves'), crea('p', '', traduci(tipo === 'chat' ? 'sezioni.aLato.leavesChat' : tipo === 'locale' ? 'sezioni.aLato.leavesLocal' : 'sezioni.aLato.leavesOther'))),
      sezione(traduci('sezioni.aLato.spend'), cifre, crea('p', 'al-nota', traduci('sezioni.aLato.noCap'))),
    );
  }

  function disegna() {
    const id = o.sessione();
    const stato = id ? statoDi(id) : statoVuoto();
    nodo.classList[acceso ? 'remove' : 'add']('al--spento');
    testa.hidden = !acceso;
    spentoBox.hidden = acceso;
    avviso.hidden = acceso;
    interruttore.setAttribute('aria-checked', String(acceso));
    nomeChat.textContent = typeof o.nomeSessione === 'function' ? String(o.nomeSessione() ?? '') : '';
    const l = stato.letture;
    legge.textContent = traduci('sezioni.aLato.hasRead', {
      messaggi: tn('sezioni.aLato.messagesOne', 'sezioni.aLato.messagesMany', l?.messaggi ?? 0),
      file: tn('sezioni.aLato.filesOne', 'sezioni.aLato.filesMany', fileLettiDallAssistente(stato.scambi).size),
      uscite: tn('sezioni.aLato.outputsOne', 'sezioni.aLato.outputsMany', l?.uscite ?? 0),
    });
    const altra = acceso && vista !== 'filo';
    indietro.hidden = !altra;
    vistaAltra.hidden = !altra;
    if (altra && vista === 'strumenti') disegnaStrumenti(stato);
    else if (altra && vista === 'privacy') disegnaPrivacy(stato);
    else vistaAltra.replaceChildren();
    filo.hidden = altra;
    onesta.hidden = !acceso || altra;
    const sospesa = stato.inVolo ?? stato.inAttesa ?? stato.altrove;
    primoBox.hidden = !(acceso && primo && !altra && stato.scambi.length === 0 && !sospesa);
    quieto.hidden = !(acceso && !primo && !altra && stato.scambi.length === 0 && !sospesa && !stato.nota);

    filo.replaceChildren();
    for (const s of stato.scambi) {
      filo.append(messaggio(traduci('chat.message.you'), s.domanda));
      /* due no (giudice v1584 punto 2): la domanda si è fermata apposta; senza testo del modello resta solo la riga, mai una bolla vuota */
      if (!s.fermataDaiNo || (typeof s.risposta === 'string' && s.risposta.trim())) {
        const risposta = messaggio('TALOS', s.risposta, 'talos-message__who--talos', true);
        const rifs = riferimenti(s.riferimenti);
        if (rifs) risposta.append(rifs);
        filo.append(risposta);
      }
      if (s.fermataDaiNo) filo.append(crea('p', 'al-nota', traduci('sezioni.aLato.stoppedAfterNo')));
      if (s.tagliata) filo.append(crea('p', 'talos-inspector__hint', traduci('sezioni.aLato.cut')));
      if (s.senzaStrumenti) filo.append(crea('p', 'al-nota', traduci('sezioni.aLato.noTools')));
      /* revisore B, nota EN/IT: dal telefono, dopo una lettura, niente pagine web finché il telefono non sa mostrare la carta */
      if ((Array.isArray(s.diario) ? s.diario : []).some((d) => d?.carta === 'nessuna')) filo.append(crea('p', 'al-nota', traduci('sezioni.aLato.deviceNote')));
    }
    if (sospesa) {
      filo.append(messaggio(traduci('chat.message.you'), sospesa.domanda));
      const rigaAttesa = crea('p', 'talos-inspector__hint attesa', traduci(stato.inAttesa ? 'sezioni.aLato.waitTurn' : 'sezioni.aLato.thinking'));
      const tempo = crea('span', 'talos-mono');
      const da = typeof sospesa.da === 'string' ? Date.parse(sospesa.da) : sospesa.da;
      tempo.dataset.attivitaDa = String(Number.isFinite(da) ? da : Date.now());
      rigaAttesa.append(' ', tempo);
      filo.append(rigaAttesa);
      if (stato.carta) filo.append(cartaDellIndirizzo(id, stato.carta));
      o.quandoCorre?.();
    }
    if (stato.nota) filo.append(crea('p', 'talos-inspector__hint', stato.nota));
    filo.scrollTop = filo.scrollHeight;
    /* foto del giro di cura: a scorrere è il flusso, non il filo; una nota o una domanda in corso si vedono senza cercarle */
    if (sospesa || stato.nota) flusso.scrollTop = flusso.scrollHeight;
    const guardato = acceso && !altra && stato.scambi.length ? ultimoGiroGuardato(stato.scambi.at(-1)) : '';
    ultimo.textContent = guardato;
    ultimo.hidden = !guardato;

    pronte.replaceChildren();
    if (acceso && !altra) {
      for (const q of DOMANDE_PRONTE) {
        const testo = traduci(`sezioni.aLato.ready.${q}`);
        if (stato.scambi.some((s) => s.domanda === testo)) continue;
        const b = bottone('', testo);
        b.dataset.pronta = q;
        b.disabled = Boolean(sospesa) || !id;
        pronte.append(b);
      }
    }
    pronte.hidden = !pronte.childNodes.length;
    chiedi.disabled = Boolean(sospesa) || !id;
    /* lo Stop c'è mentre una domanda corre o aspetta il giro; prende il posto di «Chiedi» */
    ferma.hidden = !sospesa;
    chiedi.hidden = Boolean(sospesa);

    /* Spesa sempre in vista, anche a zero (owner 16:45, punto 6: nessun tetto): in questa chat e in tutto. Prima del primo caricamento, o con un server
       di prima, la somma delle risposte di questo filo; un prezzo ignoto ⇒ niente dollari, solo il lavoro, come prima. */
    const speso = stato.consumo.prompt_tokens + stato.consumo.completion_tokens;
    const testoLavoro = speso > 0 ? o.testoConsumo(stato.consumo) : '';
    const dellaChat = stato.spesa ? stato.spesa.chat : (stato.scambi.length > 0 ? stato.dollari : 0);
    const inChat = dollari(dellaChat);
    costo.textContent = inChat ? traduci('sezioni.aLato.spentChat', { dollari: inChat }) : '';
    costo.hidden = !inChat;
    /* Scelta 8 (11/11/2026): la spesa si vede anche a zero; a zero è esatta, quindi niente «~» delle stime */
    costo.classList.toggle('talos-measure--estimate', Number(dellaChat) > 0);
    lavoro.textContent = testoLavoro ? traduci('sezioni.aLato.spent', { consumo: testoLavoro }) : '';
    lavoro.hidden = !testoLavoro;
    const tutto = dollari(stato.spesa ? stato.spesa.inTutto : null);
    inTutto.textContent = tutto ? traduci('sezioni.aLato.spentAll', { dollari: tutto }) : '';
    inTutto.hidden = !tutto;
    modello.textContent = `${stato.modello && stato.modello.diSerie === false ? String(stato.modello.id ?? '') : traduci('sezioni.aLato.modelChat')} ▾`;
    modello.hidden = !acceso;
    trasforma.hidden = stato.scambi.length === 0;
  }

  /* ---------------------------------------------------------------- azioni ------------------------------------------------------------------ */
  async function carica(id) {
    if (typeof o.carica !== 'function') return;
    let letto = null;
    try { letto = await o.carica(id); } catch { letto = null; }
    if (!letto) return;
    const stato = statoDi(id);
    /* gli scambi salvati sono la fonte: quelli arrivati mentre si caricava ci sono già dentro (stesso id) */
    if (Array.isArray(letto.scambi)) {
      const salvati = letto.scambi.filter((s) => typeof s?.domanda === 'string' && typeof s?.risposta === 'string');
      const visti = new Set(salvati.map((s) => s.id).filter(Boolean));
      stato.scambi = [...salvati, ...stato.scambi.filter((s) => !s.id || !visti.has(s.id))];
      /* dopo una ricarica il lavoro torna dai salvati (misurato dal vivo l'11/11: senza, a prezzo ignoto la riga sotto il campo restava vuota) */
      const dalServer = salvati.reduce((c, s) => sommaUsage(c, s.usage), { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 });
      const totale = (u) => u.prompt_tokens + u.completion_tokens;
      if (totale(dalServer) > totale(stato.consumo)) stato.consumo = dalServer;
    }
    if (letto.spesa && typeof letto.spesa === 'object') stato.spesa = letto.spesa;
    if (letto.letture) stato.letture = letto.letture;
    if (letto.modello) stato.modello = letto.modello;
    if (typeof letto.conStrumenti === 'boolean') stato.conStrumenti = letto.conStrumenti;
    /* revisore B, GIALLO-3: la domanda in corso da un'altra finestra (o da questa prima di una ricarica) e la sua carta; un server di prima non le dice */
    if ('inCorso' in letto) stato.altrove = letto.inCorso && typeof letto.inCorso.domanda === 'string' ? { domanda: letto.inCorso.domanda, da: letto.inCorso.da } : null;
    if ('carta' in letto) stato.carta = cartaValida(letto.carta);
    stato.caricato = true;
    if (o.sessione() === id) disegna();
  }

  async function spedisci(id, domanda) {
    const stato = statoDi(id);
    stato.nota = '';
    stato.inAttesa = null;
    stato.inVolo = { domanda, da: Date.now() };
    primo = false;
    disegna();
    try {
      const esito = await o.chiedi(id, { domanda, filo: stato.scambi.map(({ domanda: d, risposta }) => ({ domanda: d, risposta })) });
      const salvato = esito.scambio && typeof esito.scambio === 'object' ? esito.scambio : null;
      /* foto del giro di cura (11/11 sera): l'evento dello scambio salvato può arrivare PRIMA della risposta HTTP, e `carica` lo ha già messo nel
         filo col suo lavoro; qui allora non si aggiunge di nuovo (era doppio: due tabelle, due diari) */
      const giaArrivato = Boolean(salvato?.id) && stato.scambi.some((s) => s.id === salvato.id);
      if (!giaArrivato) {
        stato.scambi.push({ ...(salvato ?? {}), domanda, risposta: esito.risposta, tagliata: esito.tagliata === true });
        stato.consumo = sommaUsage(stato.consumo, esito.usage);
        stato.dollari = sommaDollari([stato.dollari, esito.costo]);
      }
      if (esito.spesa && typeof esito.spesa === 'object') stato.spesa = esito.spesa;
      if (esito.filoTagliato) stato.nota = traduci('sezioni.aLato.oldCut');
    } catch (errore) {
      if (motivoDi(errore) === 'aspetta-il-giro') stato.inAttesa = { domanda, da: Date.now() };
      else {
        stato.nota = motivoDi(errore) === 'side-chat-stopped' ? traduci('sezioni.aLato.stopped') : o.testoErrore(errore);
        if (o.sessione() === id && !campo.value) campo.value = domanda;
      }
    } finally {
      stato.inVolo = null;
      if (o.sessione() === id) disegna();
    }
  }

  function fai(domanda) {
    const id = o.sessione();
    const testo = String(domanda ?? '').trim();
    if (!id || !testo) return false;
    const stato = statoDi(id);
    if (stato.inVolo || stato.inAttesa) return false;
    vista = 'filo';
    void spedisci(id, testo);
    return true;
  }

  function chiudiSbirciata() { sbirciata = null; sbircia.hidden = true; sbircia.replaceChildren(); }
  /** Un file citato (`percorso:righe`) in sola lettura, sopra il pannello. Il server decide se si apre (segreto o fuori ⇒ no, e lo dice). */
  async function apriSbirciata(percorso, righe) {
    const id = o.sessione();
    if (!id || typeof o.apriFile !== 'function') return false;
    const [da, a] = String(righe ?? '').split('-').map((n) => Number.parseInt(n, 10));
    sbirciata = percorso;
    let testo;
    try { testo = (await o.apriFile(id, percorso))?.testo ?? ''; } catch (errore) {
      if (sbirciata !== percorso) return false;
      chiudiSbirciata();
      statoDi(id).nota = testoRifiutoFile(errore) || o.testoErrore(errore);
      disegna();
      return false;
    }
    if (sbirciata !== percorso) return false;
    const testaS = crea('div', 'sbircia-testa');
    const chiudi = bottone('chiudi', '✕');
    chiudi.setAttribute('aria-label', traduci('sezioni.aLato.close'));
    chiudi.dataset.azione = 'chiudi-sbirciata';
    testaS.append(crea('b', '', percorso), crea('span', 'al-sola', traduci('sezioni.aLato.readOnlyShort')), chiudi);
    const pre = crea('pre');
    pre.setAttribute('tabindex', '0');
    let prima = null;
    /* l'a capo finale del file non è una riga (foto dell'11/11: la sbirciata mostrava una «4» vuota sotto un file di tre righe) */
    String(testo).replace(/\r?\n$/u, '').split('\n').forEach((linea, i) => {
      const n = i + 1;
      const evidenziata = Number.isFinite(da) && n >= da && n <= (Number.isFinite(a) ? a : da);
      const r = crea('span', `riga-f${evidenziata ? ' riga-f--hl' : ''}`);
      r.append(crea('i', '', String(n)), doc.createTextNode(linea));
      if (evidenziata && !prima) prima = r;
      pre.append(r, doc.createTextNode('\n'));
    });
    sbircia.setAttribute('aria-label', percorso);
    /* revisore C (foto): la sbirciata copriva campo e spesa; la spesa è «sempre in vista» (decisione 1645, punto 6): si apre sopra il piede */
    sbircia.style.bottom = `${Math.max(0, Math.round(piede.offsetHeight || 0))}px`;
    sbircia.replaceChildren(testaS, pre);
    sbircia.hidden = false;
    prima?.scrollIntoView?.({ block: 'center' });
    return true;
  }

  modulo.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (fai(campo.value)) campo.value = '';
  });
  pronte.addEventListener('click', (evento) => {
    const b = evento.target?.closest?.('[data-pronta]');
    if (b && !b.disabled) fai(b.textContent);
  });
  interruttore.addEventListener('click', () => { acceso = false; primo = false; vista = 'filo'; memoria.scrivi('talos.assistente.acceso', 'no'); disegna(); });
  accendi.addEventListener('click', () => { acceso = true; primo = true; vista = 'filo'; memoria.scrivi('talos.assistente.acceso', 'si'); disegna(); });
  cosaCosta.addEventListener('click', () => { acceso = true; vista = 'privacy'; memoria.scrivi('talos.assistente.acceso', 'si'); disegna(); });
  cosaPuo.addEventListener('click', () => { vista = 'strumenti'; disegna(); });
  legge.addEventListener('click', () => { vista = 'strumenti'; disegna(); });
  modello.addEventListener('click', () => { vista = 'privacy'; disegna(); });
  indietro.addEventListener('click', () => { vista = 'filo'; disegna(); });
  ferma.addEventListener('click', async () => {
    const id = o.sessione();
    if (!id) return;
    const stato = statoDi(id);
    /* una domanda che aspetta il giro del modello locale non è ancora partita: si toglie qui, e torna nel campo */
    if (stato.inAttesa) { if (!campo.value) campo.value = stato.inAttesa.domanda; stato.inAttesa = null; disegna(); return; }
    ferma.disabled = true;
    try { await o.ferma?.(id); } catch (errore) { stato.nota = o.testoErrore(errore); } finally { ferma.disabled = false; }
    if (o.sessione() === id) disegna();
  });
  nodo.addEventListener('click', (evento) => {
    if (evento.target?.closest?.('[data-azione="chiudi-sbirciata"]')) { chiudiSbirciata(); return; }
    const rif = evento.target?.closest?.('[data-azione="rif"]');
    if (rif) {
      if (rif.dataset.rifFile) void apriSbirciata(rif.dataset.rifFile, rif.dataset.rifRighe);
      else if (rif.dataset.rifGiro) o.vaiAlMessaggio?.(Number(rif.dataset.rifGiro));
      else if (rif.dataset.rifPasso) o.vaiAlPasso?.(rif.dataset.rifPasso);
      return;
    }
    const radio = evento.target?.closest?.('[data-modello]');
    if (radio) {
      if (radio.dataset.modello !== 'chat') { o.apriSceltaModello?.(radio.dataset.modello); return; }
      const id = o.sessione();
      void Promise.resolve(o.sceglieModello?.(null)).then(() => (id ? carica(id) : null), (errore) => { if (id) { statoDi(id).nota = o.testoErrore(errore); vista = 'filo'; disegna(); } });
      return;
    }
    const link = evento.target?.closest?.('.talos-link-file[data-file]');
    if (!link) return;
    evento.preventDefault?.();
    evento.stopPropagation?.();
    void apriSbirciata(link.getAttribute('data-file'), link.getAttribute('data-righe'));
  });
  trasforma.addEventListener('click', async () => {
    const id = o.sessione();
    if (!id) return;
    const stato = statoDi(id);
    try {
      const esito = await o.trasforma(id, stato.scambi.map(({ domanda, risposta }) => ({ domanda, risposta })));
      stati.delete(id);
      o.apriSessione(esito);
    } catch (errore) {
      stato.nota = motivoDi(errore) ? traduci('sezioni.aLato.transformLater') : o.testoErrore(errore);
      disegna();
    }
  });
  disegna();
  { const id = o.sessione(); if (id) void carica(id); }

  return {
    nodo,
    fai,
    apriSbirciata,
    fuoco() { campo.focus(); },
    /** 0.2.1-ART D2 (09/11/2026): con un artefatto aperto sopra, il campo dice che la domanda è su quello; chiuso, torna com'era. */
    perArtefatto(aperto) {
      const testo = traduci(aperto ? 'sezioni.aLato.placeholderArtifact' : 'sezioni.aLato.placeholder');
      campo.placeholder = testo;
      campo.setAttribute('aria-label', testo);
    },
    /** La chat cambia: il filo è della sua sessione, e si ricarica dal server (le domande sono salvate con la chat). */
    perSessione() {
      chiudiSbirciata();
      vista = 'filo';
      disegna();
      const id = o.sessione();
      if (id) void carica(id);
    },
    /**
     * Revisore B, GIALLO-3: il pannello è vivo. Gli eventi della chat aperta (mai in rigiocata: lo decide chi chiama) portano la domanda in corso
     * di un'altra finestra, la sua carta e lo scambio salvato, senza cambiare chat. Torna `true` se l'evento era dell'Assistente.
     */
    evento(e) {
      const id = o.sessione();
      if (!id || e?.type !== 'CUSTOM') return false;
      const stato = statoDi(id);
      if (e.name === EVENTI_DELL_ASSISTENTE.stato) {
        const c = e.value?.inCorso;
        stato.altrove = c && typeof c.domanda === 'string' ? { domanda: c.domanda, da: c.da } : null;
        if (!stato.altrove) stato.carta = null;
        disegna();
        return true;
      }
      if (e.name === EVENTI_DELL_ASSISTENTE.carta) {
        const v = e.value;
        if (v?.chiusa === true) { if (stato.carta?.id === v.id) stato.carta = null; } else stato.carta = cartaValida(v) ?? stato.carta;
        disegna();
        return true;
      }
      if (e.name === EVENTI_DELL_ASSISTENTE.scambio) { void carica(id); return true; }
      return false;
    },
    /** A fine giro parte la domanda che aspettava; altrimenti si rilegge ciò che l'Assistente può leggere. */
    giroFinito() {
      const id = o.sessione();
      const domanda = id ? stati.get(id)?.inAttesa?.domanda : null;
      if (domanda) void spedisci(id, domanda);
      else if (id) void carica(id);
    },
  };
}
