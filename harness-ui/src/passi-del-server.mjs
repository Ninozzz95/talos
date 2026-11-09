/*
 * Decisione 143 (owner 04/11/2026): i Passi (FE-008) ACCESI di serie sul PC. Chi li accende è l'ospite del PC (`server.mjs`), non il registro:
 *   · CLI (04/11): il valore di serie del registro (`session-registry.mjs`, `listaPassi = false`) resta spento, così la CLI, che crea il suo
 *     registro senza `listaPassi`, non cambia;
 *   · Mobile (04/11): il server dell'app del telefono (`TALOS_LOCALE_OSPITE_DIR`, `accessoLocaleOspite.attivo`) gira lo stesso registro e lì
 *     i Passi restano SPENTI, anche con la variabile;
 *   · si spengono con `TALOS_PASSI=0`. L'impostazione della persona non c'è ancora: quando arriva, si legge qui accanto alla variabile.
 * Come Hermes, dove `todo_list` sta fra gli strumenti di base sempre disponibili (`toolsets.py:21`, `tools/todo_tool.py:222`), e come Codex,
 * dove `update_plan` si decide dalla configurazione della sessione, mai a metà (`codex-rs/core/src/tools/spec_plan.rs:1301`), letti il 04/11.
 * Questo file è solo del PC: non viaggia col pin del telefono (`passi-del-giro.mjs` sì).
 */

/** I Passi dell'ospite del PC: accesi salvo `TALOS_PASSI=0`; mai sul server dell'app del telefono (`telefono`, o `TALOS_KERNEL_SUL_TELEFONO=1`
 *  del Codice in casa: stessa regola del catalogo dei blocchi, revisione Z). */
export function listaPassiDelServer(ambiente, { telefono = false } = {}) {
  if (telefono === true || ambiente?.TALOS_KERNEL_SUL_TELEFONO === '1') return false;
  return ambiente?.TALOS_PASSI !== '0';
}

/**
 * ⛔ SOLO PER LE PROVE (condizione 3 di Performance, 04/11): `TALOS_PROVA_PASSI_SENZA_PERSONA=1` offre i Passi e manda il loro evento anche a una
 * conversazione nata senza nessuno davanti (il banco di Performance gira così). Una forma sola, `'1'`. Non è un'impostazione e non si documenta
 * alla persona: di serie una conversazione senza nessuno davanti non li riceve.
 */
export function passiSenzaPersonaPerProva(ambiente) {
  return ambiente?.TALOS_PROVA_PASSI_SENZA_PERSONA === '1';
}
