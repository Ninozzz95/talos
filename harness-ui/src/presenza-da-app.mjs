/*
 * ⛔ R-34 parte 2, la PRESENZA dal telefono (forma proposta dal Mobile il 30/10/2026, OK di CLI, Performance e Desktop). Sul telefono r4 è
 *   un processo a parte lanciato dall'app: la porta `personaPresenteFn` del registro non si può passare come funzione, e senza questo
 *   modulo la persona risultava «presente» di serie — una carta `semprePersona` sarebbe partita verso un telefono messo via.
 *   - Si accende con `TALOS_PRESENZA_DA_APP=1` (come `TALOS_CHATGPT_CUSTODE=app`); spenta ⇒ non esiste, la rotta risponde 404, e tutto
 *     resta com'era (desktop e CLI non la accendono).
 *   - Accesa, parte ASSENTE: chiusa per difetto, meglio una ripresa in più che una carta davanti a nessuno.
 *   - Il «presente» SCADE (CLI: un'app uccisa dal sistema non riesce a mandare `false`, e un r4 sopravvissuto all'app resterebbe
 *     «presente» per sempre): vale `ttlMs` (60 s) dall'ultimo segnale; l'app lo rinfresca finché è in primo piano.
 *   - In memoria, mai sul disco.
 */
export const DURATA_PRESENZA_MS = 60_000;

export function creaPresenzaDaApp({ ttlMs = DURATA_PRESENZA_MS, adesso = () => Date.now() } = {}) {
  let finoA = 0;
  return {
    /** Il segnale dell'app. Solo un booleano vale: il chiamante rifiuta tutto il resto prima di arrivare qui. */
    imposta(presente) {
      finoA = presente === true ? adesso() + ttlMs : 0;
      return { presente: presente === true };
    },
    /** La persona c'è adesso: un `true` ricevuto da meno di `ttlMs`. */
    presente() {
      return adesso() < finoA;
    },
  };
}
