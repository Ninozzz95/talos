import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/*
 * ⛔⛔⛔ 17/09/2026 — SU WINDOWS UN PROGRAMMA CHIAMATO PER NOME SI CERCA PRIMA NELLA CARTELLA DI LAVORO.
 *
 * Misurato su questa macchina (Node v24.18.0), con un finto `git.exe` INNOCUO — una copia di
 * `whoami.exe` — messo in una cartella temporanea, e `spawnSync('git', [], { cwd: <quella cartella> })`
 * lanciato da un processo Node nato SENZA la variabile qui sotto:
 *
 *     genitore SENZA la variabile            → "desktop-…\<utente>"   (ha girato il FINTO)
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

/*
 * ⛔⛔ R1 della seconda revisione della CLI 0.6.8 (16/10/2026, S1, stessa classe della difesa qui sopra) — LA VARIABILE DEVE STARE
 *   ANCHE NELL'AMBIENTE DEL FIGLIO. `StdioClientTransport` di `@modelcontextprotocol/client` (MCP e agenti ACP) lancia con
 *   cross-spawn, e su Windows cross-spawn (`lib/parse.js`) usa `which` (che guarda la cartella corrente PRIMA del PATH,
 *   `which/which.js:20-21`) solo per DECIDERE: se il nome porta a un `.exe`/`.com` lancia il nome nudo (e `CreateProcess` rispetta
 *   la variabile di QUESTO processo: un `node.exe` piantato non parte, misurato), altrimenti lancia `cmd.exe /d /s /c "node …"` — e
 *   lì il nome lo risolve `cmd.exe` con l'ambiente del FIGLIO. L'ambiente di serie dell'SDK (`getDefaultEnvironment`) non porta la
 *   variabile ⇒ `cmd.exe` cercava nella cartella, e un `node.cmd` aggiunto alla radice di un progetto fidato DOPO la fiducia girava
 *   al `talos -p` successivo, senza domanda (misurato dalla CLI su 0.6.7 e 0.6.8; qui R1-05). Raggiungibile con un `git pull`, o
 *   col modello che lo scrive in acceptEdits.
 * ⇒ Due muri, ognuno basta da solo per questo caso (R1-05 diventa rosso solo togliendoli tutti e due):
 *   1. la variabile nell'ambiente dei server MCP, degli agenti ACP e degli hook (e quindi dei loro figli);
 *   2. qui, il nome risolto sul solo PATH in un percorso ASSOLUTO, saltando ogni voce relativa (`.`, la voce vuota) — la regola di
 *      `CreateProcess` con la variabile accesa e di cline/cline #14171. Un nome che il PATH non ha NON si cerca altrove: si
 *      rifiuta col perché. Un percorso esplicito (con una barra) resta com'è.
 */
export function risolviProgrammaSenzaCartella(comando, { env = process.env, piattaforma = process.platform, eFile = eUnFileEseguibile } = {}) {
  if (typeof comando !== 'string' || comando.trim() === '') return comando;
  if (/[\\/]/u.test(comando)) return comando;
  const windows = piattaforma === 'win32';
  const separatoreLista = windows ? ';' : ':';
  const valore = env.PATH ?? env.Path ?? Object.entries(env).find(([k]) => k.toUpperCase() === 'PATH')?.[1] ?? '';
  const cartelle = String(valore).split(separatoreLista).map((c) => c.trim().replace(/^"(.*)"$/su, '$1')).filter((c) => c !== '' && isAbsolute(c));
  const estensioni = windows
    ? (() => {
      const lista = String(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.trim()).filter(Boolean);
      return lista.some((e) => comando.toLowerCase().endsWith(e.toLowerCase())) ? ['', ...lista] : lista;
    })()
    : [''];
  for (const cartella of cartelle) {
    for (const estensione of estensioni) {
      const candidato = join(cartella, comando + estensione);
      if (eFile(candidato)) return candidato;
    }
  }
  throw Object.assign(new Error(`"${comando}" was not found on PATH. A program in the project folder is never started by bare name: write its path (for example .${windows ? '\\' : '/'}${comando}) if that is the one you mean.`), { code: 'ENOENT' });
}

function eUnFileEseguibile(percorso) {
  try { return statSync(percorso).isFile(); } catch { return false; }
}

export function attivaDifesaRicercaProgrammi(env = process.env) {
  if (!env[VARIABILE_DIFESA_RICERCA]) env[VARIABILE_DIFESA_RICERCA] = '1';
  return env[VARIABILE_DIFESA_RICERCA];
}

attivaDifesaRicercaProgrammi();
