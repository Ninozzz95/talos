import { etichettaSeparatoreContesto } from './context-separator.js';
import { interpretaEventoCompattazione, testoRigaCompattazione } from './compattazione-legacy.js';
import { EVENTO_MCP_AVVIO, motivoMcp, nuoviServerNonPartiti } from './avviso-mcp.js';
import { t } from './lingua.js';
import { suUnaRiga } from './testo-a-schermo.js';

/*
 * R-04 (ledger della revisione degli attrezzi, 12/10/2026; cura 17/10/2026) — IL TRASCRITTO ESPORTATO NON MOSTRA LA CONTABILITÀ.
 *
 * Il Markdown esportato scriveva «Evento non riconosciuto `CUSTOM`» col JSON per ogni `consumo-fornitore` (uno per richiesta al
 * fornitore: 779 nell'archivio del 4174 contro 182 messaggi dell'assistente) e per ogni `talos.context`, `talos.process-output`,
 * `talos.compattazione`. Rumore per chi legge, e il formato pensato per essere letto diventava il JSON a pezzi.
 *
 * Come fanno i concorrenti (letti nel codice il 17/10/2026):
 * - Codex, `codex-rs/tui/src/app/transcript_export.rs:227-287` (`render_markdown_transcript`): il Markdown si costruisce dalle
 *   CELLE della storia, cioè da ciò che la persona vede; la compattazione è una riga, «Context compacted»
 *   (`thread_transcript/other_items.rs:106-110`), e il consumo di token non è un elemento della storia, quindi non c'è.
 * - Hermes, `apps/desktop/src/lib/session-export.ts:36-45`: esporta solo i MESSAGGI, in JSON; niente eventi interni.
 *
 * ⇒ Qui, come Codex: un evento interno che la chat disegna come riga diventa LA STESSA FRASE della chat (la si prende dalle stesse
 *   funzioni, così non possono divergere); uno che la chat non disegna (contabilità e misure) resta fuori dal Markdown. Due cose
 *   restano com'erano, di proposito:
 * - niente si perde: l'esportazione JSON è il carico grezzo, intero, e il Markdown dice quanti eventi interni ha lasciato fuori;
 * - un CUSTOM che qui non si conosce, o uno conosciuto con una forma che non si riconosce, NON torna `null` da sé: finisce nel
 *   `default` col suo JSON, come prima. Si lascia fuori solo ciò che si è riconosciuto.
 */

/** La contabilità del giro: la chat non la disegna come riga (costo e token vanno al contatore, l'uscita dei comandi al pannello). */
export const EVENTI_CONTABILI = Object.freeze(['consumo-fornitore', 'talos.process-output']);
const CONTABILI = new Set(EVENTI_CONTABILI);

/** Uno span di codice Markdown che regge qualunque testo: il recinto è più lungo di ogni fila di backtick che contiene (dal ramo
 *  scartato `feat/mcp-avvio-in-chat`, revisione M: nomi e motivi che vengono dal server o dal progetto non stanno mai nudi nel corsivo). */
export function spanDiCodice(testo) {
  const pulito = suUnaRiga(String(testo ?? '')).replace(/\s+/gu, ' ').trim();
  const fila = Math.max(0, ...(pulito.match(/`+/gu) ?? []).map((m) => m.length));
  const recinto = '`'.repeat(fila + 1);
  const spazio = pulito.startsWith('`') || pulito.endsWith('`') ? ' ' : '';
  return `${recinto}${spazio}${pulito}${spazio}${recinto}`;
}

/** Il contesto di UNA esportazione: il ricordo dei server MCP già detti, perché il trascritto dica ciò che la chat ha detto (solo i cambi). */
export function creaContestoTrascrizione() {
  return { ricordoMcp: new Map() };
}

/**
 * Che cosa diventa nel Markdown un evento `CUSTOM` interno:
 * - `{ testo }` — una frase, la stessa che la chat mostra;
 * - `{ omesso: true }` — contabilità o una fase senza riga in chat: resta fuori, e si conta;
 * - `null` — non lo si riconosce: chi chiama lo scrive col suo JSON, come ogni evento sconosciuto.
 */
export function trascriviEventoInterno(evento, contesto = creaContestoTrascrizione()) {
  if (!evento || evento.type !== 'CUSTOM' || typeof evento.name !== 'string') return null;
  if (CONTABILI.has(evento.name)) return { omesso: true };
  if (evento.name === 'talos.context') {
    const valore = evento.value;
    if (!valore || valore.schema !== 'talos.context.event.v1') return null;
    const testo = etichettaSeparatoreContesto(valore);
    return testo ? { testo } : { omesso: true };
  }
  if (evento.name === 'talos.compattazione') {
    const c = interpretaEventoCompattazione(evento);
    if (!c) return null;
    if (c.tipo === 'inizio') return { omesso: true }; // in chat è la barra «Riassumo…» che sparisce: la riga vera è la fine
    if (c.tipo === 'fine') {
      return { testo: c.compattato
        ? testoRigaCompattazione({ stato: 'riassunta', tokenPrima: c.tokenPrima, tokenDopo: c.tokenDopo })
        : testoRigaCompattazione({ stato: 'non-riuscita', motivo: c.motivo, dettaglio: c.dettaglio }) };
    }
    if (c.tipo === 'annullata') return { testo: testoRigaCompattazione({ stato: 'annullata' }) };
    return null;
  }
  /* 18/10/2026 (dal ramo scartato `feat/mcp-avvio-in-chat`, adattato all'evento fuso): un server MCP che non è partito, con le parole
     della nota in chat e solo quando la chat la mostra (`nuoviServerNonPartiti`, lo stesso ricordo); un giro in cui niente cambia
     resta fuori come la contabilità. Il motivo sta fra parentesi: in un documento da leggere dopo è l'unica traccia del perché. */
  if (evento.name === EVENTO_MCP_AVVIO) {
    if (!Array.isArray(evento.value?.esiti)) return null;
    const nuovi = nuoviServerNonPartiti(contesto.ricordoMcp, 'trascritto', evento.value);
    if (!nuovi.length) return { omesso: true };
    const dove = `${t('modello.sidebar.capability')} › ${t('modello.capability.connectors')}`;
    const frasi = nuovi.map((esito) => {
      const motivo = motivoMcp(esito);
      return `${t('chat.mcp.notStartedTitle', { server: spanDiCodice(esito.serverId) })}${motivo ? ` (${spanDiCodice(motivo)})` : ''}.`;
    });
    return { testo: `${frasi.join(' ')} ${t('chat.mcp.fixInExtensions', { dove })}` };
  }
  return null;
}
