/*
 * PANNELLO v2 — la scheda AGENTI. Variante A approvata dall'owner il 27/10/2026 («la spina») con le barre del tempo della
 * variante B dentro il dettaglio (archivio/2026-10-29/mockup-tab-agenti-2026-10-27/RAPPORTO.md §3 e domanda 1).
 *
 * Prende il posto delle deleghe classiche (`disegnaAgenti`, `inspector.js:1518`). Il rail v2 del workflow resta com'è: quando la
 * sessione ha un workflow la scheda è sua (`agentiDelWorkflow`, `inspector.js:2108-2116`) e questo modulo non si chiama.
 *
 * ── I DATI, campo per campo (nessun campo inventato) ───────────────────────────────────────────────────────────────────────
 * dati.agenti   = `agentiPerInspector()` (legacy/app.js:12217-12228): ogni voce è uno `snapshotFiglio`
 *                 (src/subagent-orchestrator.mjs:420-490, GET /api/v1/sessions/:id/children, http-app.mjs:9158) più
 *                 `numeroFigli` e `richiesta {id, at, testo, corrente}` aggiunti dal client.
 *                 Campi letti: sessionId, padreId, nome, taskCorto, task, modello, permessi, conclusa, interrotta, esitoDelega,
 *                 ultimoEsito, motivoChiusura, avviataAlle, conclusaAlle, ultimaAttivitaAlle, approvalPendingCount,
 *                 questionPendingCount, usageSessione, attivita {chiamate, attrezzoCorrente, bersaglioCorrente, file[], fileTagliati,
 *                 passi[]}, operazioneCorrente, riassuntoDelega, notaDelega, collisioni[].
 * dati.domande  = { [sessionId]: { comando?: string, testo?: string } } — la domanda APERTA di una figlia. ⚠️ CABLAGGIO CLIENT:
 *                 oggi la legge `cartaDellaFiglia` (legacy/app.js:12292) per disegnare la carta in chat, ma non la passa al
 *                 pannello. Nessuna rotta nuova (MAPPA.md, A-07).
 * dati.errore   = `figliErrore` (legacy/app.js, passato in `azioniAgenti.errore`, :12994): la lettura di /children è fallita.
 * dati.adesso   = istante in ms (o funzione): fisso nelle prove, assente nell'app (vale `Date.now()`).
 *
 * ── LE AZIONI (tutte esistono già, tranne `rispondi`) ──────────────────────────────────────────────────────────────────────
 * azioni.apri(figlia)          = `apriAgenteDalPannello` (legacy/app.js:12567)
 * azioni.menu(figlia, dove)    = `menuDellaDelega` (legacy/app.js:12772): Apri la conversazione · Apri come sessione intera ·
 *                                Pausa · Riprendi · Riprova · Ferma — il menu lo apre l'app, con le sue regole
 * azioni.apriDiagramma(figlia) = `apriDiagramma({ figlia, tipo: 'deleghe' })` (legacy/app.js:12405, passato come `onGrafo`)
 * azioni.riprova(figlia)       = POST …/delegation/retry (lo stesso `controllo('retry')` di `menuDellaDelega`, :12812)
 * azioni.rispondi(figlia)      = ⚠️ NUOVO CABLAGGIO: porta alla carta del permesso della figlia, già disegnata nella chat del padre
 * azioni.scriviNelComposer(t)  = `preparaCommentoNelComposer` (legacy/app.js:19755; lo usa già «Affida all'agente», :21788)
 * azioni.ricarica()            = `caricaFigliSessione` (legacy/app.js:13032)
 * azioni.apriMenu(voci, dove)  = `apriMenuAzioniLibreria` (legacy/app.js:21359), per il «⋯» della testa
 */
import { t, tn } from '../lingua.js';
import { renderizzaMarkdown } from '../markdown.js';
import { fermataNellaLingua } from '../coda-messaggi.js';
import { statoDelPasso, nomeDellAgente, attivitaDellAgente, contiDellAgente, passiDellAgente, verboAttrezzo, nomeLeggibileAttrezzo } from './fonti.js';
import {
  el, icona, bottone, bottoneIcona, statoUi, disegnaScheda, testa, sezione, riga, piega, vuoto, scheletro, fatti, codice,
  durata, oraBreve, kilo, eseguiNellaRiga, normalizza, chiediConferma, perSessione, cifra,
} from './comune.js';

/* stato del diagramma (`statoDelPasso`) → parola delle DELEGHE (owner 14/10), tono, icona (`ICONA_TONO`, grafo/comuni.js:69) */
const STATI = Object.freeze({
  running: { chiave: 'agenti.agent.statusRunning', tono: 'corso', icona: 'i-play', gruppo: 'lavoro' },
  pending: { chiave: 'agenti.stepState.waiting', tono: 'neutro', icona: 'i-clock', gruppo: 'lavoro' },
  paused: { chiave: 'agenti.agent.statusPaused', tono: 'neutro', icona: 'i-pausa', gruppo: 'lavoro' },
  waiting_human: { chiave: 'agenti.stepState.waitingForYou', tono: 'avviso', icona: 'i-user', gruppo: 'attenzione' },
  failed: { chiave: 'agenti.agent.statusFailed', tono: 'errore', icona: 'i-x', gruppo: 'attenzione' },
  uncertain: { chiave: 'agenti.stepState.toVerify', tono: 'errore', icona: 'i-alert', gruppo: 'attenzione' },
  succeeded: { chiave: 'agenti.agent.statusDone', tono: 'ok', icona: 'i-check', gruppo: 'fine' },
  cancelled: { chiave: 'agenti.agent.statusStopped', tono: 'neutro', icona: 'i-stop', gruppo: 'fine' },
  /* niente perso (scheda di oggi, `statoDelega` inspector.js:1847): senza `conclusa` vera o falsa lo stato NON si sa, e si dice —
     dati incompleti non diventano un agente «in corso» (RIPRESA-AGENTI-STATO-IGNOTO) */
  unknown: { chiave: 'agenti.delegations.statusUnavailable', tono: 'neutro', icona: 'i-ignoto', gruppo: 'fine' },
});
const PERMESSI = Object.freeze({ 'read-only': 'agenti.agent.permissionReadOnly', 'workspace-write': 'agenti.agent.permissionWritesToProject' });
/* i filtri di oggi (`agenteNelFiltro`, inspector.js:1851): «Errori» comprende anche «Da verificare» */
const FILTRI = Object.freeze([
  ['tutti', 'pannello.agenti.filtroTutti', () => true],
  ['in-corso', 'agenti.agent.statusRunning', (v) => v.gruppo === 'lavoro'],
  ['attesa', 'pannello.agenti.filtroAspettano', (v) => v.passo === 'waiting_human'],
  ['errori', 'pannello.agenti.filtroErrori', (v) => v.passo === 'failed' || v.passo === 'uncertain'],
  ['conclusi', 'pannello.agenti.filtroConclusi', (v) => v.passo === 'succeeded'],
  ['fermati', 'pannello.agenti.filtroFermati', (v) => v.passo === 'cancelled'],
  /* i due filtri rari di oggi (`inspector.js:1597`): compaiono solo quando c'è chi li riempie, come gli altri chip */
  ['in-pausa', 'processi.agents.filterPaused', (v) => v.passo === 'paused'],
  ['ignoti', 'processi.agents.filterUnavailable', (v) => v.passo === 'unknown'],
]);

const istante = (v) => { const n = typeof v === 'string' ? Date.parse(v) : Number(v); return Number.isFinite(n) ? n : null; };
const corto = (modello) => (typeof modello === 'string' && modello ? modello.split('/').at(-1) : null); // regola 13/10
const adessoDi = (dati) => (typeof dati?.adesso === 'function' ? dati.adesso() : Number.isFinite(dati?.adesso) ? dati.adesso : Date.now());

/**
 * Il modello di vista: PURO (niente DOM), così le prove lo leggono con i dati veri.
 * @returns {{ richiesta: object|null, correnti: object[], passate: {richiesta:object, agenti:object[]}[], conto: object, per: Map }}
 */
export function modelloAgenti(dati = {}) {
  const adesso = adessoDi(dati);
  const tutti = Array.isArray(dati.agenti) ? dati.agenti : [];
  const per = new Map();
  for (const a of tutti) {
    if (typeof a?.sessionId !== 'string') continue;
    let passo = statoDelPasso(a);
    if (passo === 'waiting_human' && (a.esitoDelega === 'in-pausa' || a.motivoChiusura === 'in-pausa')) passo = 'paused'; // inspector.js:1799
    if (a.conclusa !== true && a.conclusa !== false && passo !== 'waiting_human') passo = 'unknown';
    const s = STATI[passo] ?? STATI.running;
    const inizio = istante(a.avviataAlle);
    const fine = a.conclusa === true ? istante(a.conclusaAlle) : null;
    const att = attivitaDellAgente(a, passo === 'running' ? 'running' : passo);
    const conti = contiDellAgente(a);
    const domanda = dati.domande?.[a.sessionId] ?? null;
    per.set(a.sessionId, {
      id: a.sessionId, figlia: a, padre: a.padreId ?? null, richiesta: a.richiesta ?? null,
      nome: nomeDellAgente(a, 80) || t('pannello.agenti.senzaNome'), compito: a.task || a.taskCorto || '',
      passo, parola: t(s.chiave), tono: s.tono, icona: s.icona, gruppo: s.gruppo,
      modello: corto(a.modello), permessi: PERMESSI[a.permessi] ? t(PERMESSI[a.permessi]) : null,
      inizio, fine, ultima: istante(a.ultimaAttivitaAlle) ?? fine ?? inizio,
      attivita: testoAttivita(att, passo, a, fine),
      conti: { chiamate: conti.calls, file: conti.files, token: conti.tokens },
      file: (a.attivita?.file ?? []).map((f) => ({ percorso: f.percorso, segno: f.creato ? 'creato' : f.scritto ? 'modificato' : 'letto' })),
      fileAltri: a.attivita?.fileTagliati ?? 0,
      passi: passiDellAgente(a).map((p) => ({ at: istante(p.at), testo: p.kind === 'tool' ? `${verboAttrezzo(p.tool)[0]} ${p.target ?? ''}`.trim() : t(`pannello.agenti.passo.${p.kind}`) })),
      motivo: passo === 'failed' ? (a.riassuntoDelega || a.erroreConsegnaDelega || null) : passo === 'uncertain' ? (a.notaDelega || null) : null,
      /* owner 29/10/2026 notte: «Che cosa ha riportato» anche nel dettaglio (a un clic, come la pagina dell'agente: dettaglio-agente.js:207).
         Solo il testo con cui la figlia ha chiuso; per chi è fallito il resoconto è già il motivo, e non si ripete. */
      resoconto: passo !== 'failed' && typeof a.riassuntoDelega === 'string' && a.riassuntoDelega.trim() ? a.riassuntoDelega : null,
      domanda: passo === 'waiting_human' ? domanda : null,
      collisioni: Array.isArray(a.collisioni) ? a.collisioni : [],
      figli: [],
      durata: inizio === null ? null : (fine ?? adesso) - inizio,
    });
  }
  for (const v of per.values()) if (per.has(v.padre)) per.get(v.padre).figli.push(v);
  const radice = (v) => !per.has(v.padre);
  const correnti = [...per.values()].filter((v) => v.richiesta?.corrente !== false);
  const richiesta = correnti.find((v) => v.richiesta)?.richiesta ?? null;
  const gruppiPassati = new Map();
  for (const v of per.values()) {
    if (v.richiesta?.corrente !== false) continue;
    if (!gruppiPassati.has(v.richiesta.id)) gruppiPassati.set(v.richiesta.id, { richiesta: v.richiesta, agenti: [] });
    gruppiPassati.get(v.richiesta.id).agenti.push(v);
  }
  /* `at` è testo ISO (run-dalle-deleghe.js:174): sottrarre due testi dava NaN e l'ordine delle passate era casuale */
  const passate = [...gruppiPassati.values()].sort((a, b) => (istante(b.richiesta.at) ?? 0) - (istante(a.richiesta.at) ?? 0));
  return { richiesta, correnti, passate, conto: contoDi(correnti), per, radice, adesso };
}

/** «5 agenti · 2 di 5 terminati · 2 da guardare»: le regole di `contoDellaRichiesta` (inspector.js:1826) e del diagramma. */
function contoDi(lista) {
  const terminati = lista.filter((v) => ['succeeded', 'failed', 'cancelled'].includes(v.passo)).length;
  const aspettano = lista.filter((v) => v.passo === 'waiting_human').length;
  const daGuardare = lista.filter((v) => v.passo === 'failed' || v.passo === 'uncertain').length;
  return { totale: lista.length, terminati, aspettano, daGuardare, attenzione: aspettano + daGuardare, inCorso: lista.filter((v) => v.gruppo === 'lavoro').length };
}

function testoAttivita(att, passo, a, fine) {
  if (passo === 'cancelled') return { testo: fine ? t('pannello.agenti.fermatoAlle', { ora: oraBreve(fine) }) : t('agenti.agent.statusStopped'), vivo: false };
  if (passo === 'paused') return { testo: t('pannello.agenti.inPausaRiprendi'), vivo: false };
  if (passo === 'unknown') return { testo: t('agenti.delegations.statusUnavailable'), vivo: false }; // detto in chiaro, come oggi
  switch (att?.kind) {
    case 'reasoning': return { testo: t('agenti.delegations.opReasoning'), vivo: true };
    case 'responding': return { testo: t('agenti.delegations.opResponding'), vivo: true };
    case 'tool': { const file = att.target ? att.target.split('/').filter(Boolean).at(-1) : null; return { testo: file ? `${verboAttrezzo(att.tool)[1]} ${file}` : nomeLeggibileAttrezzo(att.tool), vivo: true }; }
    case 'between': return { testo: t('agenti.delegations.betweenOperations'), vivo: true };
    case 'last': return { testo: t('agenti.delegations.lastActivityAt', { ora: oraBreve(Date.parse(att.at)) }), vivo: false };
    default: {
      const ultima = istante(a.ultimaAttivitaAlle) ?? fine;
      return ultima ? { testo: t('agenti.delegations.lastActivityAt', { ora: oraBreve(ultima) }), vivo: false } : { testo: t('agenti.delegations.noActivityRecorded'), vivo: false };
    }
  }
}

/** Il conto sulla scheda: chi lavora, e il pallino se qualcuno ti aspetta o è da guardare. */
export function contoAgenti(dati = {}) {
  const { conto } = modelloAgenti(dati);
  if (!conto.totale) return { numero: null, attenzione: 0 };
  return {
    numero: conto.inCorso + conto.aspettano || null, // U-10: a zero niente numero (un «0» accanto al nome è rumore, owner 20/09)
    attenzione: conto.attenzione,
    descrizione: [tn('pannello.agenti.contoInCorsoOne', 'pannello.agenti.contoInCorsoMany', conto.inCorso), conto.attenzione ? tn('pannello.agenti.daGuardareOne', 'pannello.agenti.daGuardareMany', conto.attenzione) : null].filter(Boolean).join(' · '),
  };
}

/**
 * Disegna la scheda Agenti in `contenitore` (`#railAgenti`).
 * @param {HTMLElement} contenitore
 * @param {object} dati vedi l'intestazione
 * @param {object} azioni vedi l'intestazione
 */
export function disegnaAgenti(contenitore, dati = {}, azioni = {}, { interno = false } = {}) {
  const ui = statoUi(contenitore);
  perSessione(ui, dati.sessione); // al cambio di conversazione niente righe aperte, conferme o ricerca di quella prima
  ui.dati = dati; ui.azioni = azioni;
  ui.ridisegna = () => disegnaAgenti(contenitore, ui.dati, ui.azioni, { interno: true });
  disegnaScheda(contenitore, (d) => costruisci(d, ui, dati, azioni), { interno });
}

function costruisci(d, ui, dati, azioni) {
  if (dati.inCaricamento === true && !dati.agenti?.length) return [scheletro(d)];
  const m = modelloAgenti(dati);
  const locale = d.documentElement.lang || undefined;
  const avvisoErrore = dati.errore ? erroreDati(d, dati.errore, azioni) : null;
  if (!m.correnti.length && !m.passate.length) {
    /* niente perso: anche senza agenti la testa porta il diagramma (oggi «Apri visuale diagramma» c'è pure a scheda vuota, e il
       diagramma nuovo ha il suo stato vuoto: DELEGHE-DIAGRAMMA-03) */
    const testaVuota = azioni.apriDiagramma ? testa(d, ui, {
      quando: t('pannello.agenti.questaConversazione'), titolo: t('pannello.agenti.titoloSenzaRichiesta'),
      azioni: [bottoneIcona(d, { id: 'i-coordina', etichetta: t('agenti.rail.openDiagram'), chiave: 'apri-diagramma', fai: () => azioni.apriDiagramma(null) })],
    }) : null;
    return [testaVuota, avvisoErrore, vuoto(d, {
      testo: t('pannello.agenti.vuoto'),
      azione: azioni.scriviNelComposer ? { etichetta: t('pannello.agenti.vuotoAzione'), fai: () => azioni.scriviNelComposer(t('pannello.agenti.vuotoRichiesta')) } : null,
    })];
  }
  const filtro = FILTRI.find(([k]) => k === ui.filtro) ?? FILTRI[0];
  const testo = normalizza(ui.cerca.testo.trim());
  const passa = (v) => filtro[2](v) && (!testo || normalizza(`${v.nome} ${v.compito} ${v.modello ?? ''}`).includes(testo));
  const filtrando = filtro[0] !== 'tutti' || Boolean(testo);
  /* niente perso (DELEGHE-DIAGRAMMA-10): chi cerca un agente non sa in quale richiesta stava ⇒ ricerca e filtri guardano ANCHE le
     richieste passate, che altrimenti restano ripiegate sotto */
  const tutti = [...m.correnti, ...m.passate.flatMap((p) => p.agenti)];
  const visibili = (filtrando ? tutti : m.correnti).filter(passa);

  /* ── testa ── */
  /* i conti raggruppati nella lingua (R4-COUNT-LOCALE-5000): `tn` sceglie la forma sul numero vero, il testo porta quello scritto */
  const conto = [tn('pannello.agenti.agentiOne', 'pannello.agenti.agentiMany', m.conto.totale, { n: cifra(m.conto.totale) }), t('agenti.graph.finishedOf', { fatti: cifra(m.conto.terminati), totale: cifra(m.conto.totale) })];
  if (m.conto.attenzione) conto.push({ testo: t('agenti.graph.toCheck', { n: cifra(m.conto.attenzione) }), tono: 'avviso' });
  const chips = el(d, 'div', 'pn-chips');
  /* la rotella verticale fa scorrere la riga dei filtri quando non ci sta (TACCUINO-FILTRI, 09/10: una riga sola che scorre) */
  chips.addEventListener('wheel', (e) => { if (chips.scrollWidth > chips.clientWidth + 1 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { chips.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  /* …e dice da che parte c'è ancora qualcosa: il bordo sfuma solo dove un filtro è tagliato (oggi `data-taglio`, Hermes `fade-scroll.tsx`) */
  const taglia = () => { const prima = chips.scrollLeft > 1; const dopo = chips.scrollLeft + chips.clientWidth < chips.scrollWidth - 1; chips.dataset.taglio = prima && dopo ? 'entrambi' : prima ? 'prima' : dopo ? 'dopo' : 'nessuno'; };
  chips.addEventListener('scroll', taglia, { passive: true });
  (globalThis.requestAnimationFrame ?? setTimeout)(taglia);
  if (typeof globalThis.ResizeObserver === 'function') new globalThis.ResizeObserver(taglia).observe(chips);
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', t('pannello.agenti.filtroEtichetta'));
  for (const [k, chiave, f] of FILTRI) {
    const n = k === 'tutti' ? tutti.length : tutti.filter(f).length;
    if (k !== 'tutti' && n === 0) continue;
    const b = el(d, 'button', 'pn-chip', t(chiave));
    b.type = 'button';
    b.dataset.controllo = `filtro-${k}`;
    b.setAttribute('aria-pressed', String(k === filtro[0]));
    b.append(el(d, 'span', 'pn-mono', ` ${n}`));
    b.addEventListener('click', (e) => { e.stopPropagation(); ui.filtro = k; ui.ridisegna(); });
    chips.append(b);
  }
  const intestazione = testa(d, ui, {
    /* 30/10/2026, trovato fotografando il 4174 («Questa richiesta ·» e il vuoto): l'ora della richiesta arriva come testo ISO
       (`run-dalle-deleghe.js:174`, la stessa divisione del diagramma) e `oraBreve` vuole un numero ⇒ si passa da `istante`. Se l'ora
       non c'è davvero, resta «Questa richiesta» senza il separatore davanti al vuoto. */
    quando: m.richiesta
      ? [t('agenti.workflow.requestThis'), oraBreve(istante(m.richiesta.at), locale)].filter(Boolean).join(' · ')
      : t('pannello.agenti.questaConversazione'),
    titolo: m.richiesta?.testo || t('pannello.agenti.titoloSenzaRichiesta'),
    conto,
    azioni: azioni.apriDiagramma ? [bottoneIcona(d, { id: 'i-coordina', etichetta: t('agenti.rail.openDiagram'), chiave: 'apri-diagramma', fai: () => azioni.apriDiagramma(null) })] : [],
    cerca: { segnaposto: t('pannello.agenti.cercaSegnaposto'), etichetta: t('pannello.agenti.cercaEFiltra'), filtri: chips, conto: filtrando ? t('pannello.agenti.contoFiltrati', { n: cifra(visibili.length), totale: cifra(tutti.length) }) : null },
    menu: [
      azioni.apriDiagramma ? { chiave: 'diagramma', etichetta: t('pannello.agenti.apriDiagrammaDeleghe'), icona: 'i-coordina', aziona: () => azioni.apriDiagramma(null) } : null,
      m.passate.length ? { chiave: 'passate', etichetta: ui.piegheAperte.has('passate-tutte') ? t('pannello.agenti.chiudiPassate') : t('pannello.agenti.apriPassate'), icona: 'i-history', aziona: () => { const k = 'passate-tutte'; if (ui.piegheAperte.has(k)) { ui.piegheAperte.delete(k); for (const p of m.passate) ui.piegheAperte.delete(`richiesta-${p.richiesta.id}`); } else { ui.piegheAperte.add(k); for (const p of m.passate) ui.piegheAperte.add(`richiesta-${p.richiesta.id}`); } ui.ridisegna(); } } : null,
      azioni.ricarica ? { chiave: 'ricarica', etichetta: t('pannello.comune.aggiorna'), icona: 'i-history', separaPrima: true, aziona: () => azioni.ricarica() } : null,
    ].filter(Boolean),
  });

  /* ── le tre sezioni: chi chiede attenzione in cima (Codex «NeedsYou» prima di tutto), poi chi lavora, poi chi ha finito ── */
  const pezzi = [intestazione, avvisoErrore];
  const attenzione = visibili.filter((v) => v.gruppo === 'attenzione');
  /* un figlio di chi sta in «Richiede attenzione» (che lì non porta figli) sale in cima alla SUA sezione: nessun agente sparisce */
  const inCima = (v) => filtrando || m.radice(v) || m.per.get(v.padre)?.gruppo === 'attenzione';
  /* i figli stanno SOTTO il padre, nella sua sezione (chi richiede attenzione sale comunque in cima, una volta sola) */
  const discendenti = (v) => v.figli.filter((f) => f.gruppo !== 'attenzione').flatMap((f) => [{ v: f, figlio: true }, ...discendenti(f)]);
  const conFigli = (lista) => lista.flatMap((v) => [{ v, figlio: false }, ...(filtrando ? [] : discendenti(v))]);
  const lavoro = conFigli(visibili.filter((v) => v.gruppo === 'lavoro' && inCima(v)));
  const fine = conFigli(visibili.filter((v) => v.gruppo === 'fine' && inCima(v)));
  pezzi.push(
    sezione(d, { ui, chiave: 'attenzione', titolo: t('agenti.rail.filterAttention'), conto: attenzione.length, attenzione: true }, attenzione.map((v) => rigaAgente(d, ui, m, v, azioni, { attenzione: true }))),
    sezione(d, { ui, chiave: 'lavoro', titolo: t('agenti.family.inProgress'), conto: lavoro.filter((x) => x.v.gruppo === 'lavoro').length, spina: true }, lavoro.map(({ v, figlio }) => () => rigaAgente(d, ui, m, v, azioni, { figlio }))),
    sezione(d, { ui, chiave: 'fine', titolo: t('pannello.agenti.terminati'), conto: fine.filter((x) => x.v.gruppo === 'fine').length, spina: true }, fine.map(({ v, figlio }) => () => rigaAgente(d, ui, m, v, azioni, { figlio }))),
  );
  if (filtrando && !visibili.length) pezzi.push(vuoto(d, { testo: t('pannello.agenti.nessunoNelFiltro'), azione: { etichetta: t('pannello.comune.togliFiltri'), fai: () => { ui.filtro = 'tutti'; ui.cerca.testo = ''; ui.ridisegna(); } } }));

  /* ── le richieste passate, chiuse in fondo (owner 12/10: «prima la richiesta in corso, le passate chiuse sotto») ── */
  if (!filtrando) {
    for (const p of m.passate) {
      const c = contoDi(p.agenti);
      pezzi.push(piega(d, ui, {
        chiave: `richiesta-${p.richiesta.id}`,
        titolo: `${t('agenti.workflow.requestAt', { ora: oraBreve(istante(p.richiesta.at), locale) })} · ${p.richiesta.testo ?? ''}`,
        sotto: [tn('pannello.agenti.agentiOne', 'pannello.agenti.agentiMany', c.totale, { n: cifra(c.totale) }), c.attenzione ? t('agenti.graph.toCheck', { n: cifra(c.attenzione) }) : c.terminati === c.totale ? t('agenti.workflow.requestAllDone') : t('agenti.graph.finishedOf', { fatti: cifra(c.terminati), totale: cifra(c.totale) })].join(' · '),
        contenuto: () => p.agenti.filter((v) => !p.agenti.some((x) => x.id === v.padre)).flatMap((v) => [rigaAgente(d, ui, m, v, azioni, {}), ...v.figli.map((f) => rigaAgente(d, ui, m, f, azioni, { figlio: true }))]),
      }));
    }
  }
  return pezzi;
}

/**
 * Tante deleghe: oggi la scheda ha «Precedente / Successiva» (`inspector.js:1530`, 25 per pagina). Nel pannello v2 ogni sezione
 * ha la STESSA barra (`elencoPaginato` di `comune.js`), e la pagina è grande quanto lo spazio della colonna (owner 29/10 sera).
 * `PAGINA_AGENTI` resta solo come la misura di oggi, per le prove.
 */
export const PAGINA_AGENTI = 25;

function erroreDati(d, errore, azioni) {
  const box = el(d, 'div', 'pn-avviso');
  box.setAttribute('role', 'status');
  box.append(icona(d, 'i-alert'), el(d, 'span', '', t('pannello.agenti.datiVecchi', { errore })));
  if (azioni.ricarica) box.append(bottone(d, { etichetta: t('pannello.comune.riprova'), variante: 'ghost', fai: () => azioni.ricarica(), chiave: 'ricarica' }));
  return box;
}

function rigaAgente(d, ui, m, v, azioni, { attenzione = false, figlio = false }) {
  const padre = m.per.get(v.padre);
  let perche = null;
  if (attenzione) {
    perche = el(d, 'span', 'pn-perche__corpo');
    if (v.passo === 'waiting_human' && v.domanda?.comando) perche.append(el(d, 'span', '', t('pannello.agenti.vuoleEseguire')), codice(d, v.domanda.comando));
    else if (v.passo === 'waiting_human' && v.domanda?.testo) perche.append(el(d, 'span', '', t('pannello.agenti.haUnaDomanda', { domanda: v.domanda.testo })));
    else if (v.passo === 'waiting_human') perche.append(el(d, 'span', '', t('pannello.agenti.aspettaLaTuaRisposta')));
    else perche.append(el(d, 'span', '', v.motivo || (v.passo === 'uncertain' ? t('pannello.agenti.senzaProve') : t('pannello.agenti.senzaMotivo'))));
  }
  const sotto = attenzione
    ? [v.parola, padre ? t('pannello.agenti.dentro', { nome: padre.nome }) : null, v.modello].filter(Boolean).join(' · ')
    : rigaSotto(d, v);
  const azioniRiga = [];
  if (attenzione && v.passo === 'waiting_human' && azioni.rispondi) {
    azioniRiga.push(bottone(d, { etichetta: t('pannello.agenti.rispondi'), chiave: 'rispondi', fai: () => eseguiNellaRiga(ui, v.id, () => azioni.rispondi(v.figlia), { inCorso: t('pannello.agenti.rispondiInCorso'), fatto: (r) => r?.testo ?? t('pannello.agenti.rispostoFatto') }) }));
  }
  if (attenzione && v.passo === 'failed' && azioni.riprova) {
    azioniRiga.push(bottone(d, { etichetta: t('pannello.agenti.riprova'), variante: 'secondary', chiave: 'riprova', fai: () => eseguiNellaRiga(ui, v.id, () => azioni.riprova(v.figlia), { inCorso: t('pannello.agenti.riprovaInCorso'), fatto: t('pannello.agenti.riprovaFatto') }) }));
  }
  if (attenzione && v.passo === 'uncertain') {
    azioniRiga.push(bottone(d, { etichetta: t('pannello.agenti.controlla'), variante: 'secondary', chiave: 'controlla', fai: () => { ui.aperte.add(v.id); ui.fuoco = v.id; ui.ridisegna(); } }));
  }
  /* ⭐ Decisione owner 2 (29/10/2026): «Ferma» si conferma NELLA RIGA, non con la modale di oggi (`menuDellaDelega` riceve chi
     chiede la conferma). Se l'agente finisce da solo mentre la conferma è aperta, la conferma sparisce e la riga lo dice: non si
     offre di fermare ciò che è già fermo. */
  if (ui.conferme.get(v.id)?.tipo === 'ferma' && v.gruppo !== 'lavoro' && v.passo !== 'waiting_human') {
    ui.conferme.delete(v.id);
    ui.esiti.set(v.id, { stato: 'ok', testo: t('pannello.agenti.giaFinito') });
  }
  const chiediFerma = azioni.ferma ? () => chiediConferma(ui, v.id, {
    tipo: 'ferma', domanda: t('app.delegations.stopTitle'),
    conseguenza: `${t('app.delegations.menu.stopQuestion')} ${t('app.delegations.menu.stopConsequence')}`,
    etichetta: t('app.delegations.menu.stopConfirm'),
    fai: () => eseguiNellaRiga(ui, v.id, () => azioni.ferma(v.figlia), { inCorso: t('pannello.agenti.fermaInCorso'), fatto: t('pannello.agenti.fermato') }),
  }) : null;
  const nodo = riga(d, ui, {
    chiave: v.id, tono: v.tono, icona: v.icona, parolaStato: v.parola, nome: v.nome, figlio, vivo: v.passo === 'running',
    perche, sotto,
    dal: v.fine === null && v.inizio !== null && v.gruppo !== 'fine' ? v.inizio : undefined,
    lato: v.fine !== null || v.inizio === null ? durata(v.durata) : null,
    azioni: azioniRiga,
    apriMenu: azioni.menu ? (dove) => azioni.menu(v.figlia, dove.ancoraEl ? { ancora: dove.ancoraEl } : dove, { chiediFerma }) : null,
    /* pannello → diagramma (DELEGHE-DIAGRAMMA-06): a diagramma aperto la riga scelta lo porta sul suo agente; il dettaglio si apre lo stesso */
    alClic: azioni.seleziona ? () => azioni.seleziona(v.figlia) : null,
    dettaglio: () => dettaglioAgente(d, ui, m, v, azioni),
  });
  /* l'evidenza che il diagramma chiede al pannello (`evidenziaAgenteNelPannello`, legacy/app.js): stesso attributo di oggi */
  nodo.dataset.sessioneFiglia = v.id;
  nodo.dataset.stato = v.passo;
  nodo.dataset.c = 'AgentRow'; // il nome di componente di oggi: chi cerca le righe degli agenti (prove, evidenza) le trova ancora
  if (ui.dati?.evidenziato === v.id) { nodo.dataset.evidenziata = 'true'; nodo.setAttribute('aria-current', 'true'); }
  return nodo;
}

function rigaSotto(d, v) {
  const box = el(d, 'span', 'pn-sotto__blocco');
  const linea = el(d, 'span', 'pn-sotto__righe');
  linea.append(el(d, 'span', `pn-tronca pn-sotto__attivita${v.attivita.vivo ? ' pn-vivo-testo' : ''}`, v.attivita.testo));
  if (v.modello) linea.append(el(d, 'span', 'pn-sotto__modello pn-tronca', `· ${v.modello}`));
  box.append(linea);
  if (v.collisioni.length) {
    const a = el(d, 'span', 'pn-sotto__avviso');
    a.append(icona(d, 'i-alert'), el(d, 'span', 'pn-tronca', t('pannello.agenti.collisione', { file: v.collisioni[0].percorso?.split('/').at(-1) ?? '' })));
    a.title = v.collisioni[0].percorso ?? '';
    box.append(a);
  }
  return box;
}

function dettaglioAgente(d, ui, m, v, azioni) {
  const box = el(d, 'div', 'pn-dettaglio__corpo');
  const compito = el(d, 'p', `pn-compito${ui.aperte.has(`${v.id}#compito`) ? ' pn-compito--intero' : ''}`, v.compito);
  box.append(compito);
  if (v.compito.length > 140) {
    const tutto = el(d, 'button', 'pn-link', ui.aperte.has(`${v.id}#compito`) ? t('pannello.agenti.compitoMeno') : t('pannello.agenti.compitoTutto'));
    tutto.type = 'button';
    tutto.dataset.controllo = 'compito';
    tutto.addEventListener('click', () => { const k = `${v.id}#compito`; if (ui.aperte.has(k)) ui.aperte.delete(k); else ui.aperte.add(k); ui.ridisegna(); });
    box.append(tutto);
  }
  if (v.resoconto) {
    const r = el(d, 'div', 'pn-resoconto');
    r.append(el(d, 'p', 'pn-sezione__titolo', t('agenti.agent.reported')), renderizzaMarkdown(fermataNellaLingua(v.resoconto), { document: d, linkMarkdown: true }));
    box.append(r);
  }
  const padre = m.per.get(v.padre);
  box.append(fatti(d, [
    [t('pannello.agenti.modello'), v.modello],
    [t('pannello.agenti.permessi'), v.permessi],
    [t('pannello.agenti.avviato'), oraBreve(v.inizio)],
    [v.fine !== null ? t('pannello.agenti.durata') : t('pannello.agenti.inCorsoDa'), durata(v.durata)],
    [t('agenti.workflow.startedBy'), padre ? padre.nome : t('pannello.agenti.questaConversazione')],
    [t('agenti.workflow.itStarted'), v.figli.length ? v.figli.map((f) => f.nome).join(', ') : null],
  ]));
  const numeri = [
    Number.isFinite(v.conti.chiamate) ? tn('pannello.agenti.chiamateOne', 'pannello.agenti.chiamateMany', v.conti.chiamate) : null,
    Number.isFinite(v.conti.file) ? tn('pannello.agenti.fileOne', 'pannello.agenti.fileMany', v.conti.file) : null,
    Number.isFinite(v.conti.token) ? tn('pannello.agenti.tokenOne', 'pannello.agenti.tokenMany', v.conti.token, { k: kilo(v.conti.token) }) : null,
  ].filter(Boolean);
  if (numeri.length) box.append(el(d, 'div', 'pn-mono pn-conti', numeri.join(' · ')));
  box.append(binari(d, m, v));
  if (v.file.length) {
    const f = el(d, 'ul', 'pn-file-agente');
    for (const x of v.file.slice(0, 3)) { const li = el(d, 'li'); li.append(el(d, 'span', `pn-segnofile pn-segnofile--${x.segno}`, t(`pannello.agenti.segno.${x.segno}`)), el(d, 'span', 'pn-tronca', x.percorso)); li.title = x.percorso; f.append(li); }
    const altri = v.file.length - 3 + (v.fileAltri || 0);
    if (altri > 0) f.append(el(d, 'li', 'pn-altri', t('pannello.comune.altri', { n: altri })));
    box.append(f);
  }
  if (v.passi.length) {
    const p = el(d, 'ol', 'pn-passi');
    p.setAttribute('aria-label', t('pannello.agenti.ultimiPassi'));
    for (const x of v.passi.slice(-4)) { const li = el(d, 'li'); li.append(el(d, 'span', 'pn-mono', oraBreve(x.at)), el(d, 'span', 'pn-tronca', x.testo)); li.title = x.testo; p.append(li); }
    box.append(p);
  }
  const piede = el(d, 'div', 'pn-piede');
  if (azioni.apri) piede.append(bottone(d, { etichetta: t('pannello.agenti.apriConversazione'), variante: 'secondary', chiave: 'apri-conversazione', fai: () => azioni.apri(v.figlia) }));
  if (azioni.apriDiagramma) piede.append(bottone(d, { etichetta: t('pannello.agenti.mostraNelDiagramma'), variante: 'ghost', chiave: 'mostra-diagramma', fai: () => azioni.apriDiagramma(v.figlia) }));
  box.append(piede);
  return box;
}

/**
 * Le barre del tempo della variante B, dentro il dettaglio: tutti gli agenti della stessa richiesta su un asse COMUNE (dall'ora
 * della richiesta ad «ora»), quello aperto in evidenza, i suoi passi come tacche. Si vede chi ha lavorato in parallelo a chi e
 * chi ha aspettato — nessun concorrente letto lo mostra (RICERCA, §4 «Debolezze»).
 */
function binari(d, m, v) {
  const fratelli = (v.richiesta?.corrente === false ? [...m.per.values()].filter((x) => x.richiesta?.id === v.richiesta.id) : m.correnti).filter((x) => x.inizio !== null);
  const da = Math.min(v.richiesta?.at ?? Infinity, ...fratelli.map((x) => x.inizio));
  const a = Math.max(m.adesso, ...fratelli.map((x) => x.fine ?? 0));
  const scala = (ms) => `${(((ms - da) / Math.max(1, a - da)) * 100).toFixed(2)}%`;
  const box = el(d, 'div', 'pn-binari');
  const pista = el(d, 'div', 'pn-binari__pista');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', t('pannello.agenti.binariEtichetta', { nome: v.nome, da: oraBreve(v.inizio), a: v.fine ? oraBreve(v.fine) : t('pannello.agenti.ora') }));
  for (const x of fratelli.slice(0, 12)) {
    const riga1 = el(d, 'div', `pn-binario${x.id === v.id ? ' pn-binario--scelto' : ''}`);
    const barra = el(d, 'span', 'pn-binario__barra');
    barra.dataset.tono = x.tono;
    barra.style.left = scala(x.inizio);
    barra.style.width = `calc(${scala(x.fine ?? m.adesso)} - ${scala(x.inizio)})`;
    riga1.append(barra);
    if (x.id === v.id) for (const p of x.passi) if (Number.isFinite(p.at)) { const tac = el(d, 'i', 'pn-binario__tacca'); tac.style.left = scala(p.at); riga1.append(tac); }
    pista.append(riga1);
  }
  const asse = el(d, 'div', 'pn-binari__asse');
  asse.append(el(d, 'span', 'pn-mono', oraBreve(da)), el(d, 'span', 'pn-mono', t('pannello.agenti.ora')));
  const linea = el(d, 'i', 'pn-binari__ora');
  linea.style.left = scala(m.adesso);
  pista.append(linea);
  box.append(pista, asse);
  return box;
}
