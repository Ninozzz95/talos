/*
 * ⛔ Owner 17/10/2026 («Avviso in chat + stato in Estensioni»): un server MCP che non parte si DICE nella conversazione.
 *
 * Prima il desktop scartava in silenzio i server falliti (`agent-service.mjs`, `preparato.falliti` mai letto): la persona non
 * sapeva che un suo server era giù, né perché. Come Codex («MCP client for `x` failed to start: …»,
 * `codex-rs/tui/src/chatwidget/tests/mcp_startup.rs:536-565`), una nota d'avviso non bloccante, una per server; più di Codex, la
 * nota dice dove si ripara (Capability › Connettori, che mostra lo stesso motivo accanto al server).
 *
 * L'evento `talos.mcp-avvio` arriva a OGNI giro con l'esito di ogni server: la nota si mostra solo quando l'esito CAMBIA (un
 * fallimento nuovo, o uno diverso dal precedente), mai a ogni giro. Un server che riparte azzera il ricordo: se ricade, si ridice.
 * Lo stesso vale rigiocando la storia, perché la decisione dipende solo dalla sequenza degli eventi.
 */
import { t } from './lingua.js';
import { creaNotaSistema } from './conversazione.js';
import { testoDelCampo } from './testo-server.js';
import { suUnaRiga } from './testo-a-schermo.js';

export const EVENTO_MCP_AVVIO = 'talos.mcp-avvio';

/** Il ricordo per sessione: `sessionId → Map(serverId → impronta dell'ultimo fallimento detto)`. */
export function creaRicordoAvvisiMcp() {
  return new Map();
}

/** Gli esiti da dire adesso (i fallimenti nuovi), aggiornando il ricordo. Mai un'eccezione: un valore malformato non dice niente. */
export function nuoviServerNonPartiti(ricordo, sessionId, valore) {
  if (!sessionId || !Array.isArray(valore?.esiti)) return [];
  if (!ricordo.has(sessionId)) ricordo.set(sessionId, new Map());
  const detti = ricordo.get(sessionId);
  const daDire = [];
  for (const esito of valore.esiti) {
    if (typeof esito?.serverId !== 'string' || esito.serverId === '') continue;
    if (esito.esito === 'collegato') { detti.delete(esito.serverId); continue; }
    if (esito.esito !== 'non-partito') continue;
    /* Revisione D (bugfixer, 17/10/2026): un dettaglio con un orario o un pid («timeout after 30001 ms») cambiava a ogni giro, e lo
       stesso server giù si ridiceva 5 volte in 5 giri. Conta ciò che è STABILE: la chiave del motivo e il comando; senza chiave, il
       testo coi numeri tolti. */
    const stabile = esito.motivoChiave ? `${esito.motivoChiave}|${esito.motivoParams?.command ?? ''}` : String(esito.motivo ?? '').replace(/\d+/gu, '#');
    const impronta = `${esito.hash ?? ''}|${stabile}`;
    if (detti.get(esito.serverId) === impronta) continue;
    detti.set(esito.serverId, impronta);
    daDire.push(esito);
  }
  return daDire;
}

/** Il titolo e il testo della nota: il motivo nella lingua dell'interfaccia, e il posto dove si ripara col suo nome vero. */
/** Il motivo nella lingua dell'interfaccia, senza caratteri che ingannano (bidi, controllo), su una riga e chiuso da un punto. */
export function motivoMcp(esito) {
  const motivo = suUnaRiga(String(testoDelCampo(esito, 'motivo') ?? esito?.motivo ?? '')).trim();
  return motivo === '' || /[.!?…»”)]$/u.test(motivo) ? motivo : `${motivo}.`;
}

export function testoNotaMcp(esito) {
  const motivo = motivoMcp(esito);
  return {
    titolo: t('chat.mcp.notStartedTitle', { server: suUnaRiga(String(esito.serverId ?? '')) }),
    /* il posto si dice col nome che ha nella barra laterale (`modello.sidebar.capability`) e la sua scheda (`modello.capability.connectors`): mai un nome che diverga */
    testo: [motivo, t('chat.mcp.fixInExtensions', { dove: `${t('modello.sidebar.capability')} › ${t('modello.capability.connectors')}` })].filter(Boolean).join(' '),
  };
}

/** La nota d'avviso per un server che non è partito (la nota di sistema `warning` della conversazione). */
export function creaNotaMcpNonPartito(esito, { document: doc = globalThis.document } = {}) {
  const nota = creaNotaSistema({ tipo: 'warning', badge: t('chat.note.badge'), ...testoNotaMcp(esito) }, { document: doc });
  nota.dataset.mcpNonPartito = esito.serverId;
  return nota;
}
