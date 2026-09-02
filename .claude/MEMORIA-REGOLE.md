# MEMORIA — le regole di ingegneria e la catena fino al telefono

> ⛔ **Terzo file dell'indice di memoria**, importato da `CLAUDE.md` come gli
> altri due. Nato il **2026-08-23**, quando `.claude/MEMORIA-LEZIONI.md` ha
> toccato **24.370 byte** contro un tetto di **25.000** oltre il quale il
> contenuto si taglia **in silenzio**.
>
> ⇒ Stessa regola di sempre: **non si accorciano le glosse, si sposta un
> blocco intero**. Qui stanno le regole di ingegneria e il tratto fra «ho
> compilato» e «sta girando sul Pad». Nessuna riga persa.
>
> ⛔ I file citati stanno in
> `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.

## Regole di ingegneria — spostate qui il 2026-08-22

> ⛔ Stesso motivo delle altre migrazioni: `MEMORY.md` si riavvicinava al
> tetto. Blocco intero spostato, non accorciato.

- ⛔⛔⛔⭐⭐⭐ [IL LAG ERA FUORI DAL CODICE: GPU SPENTA NEL BROWSER](il-lag-era-fuori-dal-codice-gpu-spenta-nel-browser.md) — 02/09, review complessiva desktop: tre chiusure GREEN vere e insufficienti; il Chrome dell'owner ha l'accelerazione hardware DISATTIVATA (Local State, nessuna policy). Stessa pagina, stesso Chrome: da fermo mediana **6,1 ms** con GPU, **109 ms** (p95 212) senza. ⛔ Il Chromium headless dei ledger è anch'esso software (30 fps): un p95 di 33 ms lì non prova niente sul desktop vero ⇒ prima di attribuire un lag al codice si legge `chrome://gpu` e si misura nel browser REALE. Stesso giro: una sessione col workspace = intero **Desktop** accumula 490 `WorkspaceChanged` (355 dopo la fine del giro) in un log da 1,9 MB rigiocato a ogni apertura — la guardia copre solo `C:\`. Consegna: `.claude/CONSEGNA-REVIEW-COMPLESSIVA-2026-09-02.md`
- ⛔⛔⛔⭐⭐⭐ [IL CANCELLO SEMANTICO ERA SPENTO DA SEMPRE](il-cancello-semantico-era-spento-da-sempre.md) — 27/8, `talosHarness.mjs`: `libreriaStandard()` senza il suo argomento obbligatorio lanciava sempre, inghiottito da un `catch` che risponde `'ignoto'` (non blocca). Il cancello semantico — garanzia G2, differenziatore documentato — non ha MAI respinto una scrittura in nessuna campagna TALOS-BANCO fino a oggi. ⛔ Nessun test se n'era accorto perché ognuno provava solo che una scrittura LEGITTIMA passasse, mai che una illegittima venisse respinta — un cancello inerte supera quella prova come uno vero. Stesso giro: [esisteva letto dal cancello filtrato, non dal disco](esisteva-filtrato-dal-cancello-non-dal-disco.md) — `.md/.json/.txt` restavano sempre "nuovo" anche se già sul disco. Curati entrambi, provati anche al VERSO CONTRARIO (una funzione inventata → `premesseNegate:1` per davvero), commit `01ad12b4`/`3a7c241b`
- ⛔⛔⛔ [DUE SESSIONI, STESSA CARTELLA, intrecciano i commit](due-sessioni-stessa-cartella-intrecciano-i-commit.md) — 26/8: `git commit` fotografa l'INTERO indice condiviso, non solo i file appena aggiunti da chi lo lancia. Cura strutturale, non disciplina da ricordare: `git worktree add` per ogni sessione parallela sullo stesso progetto
- ⛔⛔⛔ [NON HO OWNERSHIP SU MOBILE](non-ho-ownership-su-mobile.md) — owner 02/09: "ricordatelo". La mia ownership è SOLO `lane/harness-desktop`. Un difetto trovato in `mobile/` (anche preciso, anche con file:riga pronti) si registra/segnala, non si corregge — leggere ovunque autorizzato, scrivere solo nella propria lane
- ✅⭐⭐⭐ [STADIO B CHIUSO — tre condizioni scartate](stadio-b-tre-condizioni-scartate.md) — 26/8: `GIRI_MASSIMI=32` da solo (mai confrontato fino in fondo), nudge `cerca` da solo (stima identica, 0,875) e i due insieme (0,75, ma n=1 e IC sovrapposti) — nessuno supera la soglia di distinguibilità del bootstrap. Rollback a 24 in `talosHarness.mjs` (`94a08cd`): è il rollback che il design "validato, con rollback" prevede, non un'autorizzazione a parte
- ⛔⭐⭐ [`wm size` NON ruota davvero: serve accelerometer](wm-size-non-ruota-davvero-serve-accelerometer.md) — 26/8, tablet portrait chiuso da remoto (owner non davanti al Pad): `accelerometer_rotation 0` + `user_rotation 0`, verificato sui byte dello screenshot (2400×3392). Corregge una lettura sbagliata tenuta per giorni («serve il tocco fisico»)

- ⛔⛔⭐⭐⭐ [Una corsa FALLITA riporta i numeri di IERI](una-corsa-fallita-riporta-i-numeri-di-ieri.md) — due volte in un giorno: il runner esce 1 e lo script legge il file della campagna prima. ⛔ **Numeri troppo uguali sono un allarme**, non una conferma
- ⛔⛔⭐⭐⭐ [Il banco non vede CHI MANCA](il-banco-non-vede-chi-manca.md) — `(nessuno)` prova che il banco misura qualcosa; **niente** prova che li abbia guardati tutti. Un concorrente e rimasto fuori **quattro giorni** senza che un rapporto protestasse. ⇒ Chi costruisce una misura costruisce anche la riga che dice **chi non c e**
- ⛔⛔⭐⭐ [Una ESCLUSIONE si misura come un ESITO](dsh-escluso-su-una-premessa-falsa.md) — avevo tolto DSH dal banco su una mia occhiata, contro un audit del sorgente che diceva l opposto. ⛔ Quando una mia nota contraddice una ricerca dell owner, **vince la ricerca** finche non ho una misura
- ⛔⛔⭐⭐ [La consegna NON entra nella riga di comando](la-consegna-non-entra-nella-riga-di-comando.md) — i backtick di un task **eseguiti da bash** prima che l harness lo vedesse. Il testo viaggia in una variabile e si espande con `"$VAR"`; per WSL serve `WSLENV=NOME/u'
- ⛔⭐⭐ [Scrivere un file da Python lo converte in CRLF](scrivere-un-file-da-python-lo-converte-in-crlf.md) — tutto il file, e un test che legge il sorgente nativo diventa rosso
- ⛔⛔⭐⭐⭐ [IL PROMEMORIA DOVE GUARDA PER ULTIMO](il-promemoria-dove-guarda-per-ultimo.md) — 3 su 3 in una notte: non riscrivere la regola, SPOSTARLA
- ⛔⛔ [Una frase sola prova UNA FRASE SOLA](una-frase-sola-prova-una-frase-sola.md) — servono **tre-quattro formulazioni diverse**
- ⛔⛔ [Il buco non era una cosa MANCANTE](il-buco-non-era-una-cosa-mancante.md) · ⛔⛔ [MAI azzoppare l'app per far tornare un tetto](mai-azzoppare-lapp-per-un-tetto.md) — il tetto **si alza**
- ⛔ [NIENTE SCRITTO A MANO](nothing-hardcoded-must-adapt.md) — un fatto sul telefono **si misura** · ⛔ [Una grammatica sola per i permessi](permissions-single-global-grammar.md) — sempre/chiedi/nega
- ⛔⛔⭐⭐ [MAI MODELLI DI PUNTA: sempre fascia flash](mai-modelli-di-punta-sempre-flash.md) - owner 20/8. ⛔ «non troppo» economici: un modello debole fa misurare IL MODELLO. Haiku $0,0358/task contro Opus $0,351. ⛔ Il costo lo dice il CREDITO del provider, non il CLI
- ⛔ [Le prove col modello A CHIAVE](per-le-prove-modelli-a-chiave.md) — i locali si allineano DOPO
- ⛔ [L'andata e ritorno NON prova la compatibilità](andata-ritorno-non-prova-compatibilita.md) — si **ricalcola l'atteso a mano** · [Assert outcome](assert-outcome-not-the-call.md) — PROVA che il test morde
- ⛔⭐⭐ [Vitest legge il Java: toccato il nativo, lancia vitest](vitest-legge-il-java-va-lanciato.md) — 2 release fallite
- ⛔ [Il typecheck a mano non controlla niente](typecheck-vuoto-tsconfig-root.md) — solo `npm run typecheck`; ⛔ non i test
- [Tutta la pipeline](analyze-whole-component-pipeline.md) — IPER-BLOCCANTE · [End to end](end-to-end-or-not-at-all.md) · [frontend-design SEMPRE](always-use-frontend-design-plugin.md)
- [Avviabili dalla chat](features-startable-from-chat.md) — DUE porte · [Niente statico](app-distributed-nothing-static.md) · [Windows shell & gate](windows-shell-and-gate-discipline.md) · [Per-user installs](per-user-installs-only.md)
- ⛔ [Una corsa da ore si STACCA dalla sessione](corsa-lunga-si-stacca-dalla-sessione.md) — `run_in_background` muore

## 🔧 La CATENA fino al telefono — spostate qui il 2026-08-21

> ⛔ Non sono state buttate: `MEMORY.md` aveva superato i **19,9 KB** e la
> regola dice di spostare un BLOCCO INTERO invece di accorciare le glosse.
> Queste quattro riguardano tutte la stessa cosa — il tratto fra «ho
> compilato» e «sta girando sul Pad» — e restano vincolanti come prima.

- ⛔⛔⭐⭐⭐ [Una cartella creata da ADB e' INVISIBILE all'app](una-cartella-creata-da-adb-e-invisibile-allapp.md) — il GGUF c'e', l'impronta e' giusta, e l'app non lo vede: cartelle di `shell` 0770
- ⛔⛔⛔⭐⭐⭐ [connectedAndroidTest DISINSTALLA e porta via i modelli](connectedandroidtest-disinstalla-e-porta-via-i-modelli.md) — 20/8: BUILD SUCCESSFUL, e sul Pad non c'era piu' ne' l'app ne' un solo GGUF
- ⛔⛔⭐⭐⭐ [Il build NON arriva al telefono](il-build-non-arriva-al-telefono.md) — senza `npx cap copy android` ogni sonda misura il build PRECEDENTE, con numeri plausibili e **nessun errore**
- ⛔⛔⭐⭐ [I test verdi in NODE non parlano del telefono](i-test-verdi-in-node-non-parlano-del-telefono.md) — Node ha ripieghi che il browser non ha
