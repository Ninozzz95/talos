/*
 * ⛔⛔⛔ 17/09/2026 — SU WINDOWS UN PROGRAMMA CHIAMATO PER NOME SI CERCA PRIMA NELLA CARTELLA DI LAVORO.
 *
 * Misurato su questa macchina (Node v24.18.0), con un finto `git.exe` INNOCUO — una copia di
 * `whoami.exe` — messo in una cartella temporanea, e `spawnSync('git', [], { cwd: <quella cartella> })`
 * lanciato da un processo Node nato SENZA la variabile qui sotto:
 *
 *     genitore SENZA la variabile            → "desktop-…\antonino"   (ha girato il FINTO)
 *     genitore CON la variabile = 1          → "usage: git [-v | --version] …"   (il git vero)
 *     genitore senza, che se la imposta da sé → "usage: git …"          (il git vero)
 *
 * È il comportamento di `CreateProcess` che libuv riproduce: la cartella di lavoro del FIGLIO viene
 * prima del `PATH`, a meno che il processo che LANCIA abbia `NoDefaultCurrentDirectoryInExePath`
 * (nodejs/node #46264; cline/cline #14171 «stop Windows resolving bare program names through the
 * workspace cwd»; ausardcompany/alexi #1752 — letti il 17/09/2026). Conta l'ambiente di chi lancia,
 * non l'`env` passato al figlio: per questo la prima stesura della mia sonda diceva «tutto bene» —
 * la shell da cui la lanciavo aveva già la variabile a 1.
 *
 * Perché ci riguarda: `workspace-info.mjs` e `scheda-di-lavoro.mjs` lanciano `git` PER NOME con
 * `cwd` = il workspace, all'apertura di ogni sessione. Un workspace è una cartella che la persona
 * ha scaricato da qualche parte: se contiene un `git.exe`, aprirlo in TALOS lo eseguiva. Erano i
 * punti 4 e 4-bis di `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`, segnati «aperto, il più serio».
 *
 * ⇒ La difesa si mette UNA volta, in testa al processo, e vale per ogni `spawn` che verrà — anche
 *   per quelli che nessuno ha ancora scritto. È un import a effetto: `server.mjs` lo importa per
 *   PRIMO, prima di ogni modulo che potrebbe lanciare qualcosa mentre si carica.
 * ⛔ Non tocca i lanci con un percorso assoluto o relativo esplicito (`./git.exe` continua a voler
 *   dire quel file): riguarda solo i nomi nudi. Fuori da Windows la variabile non ha effetto.
 * ⛔ La ereditano i figli, ed è giusto: anche `cmd.exe` la rispetta, quindi il terminale e la shell
 *   dell'agente smettono di preferire un `git.exe` della cartella corrente. Chi vuole davvero un
 *   programma della cartella lo chiama `.\programma`, come su ogni altro sistema.
 */
export const VARIABILE_DIFESA_RICERCA = 'NoDefaultCurrentDirectoryInExePath';

export function attivaDifesaRicercaProgrammi(env = process.env) {
  if (!env[VARIABILE_DIFESA_RICERCA]) env[VARIABILE_DIFESA_RICERCA] = '1';
  return env[VARIABILE_DIFESA_RICERCA];
}

attivaDifesaRicercaProgrammi();
