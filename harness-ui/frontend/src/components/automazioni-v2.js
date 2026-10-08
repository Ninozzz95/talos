/**
 * automazioni-v2.js — le automazioni a due porte nell'interfaccia (owner 08/10/2026 notte, «stato dell'arte come Claude e
 * Codex, massima UX e UI, senza compromessi»): la riga con l'orario in PAROLE come sua identità, lo stato, i giri da
 * guardare, il menu «⋯» (e lo stesso col tasto destro: regola di casa, più di due azioni ⇒ menu), il dettaglio con le
 * istruzioni e lo storico dei giri, e la voce di «Da guardare».
 *
 * Stato dell'arte letto l'08/10: Claude Desktop (dettaglio con Run now, Active/Paused, storico anche dei giri saltati col
 * motivo, Delete solo dal dettaglio — code.claude.com/docs/en/desktop-scheduled-tasks) e Codex/ChatGPT (la vista Scheduled
 * come casella in arrivo con i non letti, archiviazione automatica senza niente da dire — learn.chatgpt.com/docs/automations).
 * ⛔ Nessuna estetica nuova: talos-card, talos-kv, talos-badge, talos-switch, il menu contestuale di `schede.js`.
 * ⛔ Mai un esito inventato: «Fatto» è ciò che il giro ha detto di sé, e un giro saltato porta il motivo vero dal server.
 */
import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
import { etichettaPermesso, nomeModelloUmano } from './chat-foot.js';

const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');
const RIASSUNTO_IN_RIGA = 280;

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }

/** «Ogni giorno alle 09:00», «Giorni feriali alle 18:30»… nella lingua dell'interfaccia; mai l'oggetto grezzo. */
export function parolePianificazione(p) {
  switch (p?.tipo) {
    case 'manuale': return traduci('sezioni.automations.v2.when.manual');
    case 'ogni-ora': return traduci('sezioni.automations.v2.when.hourly', { minute: String(p.minuto).padStart(2, '0') });
    case 'giornaliera': return traduci('sezioni.automations.v2.when.daily', { time: p.ora });
    case 'feriali': return traduci('sezioni.automations.v2.when.weekdays', { time: p.ora });
    case 'settimanale': return traduci('sezioni.automations.v2.when.weekly', { day: traduci(`sezioni.automations.v2.day.${p.giorno}`), time: p.ora });
    case 'ogni-n-minuti': return tn('sezioni.automations.v2.when.everyMinutesOne', 'sezioni.automations.v2.when.everyMinutesMany', p.minuti);
    case 'cron': return traduci('sezioni.automations.v2.when.cron', { expr: p.espressione });
    case 'una-volta': return traduci('sezioni.automations.v2.when.once', { date: dataBreve(`${p.quando}:00`) });
    default: return traduci('sezioni.automations.interval.unknown');
  }
}

/** Una data in parole brevi, nell'ora del computer di chi guarda (lo stesso fuso in cui la persona ha scritto l'orario). */
export function dataBreve(valore) {
  const d = typeof valore === 'string' ? new Date(valore) : null;
  if (!d || !Number.isFinite(d.getTime())) return traduci('sezioni.common.dateNotRecorded');
  return d.toLocaleString(localeUI(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Le parole di un giro: esito, e il perché se non è andato. */
export function parolaEsitoGiro(giro) {
  const esito = traduci(`sezioni.automations.v2.run.${giro?.esito ?? 'partita'}`);
  if (!giro?.motivo || giro.esito === 'finita' || giro.esito === 'fermata' || giro.esito === 'partita') return esito;
  /* ⛔ Il motivo arriva col trattino (`app-chiusa`), e una chiave col trattino non ha la forma delle chiavi (`FORMA_DELLA_CHIAVE`):
     non si traduceva mai, e ogni giro saltato diceva «non è riuscito a finire». Trovato dal test AUTO2-GIRO (08/10/2026). */
  const chiave = `sezioni.automations.v2.reason.${String(giro.motivo).replace(/-/gu, '_')}`;
  const perche = traduci(chiave);
  return `${esito}: ${perche === chiave ? traduci('sezioni.automations.v2.reason.other') : perche}`;
}

export function testiAutomazioneV2(a, { nonLetti = 0 } = {}) {
  const inCorso = Boolean(a.giroInCorso);
  const inAttesa = typeof a.inAttesaFinoA === 'string' && new Date(a.inAttesaFinoA) > new Date();
  return {
    nome: typeof a.nome === 'string' && a.nome.trim() ? a.nome : traduci('sezioni.automations.unnamed'),
    quando: parolePianificazione(a.pianificazione),
    prossimo: a.attiva !== true ? traduci('sezioni.automations.v2.row.off')
      : inAttesa ? traduci('sezioni.automations.v2.row.waiting', { time: dataBreve(a.inAttesaFinoA) })
        : a.prossimaEsecuzione ? dataBreve(a.prossimaEsecuzione) : traduci('sezioni.automations.v2.row.nextNone'),
    ultimo: inCorso ? traduci('sezioni.automations.v2.row.running') : a.ultimaEsecuzione ? dataBreve(a.ultimaEsecuzione) : traduci('sezioni.automations.v2.row.never'),
    modello: typeof a.modello === 'string' && a.modello.trim() ? (nomeModelloUmano(a.modello) || a.modello) : traduci('sezioni.automations.modelServerDefault'),
    permessi: etichettaPermesso(a.permessi),
    ripeti: a.ripeti === null || a.ripeti === undefined ? traduci('sezioni.automations.v2.row.repeatForever')
      : tn('sezioni.automations.v2.row.repeatTimesOne', 'sezioni.automations.v2.row.repeatTimesMany', a.ripeti, { done: a.eseguite ?? 0 }),
    origine: a.origine?.tipo === 'chat' ? traduci('sezioni.automations.v2.row.originChat') : traduci('sezioni.automations.v2.row.originUi'),
    nonLetti: nonLetti > 0 ? tn('sezioni.automations.v2.row.unreadOne', 'sezioni.automations.v2.row.unreadMany', nonLetti) : null,
    inCorso,
  };
}

/**
 * Le voci del menu «⋯» (e del tasto destro): sempre le stesse, nello stesso ordine; Elimina per ultima, separata e rossa.
 * La forma è quella del menu di casa (`apriMenuAzioniLibreria`: chiave, etichetta, icona, pericolo, separaPrima, aziona).
 * Mentre una scrittura è in volo le azioni che scrivono non si offrono (quel menu non ha voci spente): resta «Apri la chat».
 */
export function vociMenuAutomazione(a, { onEsegui, onFerma, onModifica, onToggle, onApriChat, onElimina, salvataggio = false } = {}) {
  const voci = [];
  /* dall'08/10 (pagina come Libreria e Note) l'interruttore non sta più sulla scheda: accendere e mettere in pausa stanno qui */
  const accensione = () => ({ chiave: a.attiva ? 'pausa' : 'accendi', etichetta: traduci(a.attiva ? 'sezioni.automations.v2.section.action.pause' : 'sezioni.automations.v2.section.action.turnOn'),
    icona: a.attiva ? 'i-pausa' : 'i-play', aziona: () => onToggle?.(a, !a.attiva) });
  if (a.versione === 2) {
    if (!salvataggio) {
      if (a.giroInCorso) voci.push({ chiave: 'ferma', etichetta: traduci('sezioni.automations.v2.menu.stop'), icona: 'i-stop', aziona: () => onFerma?.(a) });
      else voci.push({ chiave: 'esegui', etichetta: traduci('sezioni.automations.v2.menu.runNow'), icona: 'i-play', aziona: () => onEsegui?.(a) });
      voci.push({ chiave: 'modifica', etichetta: traduci('sezioni.automations.v2.menu.edit'), icona: 'i-edit', aziona: () => onModifica?.(a) });
      voci.push(accensione());
    }
    if (a.origine?.tipo === 'chat' && a.origine.sessionId) voci.push({ chiave: 'chat', etichetta: traduci('sezioni.automations.v2.menu.openChat'), icona: 'i-doc', aziona: () => onApriChat?.(a) });
  } else if (!salvataggio) voci.push(accensione());
  if (!salvataggio) voci.push({ chiave: 'elimina', etichetta: traduci('sezioni.automations.v2.menu.delete'), icona: 'i-trash', pericolo: true, separaPrima: true, aziona: () => onElimina?.(a) });
  return voci;
}

/* I codici del server hanno il trattino («accesso-pieno»), le chiavi del dizionario no (`FORMA_DELLA_CHIAVE`): camelCase. */
export const segmentoDelCodice = (codice) => String(codice ?? '').replace(/-([a-z])/gu, (_, c) => c.toUpperCase());
/** Una minaccia trovata nelle istruzioni, in parole (decisione 13): sulla carta in chat e nella proposta dello storico. */
export const minacciaInParole = (codice) => traduci(`sezioni.automations.v2.card.threat.${segmentoDelCodice(codice)}`);

/**
 * Decisione 13 dell'owner (08/10/2026 sera): le istruzioni che un giro ha proposto per sé, in attesa del sì della persona —
 * il perché, le minacce trovate (in rosso, come sulla carta in chat), le istruzioni di adesso e quelle proposte.
 */
function creaBloccoProposta(doc, proposta) {
  const blocco = el(doc, 'div', 'talos-automation__proposta');
  blocco.dataset.autoProposta = proposta.stato;
  blocco.append(el(doc, 'p', 'talos-automation__proposta-perche', traduci('sezioni.automations.v2.proposal.why')));
  if (Array.isArray(proposta.minacce) && proposta.minacce.length) {
    const r = el(doc, 'div', 'talos-callout talos-callout--pericolo talos-approval__avvisi');
    r.setAttribute('role', 'alert');
    const corpo = el(doc, 'div', 'talos-approval__avvisi-corpo');
    const lista = el(doc, 'ul', 'talos-approval__avvisi-lista');
    for (const codice of proposta.minacce) lista.append(el(doc, 'li', '', minacciaInParole(codice)));
    corpo.append(el(doc, 'b', '', traduci('sezioni.automations.v2.card.threatsTitle')), lista);
    r.append(corpo);
    blocco.append(r);
  }
  for (const [chiave, testo] of [['now', proposta.prima], ['proposed', proposta.dopo]]) {
    const parte = el(doc, 'div', 'talos-approval__automazione-istruzioni');
    parte.dataset.autoPropostaParte = chiave;
    parte.append(el(doc, 'span', 'talos-kv__k', traduci(`sezioni.automations.v2.proposal.${chiave}`)), el(doc, 'p', 'talos-automation__istruzioni-testo', testo ?? ''));
    blocco.append(parte);
  }
  return blocco;
}

/** Un giro nello storico: quando, esito col perché, il resoconto (accorciato, intero col clic), e le azioni. */
export function creaRigaGiro(giro, { document: doc = globalThis.document, onApri, onLetto, onProposta, onMenuGiro } = {}) {
  const riga = el(doc, 'div', 'talos-automation__giro');
  riga.dataset.autoGiro = giro.runId;
  riga.dataset.esito = giro.esito ?? 'partita';
  const testa = el(doc, 'div', 'talos-automation__giro-testa');
  const tono = giro.esito === 'fallita' ? ' talos-badge--danger' : giro.esito === 'finita' ? ' talos-badge--success' : giro.esito === 'saltata' ? ' talos-badge--warning' : '';
  /* di un giro saltato conta l'ora del giro MANCATO, non quella in cui il salto è stato scritto (foto dell'08/10: «mer 11:12» per
     il giro delle 09:00) */
  const quando = giro.esito === 'saltata' ? (giro.previstaAlle ?? giro.saltataAlle) : (giro.partitaAlle ?? giro.previstaAlle);
  testa.append(el(doc, 'span', 'talos-muted', dataBreve(quando)), el(doc, 'span', `talos-badge talos-badge--sm${tono}`, parolaEsitoGiro(giro)));
  if (giro.manuale) testa.append(el(doc, 'span', 'talos-badge talos-badge--sm', traduci('sezioni.automations.v2.runs.byHand')));
  if (giro.ritardo === 'recupero') testa.append(el(doc, 'span', 'talos-badge talos-badge--sm', traduci('sezioni.automations.v2.runs.catchUp')));
  /* decisione 9 dell'owner: il giro che ha cambiato sé stesso lo dice nello storico (le istruzioni, o l'ora del prossimo giro) */
  for (const [campo, chiave] of [['istruzioni', 'changedInstructions'], ['prossimaEsecuzione', 'changedNext']]) {
    if (!giro.cambi?.includes(campo)) continue;
    const segno = el(doc, 'span', 'talos-badge talos-badge--warning talos-badge--sm', traduci(`sezioni.automations.v2.runs.${chiave}`));
    segno.dataset.autoGiroCambio = campo;
    testa.append(segno);
  }
  const proposta = giro.proposta && typeof giro.proposta === 'object' ? giro.proposta : null;
  const inAttesa = proposta?.stato === 'in-attesa';
  if (proposta) {
    const [tonoProposta, parola] = inAttesa ? [' talos-badge--warning', 'title'] : proposta.stato === 'approvata' ? [' talos-badge--success', 'approved'] : ['', 'discarded'];
    const segno = el(doc, 'span', `talos-badge talos-badge--sm${tonoProposta}`, traduci(`sezioni.automations.v2.proposal.${parola}`));
    segno.dataset.autoGiroProposta = proposta.stato;
    testa.append(segno);
  }
  if (giro.daGuardare && !giro.letta) testa.append(el(doc, 'span', 'talos-badge talos-badge--accent talos-badge--sm', traduci('sezioni.automations.v2.runs.new')));
  /* le azioni in una riga loro, in fondo: nella colonna del pannello (440 px) in testa andavano a capo una per una (foto 08/10) */
  const azioni = el(doc, 'div', 'talos-automation__giro-azioni');
  // una proposta in attesa si chiude con un sì o un no, non con «letto»: le due decisioni vengono prima di tutto
  if (inAttesa && onProposta) {
    for (const [decisione, chiave, classe] of [['approva', 'approve', 'talos-button--primary'], ['scarta', 'discard', 'talos-button--ghost']]) {
      const b = el(doc, 'button', `talos-button ${classe} talos-button--sm`, traduci(`sezioni.automations.v2.proposal.${chiave}`));
      b.type = 'button'; b.dataset.autoPropostaDecidi = decisione;
      b.addEventListener('click', () => onProposta(giro, decisione));
      azioni.append(b);
    }
  }
  /* ⛔ Regola dell'owner (10/09 e 13/09): più di due azioni ⇒ «⋯» più il tasto destro, e nulla sia nella riga sia nel menu
     (review del bugfixer, Y4). Con una proposta in attesa le due in riga sono la decisione; «Apri il giro» va nel menu. */
  const vociMenu = [];
  if (giro.sessionId && onApri) {
    if (inAttesa && onProposta && onMenuGiro) {
      vociMenu.push({ chiave: 'apri', etichetta: traduci('sezioni.automations.v2.runs.open'), icona: 'i-doc', aziona: () => onApri(giro) });
    } else {
      const apri = el(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', traduci('sezioni.automations.v2.runs.open'));
      apri.type = 'button'; apri.dataset.autoGiroApri = '';
      apri.addEventListener('click', () => onApri(giro));
      azioni.append(apri);
    }
  }
  if (vociMenu.length) {
    const piu = el(doc, 'button', 'td-card-azioni');
    piu.type = 'button'; piu.dataset.autoGiroMenu = '';
    piu.setAttribute('aria-haspopup', 'menu');
    piu.setAttribute('aria-label', traduci('sezioni.automations.v2.runs.menuLabel'));
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-more'); svg.append(uso);
    piu.append(svg);
    piu.addEventListener('click', (e) => { e.stopPropagation(); onMenuGiro(vociMenu, { ancoraEl: piu }); });
    azioni.append(piu);
    // il tasto destro apre lo STESSO menu (come Libreria): due strade, una lista sola
    riga.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); onMenuGiro(vociMenu, { x: e.clientX, y: e.clientY }); });
  }
  if (giro.daGuardare && !giro.letta && onLetto && !inAttesa) {
    const letto = el(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', traduci('sezioni.automations.v2.runs.markRead'));
    letto.type = 'button'; letto.dataset.autoGiroLetto = '';
    letto.addEventListener('click', () => onLetto(giro));
    azioni.append(letto);
  }
  riga.append(testa);
  const corpo = giro.riassunto ?? giro.dettaglio ?? (giro.esito === 'finita' && !giro.daGuardare ? traduci('sezioni.automations.v2.runs.silent') : null);
  if (corpo) {
    const testo = el(doc, 'p', 'talos-automation__giro-testo', corpo.length > RIASSUNTO_IN_RIGA ? `${corpo.slice(0, RIASSUNTO_IN_RIGA).trimEnd()}…` : corpo);
    if (corpo.length > RIASSUNTO_IN_RIGA) {
      testo.tabIndex = 0; testo.dataset.autoGiroAccorciato = '';
      testo.title = traduci('sezioni.common.details');
      const espandi = () => { testo.textContent = corpo; delete testo.dataset.autoGiroAccorciato; testo.removeAttribute('tabindex'); };
      testo.addEventListener('click', espandi, { once: true });
      testo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); espandi(); } }, { once: true });
    }
    riga.append(testo);
  }
  if (inAttesa) riga.append(creaBloccoProposta(doc, proposta));
  if (azioni.children.length) riga.append(azioni);
  return riga;
}
