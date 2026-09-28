/**
 * Il motore installato conosce l'architettura di un modello? — 27/09/2026.
 *
 * ⛔ Sessione dell'owner ec3bc6c0 (Spark-X2.5-4B, 27/09 notte): tre giri su tre «llama-server si è chiuso dopo 0 s … failed to
 *   load model». Misurato a mano con la stessa build (`.local-runtime/b10517/llama-server.exe -m … -ngl 0 --device none`):
 *   `E llama_model_load: error loading model: unknown model architecture: 'spark2_5'`. L'intestazione del GGUF dichiara
 *   `general.architecture = spark2_5`, e la scheda Hugging Face del modello dice «Native spark2_5 support requires llama.cpp
 *   b10828 or later»: il motore b10517 non sa leggerlo, e nessun riavvio lo cambia. La carta però mostrava le ultime quattro
 *   righe del motore, e la riga col perché era la quinta dal fondo.
 *   Owner, 27/09: «errore chiaro ora, motore dopo» (l'aggiornamento del motore sta nella fase «Motore locale» dopo la release).
 *
 * ⭐ Come si sa, senza avviare niente: i nomi delle architetture di llama.cpp sono stringhe della tabella `LLM_ARCH_NAMES`
 *   (`src/llama-arch.cpp`), e nella libreria compilata stanno come testo seguito da NUL. MISURATO su `llama.dll` b10517:
 *   `qwen35`, `qwen35moe`, `gemma4`, `lfm2`, `glm4`, `gpt-oss` presenti, `spark2_5` assente.
 *   ⛔ Si cerca `nome\0`, NON `\0nome\0`: il compilatore fonde le code uguali, e `bert` vive solo come coda di `nomic-bert`
 *   (misurato: `\0bert\0` assente, `bert\0` presente). Con `nome\0` un'architettura CONOSCIUTA non può mancare (il suo nome
 *   c'è per forza), quindi la risposta «non la conosce» non ha falsi negativi; un falso positivo (un nome sconosciuto che è la
 *   coda di uno conosciuto) lascia solo partire il motore, e lì la riga «unknown model architecture» lo dice lo stesso.
 * ⛔ Nessuna libreria trovata ⇒ `null` («non lo so»), mai «non la conosce»: un controllo che non sa non blocca.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const NOMI_LIBRERIA = ['llama.dll', 'libllama.so', 'libllama.dylib'];
/** La riga con cui llama.cpp rifiuta un'architettura che non conosce (`llama-model-loader`/`llama-arch`), misurata il 27/09. */
export const RIGA_ARCHITETTURA_SCONOSCIUTA = /unknown model architecture:\s*'([^']+)'/u;

const cache = new Map(); // percorso della libreria → { mtimeMs, dati }

function libreriaDelMotore(cartella) {
  let nomi;
  try { nomi = readdirSync(cartella); } catch { return null; }
  const nome = NOMI_LIBRERIA.find((n) => nomi.includes(n));
  return nome ? join(cartella, nome) : null;
}

/** C'è una libreria del motore accanto al binario? Senza, il controllo non può valere e il GGUF non si legge nemmeno. */
export function libreriaDelMotorePresente(binario) {
  return typeof binario === 'string' && binario !== '' && libreriaDelMotore(dirname(binario)) !== null;
}

/**
 * `true` se la libreria del motore nella cartella di `binario` contiene il nome, `false` se non lo contiene, `null` se non si sa
 * (nessuna libreria, nome vuoto, lettura fallita).
 */
export function motoreConosceArchitettura(binario, architettura, { leggiFn = readFileSync, statFn = statSync } = {}) {
  if (typeof architettura !== 'string' || architettura === '' || typeof binario !== 'string' || binario === '') return null;
  const libreria = libreriaDelMotore(dirname(binario));
  if (!libreria) return null;
  try {
    const mtimeMs = statFn(libreria).mtimeMs;
    let voce = cache.get(libreria);
    if (!voce || voce.mtimeMs !== mtimeMs) { voce = { mtimeMs, dati: leggiFn(libreria) }; cache.set(libreria, voce); }
    return voce.dati.indexOf(Buffer.from(`${architettura}\0`, 'latin1')) >= 0;
  } catch {
    return null;
  }
}

/** La build del motore dal percorso della sua cartella (`…/.local-runtime/b10517-vulkan/llama-server.exe` → `b10517`), o null. */
export function buildDelMotore(binario) {
  const m = /(?:^|[-_/\\])(b\d{4,6})(?:[-_/\\]|$)/u.exec(`${dirname(String(binario ?? ''))}/`) ?? /\b(b\d{4,6})\b/u.exec(basename(dirname(String(binario ?? ''))));
  return m ? m[1] : null;
}

/** Il testo della carta: che cosa, e perché nessun riavvio lo cambia. */
export function testoArchitetturaSconosciuta(architettura, build) {
  const motore = build ? `il motore installato (llama.cpp ${build})` : 'il motore installato';
  return `Il modello usa l’architettura «${architettura}», che ${motore} non sa leggere: serve una versione più recente del motore, e riprovare non cambia niente.`;
}
