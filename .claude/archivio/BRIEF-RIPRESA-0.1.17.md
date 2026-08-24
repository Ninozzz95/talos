# BRIEF — riprendi la 0.1.17 dalla Fase 1

> Da incollare in una sessione nuova, nella cartella
> `C:\Users\Antonino\Desktop\projects\AVM`.
>
> ⛔ **Il tuo ritorno è stato revisionato e ACCETTATO.** Il ramo
> `lane/motore-gpu` è **spinto** su `origin` (repo privato). Non devi rifare
> niente di ciò che hai già fatto, e non devi rispingerlo.

---

## Cosa ha detto la review

Verificato riga per riga, non a campione. Tutti i cancelli **verdi**:

```
JVM        303 test · 0 errori · 0 fallimenti   (con --rerun-tasks: i 6 s erano cache)
vitest     5.858 passati · 0 rossi
typecheck  0 errori
build      verde, tetto del pezzo iniziale rispettato
segreti    nessuno nel diff
```

E le tre cose che rendevano il ramo sicuro da spingere:

1. **La produzione non cambia, e non per promessa.** `nativeOpen` conserva la
   firma **esatta** e delega a `talos_apri_modello` con tre richieste vuote;
   vuoto attraversa senza toccare né `model_params.devices` né la Flash
   Attention. Le 5 righe cancellate erano il corpo sostituito da una delega.
   Verificato anche che `nativeOpenTargeted` **non** sta dietro un `#ifdef`:
   il simbolo esiste sempre, quindi niente `UnsatisfiedLinkError` in agguato.
2. **Il `build.gradle` non tocca la release.** I +250 stanno tutti dentro
   `if (project.hasProperty('talosResearchBackend'))`. L'unica riga fuori dal
   cancello — `excludes += '**/libOpenCL.so'` — è corretta e in produzione è
   un no-op, perché con `GGML_OPENCL=OFF` quella libreria non viene prodotta.
3. **Le classi di ricerca non pesano sull'APK spedito.** `ai/talos/research/`
   non è referenziato da nessuna riga di produzione, e le regole R8 sono
   strette: nessun `keep` generico su `ai.talos`, quindi R8 le toglie.

⭐ E il gesto che ha convinto più di ogni numero: **la scelta rifiutata invece
che indovinata**. «Il registry `X` espone 2 dispositivi: dinne uno» — con il
commento che dice perché scegliere lì sarebbe stato comodo. È la lotteria che
si voleva togliere di mezzo, e l'hai tolta invece di spostarla.

### Tre rilievi minori, nessuno bloccante

- Il tuo brief dice **21 commit**: sono **20**. Un numero verificabile che non
  torna costa credibilità a tutti gli altri, che invece tornavano.
- `nativeCancel` **non** prende `g_motore` — l'ho verificato perché se lo
  prendesse lo Stop non funzionerebbe mai durante la generazione. Non lo
  prende: la tua diagnosi dello Stop anticipato è esatta e stretta.
- ⛔ **`./gradlew testDebugUnitTest` è tornato «SUCCESSFUL in 6 s» senza aver
  girato niente**: era cache. È la tua stessa trappola n. 5 con un'altra
  faccia. Da qui in poi, sui test JVM, `--rerun-tasks` **e** il conteggio letto
  dagli XML — mai il «SUCCESSFUL».

---

## Le tre decisioni dell'owner, chiuse

| | decisione |
|---|---|
| **push** | ✅ fatto dalla sessione principale, sul repo **privato**. Tu continui a non spingere |
| **Stop anticipato** | ⛔ **NON si cura adesso.** È produzione, e la 0.1.17 non è la release che la spedisce. Resta il difetto misurato e la cura scritta; si applica quando si tocca il percorso di generazione per un'altra ragione, con la sua prova nei due versi |
| **minSdk 26 contro Vulkan 1.1** | ⛔ **`minSdk` NON si alza.** Vulkan resta ferma finché non è caricata dinamicamente, e Android 8/8.1 non si rompono per un backend che oggi non funziona nemmeno |

---

## Da dove riparti, e cosa NON fai

### 1. Fase 1 — il forward pin. È il collo di bottiglia, e lo sai già.

Sblocca C1 (OpenCL vero, con `60addddf`) e forse chiude il crash Vulkan.
La **suite golden è il cancello**: se il pin nuovo rompe Jinja, i tool o la
separazione del ragionamento, lo dice **prima** che qualunque numero di
velocità voglia dire qualcosa.

⛔ Nell'ordine: prima la golden passa, poi si misura. Un numero preso su un
motore che ha smesso di rispettare il formato non è un numero.

### 2. Solo allora OpenCL come C1 vero

Flash Attention e la race si misurano lì. I numeri di oggi diventano una
qualificazione invece di un segnale.

### 3. Poi la tenuta nel tempo, e PP8192

Le corse di oggi sono brevi: nessun test da 10 minuti, nessuna deriva termica.
E serve una corsa a contesto più largo.

### 4. Infine la politica a un numero solo

I dati per rifarla **ci sono adesso** — PP/TG/TTFT separati. Il brief
dell'owner vietava di toccarla prima di averli; il divieto è caduto.

⛔ E il numero che deve entrare nella politica nuova è il TTFT, non la
generazione: **55,7 s → 8,3 s** è ciò che la persona aspetta. Una soglia che
guarda solo i token al secondo rifiuterebbe quel backend, ed è la ragione per
cui questa fase esiste.

## ⛔ Cosa NON fai, e perché

- **Non spingi e non tagghi.** Vale ancora, senza eccezioni.
- **Non tocchi la produzione** — Stop compreso, per la decisione qui sopra.
- **Non alzi `minSdk`.**
- **Non riparti da due numeri del taccuino**: la GBNF da 55.871 byte e la
  «grammatica pigra con un innesco solo». A questo pin il formato è
  `peg-native`, il vincolo lo fa un parser PEG, e GBNF vuota è la risposta
  giusta. Rimisurali, non ereditarli — l'hai scritto tu e vale per te.
- **Non usi `./gradlew connectedAndroidTest`**: disinstalla l'app. Si usa
  `scripts/research/run-device-tests.mjs`.
- **Non ti fidi di un `assembleDebug` nudo**: sovrascrive lo stesso
  `app-debug.apk` della build di ricerca, e una corsa etichettata «OpenCL» può
  girare su una build che OpenCL non ce l'ha.

## Se ti serve una cosa che non c'è

Le chiavi dei provider **non servono** alla 0.1.17. Se dovessero servire,
fermati e dillo: OpenRouter è PKCE col browser di sistema, e le credenziali le
digita l'owner.

⛔ E la regola nuova, che vale per ogni dubbio: **guarda prima i competitor e
il web** — llama.cpp, ggml, i loro issue, la documentazione Adreno. Non c'è
bisogno di inventare niente. Se ricerca e concorrenti portano a un muro,
**fermati e dillo all'owner** invece di aggirarlo.

## Il primo comando

```
node .claude/preflight-consegna.mjs
```

Poi `.claude/RITORNO-0.1.17.md` per riprendere il filo, e
`mobile/scripts/research/README.md` per rimettere in piedi la riproduzione.

⛔ Il ramo su cui lavori resta **`lane/motore-gpu`**, che ora ha un upstream:
`git pull` prima di ricominciare, perché la sessione principale ci ha spinto
sopra anche un commit di guardie.
