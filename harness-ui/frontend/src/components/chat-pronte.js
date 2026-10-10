/*
 * ⭐ B1 (owner 10/10/2026, AskUserQuestion: «Le ultime 3, con un tetto di memoria») — LE CHAT TENUTE PRONTE.
 *
 * Misurato sul banco GLM (300 giri, giornale da 82,6 MB, server r4 sulla 4176): il RITORNO a una chat lunga dopo averne aperta
 *   un'altra costava 1,54-1,65 s — primo byte del flusso a ~190 ms, poi 780 ms del nostro JS a rigiocare tutta la storia e 380 ms
 *   di stile e impaginazione. Le micro-cure erano finite (un memo nel filtro di calm-controls: A/B nel rumore). Il passo che resta
 *   è NON rigiocare: la vista delle ultime chat resta montata (staccata dal documento) e al ritorno si chiedono al server solo gli
 *   eventi nuovi (`/events?after=<ultima sequenza vista>`, http-app.mjs).
 * ⭐ Hermes, letto nel codice (hermes-agent-2026-10-07, apps/desktop): `src/app/session/session-state-cache.ts:3-4` — LRU di 24
 *   trascritti e 32 MB; le chat vive, quella visibile e le bozze stanno fuori dai limiti; e le schede inattive restano montate sotto
 *   un antenato `data-pane-hidden` (`e2e/warm-resume-jitter.spec.ts`: al ritorno zero aggiunte, zero riconciliazioni). VS Code
 *   (`retainContextWhenHidden`): tenere vivo costa memoria, si fa solo dove ricostruire è lento — qui lo è.
 *
 * Questo modulo è la parte PURA: quante e quali chat si tengono, cosa conta come «ferma», e quali campi dello stato sono della
 *   singola chat. Il travaso del DOM e dello stato lo fa `app.js` (`parcheggiaChatAperta` / `rimettiChatPronta`).
 */

export const CHAT_PRONTE_MASSIME = 3;
/* Il tetto di memoria, in nodi montati (la colonna + i turni già staccati dalla finestra di replay). Un turno del banco GLM pesa
   ~400 nodi: 150.000 nodi sono ~370 turni montati in tutto, cioè una chat da 300 giri e un'altra media. */
export const NODI_PRONTI_MASSIMI = 150_000;

/*
 * I campi di `state.realSession` che appartengono alla SINGOLA chat. ⛔ La regola: sono esattamente quelli che
 *   `nuovaGenerazioneSessione` rimette a zero quando si cambia chat (più quelli di `azzeraSchedaContesto`) — il reset È
 *   l'inventario. Così una chat ripresa torna come un'apertura normale l'avrebbe ricostruita, né più né meno.
 *   `tests/unit/chat-pronte.test.mjs` legge il reset in `app.js` e diventa rossa se un campo nuovo non è in una delle due liste.
 */
export const CAMPI_DELLA_CHAT = Object.freeze([
  'approvazioniPendenti', 'attesaAperturaSequenza', 'attesaBubble', 'batchAttivo', 'browserIndice', 'browserPagine',
  'cachePromptPrecedenti', 'cacheSessione', 'carteDelleFiglie', 'cartellaAssoluta', 'codaInPausa', 'codaMessaggi',
  'comandiInVolo', 'currentRunModel', 'domandeDelleFiglie', 'domandePendenti', 'durateRagionamento', 'eventiAttrezzi',
  'eventiUsageContesto', 'fileSelezionati', 'followUpBubbleInAttesa', 'messageElements', 'previewProjectId',
  'previewWorkspaceName', 'prossimoOrdineAttivita', 'ragionamentoBubble', 'redirectInvalidatedIds', 'redirectPendingId',
  'redirectRequestInFlight', 'redirectRequestIntentId', 'renderIncrementale', 'reviewFiles', 'richiesteMcpPendenti', 'runCount',
  'segmentoAttivo', 'sequenzeViste', 'taskBubbleMostrata', 'testoGrezzoMessaggi', 'tettoGiriDichiarato', 'treeCache', 'treeOpen',
  'treeUiRestored', 'ultimaRichiesta', 'ultimoBatchChiuso', 'usage', 'usageEsecuzioniPrecedenti', 'usageSessione', 'usciteAgente',
  // `azzeraSchedaContesto` (C1, sessione desktop): la scheda Contesto della chat
  'richiestaDelGiro', 'politicaContesto', 'compattazioniLegacy', 'recordCompattazioneLegacy',
  /* ⛔ E quelli che il reset NON tocca ma la RIGIOCATA riscrive (il `RunStarted`, i comandi della persona, gli esiti degli attrezzi):
     senza rigiocata resterebbero ai valori della chat di prima. Trovati leggendo ogni scrittura in `app.js` (10/10/2026). */
  'contesto', 'ultimaDomanda', 'giroComandoDiretto', 'comandoDirettoDaAprire', 'ultimoBersaglioAttrezzo', 'ragionamentiInCorso',
]);
/* Azzerati anche loro al cambio di chat, ma li rimette chi APRE (o non sono della chat): non si parcheggiano. */
export const CAMPI_DELL_APERTURA = Object.freeze(['generation', 'id', 'eventSource', 'deferHistoricalRendering', 'taskId', 'treeWorkspaceKey', 'figli']);
/* Misure VIVE, azzerate al cambio di chat e rilette da sole (sessione desktop, 10/10: «la prima lettura riparte da sola»): non si
   parcheggiano, al ritorno restano azzerate. */
export const CAMPI_VIVI = Object.freeze(['risorseProcessi']);

const vuota = (x) => x == null || (typeof x.size === 'number' ? x.size === 0 : Array.isArray(x) ? x.length === 0 : false);

/**
 * Una chat si tiene pronta solo se è FERMA: niente storia in arrivo, nessun giro vivo, niente che aspetti la persona (carte,
 * domande, richieste MCP, quelle delle figlie), coda vuota, nessun comando in volo, e una sequenza da cui ripartire. Altrimenti
 * si ricostruisce come oggi: una chat che lavora non si congela (la sua storia continuerebbe senza nessuno che la disegni).
 * @returns {{ ok: true } | { ok: false, motivo: string }}
 */
export function chatParcheggiabile(rs) {
  if (!rs || typeof rs.id !== 'string' || rs.id === '') return { ok: false, motivo: 'senza-sessione' };
  if (rs.inRigiocata) return { ok: false, motivo: 'storia-in-arrivo' };
  if (!(rs.eventoTerminaleVisto || rs.chiusaDalServer)) return { ok: false, motivo: 'giro-vivo' };
  for (const campo of ['approvazioniPendenti', 'domandePendenti', 'richiesteMcpPendenti', 'domandeDelleFiglie', 'carteDelleFiglie', 'codaMessaggi', 'comandiInVolo']) {
    if (!vuota(rs[campo])) return { ok: false, motivo: `in-attesa:${campo}` };
  }
  if (rs.attesaBubble) return { ok: false, motivo: 'attesa' };
  if (!(rs.sequenzeViste?.size > 0)) return { ok: false, motivo: 'senza-sequenza' };
  return { ok: true };
}

/** L'ultima sequenza vista: da qui il server riprende (`?after=`). */
export function ultimaSequenzaVista(sequenzeViste) {
  let massima = 0;
  for (const s of sequenzeViste ?? []) if (Number.isSafeInteger(s) && s > massima) massima = s;
  return massima;
}

/** Copia i campi della chat da `rs` (riferimenti, non cloni: la chat parcheggiata si porta via i SUOI oggetti). */
export function campiDellaChat(rs) {
  const fuori = {};
  for (const campo of CAMPI_DELLA_CHAT) if (Object.hasOwn(rs, campo)) fuori[campo] = rs[campo];
  return fuori;
}

/**
 * Le chat pronte: un LRU per numero e per nodi (la meno recente esce per prima). `prendi` la toglie: una chat ripresa è di nuovo
 *   quella a schermo, e quando la si lascia si parcheggia di nuovo, fresca.
 */
export function creaChatPronte({ massime = CHAT_PRONTE_MASSIME, nodiMassimi = NODI_PRONTI_MASSIMI } = {}) {
  const voci = new Map(); // sessionId → voce; l'ordine d'inserimento è l'ordine d'uso
  const nodiTotali = () => { let n = 0; for (const v of voci.values()) n += v.nodi ?? 0; return n; };
  function scarta() {
    while (voci.size > massime) voci.delete(voci.keys().next().value);
    while (voci.size > 0 && nodiTotali() > nodiMassimi) voci.delete(voci.keys().next().value);
  }
  return {
    parcheggia(sessionId, voce) { voci.delete(sessionId); if ((voce?.nodi ?? 0) > nodiMassimi) return false; voci.set(sessionId, voce); scarta(); return voci.has(sessionId); },
    prendi(sessionId) { const voce = voci.get(sessionId) ?? null; voci.delete(sessionId); return voce; },
    dimentica(sessionId) { return voci.delete(sessionId); },
    /** Tiene solo le chat che esistono ancora (l'elenco del server). */
    pota(esistenti) { for (const id of [...voci.keys()]) if (!esistenti.has(id)) voci.delete(id); },
    svuota() { voci.clear(); },
    ids() { return [...voci.keys()]; },
    nodi: nodiTotali,
  };
}
