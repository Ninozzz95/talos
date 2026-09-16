# L4 — il giornale su disco, la ripresa vera, e il cancello che usa il record VERO

Lane `lane/harness-desktop`, 11/09/2026. Implementa il lotto **L4** di
`.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` (§6.2 · §6.5 · §6.6 · §7), più le due
aggiunte chieste dal coordinatore a lotto aperto (l'elenco che non mente più; l'istantanea della
cache del fetch di L6).

⛔ Nessun giro col modello, nessuna richiesta al 4174, nessun `git`. Nessun file di
`src/research/*.mjs` toccato (sono di L3/L6, e `fetch-cache.mjs` risulta ` M` per mano di un altro
agente: usato, mai scritto). Nessun file di `mobile/` toccato.

---

## 1. Cosa c'era, prima della cura

| fatto | prova |
|---|---|
| una ricerca era **UN file** riscritto per intero a ogni aggiornamento | `research-store.mjs`, `percorsoVoce() → .harness-ui-research/<id>.json`, `writeFile` in `creaRicerca`/`aggiornaRicerca` |
| niente giornale ⇒ **niente da rigiocare** | `src/research/run.mjs` esisteva ma **nessun file lo importava** (L3a §6.3, L3b §6.2: «un albero nuovo appeso a niente») |
| `riprendi()` rifiutava dopo ogni riavvio del server | `research-orchestrator.mjs`, `if (!voce.messaggiFinali) → 'cannot be resumed: start a new one'` |
| il cancello giudicava la **prosa**, non il record | `rileggiRapportoMinimo` (titolo + una riga + un URL sotto «## Fonti»), dichiarata «minima» da L2 stessa |
| l'elenco **non** rileggeva i rapporti, il dettaglio sì | `elenca()` → `statoVivo` e basta; `leggi()` → rilettura. ⇒ `d2a453a8` compariva «Conclusa» in lista e «bloccata dal permesso» aperta: **la lista mentiva e il dettaglio la smentiva** |
| la cache del fetch non sopravviveva a niente | `fetch-cache.mjs` (L6) ha `snapshot()`/`restore()` e dichiara «questo modulo non scrive niente su disco»: nessuno la persisteva |

---

## 2. Ricerca web PRIMA di scrivere — fonte + data, e **cosa ha cambiato il codice**

⚠️ `WebSearch` **esaurito** (200/200 per questa sessione, come per L1-L3b): le due domande del brief
sono state chiuse con `WebFetch` su **fonti primarie**, lette l'**11/09/2026**.

| # | fonte | data | cosa ha cambiato |
|---|---|---|---|
| F1 | **LWN, «Ensuring data reaches disk»** — <https://lwn.net/Articles/457667/> | pagina viva, letta 11/09/2026 | La sequenza sicura è **cinque** passi, non due: «1. create a new temp file (**on the same file system!**) 2. write data to the temp file 3. **fsync() the temp file** 4. rename 5. **fsync() the containing directory**». ⇒ il temporaneo di `scriviAtomico` nasce **nella stessa cartella** del file (non in `%TEMP%`, dove il rename sarebbe una copia), e la scrittura usa `flush: true` = passo 3. Il passo 5 è **dichiarato non fatto**, vedi F3 |
| F2 | **`rename(2)`** — <https://man7.org/linux/man-pages/man2/rename.2.html> | pagina viva, letta 11/09/2026 | «If newpath already exists, it will be **atomically replaced**, so that there is no point at which another process attempting to access newpath will find it missing». ⇒ è la garanzia su cui poggia il vincolo: un lettore vede il vecchio o il nuovo, **mai mezzo file** |
| F3 | **`MoveFileExW`** — <https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw> + **libuv `src/win/fs.c`** (letto alla fonte: `fs__rename` → `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`; `fs__fsync` → `FlushFileBuffers`) | letti 11/09/2026 | ⛔ **Il vincolo che non conoscevo.** Windows promette che il contenuto viene «replaced … **provided that security requirements regarding ACLs are met**» e **non usa mai la parola “atomically”** come POSIX; e non c'è modo di fare `fsync` di una *directory*. ⇒ il passo 5 di F1 **non è disponibile su questa piattaforma**, ed è scritto nel codice invece di lasciar credere che la ricetta sia applicata intera. Ciò che resta garantito ovunque è ciò che serve al vincolo: **se il rename fallisce, il file vecchio è intatto** — ed è quello che il test misura |
| F4 | **GraphFlow** — [arXiv:2605.14968](https://arxiv.org/abs/2605.14968) | 14/05/2026 | «a durable engine records outcomes in an **append-only event log** and can enforce contracts at system boundaries, **supporting replay, retries, and audit**». ⇒ conferma la forma **e** nomina le tre cose che compra insieme: ripresa, ritentativi, verificabilità. È la ragione per cui il giornale espone `righeSaltate` (l'audit vuole sapere se si è caricato *per intero*) |
| F5 | **Verified Detection and Prevention of Concurrency Anomalies in Multi-Agent LLM Systems** — [arXiv:2606.17182](https://arxiv.org/abs/2606.17182) | 15/06/2026 | «deterministic-generation semantics — the regime durable-execution engines enforce by **deterministic replay**». ⇒ il test «una corsa registrata e rigiocata dà lo stesso stato» non confronta un risultato atteso scritto a mano: confronta **due repliche dello stesso file** con `deepEqual`, che è la proprietà che la fonte nomina |

⭐ **E prima ancora, dentro il proprio codebase** (lezione 06/09 «chi guarda da fuori inventa quello
che dentro aveva già»): `session-store.mjs` aveva **già** il giornale JSONL con la coda per percorso
(W0-07, 04/09 — il file da 1,5 MiB spezzato da due `appendFile` concorrenti) e la lettura tollerante;
`local-model-store.mjs`, `harness-receipt-keypair.mjs`, `generated-image-store.mjs`,
`search-source-store.mjs` avevano già temporaneo+`rename`. **Non ho inventato un sesto modo**: ho
riusato quella forma, con due differenze dichiarate (§3).

---

## 3. La cura, file:riga

### 3.1 `src/research-store.mjs` — da `<id>.json` a `<id>/`

| dove | cosa |
|---|---|
| testa del file + blocco «L4 — DA UN FILE A UNA CARTELLA» (`:89-160`) | la forma di §6.2, il vincolo, e le cinque fonti sopra con quel che ognuna ha cambiato |
| `NOME_META` `NOME_GIORNALE` `NOME_PIANO` `CARTELLA_FONTI` `FORMATO_CORRENTE` (`:162-190`) | i nomi in **un posto solo**; `formato: 2` sulla voce è ciò che dice al cancello se il ripiego è lecito |
| `percorsoMeta` · `percorsoVoceLegacy` · `percorsoGiornale` · `percorsoPiano` · `cartellaDelleFonti` | le due forme convivono, entrambe nominate |
| **`scriviAtomico(percorso, contenuto, deps)`** (`:214-236`) | temporaneo nella stessa cartella + `{flush:true}` + `rename`; il `catch` **pulisce e rilancia** (mai un guasto inghiottito) |
| `elencaRicerche` (`:245-280`) | vede cartelle **e** `<id>.json`; **dedupe per id, vince la cartella** (una migrazione interrotta non produce due righe) |
| `leggiRicerca` (`:290-310`) | prova `<id>/meta.json`, poi `<id>.json`; tollera `ENOENT` **e `ENOTDIR`** (su Windows chiedere `<id>/meta.json` quando `<id>` è un file dà l'uno o l'altro) |
| `creaRicerca` | `idRicercaValido` **a monte** (l'id adesso è un nome di cartella), `formato: 2`, scrittura atomica |
| **`migraRicerca`** (`:365-405`) | scrive `meta.json` **e poi** toglie `<id>.json`; `migrataDa` sulla voce; ⛔ `formato` resta **assente** — una migrazione di contenitore non è una promessa sul contenuto; un `<id>.json` illeggibile **non si tocca** e si lancia |
| `aggiornaRicerca` | chiama `migraRicerca` — **questo è «il primo tocco»**: si migra solo perché stavamo comunque scrivendo |
| `eliminaRicerca` | toglie la **cartella intera** + il `<id>.json` mai migrato |
| `scriviRapporto` | atomico anche lui |
| **`accodaEvento`** / **`leggiGiornale`** | append-only con **coda per percorso** e `flush:true`; lettura che **salta e conta** le righe illeggibili |
| **`scriviPiano`/`leggiPiano`**, **`scriviFonte`/`leggiFonte`/`elencaFonti`** | il piano atomico; le fonti **indirizzate dal contenuto** (`sha256`), scritte una volta sola |
| **`statRapporto`** | `mtimeMs`+`size`: la chiave della cache dell'elenco |
| **`scriviIstantaneaCache`/`leggiIstantaneaCache`** | `<id>/cache.json`, atomico; ⛔ **non** valida la versione (lo fa `restore()` nel modulo che possiede il formato: due numeri di versione divergono) |

**Le due differenze dichiarate rispetto a `session-store.mjs`**, che è il precedente da cui ho copiato:
1. **`flush: true` di default sul giornale.** Là si è scelto di non fare `fsync` per riga («la
   finestra di perdita è quella del buffer del SO»); qui una riga è un **passo pagato** e sono poche
   per corsa. È il debito che la ricerca del 04/09 aveva lasciato aperto («una scrittura riuscita
   vive nella cache del kernel finché non c'è un `fsync`»): qui si chiude perché qui si può.
2. **Una riga rotta *in mezzo* si salta invece di far fallire la lettura.** `leggiRegistro` lancia;
   qui no, e il motivo è nella testa di `run.mjs`: «un giro che non si può rigiocare è un giro il cui
   lavoro pagato è perso». Là il file è una trascrizione da mostrare, qui è la prova di ciò che è
   stato speso.

### 3.2 `src/research-orchestrator.mjs` — il cancello vero, il giornale, la ripresa

| dove | cosa |
|---|---|
| import (`:63-89`) | **il primo aggancio di `src/research/` al prodotto**: `report.mjs`, `run.mjs`, `verification.mjs`, `fetch-cache.mjs`. ⛔ Nessuno entra nel kernel: `talosHarness.mjs` importa **tre costanti** da `research-store.mjs`, che continua a non importare nulla da `src/research/` |
| **`rileggiRapportoRecintato`** (esportata, `:92-150`) | `talosResearchParseReport` → ≥1 affermazione **e** ≥1 fonte **dal record**; `ripiegoConsentito` (solo per le voci senza `formato`) ricade su `rileggiRapportoMinimo` e lo **dichiara** (`ripiego:true`) |
| `bilancioDelRecord` / `proveDistinteDelRecord` | il bilancio da `talosResearchVerifiedStanding` (nomi italiani, come il resto del contratto); `proveDistinte` = fonti **diverse** con almeno un `passage` non vuoto — l'unico dei due numeri che non si gonfia allungando la bibliografia |
| `promptRicerca` | la consegna **chiede il record**, campo per campo, con l'esempio copiabile. ⛔ E impone `judge: null` + `claimSupported: "unchecked"`: **un modello non timbra sé stesso** (`report.mjs`: «mai dal modello che ha scritto il rapporto») |
| `consegnaDiRipresa` (`:262-305`) | la consegna di una ripresa dal giornale: domanda, speso, passi fatti, passo da cui ripartire, linee aperte, fonti già tenute — **e la consegna originale per intero**, perché senza le regole del deposito una ricerca ripresa consegnerebbe qualcosa che il cancello respinge |
| `giudiziRapporto` + `TETTO_CACHE_GIUDIZI` | la cache su `id`+`mtime`+`size`; oltre 200 voci si svuota (mai illimitata in un processo che vive giorni) |
| **`giudicaRapporto`** | **un solo cancello per `elenca()` e `leggi()`**. Legge il deposito, poi (solo se manca) la Libreria; `daDeposito` distingue «non ha consegnato» da «ha consegnato una cosa che non passa» |
| `registra()` | un evento nel giornale; **unico `catch` muto del file**, e il perché è scritto: il giornale è la prova di ciò che si spende, non la condizione per spendere |
| `avvia()` | `run_started` **prima** di `avviaESeguiFn` (una conclusione fulminea non deve scrivere `run_finished` su un giornale senza avvio) |
| `mettiInPausa` / `onConclusioneRicerca` / `annulla` / `rinomina` | `run_pause_requested` · `run_paused` · `run_cancelled` · `run_renamed` · `run_finished`. ⛔ **Nessun `run_finished` sui rami di guasto**: porterebbe il giro a terminale, cioè renderebbe non riprendibile proprio il caso che deve potersi riprendere |
| **`riprendi()`** | via A (conversazione in memoria: invariata, è migliore); via B (**riavvio**): `leggiGiornale` → `talosResearchReplay` → `talosResearchRecover` → `talosResearchNextStep`, rifiuto se il giro è terminale, `run_resumed` + ri-annuncio del passo in volo, ripartenza |
| `elenca()` | rilegge le voci `done` **e** `senza-rapporto`; espone `bilancio` e `proveDistinte` |
| `leggi()` | stesso cancello; aggiunge `piano`, `passi`, `spesa`, `giornale{eventi,righeSaltate,stato}`, `contenutoRespinto` |

### 3.3 `src/session-registry.mjs` — solo le righe delle dipendenze

Import dei sette nomi nuovi (`:88-100`), sette parametri iniettabili nuovi (`:1395-1412`), e i sette
passati a `creaResearchOrchestrator` (`:1537-1540`). **Nient'altro.**

---

## 4. Le prove, nei due versi — `tests/ricerca-giornale-e-ripresa.test.mjs` (nuovo, 34 test)

**Migrazione**
- **al primo tocco**: leggere ed elencare **non** migrano (il `<id>.json` è ancora lì); `aggiornaRicerca` sì, e nessun campo si perde; `migrataDa` scritto; ⛔ `formato` **resta assente**.
- **migrazione interrotta** (entrambe le copie sul disco) → l'elenco mostra **una** riga, quella nuova.
- **`<id>.json` illeggibile** → si lancia, e **il file resta dov'è**.
- id ostili (`..`, `a/b`, `C:\Windows`, …) respinti **alla nascita**, e niente creato fuori.

**Scrittura atomica**
- giro buono: contenuto intero, **nessun `.tmp-` superstite**.
- ⛔ **crash simulato fra temporaneo e rename** (`renameFn` che lancia): l'errore **si rilancia**, il file vecchio è **byte per byte quello di prima**, il temporaneo è stato pulito. Provato sia su un file nudo sia su `meta.json` via `aggiornaRicerca`.

**Giornale (dal DISCO, non in memoria — la lacuna che L3b aveva dichiarato)**
- 10 eventi → 10 righe, in ordine.
- **50 scritture concorrenti** con carico da 64 KB → 50 righe leggibili, **0 saltate**, 50 id distinti.
- ⛔ **troncato a metà riga** (append interrotto, senza `\n`): 4 eventi buoni, `righeSaltate: 1`, replay riuscito, **spesa non inventata**.
- ⛔ **riga rotta in mezzo** (non l'ultima) + un JSON valido che non è un evento: si caricano gli altri 3, `righeSaltate: 2`.
- ⛔ **evento duplicato sul disco** (`step_finished` due volte): `deepEqual` su `talosResearchSpent` → **1.200 token, non 2.400**.
- **determinismo**: due letture dello stesso file rigiocate → `deepEqual` sullo stato intero.
- evento senza `kind` e id ostile → respinti alla scrittura, e il giornale resta vuoto.

**Piano e fonti**
- piano assente → `null`; scritto → riletto uguale.
- fonte **indirizzata dal contenuto**: stesso testo ⇒ stesso `ref` ⇒ `giaPresente:true`, **nessuna riscrittura**.
- ⛔ `ref` ostili (`fonti/../../segreto.txt`, `../segreto.txt`, maiuscole, vuoto, `null`, `42`) → `null`, e il file fuori non si legge.

**Cancello sul record vero**
- record con 3 affermazioni e 2 fonti → `done`, `bilancio {totali:3, …, nonVerificate:3}`, `proveDistinte:2`.
- ⛔ **la scusa da 290 byte dell'11/09**: respinta **in entrambi i modi** (col ripiego e senza).
- ⛔ record **rotto / versione ignota / recinto rinominato** → respinto, `bilancio: null` (mai «tutto a zero»: `null` e zero non sono la stessa cosa).
- record con affermazioni e **zero fonti** → respinto, motivo che nomina il record.
- `passage` vuoto → passa (il cancello non giudica la qualità) ma `proveDistinte: 0`.
- ⛔ **la prosa che passava L2 non passa più** su una ricerca `formato: 2`, e **la stessa prosa passa** su una voce senza `formato` — stesso testo, due esiti, e l'unica differenza è l'età (`tests/research-orchestrator.test.mjs`).

**Ripresa vera**
- ⛔⛔ **un registro NUOVO sullo stesso disco** (il riavvio): `riprendi()` **riesce**, la consegna porta la domanda dal giornale, `4213 tokens, 3 searches, 5 pages` già spesi, `Steps already completed: b1:search`, `Resume from this step: b2:search … in flight when the process died`, le linee aperte, le fonti già tenute **e la consegna originale**. Il giornale registra `run_resumed`, il passo in volo è ri-annunciato, e **la spesa non raddoppia**.
- ⛔ **annullata** → rifiuta (`is cancelled and will not be resumed`), zero avvii.
- ⛔ **senza giornale** (ricerca vecchia) → rifiuta onestamente, e **non inventa un `run_started`** per far quadrare le cose.
- con la conversazione ancora in memoria vince quella (contesto esatto), e `run_resumed` si registra lo stesso.

**L'elenco che non mente più**
- una `done` col rapporto valido resta `done` **col bilancio**; una `done` senza rapporto esce **`senza-rapporto` già in `elenca()`**, e ⛔ **il file su disco resta `terminata:"done"` con il suo `reportLibraryId`**.
- **la cache**: tre `elenca()` di fila → **una** lettura; cambiata l'impronta → si rilegge. (Una cache a chiave-id sola avrebbe rifatto in memoria la bugia tolta dal disco.)

**Istantanea della cache del fetch**
- salvata accanto al giornale con `snapshot()` del modulo **vero**, e `riprendi()` la rimette dentro: `1 cached pages restored`.
- ⛔ **verso contrario**, quattro forme (`version:99`, `entries` non array, non-JSON, vuoto): la ripresa **riesce lo stesso** e **non vanta** un risparmio che non c'è.

**Giro intero su disco**: avvio → deposito → conclusione ⇒ `done`, `giornale.stato: 'done'`,
`righeSaltate: 0`, e nella cartella esattamente `cache.json · giornale.jsonl · meta.json ·
rapporto.md` — **nessuna scoria `.tmp-`**.

### La suite

```
node --test tests/*.test.mjs tests/research/*.test.mjs
ℹ tests 2721   ℹ pass 2721   ℹ fail 0   (24,4 s)
```

⛔ **Un difetto trovato dal vivo mentre scrivevo L4, e vale più del codice che l'ha prodotto.**
Coi default reali, i test dell'orchestratore hanno creato **`C:\p\.harness-ui-research\`** e
**`C:\progetto\.harness-ui-research\`** sul disco della macchina (le cartelle finte `/p` e
`/progetto`, risolte davvero), e quelli di `session-registry` hanno scritto in `C:\tmp\x`. Il primo
effetto non è stato un errore: è stato **un test di `riprendi` che passava o falliva a seconda di
cosa avevano scritto i test precedenti**. È la lezione del 10/09 alla lettera — *misura l'oggetto,
mai l'ambiente*. Cura: sette porte iniettabili in più e i due store finti aggiornati; le cartelle
create sono state rimosse, e ho **riverificato** che non si ricreino.

---

## 5. Il contratto — cresciuto, e come

**`elenca()` e `leggi()`**: dodici campi → **quattordici**. I dodici di L2 sono **identici** (stesso
nome, stesso tipo, stesso significato). Aggiunti:

- **`bilancio`** — `{totali, sostenute, inParte, nonSostenute, contese, nonVerificate}`, o **`null`**
  quando il record recintato non c'è. ⛔ `null` **non** è «tutto a zero»: mostrare zeri su una
  ricerca mai misurata sarebbe un verdetto inventato. Nomi italiani perché in italiano è tutto il
  contratto (`stato`, `motivo`, `domanda`): due lingue nello stesso oggetto sono due contratti.
- **`proveDistinte`** — intero, `0` quando non c'è record.

Il test `CONTRATTO §6.4` è aggiornato (nome compreso: «i **quattordici** campi») e porta scritto il
perché: §6.7 vuole che la riga in elenco guidi **col bilancio**, e fino a ieri l'elenco non aveva il
dato per farlo. Il `deepEqual` sulle chiavi resta, così la prossima crescita passa da lì.

**Solo `leggi()`**, in più: `piano`, `passi`, `spesa`, `giornale {eventi, righeSaltate, stato}`,
`contenutoRespinto`.

⛔ **`contenutoRespinto` è una porta separata, e non è pedanteria**: se la scusa da 290 byte uscisse
dal campo che si chiama `contenutoRapporto`, il frontend la disegnerebbe come rapporto e avremmo
rifatto il guasto dell'11/09 **dentro la sua cura**. Ma non si butta: è il prodotto di una corsa
pagata, e si legge.

**Per L7**: `bilancio` è `null`-abile e va reso come «non misurato», mai come cinque zeri;
`stato: 'senza-rapporto'` adesso **arriva anche dalle righe dell'elenco**.

---

## 6. Le deviazioni dal brief, dichiarate

1. **L'aggancio del motore si ferma al giornale + piano, come il brief permette — e lo dico.**
   `avvia()` scrive `run_started`; il ciclo di vita (`run_pause_requested`, `run_paused`,
   `run_resumed`, `run_renamed`, `run_cancelled`, `run_finished`) è registrato **perché sono fatti
   veri che l'orchestratore osserva**. I passi di raccolta (`step_started`/`step_finished` con la
   spesa) **no**: le pagine le apre il kernel con `naviga`/`web_search`, che non passano di qui, e il
   collettore (`collector.mjs`) non è agganciato. ⛔ Non ho sintetizzato un piano finto per riempire
   `piano`: sarebbe stato scrivere nel registro un fatto che nessuno ha osservato. ⇒ oggi, su una
   ricerca vera, `piano: []` e `passi: []`, e `consegnaDiRipresa` lo **dice al modello** invece di
   fargli credere che non ci sia più niente da fare.
2. **Il cancello pretende il record, quindi la consegna glielo insegna.** Il brief chiedeva il
   primo; senza il secondo il cancello sarebbe stato **irraggiungibile** — niente, oggi, produce il
   record recintato — e ogni ricerca vera sarebbe uscita `senza-rapporto`. Ho quindi esteso
   `promptRicerca` con la forma esatta del record. ⛔ **Rischio dichiarato, non misurato**: se il
   modello sbaglia il JSON, la ricerca esce `senza-rapporto` **pur avendo lavorato**. Il testo
   depositato resta leggibile (`contenutoRespinto`) e nulla va perso, ma **finché non c'è un giro
   vero (L8) non so quanto spesso accada**.
3. **`judge: null` e `claimSupported: "unchecked"` imposti per consegna.** Un modello che si timbra
   «sostenuta dalla fonte» stamperebbe il segno di verifica falso che tutto il disegno esiste per
   togliere. Il bilancio dirà «N non verificate», che è la verità di oggi.
4. **La metadata sta in `<id>/meta.json`.** §6.2 disegna la cartella ma non nomina il file della
   voce; metterla dentro è l'unico modo perché «migrare al primo tocco» abbia un significato.
5. **`riprendi()` non ha preso un parametro `cartella`**: lo prende da `voce.cartella` (che
   `ripristina()` rimette a posto dall'intestazione). Aggiungerlo avrebbe voluto una riga in
   `session-registry.mjs` fuori dal perimetro.
6. **Sette porte iniettabili in più in `session-registry.mjs`**, oltre a `leggiRapportoFn`: vedi
   §4, non è simmetria, è la cura del difetto trovato.
7. **La cache del fetch è persistita ma oggi è VUOTA sui dati veri** (vedi §7.3).

---

## 7. Cosa NON ho verificato

1. **Nessun giro col modello, nessun 4174, nessuno screenshot, nessun git.** Tutto è provato a unità
   e a filo intero, su un filesystem vero temporaneo. ⛔ Nessuno di questi test dimostra che
   `glm-5.3-flash` produca davvero un record recintato valido: è **L8**, e vale la lezione già
   pagata («il giro vero trova quattro difetti che 80 test verdi non vedono»).
2. **La spesa nel giornale non viene da una misura vera.** `talosResearchSpent` somma ciò che
   `step_finished` porta, e oggi quegli eventi li scrivono **solo i test**. Il numero è giusto per
   costruzione, ma sui dati veri **non c'è ancora nessun numero**.
3. **L'istantanea della cache del fetch, oggi, è vuota.** Il giro salva-e-ripristina è provato nei
   due versi con `snapshot()` del modulo vero, ma **nessuno riempie quella cache**: il collettore non
   è agganciato e `naviga` non passa di qui. ⇒ è **il punto di innesto pronto**, non un risparmio
   misurato. Dire il contrario sarebbe vendere un numero che non esiste.
4. **Il `fsync` della directory (passo 5 di LWN) non c'è**, e su Windows non è disponibile. Dopo un
   crash del **sistema** (non del processo) la voce di directory può non essere durevole. Il file
   vecchio resta comunque intatto.
5. **La migrazione non è mai stata eseguita su dati veri dell'owner.** Le fixture riproducono la
   forma di `<id>.json`, non i suoi file veri in `.harness-ui-research/` sul 4174 — che non ho
   toccato né letto.
6. **`elenca()` giudica TUTTE le voci prima di paginare** (il filtro per `status` lo impone). Con la
   cache è una lettura per ricerca per vita del processo; su una cartella con centinaia di ricerche
   la **prima** apertura della sezione costerebbe centinaia di `stat`+`read`. Non misurato.
7. **Trovato per strada, non mio, non corretto**: qualcosa nella suite crea
   `C:\tmp\x\.harness-ui-library\` sul disco vero. Non è codice di ricerca (dopo la mia cura
   `.harness-ui-research` non si ricrea più lì) e non l'ho inseguito: **registrato, non risolto**.
8. **Nessuna prova visiva**: in questo lotto non c'è UI. La resa di `bilancio`/`proveDistinte` e
   dello stato `senza-rapporto` **in elenco** è di L7.
9. **`npm run kernel:controlla` resta rosso** come prima di questo lotto (le due copie del kernel
   divergono): non causato da qui, non toccato.
