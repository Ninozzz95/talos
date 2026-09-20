/*
 * La coerenza fra i cancelli — T03-D2.
 *
 * ⛔ 06/9, trovato dalla prova T03 e rimasto fuori da OGNI tabella di stato per tre giorni: chi mette
 * «scrivi» su *Chiedi conferma* o *Nega sempre* crede di aver chiuso la porta ai file. Non è vero:
 * `shell` è un attrezzo diverso, con un cancello suo, e un `echo ... > file` scrive lo stesso. Il
 * meccanismo funziona — ogni attrezzo ha il suo cancello — ma l'interfaccia lascia credere una cosa
 * falsa proprio dove si prende una decisione di sicurezza.
 *
 * Non è un difetto solo nostro, ed è riconosciuto come vulnerabilità altrove (letti il 06/09/2026):
 * un attrezzo di esecuzione che aggira il divieto di scrittura del gate di sicurezza — identico;
 * sotto-agenti che aggirano le regole di negazione dei permessi — stesso rischio. La mitigazione che
 * quei progetti indicano è un divieto ASSOLUTO a monte; noi quel divieto non l'abbiamo, e finché non
 * c'è la cosa onesta è **dirlo**: un cancello che sembra chiuso e non lo è è peggio di uno aperto.
 *
 * ⛔ Qui NON si tocca il comportamento del kernel: si calcola solo cosa dichiarare a schermo.
 */

/** Gli attrezzi che possono scrivere su disco anche quando `scrivi` è chiuso. */
export const SCRIVONO_LO_STESSO = Object.freeze({
  /*
   * ⛔ BC-59 (17/09) — `file_edit` è entrato nel kernel il 16/09 e cambia i file del progetto con un
   *   cancello SUO: chi chiude «Scrivi un file» credendo di aver chiuso la porta ai file la lascia
   *   aperta esattamente come con `shell`. È lo stesso difetto di T03-D2, su un attrezzo nuovo.
   *   ⛔ Sta per PRIMO perché è la via più vicina a quella che la persona crede di aver chiuso:
   *   `shell` almeno è un altro mestiere, questo scrive file e basta.
   */
  file_edit: 'la modifica di una parte di un file',
  shell: 'un comando nel terminale',
  document_create: 'la creazione di un documento',
  generate_image: 'la generazione di un’immagine',
});

/** Le politiche di sessione sotto cui una scrittura passa senza che nessuno te la chieda. */
const POLICY_CHE_SCRIVONO_IN_SILENZIO = new Set(['Workspace write', 'Full access']);

/**
 * L'attrezzo può scrivere senza chiedere niente?
 * `sempre` sì; nessun override eredita la politica di sessione; `chiedi` e `nega` no — con «chiedi»
 * la persona vede comunque la richiesta, quindi non viene ingannata.
 */
function passaInSilenzio(valore, policySessione) {
  if (valore === 'sempre') return true;
  if (valore === 'chiedi' || valore === 'nega') return false;
  return POLICY_CHE_SCRIVONO_IN_SILENZIO.has(String(policySessione || ''));
}

/** Il cancello su «scrivi» è stato chiuso dalla persona? */
function scriviChiuso(permessiPerAttrezzo) {
  const v = permessiPerAttrezzo?.scrivi;
  return v === 'nega' || v === 'chiedi';
}

/**
 * Le porte laterali che restano aperte dopo aver chiuso «scrivi».
 * @param {Record<string,string>} permessiPerAttrezzo
 * @param {string} policySessione una fra Read only · Workspace write · On request · Full access
 * @returns {{aperte:string[], avviso:string}} `aperte` sono i NOMI TECNICI, per chi deve agire
 */
export function porteLateraliAperte(permessiPerAttrezzo = {}, policySessione = '') {
  if (!scriviChiuso(permessiPerAttrezzo)) return { aperte: [], avviso: '' };
  const aperte = Object.keys(SCRIVONO_LO_STESSO)
    .filter((attrezzo) => passaInSilenzio(permessiPerAttrezzo?.[attrezzo], policySessione));
  if (aperte.length === 0) return { aperte: [], avviso: '' };
  const nomi = aperte.map((a) => SCRIVONO_LO_STESSO[a]);
  const elenco = nomi.length === 1 ? nomi[0] : `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}`;
  const verbo = aperte.length === 1 ? 'resta una via' : 'restano vie';
  return {
    aperte,
    avviso: `Hai chiuso «Scrivi un file», ma ${verbo} per scrivere lo stesso: ${elenco}. Sono attrezzi diversi, ognuno col suo cancello.`,
  };
}
