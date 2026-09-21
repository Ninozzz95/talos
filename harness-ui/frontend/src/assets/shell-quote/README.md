# shell-quote 1.10.0 — `parse`, vendorizzato il 16/09/2026

**Da dove viene.** `https://cdn.jsdelivr.net/npm/shell-quote@1.10.0/parse.js`
(pacchetto npm `shell-quote`, versione **1.10.0**, licenza **MIT**, autore James Halliday).
Licenza integrale in `LICENSE-shell-quote`, presa da
`https://cdn.jsdelivr.net/npm/shell-quote@1.10.0/LICENSE` lo stesso giorno.
Il pacchetto **non ha dipendenze di produzione** (verificato su
`https://registry.npmjs.org/shell-quote/latest` il 16/09/2026): è un file solo, e sta nel repo
come xterm e Prism — nessun `npm install` nuovo.

**Perché questo e non un altro.** La colonna «Processi» deve formattare un comando per
*significato* (eseguibile · sottocomando · flag · argomenti · percorsi · URL · pipe · redirezioni),
e una divisione per spazi sbaglia su `git commit -m "due parole"`, su `'a b'`, sugli escape e sugli
operatori attaccati (`a>b`). Le due alternative viste il 16/09/2026 sono:

* **mvdan-sh** (il parser Go di `mvdan/sh` compilato in JS con GopherJS): è il parser più fedele in
  circolazione, ma il bundle pesa alcuni MB — sproporzionato per colorare una riga in una colonna
  laterale, e finirebbe nel pacchetto servito.
* **@ericcornelissen/bash-parser**: AST completo (POSIX), ma è un albero di moduli, non un file, e
  vendorizzarlo vuol dire vendorizzare anche le sue dipendenze.

`shell-quote/parse` sta in mezzo: è uno **scanner vero** delle regole di quoting di Bash (virgolette
singole, doppie, escape, cambio di contesto dentro la stessa parola), riconosce gli **operatori di
controllo** (`|| && ;; |& <( <<< >> >& <& & ; ( ) | < >`), i **glob** e i **commenti`#`**, in poche
centinaia di righe senza dipendenze. È esattamente ciò che serve per MOSTRARE un comando.

**Che cosa NON fa, e come lo gestiamo.**

* Non è un AST: non distingue da solo «sottocomando» da «argomento». Quella parte è nostra e sta in
  `src/components/comando-shell.js`, dietro un adattatore: se domani il parser cambia, cambia un
  file solo.
* Non conserva le virgolette originali (`-m "due parole"` torna come token `due parole`).
  L'adattatore le **rimette** quando il token contiene spazi o metacaratteri, e lo dichiara.
* Espande le variabili. In TALOS **non si espandono**: l'adattatore passa un `env` che restituisce
  la variabile a se stessa (`$HOME` → `$HOME`), perché qui il comando si **mostra**, non si esegue.

**Sicurezza.** L'avviso GHSA-w7jw-789q-3m8p / CVE-2026-9277 (giugno 2026) riguarda `quote()`, la
funzione *inversa*, ed è corretto da 1.8.4 in poi; qui è vendorizzata la sola `parse()` della
1.10.0, che è successiva alla correzione. `parse()` non esegue niente: trasforma una stringa in un
elenco di token.

**Modifiche al file.** Due, meccaniche, elencate anche in testa a `parse.js`: tolte le annotazioni
`@type`/`@import` di TypeScript, e `module.exports =` diventato `export default` (questo bundle è
ESM). L'algoritmo è quello di monte, riga per riga.
