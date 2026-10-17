/*
 * ⭐ I SEGRETI DI r4 DALLO STDIN (owner, via la sessione mobile, 14/10/2026 notte: «Token di r4 dallo stdin»).
 *
 * Perché: sul telefono un segreto passato nell'AMBIENTE resta leggibile in `/proc/<pid>/environ` anche dopo
 * `delete process.env.X` (è il blocco iniziale del processo — misurato dalla sessione mobile), e i comandi dell'agente girano
 * con lo stesso utente del server. Dallo stdin invece il segreto non lascia traccia nell'ambiente, e qui NON ci entra: chi lo
 * usa lo riceve in una copia (`loadConfig`) o come argomento (il portachiavi a modulo), mai in `process.env`, così nemmeno i
 * processi figli lo ereditano.
 *
 * La forma (concordata con la sessione mobile):
 *   · `TALOS_HARNESS_UI_SEGRETI_DA=stdin` — l'unico valore ammesso; senza la variabile non si legge niente;
 *   · lo stdin si legge UNA volta all'avvio, prima del config, fino all'EOF: al più 4096 byte, entro 10 s (chi avvia DEVE
 *     chiuderlo dopo aver scritto); un terminale interattivo non è una fonte di segreti;
 *   · righe `NOME=valore` in UTF-8 separate da `\n` (un `\r` in coda si toglie), NOME `[A-Z][A-Z0-9_]*`, valore non vuoto;
 *     le righe vuote si ignorano, niente commenti;
 *   · un nome già nell'ambiente è un errore (mai due fonti per lo stesso segreto);
 *   · ⛔ il token di r4 (`TALOS_HARNESS_UI_TOKEN`) è OBBLIGATORIO, e solo dallo stdin: chi sceglie questa modalità la sceglie per
 *     sicurezza, e uno stdin vuoto o un nome sbagliato di una lettera facevano partire il server SENZA serratura (SEGRETI-REV-01
 *     del bugfixer, 14/10: /api rispondeva 200 senza cookie). Per la stessa ragione un nome `TALOS_HARNESS_UI_*` che r4 non
 *     consuma si rifiuta invece di finire al portachiavi: è quasi sempre un refuso del token;
 *   · ogni errore porta un codice `SECRETS_STDIN_*` e al più il NOME di una voce: mai un valore.
 * Ciò che r4 consuma (oggi solo `TALOS_HARNESS_UI_TOKEN`) va al config; il resto, congelato, al portachiavi a modulo.
 */

export const SEGRETI_DA_STDIN = 'stdin';
export const TETTO_SEGRETI_BYTE = 4096;
export const TEMPO_SEGRETI_MS = 10_000;
/** I segreti che r4 consuma da sé: non arrivano al portachiavi a modulo. */
export const SEGRETI_DI_R4 = Object.freeze(['TALOS_HARNESS_UI_TOKEN']);
const NOME = /^[A-Z][A-Z0-9_]*$/u;
/** Il prefisso dei nomi di r4: una voce con questo prefisso che r4 non consuma è un refuso, non un segreto per il portachiavi. */
const PREFISSO_DI_R4 = 'TALOS_HARNESS_UI_';
const TOKEN_DI_R4 = 'TALOS_HARNESS_UI_TOKEN';

function erroreSegreti(code, messaggio) {
  // il codice anche nel messaggio: il log d'avvio stampa il messaggio, e chi legge il log deve poter cercare il codice
  return Object.assign(new Error(`${code} (TALOS_HARNESS_UI_SEGRETI_DA): ${messaggio}`), { code });
}

/** Il testo letto ⇒ le voci. Esportata per le prove. */
export function leggiRigheDeiSegreti(testo, env = {}) {
  const voci = new Map();
  const righe = testo.split('\n');
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i].endsWith('\r') ? righe[i].slice(0, -1) : righe[i];
    if (riga === '') continue;
    const uguale = riga.indexOf('=');
    const nome = uguale > 0 ? riga.slice(0, uguale) : '';
    const valore = uguale > 0 ? riga.slice(uguale + 1) : '';
    if (!NOME.test(nome) || valore === '' || valore.includes('\r')) {
      throw erroreSegreti('SECRETS_STDIN_MALFORMED', `line ${i + 1} is not NAME=value${NOME.test(nome) ? ` (${nome})` : ''}.`);
    }
    if (voci.has(nome)) throw erroreSegreti('SECRETS_STDIN_DUPLICATE', `${nome} appears twice.`);
    if (Object.hasOwn(env, nome) && env[nome] !== undefined) throw erroreSegreti('SECRETS_STDIN_ALSO_IN_ENV', `${nome} is also in the environment: one source only.`);
    voci.set(nome, valore);
  }
  return voci;
}

/**
 * Legge i segreti, se l'ambiente lo chiede.
 * @param {{ env?: object, stdin?: import('node:stream').Readable & { isTTY?: boolean }, tettoByte?: number, tempoMs?: number }} [opzioni]
 * @returns {Promise<{ perR4: Record<string,string>, perIlPortachiavi: Readonly<Record<string,string>> }>} `perR4` va al config
 *   (in una copia dell'ambiente), `perIlPortachiavi` al modulo; senza la variabile, tutti e due vuoti.
 */
export async function leggiSegretiDaStdin({ env = process.env, stdin = process.stdin, tettoByte = TETTO_SEGRETI_BYTE, tempoMs = TEMPO_SEGRETI_MS } = {}) {
  const scelta = env.TALOS_HARNESS_UI_SEGRETI_DA;
  if (scelta === undefined || scelta === '') return { perR4: {}, perIlPortachiavi: Object.freeze({}) };
  if (scelta !== SEGRETI_DA_STDIN) throw erroreSegreti('SECRETS_STDIN_INVALID', `the only accepted value is "${SEGRETI_DA_STDIN}".`);
  if (!stdin || stdin.isTTY) throw erroreSegreti('SECRETS_STDIN_NOT_A_PIPE', 'the secrets must come from a pipe closed by whoever starts the server, not from a terminal.');
  const testo = await new Promise((risolvi, rifiuta) => {
    const pezzi = [];
    let letti = 0;
    let finito = false;
    const chiudi = (errore, valore) => {
      if (finito) return;
      finito = true;
      clearTimeout(orologio);
      stdin.removeListener('data', alDato); stdin.removeListener('end', allaFine); stdin.removeListener('error', allErrore);
      stdin.pause?.();
      if (errore) { stdin.destroy?.(); rifiuta(errore); } else risolvi(valore);
    };
    const alDato = (pezzo) => {
      const b = Buffer.isBuffer(pezzo) ? pezzo : Buffer.from(String(pezzo), 'utf8');
      letti += b.length;
      if (letti > tettoByte) { chiudi(erroreSegreti('SECRETS_STDIN_TOO_LARGE', `more than ${tettoByte} bytes.`)); return; }
      pezzi.push(b);
    };
    const allaFine = () => {
      const buf = Buffer.concat(pezzi);
      const testoLetto = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
      try { chiudi(null, testoLetto.decode(buf)); } catch { chiudi(erroreSegreti('SECRETS_STDIN_MALFORMED', 'not valid UTF-8.')); }
    };
    const allErrore = () => chiudi(erroreSegreti('SECRETS_STDIN_UNREADABLE', 'stdin could not be read.'));
    const orologio = setTimeout(() => chiudi(erroreSegreti('SECRETS_STDIN_NO_EOF', `stdin was not closed within ${tempoMs} ms.`)), tempoMs);
    orologio.unref?.();
    stdin.on('data', alDato); stdin.once('end', allaFine); stdin.once('error', allErrore);
    stdin.resume?.();
  });
  const voci = leggiRigheDeiSegreti(testo, env);
  for (const nome of voci.keys()) {
    if (nome.startsWith(PREFISSO_DI_R4) && !SEGRETI_DI_R4.includes(nome)) {
      throw erroreSegreti('SECRETS_STDIN_UNKNOWN_NAME', `${nome} is not a secret r4 reads (only ${SEGRETI_DI_R4.join(', ')}).`);
    }
  }
  if (!voci.has(TOKEN_DI_R4)) {
    throw erroreSegreti('SECRETS_STDIN_TOKEN_MISSING', `${TOKEN_DI_R4} must come from stdin in this mode: without it the server would start with no lock.`);
  }
  const perR4 = {};
  const perIlPortachiavi = {};
  for (const [nome, valore] of voci) (SEGRETI_DI_R4.includes(nome) ? perR4 : perIlPortachiavi)[nome] = valore;
  return { perR4, perIlPortachiavi: Object.freeze(perIlPortachiavi) };
}
