# Il pacchetto di refactor UI dell'owner — custodia e prima analisi (11/09/2026, sera)

**Dove sta:** `.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_UI_Final_DropIn/` (estratto dallo
zip `Talos_Desktop_UI_Final_DropIn_20260911.zip`, 2.688.651 byte, 41 file, 3,6 MB estratti; lo zip
resta in `~/.claude/uploads/`, mai nel repo — `*.zip` è ignorato apposta dall'11/09).
**Versione:** `2026-09-11`, schema `talos.desktop.final-dropin.v1`. Checksum SHA-256 nel pacchetto.

## Che cos'è, letto nel pacchetto (non nella descrizione)

| pezzo | peso | cosa fa |
|---|---|---|
| `frontend/src/motion/desktop-scenes.js` | 48 KB | **14 scene Canvas animate** (Calm, Forge, Paper, Terminal, Aurora, Glacier, Ember, Atlas, Noir, Signal, Violet, Claudius, Basicus, Telemetry) |
| `frontend/src/motion/desktop-background.js` | 16 KB | il renderer: monta un Canvas decorativo sotto il contenuto, consuma i token del tema |
| `frontend/src/styles/desktop-final.css` | 19 KB | le rifiniture di Note, Ricerca approfondita, Libreria, Memoria, Attività, Impostazioni (foto in `review/`) |
| `public/talos-desktop-motion.js` + `talos-desktop-final.css` | 64 + 19 KB | gli stessi due, già costruiti per il `public/` corrente |
| `applica.mjs` / `verifica.mjs` / `ripristina.mjs` (+ `.ps1`/`.cmd`) | — | installatore idempotente con backup in `.talos/ui-backups/` e rollback per SHA |

Tre patch minime: `frontend/src/main.js` (4 righe: `await import('./motion/desktop-background.js')`
dopo `legacy/app.js`), `frontend/src/styles/main.css` (un `@import` finale), `public/index.html`
(un `<link>` e uno `<script type="module">` con `data-talos-final-ui`). `index.template.html` **non**
viene toccato.

## Preflight, fatto stasera in sola lettura sul nostro albero: ✓ 12/12
Tutte le ancore riconosciute (`main.js`, `main.css`, template, `public/index.html`, catena
tema/aspetto, i 5 file di payload). Il pacchetto era costruito sulla baseline `harness-ui.rar`, ma
le ancore reggono anche sul codice di oggi.

## ⛔ I cinque punti da chiarire PRIMA di applicarlo — nessuno è un rifiuto, sono le condizioni

1. **Riaccende lo sfondo animato, di proposito.** Il suo `installer-test.txt` lo dichiara: «Background
   settings group is visible when the real CSS-hidden rule is overridden by desktop-final.css».
   Cioè `desktop-final.css:48` scavalca la regola con cui oggi ho abolito la sezione «Sfondo» su
   ordine dell'owner. È coerente con quanto ha detto («ho risolto il fatto dei temi animati»), ma
   comporta due cose da fare nello stesso giro: togliere la mia regola di abolizione in
   `aspetto.css` (fondo del file) e **spegnere il cancello** `tests/parity/sfondo-animato-abolito.spec.mjs`
   dichiarandone il motivo — altrimenti diventa rosso di proposito.
2. **La patch a `public/index.html` viene cancellata da ogni nostra build.** Noi rigeneriamo
   `public/` con `npm run build` + `cp -r dist/. ../public/`: il `<link>`/`<script>` aggiunti a mano
   spariscono al primo build. Il README lo sa («nelle build successive il renderer e il CSS entrano
   dal grafo sorgente di `main.js`/`main.css`») — quindi la via giusta è **solo le patch ai sorgenti**
   e poi la NOSTRA build, non i due file precostruiti in `public/`.
3. **`STATIC_ASSETS` è una mappa cablata** (`src/static-files.mjs`): un file non elencato dà **404 in
   silenzio** (lezione dell'11/09 mattina, `avvio.js`). Se il renderer resta un asset separato
   (`talos-desktop-motion.js`), va aggiunto lì; se entra nel bundle via `main.js`, il problema non
   c'è. Da verificare a build fatta, con una richiesta HTTP, non a occhio.
4. **CSP con nonce**: `style-src 'self' 'nonce-…'` e `script-src`. Un `<link>`/`<script src>` esterni
   con `'self'` passano; uno stile o uno script INLINE no, in silenzio. Il pacchetto usa file
   esterni — bene — ma il Canvas che inietta stili via JS (`el.style` va, `<style>` creato no) va
   controllato una volta a runtime: `tests/parity/nessun-errore-a-runtime.spec.mjs`.
5. **Il Chrome dell'owner ha l'accelerazione hardware SPENTA** (misurato il 02/09: 6,1 → 109 ms per
   fotogramma). Quattordici scene Canvas che si ridipingono a ogni frame lì costano. Il pacchetto lo
   mitiga già («la scena principale della Chat diventa statica quando c'è un thread; la preview
   nelle Impostazioni continua a muoversi») — ma va **misurato nel suo browser**, non in headless.

## Che cosa NON c'è dentro (per non aspettarselo)
Nessun cambiamento alla Chat («chat preservata: nessuna nuova griglia»), nessun JS di prodotto oltre
al renderer, nessun test nostro. Le foto in `review/` sono sue: mostrano Attività, Impostazioni,
Libreria, Memoria, Note, Ricerca — vanno confrontate con le nostre nei due temi dopo l'applicazione.

## Piano di applicazione (quando l'owner dice di applicarlo)
Un agente Opus 5 (effort high), a albero FERMO (nessun altro agente su `frontend/`):
1. `verifica.mjs --root` (fatto: verde) → `applica.mjs --root` **su un worktree o un banco**, non
   sul 4174;
2. tenere le patch ai SORGENTI, scartare i due file precostruiti in `public/`, fare la nostra build;
3. togliere l'abolizione dello sfondo e il suo cancello, con il motivo scritto;
4. `STATIC_ASSETS` se serve; `nessun-errore-a-runtime` nei due temi; foto di OGNI sezione toccata
   (Note, Ricerca, Libreria, Memoria, Attività, Impostazioni, Chat) in chiaro e scuro a 1440 e 1024;
5. riadattare al sistema di design dove diverge (tokens.css): è un mockup, l'ha detto lui;
6. solo dopo: consegna al 4174 una volta sola, e misura dei fotogrammi nel Chrome vero.
