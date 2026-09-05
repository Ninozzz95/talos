/*
 * La colonna dei dettagli come la disegna il mockup (sessione «W1-02 registro processi»),
 * nella forma dei dati del monolite: RunStarted.contesto, usage, finestra del modello,
 * ripartizione dichiarata, giri, file toccati, processi.
 */
export const INSPECTOR = Object.freeze({
  titolo: 'W1-02 registro processi',
  contesto: { progetto: 'AVM-harness-desktop', cartella: 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop', branch: 'lane/harness-desktop', worktree: 'AVM-harness-desktop', nonSalvate: 2, repoAnnidati: ['harness-ui/frontend/artifacts/repo-prova'] },
  usage: { prompt_tokens: 38_400, completion_tokens: 2_800, cached_tokens: 30_000, giri: 7 },
  finestra: 200_000,
  ripartizione: { attrezzi: 7_500, istruzioni: 4_100, memoria: 1_800 },
  giri: [
    { numero: 1, titolo: 'La richiesta', token: 400 },
    { numero: 2, titolo: 'Lettura del registro', token: 1_900 },
    { numero: 3, titolo: 'Le due condizioni', token: 4_200 },
    { numero: 5, titolo: 'Scrittura e ricevuta', token: 6_100 },
    { numero: 7, titolo: 'Suite completa', inCorso: true },
  ],
  file: [
    { path: 'src/session-registry.mjs', aggiunte: 18, rimozioni: 2 },
    { path: 'tests/session-registry.test.mjs', aggiunte: 64, rimozioni: 0 },
    { path: 'src/http-app.mjs', aggiunte: 30, rimozioni: 0 },
  ],
  processi: [
    { comando: 'node --test tests/*.test.mjs', stato: 'in-corso', chi: 'agente', giro: 7, durataMs: 41_000 },
    { comando: 'npm run verify:all', stato: 'ok', chi: 'agente', giro: 5, durataMs: 18_100, uscita: 0 },
    { comando: 'git status --short', stato: 'ok', chi: 'tu', durataMs: 300, uscita: 0 },
    { comando: 'gradlew assembleDebug', stato: 'errore', chi: 'agente', giro: 3, durataMs: 74_000, fermoDaMs: 74_000, inCorsoFermo: true },
  ],
});
