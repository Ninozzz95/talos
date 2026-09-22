/**
 * ambiente-solo-server.mjs — le variabili che il SERVER TALOS ha addosso solo perché gliele ha
 * messe il desktop, e che un processo lanciato PER LA PERSONA non deve ereditare.
 *
 * ⛔⛔⛔ CLI-REQ-04 (17/09/2026) + D1 del secondo giro. Nasce come costante dentro
 * `pty-terminal.mjs`, e si sposta qui perché adesso i clienti sono DUE: la shell della scheda
 * Terminale e il browser di sistema che `browser-vivo.mjs` avvia per la persona. Una copia per
 * cliente sarebbe due elenchi che divergono al primo segreto nuovo — e nessuno se ne
 * accorgerebbe, perché il risultato sbagliato (una variabile che passa) ha lo stesso aspetto di
 * quello giusto.
 *
 * ⛔ E non basta esportarlo da `pty-terminal.mjs`: quel modulo importa `node-pty`, un modulo
 * NATIVO, in cima. Farlo importare a `browser-vivo.mjs` legherebbe l'avvio del browser alla
 * presenza di un binding compilato che lì non serve. Un file senza dipendenze è la forma che
 * permette di riusare l'elenco invece di copiarlo.
 *
 * ⛔⛔ PERCHÉ UN ELENCO CHIUSO E NON IL FILTRO A FORMA del kernel (`ambienteSenzaCredenziali`,
 * D-10E) — decisione dell'owner, 17/09/2026. Questi processi sono della PERSONA: la scheda
 * Terminale è «un terminale vero e proprio [...] che non ha limiti» (intestazione di
 * `pty-terminal.mjs`), e il browser è il suo browser. Un filtro che toglie «tutto ciò che sembra
 * una credenziale» porterebbe via anche `GH_TOKEN`, `NPM_TOKEN`, `ANTHROPIC_API_KEY`,
 * `AWS_SECRET_ACCESS_KEY`: `gh` e `npm publish` funzionerebbero nella Git Bash della stessa
 * macchina e fallirebbero dentro TALOS. Si toglie SOLO ciò che esiste perché ce l'ha messo TALOS.
 *
 * ⛔⛔⛔ E IL KERNEL NON COPRE GIÀ QUESTI NOMI: il commit del primo giro lo affermava, ed era
 * FALSO. Misurato il 17/09/2026 chiamando `eUnaCredenziale()` di `kernel/talosHarness.mjs` sui
 * quattro nomi:
 *     TALOS_HARNESS_UI_TOKEN                  → true   (D-10E lo toglie)
 *     TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64   → true   (D-10E lo toglie)
 *     TALOS_HARNESS_RECEIPT_KEY_ID            → **false**
 *     ELECTRON_RUN_AS_NODE                    → **false**
 *     TALOS_HARNESS_SEARCH_API_KEY            → true
 *   Causa: `FORMA_DI_CREDENZIALE` (`talosHarness.mjs:3705`) ha `_KEY$` e `^KEY_` ma non `_KEY_`,
 *   e `ELECTRON_RUN_AS_NODE` non ha forma di credenziale perché non è un segreto — è un cambio
 *   di comportamento. ⇒ Quei due arrivano ancora all'attrezzo `shell` e a `prova` del modello.
 *   ⛔ NON è curato qui: il filtro del kernel è fuori dal perimetro di questa riga. È DICHIARATO,
 *   perché una cosa non curata e non scritta è una cosa dimenticata.
 */

/** ⛔ Le variabili che esistono solo perché TALOS le ha messe. Elenco CHIUSO, deciso dall'owner. */
export const VARIABILI_SOLO_DEL_SERVER = Object.freeze([
  // Il token di loopback: chi ce l'ha parla con la nostra API con l'autorità dell'interfaccia.
  'TALOS_HARNESS_UI_TOKEN',
  /*
   * ⛔ La coppia della firma ricevute va tolta INTERA, mai a metà: `parseFirmaRicevute`
   * (`config.mjs:627-634`) fallisce l'avvio quando ne trova una sola. Lasciare l'id addosso al
   * processo farebbe morire con ConfigurationError un TALOS lanciato da lì.
   */
  'TALOS_HARNESS_RECEIPT_KEY_ID',
  'TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64',
  /*
   * ⛔ Aggiunta nel secondo giro (B3): è la chiave della fonte di ricerca web, che il server legge
   * da `config.mjs:685` e tiene per sé. Sta nel NOSTRO spazio di nomi `TALOS_*`, cioè è nostra e
   * non della persona: è esattamente il criterio dell'owner («si toglie ciò che esiste perché
   * TALOS lo usa, non le credenziali della persona»). Nel primo giro non era stata decisa per
   * nome, ed è la ragione per cui la guardia qui sotto adesso legge anche `config.mjs`.
   */
  'TALOS_HARNESS_SEARCH_API_KEY',
  /*
   * Non è un segreto, è un cambio di comportamento: `runtime.mjs:56` la mette per far partire il
   * server come Node dentro l'eseguibile Electron. Ereditata, farebbe partire come Node semplice
   * QUALUNQUE programma Electron lanciato da lì.
   */
  'ELECTRON_RUN_AS_NODE',
]);

/*
 * ⛔ CLI-REQ-04, punto (a): le altre variabili che `runtime.mjs` mette nel figlio, dichiarate
 * innocue PER NOME invece che dimenticate in silenzio. La prova legge la sorgente di
 * `runtime.mjs` e di `config.mjs` e pretende che ogni nome stia in uno dei due elenchi.
 *
 * Perché innocue: host e porta sono un indirizzo di loopback, non una credenziale — senza il
 * token non aprono niente, e chi lavora nel terminale ha buoni motivi per sapere dove ascolta il
 * server. Il file di handshake contiene `{host, port}` e nient'altro (`server.mjs:775-777`). Le
 * tre cartelle dei dati e i due percorsi del motore locale sono percorsi sul disco della persona,
 * che dal terminale può già leggere.
 */
export const VARIABILI_DEL_SERVER_DICHIARATE_INNOCUE = Object.freeze([
  'TALOS_HARNESS_UI_HOST',
  'TALOS_HARNESS_UI_PORT',
  'TALOS_HARNESS_UI_REPORT_FILE',
  'TALOS_DESKTOP_DATA_DIR',
  'TALOS_HARNESS_UI_SESSIONS_DIR',
  'TALOS_LLAMA_SERVER_PATH',
  'TALOS_LLAMA_SERVER_FALLBACK_PATH',
  /*
   * ⛔⛔⛔ B-1 del terzo giro (17/09/2026) — DUE CREDENZIALI CHE RESTANO, DECISE PER NOME.
   *
   * `config.mjs:590-591` legge anche `OPENROUTER_API_KEY` e `HF_TOKEN`, e il primo giro non le
   * aveva decise: passavano perché la guardia guardava solo `runtime.mjs` e solo i nomi `TALOS_*`.
   * Passare per distrazione e passare per decisione si somigliano, e proprio per questo vanno
   * separati.
   *
   * ⇒ RESTANO, ed è la stessa regola dell'owner applicata dritta: sono credenziali della PERSONA,
   *   non cose che esistono perché ce le ha messe TALOS. Stanno nello spazio di nomi dei loro
   *   fornitori — come `GH_TOKEN`, `NPM_TOKEN`, `ANTHROPIC_API_KEY` — e chi apre il terminale se le
   *   aspetta: `huggingface-cli`, `curl` verso OpenRouter, la CLI di un altro agente. Toglierle
   *   sarebbe il filtro a forma che l'owner ha rifiutato, travestito da elenco.
   * ⛔ Il fatto che il server le LEGGA non le rende sue: le legge dall'ambiente della persona,
   *   non le mette lui. Il criterio è l'ORIGINE, non chi le usa.
   */
  'OPENROUTER_API_KEY',
  'HF_TOKEN',
]);

const NOMI_SOLO_DEL_SERVER = new Set(VARIABILI_SOLO_DEL_SERVER.map((nome) => nome.toUpperCase()));

/**
 * L'ambiente da dare a un processo lanciato PER LA PERSONA: tutto il suo, meno ciò che è solo del
 * server.
 *
 * ⛔ Confronto senza distinzione di maiuscole: su Windows i nomi delle variabili d'ambiente lo
 * sono, e `runtime.mjs:47` filtra già i suoi con una regexp `/i`.
 * ⛔ Gli `undefined` si scartano: `IPtyForkOptions.env` di node-pty 1.1.0 è
 * `{[key:string]: string|undefined}`, e `runtime.mjs:47` fa già lo stesso per il figlio.
 */
export function ambienteSenzaVariabiliDelServer(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([nome, valore]) => valore !== undefined && !NOMI_SOLO_DEL_SERVER.has(nome.toUpperCase())),
  );
}
