import { etichettaSeparatoreContesto, testiModelloInutilizzabile } from './context-separator.js';
import { fineMuta, interpretaEventoCompattazione, testoRigaCompattazione } from './compattazione-legacy.js';
import { EVENTO_MODELLO_INUTILIZZABILE } from './motivi-compattazione.js';
import { EVENTO_MCP_AVVIO, motivoMcp, nuoviServerNonPartiti } from './avviso-mcp.js';
import { leggiControlloSpento, testiControlloSpento } from './avviso-controllo-spento.js';
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

/** La contabilità del giro: la chat non la disegna come riga (costo e token vanno al contatore, l'uscita dei comandi al pannello).
 *  Spesa di servizio (30/10, parte 2 B): l'attesa del motore è una misura, la chat non la disegna.
 *  PERF R-34 (Desktop 30/10): `talos.chiamata-nel-testo` è il giornale di una chiamata scritta come testo — la chat non la disegna
 *  (la riga aspetta il bozzetto), e il suo frammento non va mai nel Markdown; resta nell'esportazione JSON.
 *  Decisione 245 (05/11): `talos.continuazione` (ripreso dopo una fermata per il contesto) va solo al giornale su disco, mai a schermo. */
export const EVENTI_CONTABILI = Object.freeze(['consumo-fornitore', 'consumo-di-servizio', 'talos.process-output', 'talos.attesa-del-motore',
  'talos.chiamata-nel-testo', 'talos.continuazione']);
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
  /* i passi del riassunto preparato in sottofondo (inizio, pronta, scartata, non arriva): la chat non ne disegna una riga, e prima finivano
     nel trascritto col loro JSON. La riga che conta (rapido, migliorato) è già nell'evento `talos.compattazione`. */
  if (evento.name === 'talos.compattazione-preparata') return { omesso: true };
  if (evento.name === 'talos.blocco.azione.v1') return { omesso: true }; // il gesto è già il messaggio della persona
  if (evento.name === 'talos.risultati-accorciati') return { omesso: true }; // la riga vive sotto la risposta: nel trascritto esportato sarebbe contabilità
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
    if (fineMuta(c)) return { omesso: true }; // (6) 21/10: un riassunto di sfondo che ha ceduto il posto non si racconta
    if (c.tipo === 'fine') {
      return { testo: c.compattato
        ? testoRigaCompattazione({ stato: 'riassunta', tokenPrima: c.tokenPrima, tokenDopo: c.tokenDopo, ripiego: c.ripiego === true, ragione: c.ragione ?? null, nonDisponibile: c.nonDisponibile ?? null, dallaRiserva: c.dallaRiserva === true, riassuntoDi: c.riassuntoDi ?? null, migliorata: Boolean(c.migliora) })
        : testoRigaCompattazione({ stato: 'non-riuscita', giro: c.giro ?? null, motivo: c.motivo, dettaglio: c.dettaglio, nonDisponibile: c.nonDisponibile ?? null, motoreNonPartito: c.motoreNonPartito === true }) };
    }
    if (c.tipo === 'annullata') return { testo: testoRigaCompattazione({ stato: 'annullata' }) };
    return null;
  }
  /* Revisione del Blocco 22, F9: la riga che la chat disegna (FE-053), con le sue funzioni. In chat il perché sta nel `title`; in un documento da leggere dopo va scritto, e la
     riga finisce coi due punti apposta. Un evento senza modello resta col suo JSON, come ogni forma che non si riconosce. */
  if (evento.name === EVENTO_MODELLO_INUTILIZZABILE) {
    if (typeof evento.value?.modello !== 'string' || !evento.value.modello) return null;
    const { riga, perche } = testiModelloInutilizzabile(evento.value);
    return { testo: `${riga} ${perche}` };
  }
  /* 18/10/2026 (dal ramo scartato `feat/mcp-avvio-in-chat`, adattato all'evento fuso): un server MCP che non è partito, con le parole
     della nota in chat e solo quando la chat la mostra (`nuoviServerNonPartiti`, lo stesso ricordo); un giro in cui niente cambia
     resta fuori come la contabilità. Il motivo sta fra parentesi: in un documento da leggere dopo è l'unica traccia del perché. */
  /* owner 29/10/2026: il controllo delle scritture spento — la stessa riga che la chat mostra */
  const controlloSpento = leggiControlloSpento(evento);
  if (controlloSpento) return { testo: testiControlloSpento(controlloSpento).riga };
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
