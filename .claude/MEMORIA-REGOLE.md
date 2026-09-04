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

- ⛔⛔⛔⭐⭐⭐ [UNA SONDA DI UN'ALTRA SESSIONE SCRIVE SUL SERVER VIVO](una-sonda-di-unaltra-sessione-scrive-sul-server-vivo.md) — 02/09: il «falso read-only» e l'ID modello `talos-test/…` nella sessione dell'owner erano righe `impostazioni-sessione` scritte da una sonda di un'altra sessione Claude sul server 4174 (dump nel suo scratchpad). ⛔ Una sonda non tocca MAI 4174 né una sessione che non ha creato; davanti a un comportamento «impossibile» prima il JSONL della sessione (CHI ha scritto), poi il codice. Cura nel prodotto: il permesso del giro viaggia in `RunStarted.contesto` e sta sotto la bolla utente
- 🔜⛔⛔⭐⭐⭐ [DOSSIER COMPETITOR: funzioni distintive lette NEL CODICE](dossier-competitor-funzioni-distintive.md) — 03/09: 11 concorrenti (Hermes primo) clonati a commit fissato in `%LOCALAPPDATA%\Temp\talos-competitor`, un capitolo ciascuno con «TALOS oggi · parità · +1 misurabile», 18 righe `PROPOSTA` (P-01…P-18, 56,5 gg) nel ledger §3 **in ordine owner dalle più critiche alle più lunghe/opzionali** (P-03, P-11, P-13, P-01 … P-10) + §8 «Parità competitiva» + K-09/K-10/K-11 + secondo livello `DOSSIER-COMPETITOR-ESTRATTI-CODICE` (codice verbatim commentato). ⛔ Nessuna autorizzata: l'owner le promuove una alla volta. ⛔ La stima «12-16 ore» era detta senza misura (durata vera ~1 h): mai dare ore non misurate. ⭐ Fatti: Hermes v0.21 **ha** le approvazioni (corregge il 28/8), Aider fermo dal 22/5, `OpenHands/OpenHands` è oggi Agent Canvas, il README `memories/` di Codex cita una cartella che nel clone non c'è
- 🔜⛔⛔⛔ [PIANO DESKTOP CUSTODITO, IN ATTESA DEL VIA](piano-desktop-custodito-in-attesa-del-via.md) — 03/09: ledger 59 righe + guide Wave 0/1/2 + ledger kernel + review stato dell'arte, tutto committato (`c89dc763`), puntatore in `.claude/RIPRESA-SESSIONE.md`. ⛔ Owner: «custodisci il piano, per adesso ci fermiamo qui» — NESSUNA riga si implementa senza il suo sì esplicito, riga per riga
- ⛔⛔ [UN VERIFICATORE DI COPERTURA PASSA PER COSTRUZIONE](un-verificatore-di-copertura-passa-per-costruzione.md) — 02/09: la zip di ChatGPT dichiarava sette contatori a zero e RESULT=PASS; rieseguito passava davvero, ma le 38 patch erano 494 righe totali senza un file esistente toccato e sette stati «validati» non avevano niente dietro. ⛔ Un report si giudica rieseguendolo E misurando la sostanza (righe per patch, file esistenti, stati senza artefatto); lo scheletro (id, ordine, fonti) si tiene, la carne si rifà sui file veri
- ⛔⛔ [String.replace MANGIA i dollari](string-replace-mangia-i-dollari.md) — 02/09: patch via script Node, `$$('#sel')` diventato `$('#sel')` (eccezione a runtime, trovata solo dalla pipeline QA) e `/\s+/` arrivato come `/s+/` passando da bash a `node -e` («Ri pondi  olo»). ⛔ Sempre `s.replace(a, () => b)`, script su file (mai backtick dentro `node -e` da bash), rilettura delle righe toccate
- ⛔⛔⛔⭐⭐⭐ [PARTE 3 — le pratiche di Fable diventano REGOLE per ME](pratiche-fable-parte-3-una-sonda-non-tocca-4174.md) — owner, terza volta: "fai in modo che vengano messe in pratica sempre". Le due voci sopra mi riguardano DIRETTAMENTE (le mie sonde `sonda-*.mjs` toccano lo stesso 4174; ho usato `node -e` inline più volte), + un terzo trovato (Chrome-via-CDP backgrounded strozza `requestAnimationFrame` a ~1/s: ogni mia misura di fluidità è sospetta senza `--disable-backgrounding-occluded-windows`) + la FORMA del resoconto finale di Fable (riproduzione nominata → causa con prova → cura → riverifica coi numeri, tre liste mai mescolate) da riusare
- ⛔⛔⛔⭐⭐⭐ [Il CONTEGGIO di una suite non ermetica NON è una prova](il-conteggio-di-una-suite-non-ermetica-non-e-una-prova.md) — 02/9: ho riportato «da 20 rossi a 6» come merito mio; la stessa suite due volte di fila sullo stesso codice dava **21 e 19**, insiemi diversi, perché Playwright punta al **4174 VIVO** con le sessioni vere (nessun `webServer`). ⛔ Prima di citare un conteggio: rilanciarlo e confrontare gli INSIEMI; per attribuire una regressione serve un **A/B nello stesso momento** contro il commit baseline. ⭐ È la 1ª delle cinque pratiche di Fable, che avevo scritto poche ore prima e non ho applicato a me
- ⛔⛔⛔⭐⭐⭐ [VIEWPORT DESKTOP — non solo tablet](viewport-desktop-non-solo-tablet.md) — owner 02/9, correzione: «la regola impone viewport tablet ma noi siamo su desktop». Le quattro viewport sono una regola MOBILE: su Harness Desktop ogni giro visivo passa anche da **laptop 1024×800** (dove le colonne si stringono per prime) e **desktop 1440×900**. ⛔ Scritta nello SCRIPT (`VIEWPORT_DESKTOP` in `qa-visual-pipeline.mjs`), non affidata alla memoria — c'erano NOVE copie sparse, due le ha trovate il test
- ⛔⛔⛔⭐⭐⭐ [FORMULA DI CHIUSURA FASE — tre domande, solo quelle](formula-di-chiusura-fase-tre-domande.md) — owner 02/9, «accetto SOLO queste»: **Cosa devi fare tu** (scelte secche sì/no/dopo) · **Cosa faccio io** (riprendo da solo, non lo chiedo) · **Cosa rimane** (debito e NON verificato, per nome). ⛔ Niente offerte di continuare in coda. ⛔ Prove, numeri e tabelle vanno nel LEDGER e nel COMMIT, non nel messaggio di chat
- ⛔⛔⭐⭐⭐ [I TRE AGENTI e le loro lane](i-tre-agenti-e-le-loro-lane.md) — owner 02/9: **Opus 5** desktop (io) · **Sonnet 5 Max** mobile · **Fable 5.1** review e ricerca. ⛔ Sono tutte VIVE: ognuna vede le altre come «ferme da N giorni» solo perché sono sessioni LUNGHE. Mai dedurre identità dall'età o da busy/idle — si chiede con SendMessage. ⛔ E un sì dell'owner dato per un OGGETTO non vale per un altro: il 02/9 la sessione «da chiudere» ero io

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

## 🔜 APERTI del banco TALOS-BANCO — spostati qui il 2026-09-04

> ⛔ `MEMORY.md` era a **20.796 byte** contro il tetto d'allarme di 19.900 dopo la lezione
> sul codice d'uscita dei task in background. Questi cinque aperti riguardano tutti il banco
> di misura (campagne, giri, 429, leve): blocco intero spostato, non accorciato. Restano
> APERTI e vincolanti come prima.

- 🔜⛔⛔⛔⭐⭐⭐ [28/8 — TALOS-BANCO: 24 righe su 27 perse da uno script di ri-misura precedente](corri-riscrive-il-file-se-ripetizioni-non-combacia.md) — scoperto ORA, non segnalato da chi l'ha causato: `ri-misura-fase4-tool-args.mjs` (27/8, ~23:30) ha chiesto `ripetizioni:2` contro le `ripetizioni:1` già sul disco, e `corri()` ha riscritto `talos.jsonl` prima di girare — restano solo 3 righe, modello sbagliato (`qwen/qwen3.7-flash`), nessun backup. 🔜 Decide l'owner: accettare la perdita e ripartire da questo stato, o altro — nel frattempo NON lanciare altre `corri()` su `talos.jsonl` senza aver riletto questa nota
- 🔜⛔⛔⛔⭐⭐⭐ [TALOS ESAURISCE I GIRI, non le capacita](talos-esaurisce-i-giri-non-le-capacita.md) — misurato 22/8 su `storia`: **fallisce in 80 s** mentre gli altri ne usano 332-630, e l'ultima frase e troncata a meta ricerca ⇒ `GIRI_MASSIMI = 24` finiti. ⛔ La cura NON e alzarli: i token sono la **somma sui giri**, quadratica — servono contesto magro **e poi** piu giri. Gia paghiamo **2,3× aider**
- 🔜⛔⛔⛔⭐⭐⭐ [TALOS NON VEDE i file del corpus STORIA](talos-non-vede-i-file-del-corpus-storia.md) — `elenca` arriva a **profondità 2**, i 106 percorsi dei task stanno a **4-6**, e **35 consegne su 35** non nominano i file: non può risolverne **nessuno**, e non per bravura. ⛔ La cura ovvia è sbagliata — un elenco piatto è **13.489 token** contro i 505 su cui abbiamo scommesso ⇒ serve **`cerca`**, non un elenco più profondo. ⛔ Prima che parta la corsa `storia`
- 🔜⛔⛔⭐⭐⭐ [LE CINQUE LEVE DI TALOS — quattro DISARMATE](le-cinque-leve-di-talos-quattro-disarmate.md) — `npm run leve`, automatico: ⛔ non ritenta MAI su 429 · i 24 giri finiscono in silenzio · il taglio a 4.000 caratteri **butta la diagnosi in 4 task su 6**. ⛔ Le cure NON si applicano a campagna in corso: due TALOS sotto un nome solo
- 🔜⛔⛔⛔⭐⭐⭐ [IL 429 NON E UN FALLIMENTO — la campagna del 20/8 e CONTAMINATA](il-429-non-e-un-fallimento.md) — il fornitore rispondeva **429** e il banco scriveva `fallito`: **codex 48 righe su 66**, **talos 18 su 66**, e tutti e diciotto i fallimenti di talos erano limiti di traffico. Il `codex 1/11` **non era codex**; letto bene, **talos fa 8/8**. ⛔ Causa: `qwen/qwen3.7-flash` ha **UN SOLO fornitore** su pool condiviso ⇒ il modello del banco deve averne **piu di uno**

## 🔧 La CATENA fino al telefono — spostate qui il 2026-08-21

> ⛔ Non sono state buttate: `MEMORY.md` aveva superato i **19,9 KB** e la
> regola dice di spostare un BLOCCO INTERO invece di accorciare le glosse.
> Queste quattro riguardano tutte la stessa cosa — il tratto fra «ho
> compilato» e «sta girando sul Pad» — e restano vincolanti come prima.

- ⛔⛔⭐⭐⭐ [Una cartella creata da ADB e' INVISIBILE all'app](una-cartella-creata-da-adb-e-invisibile-allapp.md) — il GGUF c'e', l'impronta e' giusta, e l'app non lo vede: cartelle di `shell` 0770
- ⛔⛔⛔⭐⭐⭐ [connectedAndroidTest DISINSTALLA e porta via i modelli](connectedandroidtest-disinstalla-e-porta-via-i-modelli.md) — 20/8: BUILD SUCCESSFUL, e sul Pad non c'era piu' ne' l'app ne' un solo GGUF
- ⛔⛔⭐⭐⭐ [Il build NON arriva al telefono](il-build-non-arriva-al-telefono.md) — senza `npx cap copy android` ogni sonda misura il build PRECEDENTE, con numeri plausibili e **nessun errore**
- ⛔⛔⭐⭐ [I test verdi in NODE non parlano del telefono](i-test-verdi-in-node-non-parlano-del-telefono.md) — Node ha ripieghi che il browser non ha

## ⛔⛔⛔⛔ La regola che violo di più — RICERCA WEB PRIMA DI SCRIVERE (04/09/2026)

> Ripetuta qui, e non solo in `MEMORY.md`, perché due volte in un giorno solo
> non è bastato leggerla in un posto solo. Owner, entrambe le volte furioso.

**Prima violazione (delegando):** ho girato la regola a un agente e poi ho scritto
io un brief tecnico sul foglio capability **senza cercare**. La ricerca fatta dopo
ha mostrato che il pulsante «+» promette una cosa e ne apre un'altra, che Claude
Code espone origine/timeout/spegnimento per i server esterni, che Hermes ha una
memoria a tre strati: niente di tutto ciò si vedeva dal nostro codice.

**Seconda violazione (scrivendo codice):** la cura di W0-07 (coda di scrittura per
file) presa dalla mia diagnosi. La ricerca fatta dopo ha confermato la forma **e**
aggiunto due vincoli che non conoscevo: per un registro serve uno stream
persistente invece di aprire e chiudere a ogni evento, e una scrittura riuscita
vive nella cache del kernel finché non c'è un `fsync`.

⇒ **Non è «cerca quando hai un dubbio». È «cerca prima di scrivere, soprattutto
quando NON hai dubbi».** Quello che manca non è la soluzione: sono i vincoli.

**I quattro momenti obbligatori:** prima di ogni `Edit`/`Write` su codice di
prodotto · prima del brief di un agente · prima di dichiarare chiusa una riga ·
prima di dire «va bene così» su qualcosa che l'owner sta guardando.
**Fonte + data nel ledger e nel commit: senza citazione, la ricerca non c'è stata.**
