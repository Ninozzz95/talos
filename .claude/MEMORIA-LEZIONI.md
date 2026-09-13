# MEMORIA — le lezioni chiuse

> Questo file è la **seconda metà dell'indice di memoria**, importata da
> `CLAUDE.md` alla radice del repo. Esiste perché `MEMORY.md` ha due tetti
> COMPILATI dentro claude.exe — **200 righe** e **25 KB** — e oltre quelli il
> contenuto viene tagliato **in silenzio**, senza che nessuno se ne accorga.
> Owner 2026-08-19: «dobbiamo trovare il modo per aumentare il tetto».
> ⇒ Il tetto non si alza: si sdoppia l'indice. Nessuna riga è stata persa.
>
> ⛔ I file citati qui sotto stanno in
> `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.
> Si aprono per nome, come dall'altro indice.

## ✅ Spostata qui il 03/09 — la voce chiusa del 27/8 sul gitignore

> ⛔ `MEMORY.md` era a **20.429 byte** contro il tetto d'allarme di 19.900 dopo la voce
> «consiglio modello ed effort a ogni fase». Questa era già ✅ e stava ancora fra gli APERTI:
> blocco intero spostato, non accorciato.

- ✅⛔⛔⭐⭐⭐ [27/8 — `mobile/docs/` bloccava in silenzio OGNI screenshot nuovo dal 18/8](gitignore-mobile-docs-blocca-screenshot-nuovi.md) — un pattern di directory (`mobile/docs/`) rendeva inerte la negazione `!docs/immagini/*.png`; corretto a `mobile/docs/*` + `!mobile/docs/immagini/` (il GLOB, non la directory, è la forma che funziona) — verificato con `git check-ignore -v`, zero effetti collaterali sul resto già tracciato. 🔜 Resta APERTO solo `git add`/`git commit` dei tre screenshot: cartella condivisa con una sessione viva, decide l'owner · [[harness-ui-inglese-debito-readme]] — screenshot harness in italiano nel README, eccezione esplicita dell'owner, debito registrato

## ✅ Chiusa il 24/8 — il buco RTF non spiegato

> ⛔ Spostata qui dagli APERTI di `MEMORY.md` il 24/8: l'indice era a 19.819
> byte, sopra il tetto d'allarme di 19.900. Il motore Pocket TTS che questa
> voce descriveva come rotto è lo stesso che `CHANGELOG.md` v0.1.19 (scritto
> lo stesso giorno) dichiara riparato — stutter e underrun misurati spariti,
> tempo al primo audio 449-537 ms — quindi la voce è chiusa, non solo spostata.

- ✅⛔⛔⭐⭐⭐ [0.1.19 — il buco NON SPIEGATO era più grande del deficit](il-buco-non-spiegato-era-piu-grande-del-deficit.md) — il file prediceva RTF 0,73-0,89, il Pad misurava **1,5**: ~50 ms/frame attribuiti a niente contro i **40** che servivano. Causa candidata verificata alla fonte (`torch.cat` a ogni frame, O(T²)). Chiusa nel rifacimento del motore su Pocket TTS, v0.1.19

## ✅ Le CHIUSE del 23/8 — il banco che misura se stesso, e il guardiano che accusava

> ⛔ Aggiunte qui e non in `MEMORY.md`: quello era a **19.354 byte** su un tetto
> d'allarme di 19.900, e sono lezioni **chiuse**. In `MEMORY.md` resta la sola
> riga vincolante, quella sull'uccidere un processo.

- ⛔⛔⛔⭐⭐⭐ [LA COLONNA DEL COSTO HA UNA RISOLUZIONE](la-colonna-del-costo-ha-una-risoluzione.md) — `(nessuno)` non chiama nessuna API **per costruzione**, e gli erano attribuiti **$0,0276**: il banco aveva addosso da sempre una sonda di taratura mai letta. ⇒ **risoluzione $0,0021 per riga**, e **talos ($0,0014) e aider ($0,0016) stanno SOTTO**: il confronto fra i due non ha contenuto. ⭐ L'errore **scivola in avanti** — la baseline corre dopo codex ed è il 6-23% della sua spesa sullo stesso task, 13 su 13, mai negativo (r = 0,545): è fatturazione in ritardo, `ATTESA_DEL_CREDITO_MS = 4_000` è troppo corta. ⛔ La cura NON è allungare l'attesa (nessuna la garantisce): è **dichiarare la risoluzione**, perché «sotto la risoluzione» non è «economico». ⛔ E il totale di aider ($0,0273) è della **stessa taglia** dell'errore: il primo in classifica sta dentro il rumore
- ⛔⛔⛔⭐⭐⭐ [IL GUARDIANO ACCUSAVA LA SESSIONE DELL'OWNER](il-guardiano-accusava-la-sessione-dellowner.md) — la sorveglianza gridava «3 ORFANI, rubano CPU» e uno era **`codex resume` dell'owner, vivo**: nomina un harness, è nato dopo la corsa, e il genitore è morto perché è una shell staccata. **Due volte a un passo dall'ucciderlo**, e la seconda gli stessi tre erano un albero **vivo della campagna** su un task pagato. ⛔ **Terza forma** dello stesso difetto in un giorno: *un filtro che riconosce la MENZIONE invece della cosa*. ⭐ Cura: l'appartenenza **si prova** — l'orfano o un suo figlio devono toccare una cartella `banco-*`. ⭐ E ogni allarme porta **CHI**, non solo quanti. ⛔ Quattro banchi di prova a mano hanno MENTITO (gli escape non sopravvivono alla shell): si prova dalla **porta vera**, `unGiro()`
- ⛔⛔⭐⭐ [IL DEBUG WIRELESS MOSTRA IL PAD DUE VOLTE](il-debug-wireless-mostra-il-pad-due-volte.md) — due trasporti per lo stesso tablet ⇒ ogni adb senza `-s` muore con *more than one device/emulator*. ⛔ `run-device-tests.mjs` **stampava** l'indirizzo e poi falliva all'install: sapere e non passare. ⭐ Riparato (seriale scelto una volta, passato ovunque, si ferma se non è collegato) e dotato di **prova a secco** `TALOS_PROVA_A_SECCO=1`: i comandi che leggono girano davvero, quelli che cambiano il telefono si stampano. ⛔ `termica.mjs` no: vuole `ANDROID_SERIAL`

## ✅ Spostate qui il 23/8 (seconda tranche) — tre lezioni chiuse rimaste nell'indice sbagliato

> ⛔ `MEMORY.md` era di nuovo sopra il tetto d'allarme (19.987 byte su
> 19.900) dopo l'aggiunta del terzo documento custodito sul motore locale
> (il piano tecnico Fase 4/5). Questi tre bullet erano già senza `🔜` — cioè
> già lezioni chiuse, mai migrate dall'indice degli aperti. Testo
> invariato, solo spostato e marcato ✅.

- ✅⛔⭐⭐ [Plugin Capacitor terzo che crasha: si SCAVALCA con load()](plugin-capacitor-terze-parti-si-scavalca.md)
- ✅⛔⭐⭐ [OnePlus 13: crash avvio, getPermissionState NULL](getpermissionstate-torna-null.md) — chiuso; manca il giro completo
- ✅⛔⛔⭐⭐⭐ [ROMA a chi era a CATANIA](roma-a-chi-era-a-catania.md) — la precisa era negata e tacevamo; ⛔ la mia nota era falsa: 6 decimali, il codice ne fa 4

## ✅ CHIUSI — le lezioni che restano — spostate in CATALOGO.md il 13/09/2026

> ⛔ **Spostato in CATALOGO.md il 13/09/2026** (cartella della memoria, sezione «Le lezioni
> CHIUSE»). Questo indice era a **22.749 byte** contro il tetto d'allarme di 19.900, e questa
> sezione da sola ne pesava **13.958** — il **61%** del file. Blocco intero, non accorciato:
> nessuna riga persa.
>
> ⭐ Il blocco si e' scelto **misurando ogni sezione**, non a occhio: le altre sei insieme
> facevano 8.153 byte, quindi spostare qualunque altra cosa non avrebbe risolto niente.
>
> Li' dentro: lo schermo e l'occhio, il dire il vero su cosa e' successo, voce e orecchio, il
> telefono e ColorOS, interrogare il telefono, impostazioni e consensi, il costo che non si
> vedeva, il banco che si legge da solo, il crash del 22/8, il rilascio della 0.1.18, schede e
> resoconto, WebView e finestre, strumenti che mentono, ponte e diagnosi, chat e dati.

## ✅ Le CHIUSE del 20-21/8 — spostate qui il 2026-08-22

> ⛔ `MEMORY.md` era a **19.664 byte** contro un tetto di allarme di 19.900,
> e oltre i 25 KB compilati il contenuto si taglia **in silenzio**. Queste
> cinque voci erano già marcate ✅ e stavano ancora nell'indice degli APERTI:
> sono lezioni chiuse, e il loro posto è qui. Blocco intero, non accorciato.

- ✅⭐⭐⭐ [«Scatta foto» NON crasha: la fotocamera non c'è](assistente-crasha-su-scatta-foto.md) — fra i 15 attrezzi **nessuno scatta**
- ✅⭐⭐ [Due misure che non tornavano](le-due-misure-che-non-tornano.md) — chiuso: lo strumento è fedele a **0,0005**
- ✅⛔⛔⭐⭐⭐ **0.1.16 — la UI Ricerca approfondita: FATTA** (20/8): contesa aperta sul rapporto, tenuta nel tempo, BibTeX/RIS, fonti+token in testata. ⛔ La contesa NON POTEVA esistere — [funzione coi test e nessun chiamante](funzione-con-i-test-e-nessun-chiamante.md). Resta fuori: «estendi con una linea» → [ledger](ricerche-custodite-fuori-dal-repo.md)
- ✅⛔⭐⭐⭐ [Lo STOP sotto GPU — CHIUSO il 21/8](stop-sotto-gpu-non-interrompe.md) — la cura in `ggml-opencl` porta 1.430 → **32/36/36 ms** al microbatch PIENO **512**: il 192 non serve piu. ⛔ Il costo della cura e **per GRAFO**, non per token ⇒ un riferimento «senza cura» dentro un confronto fra configurazioni e un **fantasma**
- ✅⭐⭐⭐ [L'ABORT su GPU e' una FUNZIONE MANCANTE — **implementata il 21/8**, non una legge](labort-su-gpu-e-una-funzione-mancante.md) — la implementano solo CPU e **Metal**; `ggml-opencl` ha `get_proc_address = NULL`. Cura ~30 righe a **costo zero**, e upstream #10509 e' **stale**

## 📱 Mobile — spostato in CATALOGO.md il 2026-09-04

> ⛔ Questo file aveva superato i **25.000 byte** (25.580), il tetto oltre cui il contenuto si
> taglia **in silenzio**: gli aperti della lane mobile e le regole dell'assistente sul telefono
> sono in `CATALOGO.md`, sezione «Mobile, 04/09». Restano vere; semplicemente non le implemento
> io (ownership mobile revocata dall'owner il 04/09) e non devono consumare un indice che si
> carica a ogni sessione desktop.
