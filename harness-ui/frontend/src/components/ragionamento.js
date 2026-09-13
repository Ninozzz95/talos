/*
 * ⛔⛔ IL RAGIONAMENTO SI COMPRIME, NON SPARISCE — le parole della sua riga, in un posto solo.
 *
 * Decisione dell'owner, 13/09/2026 sera, dopo una ricerca chiesta da lui:
 *   · Hermes desktop (`apps/desktop/src/components/assistant-ui/thread/message-parts.tsx`, letto nel
 *     clone): il ragionamento non si nasconde mai. È una riga apribile che dice «Thinking…» mentre
 *     scrive e poi «Thought for 12s» / «Thought briefly» / «Thought» — «a turn that ended must not go
 *     on saying Thinking». La preferenza è «Collapse thinking by default», spenta di serie. Un
 *     ragionamento senza testo non ha riga: «an empty header is never wanted».
 *   · assistant-ui (https://www.assistant-ui.com/docs/ui/reasoning): «a plain collapsed row once the
 *     model moves on», etichetta «Reasoning (12s)».
 *   · AI SDK Elements (https://elements.ai-sdk.dev/components/reasoning): aperto mentre scrive, chiuso
 *     quando ha finito.
 *   · NN/g, Nielsen, «Progressive Disclosure» (3/12/2006): il secondario si rimanda, ma «it must be
 *     obvious how users progress» — deve restare trovabile.
 *
 * Prima TALOS faceva il contrario: «Mostra ragionamento» spento voleva dire `hidden`, invisibile e
 * irraggiungibile, e un turno il cui unico contenuto era un ragionamento restava con la sola
 * intestazione. Valore di serie scelto dall'owner: SEMPRE COMPRESSO (l'interruttore resta spento).
 *
 * ⛔ Gli eventi del ragionamento non portano un orario: zero su 105.853 nello store (13/09). La durata
 *   si misura solo dal vivo; in una rigiocata tutto accade in pochi millisecondi, e senza questa
 *   distinzione ogni ragionamento direbbe «Ha ragionato poco». Lì si dice solo «Ha ragionato».
 */

/** Il nome dell'interruttore: non più «mostra/nascondi», ma se aprirlo mentre il modello scrive. */
export const ETICHETTA_INTERRUTTORE_RAGIONAMENTO = 'Apri il ragionamento mentre scrive';

/**
 * Una durata in parole brevi: «12 s», «1 min 5 s», «2 min».
 * @param {number} secondi
 * @returns {string}
 */
export function formattaDurataRagionamento(secondi) {
  const totale = Math.max(0, Math.round(Number(secondi) || 0));
  if (totale < 60) return `${totale} s`;
  const minuti = Math.floor(totale / 60);
  const resto = totale % 60;
  return resto ? `${minuti} min ${resto} s` : `${minuti} min`;
}

/**
 * L'etichetta della riga del ragionamento.
 *
 * ⛔ Tre modi per un ragionamento FINITO di raccontarsi, come in Hermes: con una durata misurata la
 *   dice; sotto il secondo non scrive «0 s» (esatto e inutile) ma «poco»; senza durata — una
 *   rigiocata — dice solo che è successo. E un ragionamento finito non dice mai «Sta ragionando».
 * @param {{inCorso?:boolean, secondi?:number|null}} stato
 * @returns {string}
 */
export function etichettaRagionamento({ inCorso = false, secondi = null } = {}) {
  if (inCorso) return 'Sta ragionando…';
  if (secondi === null || secondi === undefined || !Number.isFinite(Number(secondi))) return 'Ha ragionato';
  if (Number(secondi) < 1) return 'Ha ragionato poco';
  return `Ha ragionato per ${formattaDurataRagionamento(secondi)}`;
}

/*
 * ⭐⭐ 13/09 sera — DIRE SU COSA STA RAGIONANDO. Owner: «dobbiamo fare meglio di Hermes».
 *
 * Codex lo fa: `codex-rs/tui/src/chatwidget/streaming.rs` estrae il primo titolo in grassetto del
 * ragionamento (`extract_first_bold`) e lo mette nella riga di stato al posto di «Working». Hermes
 * desktop no: la sua riga dice «Thinking…» e basta.
 *
 * ⛔ Misurato sul nostro store prima di copiarlo: solo 31 ragionamenti su 595 hanno un titolo in
 *   grassetto (5%). I nostri modelli scrivono prosa. Quindi il titolo vince quando c'è, e il RIPIEGO —
 *   l'ultima frase completa — è il caso normale, non l'eccezione.
 * ⛔ Da noi il ragionamento arriva come un blocco solo, senza le sezioni con cui Codex azzera il
 *   titolo: vale il titolo PIÙ RECENTE, non il primo, altrimenti un ragionamento lungo resterebbe
 *   fermo sulla prima cosa pensata.
 * ⛔ Mai una frase a metà: il flusso arriva a pezzi, e mostrare l'ultimo pezzo farebbe leggere parole
 *   tronche che cambiano a ogni token. Una frase è finita quando dopo il punto c'è uno spazio o un a
 *   capo — così `agentmarketcap.ai` o `v0.1.33` non spezzano niente.
 */
const MINIMO_PAROLE_ARGOMENTO = 3;

function pulisciArgomento(testo) {
  return String(testo)
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function accorciaArgomento(testo, massimo) {
  if (testo.length <= massimo) return testo;
  return `${testo.slice(0, massimo - 1).trimEnd()}…`;
}

/**
 * L'argomento corrente di un ragionamento che sta ancora arrivando, su una riga.
 * @param {string} testo il ragionamento accumulato finora
 * @param {{massimo?:number}} [opzioni]
 * @returns {string|null} `null` quando non c'è ancora niente di finito da dire
 */
export function argomentoDelRagionamento(testo, { massimo = 90 } = {}) {
  const grezzo = String(testo ?? '');
  if (!grezzo.trim()) return null;
  const titoli = [...grezzo.matchAll(/\*\*([^*\n]{3,80})\*\*/g)];
  if (titoli.length) {
    const titolo = pulisciArgomento(titoli[titoli.length - 1][1]);
    if (titolo) return accorciaArgomento(titolo, massimo);
  }
  let fine = -1;
  for (const m of grezzo.matchAll(/[.!?](?=\s)|\n/g)) fine = m.index + 1;
  if (fine <= 0) return null;
  const frasi = grezzo.slice(0, fine)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(pulisciArgomento)
    .filter((frase) => frase.split(' ').filter(Boolean).length >= MINIMO_PAROLE_ARGOMENTO);
  return frasi.length ? accorciaArgomento(frasi[frasi.length - 1], massimo) : null;
}
