/*
 * ⛔⛔ F009 — CON CHE UTENTE GIRANO I COMANDI LINUX, E CHE COSA PROTEGGE (audit 28-29/09/2026).
 *   Decisioni owner 01/10/2026: «come gli altri, insieme», dichiarato «nell'esito e nel foglio della shell», l'impostazione
 *   dell'utente normale «accesa» di partenza, e la conferma «una volta per sessione» quando un comando girerebbe da root
 *   senza che nessuno sia interpellato (owner, sera: non solo con l'accesso pieno).
 *
 * Misurato il 01/10/2026 sulla macchina dell'owner: la distro predefinita (Ubuntu) esegue i comandi come root (uid 0), e
 * `C:` è montato in WSL senza `metadata` (`uid=0;gid=0`), quindi i permessi Linux sui file di Windows non sono reali
 * (Microsoft: «metadata… disabled by default», https://learn.microsoft.com/en-us/windows/wsl/file-permissions). L'etichetta
 * di prima diceva «namespace Linux: filesystem e processi separati», che faceva credere a un isolamento che non c'è.
 *
 * Come fanno gli altri, letto nel codice il 01/10/2026: Hermes `tools/environments/docker.py:498-509` fa girare come utente
 * normale solo su richiesta (`docker_run_as_host_user` → `--user uid:gid`); Codex e Claude Code isolano con una sandbox;
 * Claude Code 2.1.283 rifiuta il permesso massimo da root («bypass_root»). Nessuno crea utenti: neanche TALOS.
 * `wsl --distribution <d> --user <u>` è la forma ufficiale (https://learn.microsoft.com/en-us/windows/wsl/basic-commands).
 */

/* Una sola chiamata a WSL dice chi è l'utente predefinito, se c'è un utente normale e come sono montati i dischi. */
export const SCRIPT_FATTI_WSL = [
    'printf "utente=%s\\n" "$(id -un)"',
    'printf "uid=%s\\n" "$(id -u)"',
    "getent passwd | awk -F: '$3>=1000 && $3<60000 && $7 !~ /(nologin|false)$/ {print \"normale=\" $1; exit}'",
    "awk '$2 ~ /^\\/mnt\\/[a-z]$/ {print \"montaggio=\" $2 \" \" $4}' /proc/mounts",
].join('\n')

const NOME_UTENTE = /^[a-z_][a-z0-9_-]{0,31}\$?$/iu

/** I fatti dalla risposta della sonda; `null` se la risposta non dice almeno utente e uid. */
export function leggiFattiWsl(testo) {
    const fatti = { utente: null, uid: null, utenteNormale: null, montaggi: {} }
    for (const riga of String(testo ?? '').split(/\r?\n/u)) {
        const i = riga.indexOf('=')
        if (i < 0) continue
        const chiave = riga.slice(0, i), valore = riga.slice(i + 1).trim()
        if (chiave === 'utente' && NOME_UTENTE.test(valore)) fatti.utente = valore
        else if (chiave === 'uid' && /^\d+$/u.test(valore)) fatti.uid = Number(valore)
        else if (chiave === 'normale' && NOME_UTENTE.test(valore)) fatti.utenteNormale ??= valore
        else if (chiave === 'montaggio') {
            const m = /^\/mnt\/([a-z]) (\S+)$/u.exec(valore)
            if (m) fatti.montaggi[m[1]] = { metadata: m[2].split(/[,;]/u).includes('metadata') }
        }
    }
    return fatti.utente !== null && fatti.uid !== null ? fatti : null
}

/**
 * Con che utente girare. Cambia qualcosa solo dove il predefinito è root E esiste un utente normale E la preferenza è
 * accesa: allora si passa `-u <utente>`. Altrimenti si resta sul predefinito, e si dice se è root.
 */
export function sceltaUtenteWsl(fatti, { usaUtenteNormale = true } = {}) {
    if (!fatti) return null
    if (fatti.uid === 0 && usaUtenteNormale && fatti.utenteNormale) return { utente: fatti.utenteNormale, root: false, passaUtente: true }
    return { utente: fatti.utente, root: fatti.uid === 0, passaUtente: false }
}

/*
 * Revisione del blocco dati, BD3 (decisione 41, «carta solo per root»): il comando può chiedere root da solo, con `wsl -u root` o `wsl --system`,
 * dalla shell di Windows o dentro Linux grazie all'interop. Come Codex, che guarda dentro `sudo` (`codex-rs/shell-command/src/command_safety/
 * is_dangerous_command.rs:147`), e Hermes, che salta gli involucri (`tools/approval_detection.py:609`). Si legge la riga, pezzo per pezzo, e conta
 * solo `wsl` in posizione di comando. ⛔ Ferma le forme scritte: una variabile non si vede.
 */
const INVOLUCRI = new Set(['sudo', 'env', 'exec', 'nohup', 'time', 'start', 'call', 'command']);
const GUSCI = new Set(['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'dash']);
const OPZIONI_DEL_GUSCIO = new Set(['/c', '/k', '-c', '-command', '-commandwithargs']);
const OPZIONI_WSL_CON_VALORE = new Set(['-d', '--distribution', '--distribution-id', '--cd', '--shell-type']);
const FINE_OPZIONI_WSL = new Set(['--', '-e', '--exec']);
const nomeProgramma = (parola) => parola.split(/[\\/]/u).pop().toLowerCase().replace(/\.exe$/u, '');
const eRoot = (utente) => /^(?:root|0)$/iu.test(utente ?? '');

/** La riga in pezzi fra i separatori, ognuno in parole; le virgolette tengono insieme una parola e non si contano. */
function pezziDellaRiga(riga) {
  const pezzi = [[]];
  let parola = null, virgoletta = null;
  const chiudi = () => { if (parola !== null) pezzi.at(-1).push(parola); parola = null; };
  for (const ch of riga) {
    if (virgoletta) { if (ch === virgoletta) virgoletta = null; else parola += ch; continue; }
    if (ch === '"' || ch === "'") { virgoletta = ch; parola ??= ''; continue; }
    if (/\s/u.test(ch) && ch !== '\n') { chiudi(); continue; }
    if (';&|()\n`'.includes(ch)) { chiudi(); pezzi.push([]); continue; }
    parola = (parola ?? '') + ch;
  }
  chiudi();
  return pezzi;
}

function wslChiedeRoot(parole) {
  for (let i = 0; i < parole.length; i += 1) {
    const a = parole[i];
    if (FINE_OPZIONI_WSL.has(a)) return false;
    if (a === '--system') return true;
    if (a === '-u' || a === '--user') { if (eRoot(parole[i + 1])) return true; i += 1; continue; }
    if (a.startsWith('--user=')) { if (eRoot(a.slice('--user='.length))) return true; continue; }
    if (OPZIONI_WSL_CON_VALORE.has(a)) { i += 1; continue; }
    if (a === '~' || a.startsWith('-')) continue;
    return false; // il primo pezzo che non è un'opzione è il comando di Linux: il resto è suo
  }
  return false;
}

export function comandoChiedeRootWsl(comando) {
  if (typeof comando !== 'string' || !/wsl/iu.test(comando)) return false;
  return pezziDellaRiga(comando).some((parole) => {
    let i = 0;
    for (; i < parole.length; i += 1) {
      const p = parole[i];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(p) || INVOLUCRI.has(nomeProgramma(p))) continue;
      if (i > 0 && /^[-/]/u.test(p) && INVOLUCRI.has(nomeProgramma(parole[i - 1]))) continue;
      break;
    }
    const programma = nomeProgramma(parole[i] ?? '');
    if (programma === 'wsl') return wslChiedeRoot(parole.slice(i + 1));
    if (!GUSCI.has(programma)) return false;
    const opzione = parole.findIndex((p, j) => j > i && OPZIONI_DEL_GUSCIO.has(p.toLowerCase()));
    return opzione !== -1 && comandoChiedeRootWsl(parole.slice(opzione + 1).map((p) => (/\s/u.test(p) && parole.length - opzione > 2 ? `"${p}"` : p)).join(' '));
  });
}

/** Decisione 41: la distro esegue come root e non ha un utente normale, quindi `tools.wslNormalUser` acceso non può cambiare niente. */
export function distroSenzaUtenteNormale(fatti) {
    return Boolean(fatti) && fatti.uid === 0 && !fatti.utenteNormale
}

/**
 * Il disco di Windows su cui sta la cartella, visto da WSL: `C:\…` o `/mnt/c/…` (la forma che la sessione tiene dopo un
 * `cd`) → `{ montaggio: '/mnt/c', metadata }`. `null` se la cartella non è su un disco di Windows (`\\wsl$\…`);
 * `metadata: null` se il montaggio non è nei fatti.
 */
export function discoDellaCartella(fatti, cartella) {
    const testo = String(cartella ?? '')
    const m = /^([A-Za-z]):/u.exec(testo) ?? /^\/mnt\/([a-z])(?:\/|$)/u.exec(testo)
    if (!m) return null
    const lettera = m[1].toLowerCase()
    const montaggio = fatti?.montaggi?.[lettera]
    return { montaggio: `/mnt/${lettera}`, metadata: montaggio ? montaggio.metadata : null }
}
