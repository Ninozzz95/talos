/*
 * CHE COSA FA UN AGENTE ADESSO, I SUOI CONTI, L'ATTIVITÀ RECENTE DI TUTTI — owner 13/10/2026: le tre cose che la vista classica
 * delle deleghe mostrava e il diagramma nuovo no (`grafo-agenti.js`, `attivitaNodoGrafo` e l'elenco «Recenti»). Mockup approvato
 * lo stesso giorno (handoff `mockup-attivita-diagramma-2026-10-13/`, ledger UI §18).
 *
 * Qui stanno solo i FATTI, presi dalla delega com'è (`attivita`, `operazioneCorrente`, `usageSessione` di `GET …/children`):
 * nessuna parola, nessun orario scritto. Le parole le mette chi disegna (`testoAttivita`), nella lingua dell'interfaccia.
 * ⛔ Un numero che manca resta `null` («non lo so»), mai zero: i totali dicono quanti agenti li hanno davvero.
 */

export const PASSI_RECENTI = 8;
const STATI_AL_LAVORO = new Set(['running', 'leased']);

const istante = (v) => { const t = typeof v === 'string' && v !== '' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };
const conta = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const testoPieno = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Che cosa fa l'agente, dai fatti: `{ kind, tool?, target?, at? }`.
 *  - al lavoro: `reasoning` · `responding` · `tool` (con l'attrezzo in volo e, se il server lo sa, il suo bersaglio) · `between`
 *    (fra un'operazione e l'altra);
 *  - fermo: `last` (l'ora dell'ultimo passo che ne porta una) oppure `none`.
 * Stessa regola della classica (`attivitaNodoGrafo`): chi lavora dice cosa fa, gli altri quando hanno fatto l'ultima cosa.
 */
export function attivitaDellAgente(agente, stato) {
  const att = agente?.attivita;
  const passi = Array.isArray(att?.passi) ? att.passi : [];
  if (STATI_AL_LAVORO.has(stato)) {
    const fase = agente?.operazioneCorrente;
    if (fase?.status === 'running' && fase.kind === 'reasoning') return { kind: 'reasoning' };
    if (fase?.status === 'running' && fase.kind === 'response') return { kind: 'responding' };
    const attrezzo = testoPieno(att?.attrezzoCorrente);
    /* il bersaglio è quello della chiamata IN VOLO (`bersaglioCorrente`, quando il server lo dichiara): mai quello dell'ultima
       chiamata finita, che può essere un altro file */
    if (attrezzo) return { kind: 'tool', tool: attrezzo, target: testoPieno(att?.bersaglioCorrente) };
    return { kind: 'between' };
  }
  const ultimo = [...passi].reverse().find((p) => istante(p?.quando) !== null);
  return ultimo ? { kind: 'last', at: new Date(istante(ultimo.quando)).toISOString() } : { kind: 'none' };
}

/** I conti dell'agente: chiamate, file toccati (con `filesPartial` se il server ne ha lasciati fuori), token. `null` = non si sa. */
export function contiDellAgente(agente) {
  const att = agente?.attivita;
  const ingresso = conta(agente?.usageSessione?.prompt_tokens); const uscita = conta(agente?.usageSessione?.completion_tokens);
  const file = Array.isArray(att?.file) ? att.file.length : conta(att?.numeroFile);
  return { calls: conta(att?.chiamate), files: file, filesPartial: (conta(att?.fileTagliati) ?? 0) > 0, tokens: ingresso !== null && uscita !== null ? ingresso + uscita : null };
}

/** Gli ultimi passi dell'agente che portano un'ora (al più `PASSI_RECENTI`), dal più vecchio al più nuovo: `{ at, kind, tool, target }`. */
export function passiDellAgente(agente) {
  const passi = Array.isArray(agente?.attivita?.passi) ? agente.attivita.passi : [];
  const tipi = { attrezzo: 'tool', avvio: 'started', fine: 'finished', errore: 'failed' };
  return passi.filter((p) => istante(p?.quando) !== null && tipi[p?.tipo])
    .map((p) => ({ at: new Date(istante(p.quando)).toISOString(), kind: tipi[p.tipo], tool: p.tipo === 'attrezzo' ? testoPieno(p.attrezzo) : null, target: p.tipo === 'attrezzo' ? testoPieno(p.percorso) : null }))
    .filter((p) => p.kind !== 'tool' || p.tool !== null)
    .slice(-PASSI_RECENTI);
}

/**
 * I totali di un insieme di righe del diagramma (`calls`, `fileCount`/`files`, `tokens` come li mette `run-dalle-deleghe.js`): la
 * somma di ciò che si sa, e per ognuno quanti agenti lo dichiarano (`…Known`). `agents` è quanti sono in tutto.
 * ⛔ I FILE SONO QUELLI DISTINTI (14/10/2026): due agenti che toccano lo stesso file fanno UN file toccato, non due — qui si
 * sommavano i conti di ogni agente; la vista classica contava i percorsi (`telemetriaGrafoAgenti`, RIPRESA-GRAFO-TELEMETRIA).
 * Chi dichiara solo QUANTI file (senza l'elenco: un record compatto della storia) non si può confrontare con gli altri: il
 * totale è allora un minimo — il più grande fra i distinti noti e quel conto — e si dice parziale («almeno»).
 */
export function totaliDelleRighe(righe) {
  const t = { agents: 0, calls: null, callsKnown: 0, files: null, filesKnown: 0, filesPartial: false, tokens: null, tokensKnown: 0 };
  const percorsi = new Set(); let soloConto = null;
  for (const r of righe) {
    t.agents += 1;
    if (r.calls != null) { t.calls = (t.calls ?? 0) + r.calls; t.callsKnown += 1; }
    if (r.fileCount != null) {
      t.filesKnown += 1; if (r.filesPartial) t.filesPartial = true;
      if (Array.isArray(r.files)) { for (const f of r.files) if (typeof f?.path === 'string') percorsi.add(f.path); }
      else { soloConto = Math.max(soloConto ?? 0, r.fileCount); t.filesPartial = true; }
    }
    if (r.tokens != null) { t.tokens = (t.tokens ?? 0) + r.tokens; t.tokensKnown += 1; }
  }
  if (t.filesKnown > 0) t.files = Math.max(percorsi.size, soloConto ?? 0);
  return t;
}

/**
 * L'attività recente di TUTTE le righe: gli ultimi `quante` passi, dal più nuovo; a parità d'ora resta l'ordine del diagramma.
 * `finoA` (millisecondi, in riproduzione): solo i passi fino a quell'istante — fra quelli che ogni agente conserva (gli ultimi
 * `PASSI_RECENTI`): un istante lontano può non averne più, e allora l'elenco è vuoto, non inventato.
 */
export function attivitaRecente(righe, quante = PASSI_RECENTI, finoA = null) {
  /* si tengono solo i `quante` migliori mentre si scorre: niente elenco intero da ordinare. Misurato dal bugfixer il 13/10/2026
     con 5.000 agenti: 115 ms a ogni aggiornamento, per ordinare 40.000 passi rileggendo l'ora a ogni confronto. */
  const prima = (a, b) => a.t > b.t || (a.t === b.t && (a.i < b.i || (a.i === b.i && a.j > b.j)));
  const scelti = [];
  for (let i = 0; i < righe.length; i += 1) {
    const passi = righe[i].steps ?? [];
    for (let j = passi.length - 1; j >= 0; j -= 1) {
      const t = Date.parse(passi[j].at);
      if (!Number.isFinite(t) || (finoA !== null && t > finoA)) continue;
      const voce = { t, i, j };
      if (scelti.length === quante && !prima(voce, scelti[quante - 1])) continue;
      let posto = scelti.length; while (posto > 0 && prima(voce, scelti[posto - 1])) posto -= 1;
      scelti.splice(posto, 0, voce); if (scelti.length > quante) scelti.pop();
    }
  }
  return scelti.map(({ i, j }) => ({ ...righe[i].steps[j], nodeId: righe[i].nodeId, sessionId: righe[i].sessionId, label: righe[i].label }));
}

const maiuscola = (testo) => (typeof testo === 'string' && testo !== '' ? testo.charAt(0).toLocaleUpperCase() + testo.slice(1) : testo);

/**
 * Le parole dell'attività, nella lingua dell'interfaccia. `tr` traduce, `nomeAttrezzo` dà il nome umano di un attrezzo (mai l'id
 * tecnico a schermo: regola dell'owner del 04/09), `verbo` i suoi due tempi (`[passato, presente]`: «Wrote», «Writing»), `ora`
 * scrive un orario breve.
 * Torna `{ testo, vivo }`: `vivo` quando l'agente sta facendo qualcosa adesso (la riga si legge piena, non attenuata).
 */
export function testoAttivita(attivita, { tr, nomeAttrezzo, verbo, ora }) {
  if (!attivita) return null;
  switch (attivita.kind) {
    case 'reasoning': return { testo: tr('agenti.delegations.opReasoning'), vivo: true };
    case 'responding': return { testo: tr('agenti.delegations.opResponding'), vivo: true };
    /* con un file: il verbo al presente e il NOME del file («Writing prezzi.test.js»: la riga è corta, il percorso intero sta nel
       dettaglio e nell'elenco dell'attività); senza: il nome dell'attrezzo («Terminal command») */
    case 'tool': { const file = attivita.target ? attivita.target.split('/').filter(Boolean).at(-1) : null;
      return { testo: file ? `${verbo(attivita.tool)[1]} ${file}` : maiuscola(nomeAttrezzo(attivita.tool)), vivo: true }; }
    case 'between': return { testo: tr('agenti.delegations.betweenOperations'), vivo: true };
    case 'waitingAgents': return { testo: tr(attivita.count === 1 ? 'agenti.workflow.activityWaitingOne' : 'agenti.workflow.activityWaitingMany', { n: attivita.count }), vivo: true };
    case 'last': return { testo: tr('agenti.delegations.lastActivityAt', { ora: ora(attivita.at) }), vivo: false };
    default: return { testo: tr('agenti.delegations.noActivityRecorded'), vivo: false };
  }
}

/** Le parole di un passo (già fatto) dell'elenco «Attività recenti»: `{ icona, che, dove }` — «Read» + il file, o il nome dell'attrezzo. */
export function testoDelPasso(passo, { tr, nomeAttrezzo, verbo, iconaAttrezzo }) {
  if (passo.kind === 'tool') return { icona: iconaAttrezzo(passo.tool), che: passo.target ? verbo(passo.tool)[0] : maiuscola(nomeAttrezzo(passo.tool)), dove: passo.target ?? null };
  if (passo.kind === 'started') return { icona: 'i-play', che: tr('agenti.delegations.eventStarted'), dove: null };
  if (passo.kind === 'failed') return { icona: 'i-alert', che: tr('agenti.delegations.eventError'), dove: null };
  return { icona: 'i-check', che: tr('agenti.delegations.eventFinished'), dove: null };
}
