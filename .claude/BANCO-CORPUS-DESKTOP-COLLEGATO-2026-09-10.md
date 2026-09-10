# Il corpus del desktop è collegato al banco — 10/09/2026

Owner: «si» (punto 3). Fatto, e provato — anche nel verso che poteva fare danno.

## Che cosa mancava davvero, e non era dove il rapporto diceva

`preparaDaCommit(task)` vuole `task.daCommit = { genitore, sha, test }`. L'agente aveva scritto che
i suoi task «portano `daCommit.repo`, `daCommit.miniera` e `daCommit.ambito`». **Non è così**: quel
campo non esiste in nessuno dei due file prodotti — `repo`, `miniera` e `ambito` stanno alla
**radice** del JSON gemello, non dentro i task. Verificato prima di scrivere una riga.

## ⛔ E una differenza che il mobile non aveva

Per il corpus mobile la miniera **era** il clone git: `git archive` e i `node_modules` venivano
dallo stesso posto, e una costante bastava. `AVM-miniera-desktop` invece **non è un repository**
(verificato: «fatal: not a git repository»): tiene soltanto i due `node_modules` — `harness-ui/`
(76 pacchetti) e `harness-ui/frontend/` (12) — mentre l'albero si estrae dal repo vero.

⇒ Tre campi separati, non uno: `repo` (da dove si estrae), `miniera` (da dove si aggancia),
`agganci` (quali percorsi). Chi non li dichiara ottiene **esattamente** i valori di prima: i 36 task
mobile non cambiano di un byte — provato.

## ⛔⛔ Il punto che poteva costare la campagna

`buttaConCura` stacca la giunzione prima di cancellare, «o si cancella la miniera»: `rmSync`
ricorsivo **segue** una giunzione, e dall'altra parte non c'è una copia ma i pacchetti condivisi da
tutti i giri. Il mobile ne aveva **una**, il desktop ne ha **due**.

⇒ Staccarne una su due sarebbe stato **peggio che non staccarne nessuna**: la seconda sarebbe stata
seguita e cancellata, e la diagnosi sarebbe arrivata molto dopo, su un task a caso, come «vitest non
trovato». Ora l'elenco degli agganci viaggia col task e `buttaConCura` li stacca tutti.

## La prova, su un task vero

| controllo | esito |
|---|---|
| albero del genitore montato | sì (`harness-ui/src` presente) |
| nessuna `.git` nell'albero (*history isolation*) | sì |
| `harness-ui/node_modules` | **GIUNZIONE**, non copia |
| `harness-ui/frontend/node_modules` | **GIUNZIONE**, non copia |
| test del commit montato sull'albero del genitore | sì |
| spazio buttato | sì |
| **miniera dopo il butta** | **76 e 12 — intatta** |

## Che cosa è collegato, e che cosa no

`corpusDesktopAlBanco.mjs` espone **50 task** (`verificato: true`), non 266. Gli altri sono
candidati: farli entrare in una misura significherebbe contare come «fallimento del modello» un task
che nessuno ha mai provato essere risolvibile. `corpusDesktop({soloVerificati:false})` li dà tutti,
per contarli — mai per misurare.

⛔ **Resta da fare, e non l'ho fatto**: chiamare questo corpus da `corsaCoding.mjs`. Il collegamento
c'è ed è provato, ma quale corpus entra in una campagna decide quanto vale ogni confronto passato —
è la scelta del denominatore, e la fa l'owner.

⛔ `TALOS-BANCO` **non è un repository git**: nessuna di queste modifiche è versionata lì. Copie in
`scratchpad/banco-spazioDaCommit.mjs`, `scratchpad/banco-corpusDesktopAlBanco.mjs`,
`scratchpad/harness-banco-con-leva-p13.mjs`, più l'originale intatto in
`scratchpad/spazioDaCommit-PRIMA.mjs`.
