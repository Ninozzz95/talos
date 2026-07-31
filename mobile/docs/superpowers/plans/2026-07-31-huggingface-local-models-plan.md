# Modelli locali da Hugging Face — piano, seconda stesura

Data: 2026-07-31
Ordine: priorità assoluta subito dopo la fase B.
Base: dieci agenti in parallelo (otto ricognizioni + due critici), con **sonde
vere** contro l'API e il CDN di Hugging Face il 31 luglio 2026.

La prima stesura è stata riscritta, non ritoccata: due sue affermazioni erano
sbagliate e la scelta di trasporto era già spesa.

---

## 0 · Dove la prima stesura sbagliava

**Il one-up che avevo scelto era già occupato.** Avevo scritto che nessuno
risponde a «gira sul mio telefono?». **PocketPal lo fa già**, con matematica
GGUF vera. Il one-up sta altrove — §7.

**«LM Studio Mobile» su Android non esiste.** Premessa mia, presa da un
risultato di ricerca, sbagliata.

**Il trasporto era già speso.** `TalosRunService` è dichiarato `dataSync` e da
Android 15 quel tipo ha **sei ore al giorno condivise da tutta l'app**. Un
download lì dentro spenderebbe il budget della chat — e il servizio non aveva
`onTimeout`, quindi il superamento era un crash. Difetto **vivo**, corretto
separatamente (commit `98eea5e`) prima di qualunque lavoro sul download.

---

## 1 · Il contratto di rete, misurato e non dedotto

**Il redirect è Xet-bridge ovunque nel 2026.** `GET /{repo}/resolve/{rev}/{file}`
risponde `302` verso `us.aws.cdn.hf.co/xet-bridge-us/…` con una firma
CloudFront. Il vecchio percorso `cdn-lfs*` non è comparso una sola volta.

**Il `Range` sulla richiesta di resolve avvelena l'URL firmato.** Se la resolve
porta un `Range`, la Policy incorpora `"ByteRange":{"ExpectedHeader":"bytes=0-15"}`
e l'URL diventa **monouso per quell'esatto intervallo**: qualunque altro range
risponde `403 Auth failed: invalid range`. Se la resolve è **nuda**, l'URL
firmato accetta range arbitrari e paralleli. Quindi: **resolve nuda → conserva
l'URL del CDN → applica il `Range` al CDN**, mai alla resolve.

**L'URL firmato dura 3600 secondi.** Misurato. Aritmetica: 4,0 GB a 1 MB/s
richiedono 4295 s. **Non può finire su un solo URL.** Un `403` a metà stream
significa «ri-risolvi», non «fallito»: nuova resolve nuda, `Range: bytes={haveBytes}-`,
si continua. E ri-risolvere in anticipo a T+50 min.

**L'hash vero è `lfs.oid`, non l'ETag.** L'ETag del CDN è l'hash Merkle di Xet.
Il `x-linked-etag` della 302 è il sha256 e coincide con `lfs.oid`. Verificare
contro l'ETag è **peggio di non verificare**, perché riporta successo.

**`POST /api/models/{repo}/paths-info/{rev}` con `{"paths":[…],"expand":true}`**
restituisce in una chiamata: dimensione, `lfs.oid`, `xetHash`, commit e
`securityFileStatus` (verdetto antimalware). È l'intero contratto di download in
un oggetto verificabile. CORS lo consente dalla WebView.

**Il 429 non ha `Retry-After`.** Ha un corpo HTML da 52 KB e l'unico dato
utilizzabile è `t=` nell'header `ratelimit` (secondi al reset). Due conseguenze:
`res.json()` su un 429 lancia un errore di parsing e l'app direbbe «risposta
malformata» invece di «limite raggiunto, 254 s»; e i limiti anonimi sono **per
IP**, con i carrier dietro CGNAT. **Il token HF non è un vezzo per i modelli
chiusi: è l'isolamento dai limiti**, e va offerto anche per i modelli aperti.

**I modelli chiusi**: metadati ed elenco file sono pubblici, solo `/resolve/` è
bloccato con un 401 riconoscibile. E **l'accettazione della licenza si può fare
solo nel browser** — un checkbox in-app sarebbe un falso.

**Tutto ciò che serve al verdetto sta nei primi 1.144 byte del GGUF**, leggibili
con un `Range`. Il chat template invece sta molto più avanti (byte ~7,8 M nel
file misurato). `general.file_type` è l'autorità sulla quantizzazione, **non il
nome del file**. `@huggingface/gguf` fa già questo parsing in TypeScript.

**`filter=gguf` da solo restituisce anche modelli di immagini, embedding e
pornografia**: il tag dice solo «il repo contiene un .gguf».

---

## 2 · Il motore di trasporto

**API 34+: User-Initiated Data Transfer job** (`RUN_USER_INITIATED_JOBS`).
Nessun tetto di sei ore, nessuna dichiarazione di foreground service da
giustificare in Play Console. Nessuna libreria Jetpack lo incapsula: va scritto.
Due spigoli duri: lo «Stop» del Task Manager e la pressione di memoria uccidono
il processo **senza `onStopJob`**.

**API 26-33: foreground service `dataSync` dedicato** — budget proprio, tipo
proprio, canale di notifica proprio, id proprio. **Non** `TalosRunService`.

**La rete si lega, non si assume.** `JobParameters.getNetwork()` e ogni socket
aperto tramite `network.getSocketFactory()`, DNS incluso. Un socket legato a una
rete **muore con quella rete** invece di migrare: è ciò che impedisce a un
passaggio Wi-Fi→cellulare di spendere il piano dati in silenzio. In galleria non
arriva un errore: arriva un socket che **pende** — serve un cane da guardia sui
byte in arrivo (8 s a zero → stato con un nome).

**Il checkpoint va sul TEMPO, non sui byte.** Finestre da 128 MiB su un link che
sfarfalla producono **progresso netto zero**: la barra torna indietro e il
download non finisce mai su un tragitto pendolare. `fdatasync` + sidecar
sostituito atomicamente **ogni 5 s o ogni 8 MiB, quello che viene prima**.
La finestra di *resolve* resta grande (128-256 MiB): resolve e checkpoint non
sono lo stesso confine.

**Lo spazio si prenota, non si controlla.** `getAllocatableBytes` +
`allocateBytes`, poi `posix_fallocate` così `ENOSPC` esce al secondo zero e non
al 94%. **Mai `setRequiresStorageNotLow(true)`**: è un blocco che il download
infligge a sé stesso, e il dossier lo raccomandava in tre punti prima che il
critico lo smontasse.

**Ogni durata su `SystemClock.elapsedRealtime()`**, mai sull'orologio a muro: il
telefono con l'ora sbagliata è sproporzionatamente il telefono economico che
questa funzione serve. La scadenza dell'URL si deriva dall'header `date:` della
risposta contro `Expires`, una volta, e diventa una scadenza monotona.

**Lo sha256 si trasmette in streaming** su 4,68 GB, mai con `mmap`. Lo stato
dell'hash **sopravvive alla morte del processo**, così non serve una seconda
lettura completa.

**I killer degli OEM.** Xiaomi, Samsung, Huawei uccidono senza `onStopJob`,
ripetutamente, quasi allo stesso punto. I codici di uscita non li identificano:
si riconosce il **motivo ricorrente** (`getHistoricalProcessExitReasons`, N
uccisioni, schermo spento entro pochi secondi, nessun evento termico). Dopo il
secondo, **si dice**, invece di riprovare all'infinito.

---

## 3 · Il download center, sezione per sezione

1. **Questo telefono** — una riga: *11,2 GB liberi · 6,0 GB di RAM utilizzabile ·
   Wi-Fi*. È la cornice a cui ogni rifiuto successivo si riferisce.
2. **In corso** — al massimo una riga attiva: nome, quantizzazione, barra
   determinata, *61% · 2,41 GB di 4,07 GB · 4,2 MB/s · circa 6 min · Wi-Fi*,
   Pausa e Annulla come pulsanti, e «parte 2 di 3» se il modello è diviso.
3. **In coda** — posizione, dimensione, «inizia fra circa 12 min», riordinabile.
4. **In pausa / serve te** — il cesto onesto: in pausa da te, spazio finito, in
   attesa del Wi-Fi, **limite di frequenza con conto alla rovescia vivo**, file
   cambiato a monte, verifica fallita. Una frase, e l'azione che la risolve.
5. **Su questo telefono** — installati: dimensione, ultimo uso, tok/s
   **misurati** o «stimati» se non lo sono, Elimina.
6. **Spazio** — una barra impilata (modelli · libreria · database · resto) che
   somma all'ingombro vero dell'app, l'accesso a `ACTION_MANAGE_STORAGE`, e i
   file parziali orfani con dimensione ed età.
7. **Trova un modello** — catalogo TALOS (remoto, **firmato**, in cache), ricerca
   HF, import da URL. Ogni scheda porta il verdetto calcolato dall'header:
   *4,07 GB di file · 1,2 GB di cache a 8k · ci stanno nei tuoi 6,0 GB con 1,1
   GB di margine* — e quando non ci sta, **a quale contesto ci starebbe**.

Impostazioni in linea: «Scarica su rete mobile» (spenta, con la dimensione
ripetuta quando la accendi) e «Tieni liberi 1,5 GB», modificabile e **spiegato**.

**Il pavimento libero non è cortesia**: esiste perché il database cifrato e il
suo journal stanno sulla stessa partizione. E si mostra **lo stato dopo**:
«ti resteranno 1,6 GB» — il numero che interessa davvero, che nessun competitor
mostra.

**Nessuno stato può essere una rotella indeterminata.** Regola da far rispettare
in review: ogni stato ha un nome in italiano, da quanto tempo ci si trova,
un'azione possibile, e o una barra determinata o un conto alla rovescia.

---

## 4 · L'aritmetica del verdetto

Dal solo header GGUF, prima di scaricare un byte:

```
A = KV(n_ctx) + compute + overhead + runtime      (richiesta incomprimibile)
R = M_avail − M_threshold − A − 256 MiB           (RAM per tenere i pesi residenti)
D = max(0, W − R)                                 (deficit riletto da storage per token)
```

Cancelli, primo che scatta vince: spazio insufficiente · ABI non supportata ·
`A > 0,45 × RAM` · `R ≤ 0` · già ucciso per memoria su questa configurazione.

Bande: **COMODO** · **STRETTO** («gira; una app fotocamera in background può
sfrattarlo») · **STRISCERÀ** (con i tok/s previsti **e il termine dominante** —
banda, paginazione da storage, o contesto) · **NON GIRERÀ**.

**L'inversione che trasforma un rifiuto in un consiglio**: il contesto è la
variabile libera, quindi si calcola `n_ctx_max` e si propone quello invece di
dire no.

Il compute buffer **non ha una forma chiusa pubblicata**: si dice, e il numero
si prende da una prova nativa a vuoto — non si inventa.

`getMemoryClass()` è il **tetto sbagliato**: limita solo l'heap Dalvik, e
llama.cpp alloca nativamente.

---

## 5 · Lo strato prodotto che gli otto sweep avevano saltato

I due critici hanno trovato che la ricognizione era eccellente sul filo e sul
metallo e **muta sul prodotto**. Va progettato:

- **La vita del modello dopo l'installazione.** Identità = `(repo, revision,
  file, sha256)`, registrata **sulla conversazione**, non un nome. Aggiornare =
  installa accanto → prova → passa → cancella il vecchio, **mai in place**.
- **`docs/feature-parity.json` ha già `models_runtime: blocked`** con clausole
  che questo piano non soddisfa. Da riconciliare **prima** di affettare.
- **Passare da locale a cloud a metà chat** deve dire il costo **prima**: «questa
  chat è 61k token, questo modello ne tiene 8k».
- **Cancellare un modello orfana le conversazioni.** Serve uno stato
  `unavailable`, l'anteprima che **conta e nomina** le chat legate, e una chat
  orfana che resta leggibile e non inviabile — **mai un ripiego silenzioso su un
  altro modello**.
- **Il modello dei provider non ha posto per «locale»**: `requiresSecret`
  booleano va sostituito da `readiness: 'secret' | 'endpoint' | 'artifact'`.
- **Il primo caricamento è indisegnato**, ed è dove vivono i guasti
  interessanti: prova obbligatoria (carica → 8 token → stop naturale → scarica)
  prima che un modello diventi selezionabile.
- **L'esperienza offline** — il motivo per cui la funzione esiste — non ha
  disegno. Serve un contratto OFFLINE-READY: tutto ciò che serve a caricare e far
  girare (template, BOS/EOS, architettura, tetto di contesto, licenza) scritto in
  un manifest **accanto al .gguf**, e **nessuna chiamata di rete** al momento
  dell'inferenza. Provato con un test che revoca la rete a livello di sistema.
- **Fermare una generazione locale**: `cancel({generationId})` nel contratto del
  plugin **dalla prima riga**.
- **Il PIN richiude il database dopo 5 minuti**: un download di 40 minuti finisce
  dentro un database chiuso. La verità sta sul **filesystem**, il database è un
  indice derivato ricostruito allo sblocco. E la notifica **non mette il nome del
  modello sulla schermata di blocco**.
- **Il telefono su cui non ci sta niente** è uno schermo vero, che dice cosa il
  telefono **può** fare.
- **Come si testa**: la policy di download in una classe pura senza I/O, un
  generatore di GGUF finti da 64 KB, un server di replay con i codici registrati
  (403 legato al range, scadenza a metà stream), e **un** test strumentato che
  uccide il processo a metà.

---

## 6 · Sicurezza e licenze

- **Un GGUF ostile è RCE dentro llama.cpp** — quattro CVE nominate in 14 mesi, e
  upstream **rifiuta esplicitamente questo modello di minaccia**. Validazione
  dell'header prima di passarlo al nativo: fattibile, verificata sui byte veri.
- **HF regala un verdetto antimalware per file** (`securityFileStatus`): si può
  bloccare su quello. Non è una garanzia, è un dato in più.
- **Niente pinning del certificato**: l'host del CDN varia, una allowlist esatta
  si rompe in produzione.
- **Il token**: OAuth pubblico con PKCE, scope `gated-repos`. Nessuna chiave
  nell'APK. La licenza si accetta **solo** su huggingface.co.
- **Llama 4 non è concesso in licenza a uno sviluppatore domiciliato in UE.**
- **AI Act, art. 50, dal 2 agosto 2026**: «pesi aperti in locale» **non è una
  difesa**.
- La policy contenuti IA del Play Store pretende una segnalazione in-app che
  **collide** con la direttiva «niente censura» — una ragione in più per la
  direzione GitHub/F-Droid.

---

## 7 · Il one-up vero

Su nove app esaminate a livello di codice (PocketPal, SmolChat, ChatterUI, AI
Edge Gallery, MNN Chat, Locally, LLM Hub, Cactus, OfflineLLM), **nessuna**:

1. **verifica un hash crittografico del file finito** — lo stato dell'arte è
   controllare 4 byte magici;
2. rifiuta di esporre un file parziale sotto il nome finale;
3. legge lo **stato termico** — mai, in nessun punto;
4. tiene una **riserva di spazio** (PocketPal accetta `richiesto ≤ libero`);
5. **firma il catalogo** — nessuno verifica una firma prima di lasciare che un
   documento di rete decida cosa gira sul telefono;
6. **rimisura e ri-ordina** in base a ciò che questo telefono ha davvero fatto;
7. **spiega** perché un modello è consigliato e un altro no;
8. espone la funzione come **tool chiamabile dalla chat** — nessuna seconda porta
   in tutta la categoria;
9. **fissa una revisione e la verifica**;
10. valida l'header GGUF prima del nativo, nonostante le CVE;
11. gestisce deliberatamente il tetto di 6 ore di Android 15;
12. ricade su un altro registro quando uno è irraggiungibile;
13. riconcilia «quanto occupa TALOS» con quello che dicono le Impostazioni.

Sono tredici righe, tutte alla nostra portata, e **la prima da sola** è
sufficiente: un modello troncato non crasha, produce spazzatura plausibile.

---

## 8 · Le fette

1. **Client HF puro** — ricerca, `paths-info`, parsing GGUF via `Range`.
   Nessuna rete nei test, nessun permesso.
2. **L'aritmetica del verdetto** — pura, testabile, è il §4.
3. **La policy di download** — classe pura senza I/O: quale range, quando
   ri-risolvere, come leggere un 403 contro un 416, quando smettere.
4. **Il plugin nativo** — UIDT + fallback, con i test di cui al §5.
5. **La stazione** — il §3.
6. **Il primo caricamento e il contratto offline** — il §5.
7. **La seconda porta** — dopo la migrazione dei livelli di rischio, o con un
   `always_ask` per tool; **mai** `allow_for_session` per 4 GB.

Le fette 1, 2 e 3 non hanno bisogno di niente: né chiavi, né plugin, né rete.

---

## 9 · Decisioni prese dall'owner (2026-07-31)

**1 · Rollback di un aggiornamento — tieni il vecchio, poi chiedi.**
Il file precedente resta finché il nuovo non ha risposto bene alcune volte; poi
si propone di liberarlo **con il numero in chiaro** («il modello vecchio occupa
4,07 GB — lo libero?»). Mai accumulare in silenzio, mai cancellare in silenzio.

**2 · Primo avvio senza chiavi — offrire un modello piccolo, mai automatico.**
Un tocco per saltare, dimensione dichiarata prima di iniziare, **solo Wi-Fi**.
È l'unico momento in cui TALOS può dire «questa app è tua e basta».

**3 · Generazione locale in background — continua, con la notifica.**
Una risposta congelata a metà frase si legge come un guasto. Due paletti: si
ferma da sola quando il telefono è troppo caldo, e resta un'impostazione
spegnibile. **Aggiunta dell'owner**: la notifica deve avere la **barra di
avanzamento**, «come fanno le app serie».
→ e da qui nasce un lavoro a sé: **il sistema di notifiche va rivisto e superato
sotto ogni aspetto, DOPO Hugging Face** (§10).

**4 · Llama 4 — fuori dal catalogo, non bloccato.**
Non lo consigliamo in un paese dove non è licenziato: è responsabilità
editoriale nostra. Ma non lo blocchiamo se lo cerchi tu su Hugging Face, con la
nota sulla licenza in chiaro. *Quello che consigliamo* e *quello che
permettiamo* sono due cose diverse.

---

## 10 · In coda dopo questa fase: il sistema di notifiche

Owner 2026-07-31, insieme alla decisione 3: «da rivedere il sistema di
notifiche, dobbiamo one-upparlo da tutti i punti di vista, dopo HF».

Non è una rifinitura del download: è **tutta la superficie notifiche dell'app**.
Oggi ne esiste una sola, `TalosRunService`, senza barra di avanzamento, senza
azioni, senza raggruppamento, con le stringhe in inglese cablate nel nativo e
irraggiungibili dal bundle di traduzione.

Da guardare quando si apre, con la stessa ricerca-e-one-up delle altre fasi:
avanzamento determinato, azioni inline (pausa, annulla, apri), canali separati
per genere di lavoro, raggruppamento quando i lavori sono più d'uno, **cosa
appare su una schermata di blocco in un'app protetta da PIN**, localizzazione di
una notifica pubblicata dopo la morte del processo, e il silenzio come
impostazione seria e non come ripiego.
