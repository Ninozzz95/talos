# Ordine di lavoro — allineamento del desktop

**Destinatario:** l'agente che lavora sul ramo `main` (desktop).
**Emesso da:** la corsia mobile, `lane/talos-mobile`.
**Autorizzato da:** l'owner, 2026-08-04, sulla tabella del censimento.
**Stato dei fatti:** desktop `dafb945` (2026-07-30) · mobile `6ca85dc` (2026-08-04) · base comune `6270de3` (2026-07-20).

---

## 0. Come leggere questo documento

### 0.1 Non ti serve niente da un'altra macchina

Il desktop e il mobile sono **lo stesso repository**. Tutto ciò che questo
documento nomina è raggiungibile da dove sei:

```bash
git fetch origin
git show lane/talos-mobile:mobile/<percorso>        # leggere un file mobile
git log --oneline main..lane/talos-mobile -- mobile/ # cosa ha fatto la corsia
```

Non chiedere file all'owner e non farti mandare copie: una copia invecchia, un
riferimento a git no. **Ogni affermazione di questo documento cita un file a una
revisione, e va verificata aprendolo.** Se una citazione non corrisponde più,
quella riga è sbagliata: segnalala invece di adattarti.

### 0.2 Rigenera i fatti invece di fidarti dei numeri

```bash
cd mobile && node scripts/census.mjs        # → docs/alignment/census.json
```

Il censimento legge `control-plane/routes/api.php` da `origin/main` e le
stazioni + i tool dal mobile. **Si rifiuta di essere incompleto in silenzio**:
conta le rotte senza interpretarle e si ferma se ne perde una forma. Se lo fai
girare e fallisce, hai aggiunto una forma di rotta che il lettore non conosce —
insegnagliela, non abbassare il conto.

### 0.3 La direzione non è quella di prima

La dottrina storica era «il mobile è 1:1 col desktop, il desktop è la fonte
canonica». **Era vera quando il desktop guidava.** Dalla separazione:

```
main (desktop)   +50 commit
lane/mobile      +354 commit
```

Quindi in questo ciclo **il flusso è prevalentemente mobile → desktop**. Non
significa che il mobile abbia sempre ragione: significa che la direzione va
stabilita per capacità, e dove il desktop è migliore lo si dice invece di
sovrascriverlo. Ogni voce qui sotto dichiara la sua direzione.

### 0.4 «Uguali» non vuol dire stesso codice

Il desktop è un server (Laravel + core PHP + browser-worker) con una UI web. Il
mobile gira da solo sul telefono, senza server. Allineare vuol dire **stessa
capacità e stesso contratto**, con posti d'esecuzione diversi — ed è esattamente
ciò che il template delta già codifica nel campo
`execution location: local_mobile | trusted_node | remote_provider | unavailable`.

Non portare architettura. Porta capacità e contratti.

---

## 1. Ambito: cosa è dentro e cosa è fuori

Le decisioni dell'owner del 2026-08-04, alla lettera. **Non sono negoziabili in
questo ciclo** — se una ti sembra sbagliata, fermati e chiedi, non decidere.

### 1.1 FUORI, rimandato dopo questo allineamento

| area | rotte | parole dell'owner |
|---|---|---|
| `browser` | 24 | «valutiamo assieme ma in seguito, dopo l'allineamento del resto del desktop» |
| `google` + `connectors` | 12 | «dopo allineamento» |
| `calendar-drafts` | 3 | «sì dopo allineamento desktop» |
| `traces/replay`, `faults/explain` | 2 | «dopo allineamento desktop» |

**Non toccarle.** Non rifattorizzarle «già che ci sei», non spostarle, non
cambiarne i contratti. Sono materia di una conversazione che non è ancora
avvenuta.

### 1.2 FUORI, da nascondere

| area | rotte | decisione |
|---|---|---|
| `model-comparisons` | 4 | «per adesso lo nascondiamo, in sospeso TBA» |
| `benchmark-groups` | 3 | idem |

**Nascondere ≠ cancellare.** Le rotte, i modelli e i test restano dove sono e
continuano a passare. Sparisce solo l'ingresso dall'interfaccia. Un `feature
flag` spento è la forma giusta; una migrazione che cancella dati non lo è.
Scrivi nel commit *perché* è nascosto e *cosa* lo riaccende, altrimenti fra due
mesi qualcuno lo cancella davvero.

### 1.3 Un programma a sé, PRIMA della piattaforma agentica

**`skills`** — l'owner: «assolutamente sì, e l'ho dimenticato». Ma non è
«portare le 7 rotte»:

> «in connectors, abbiamo una repo open source (decideremo previa ricerca web)
> di skills installabili nella chat (e nella piattaforma agentica), segnalo
> prima della piattaforma agentica»

Quindi: una **fonte open source** di skill installabili, **scelta con una
ricerca web prima di decidere**, installabili **dalla chat** e non solo dalla
piattaforma agentica, **posizionate prima** della progettazione della
piattaforma agentica.

**Il tuo compito qui, in questo ciclo, è UNO solo:** produrre il documento di
contratto di `/skills` così com'è oggi sul desktop — `GET/POST /skills`,
`/skills/planning-context`, `/skills/{skill}`, `/skills/{skill}/evaluation` —
con schema d'ingresso e d'uscita di ognuna, e il modello dati. **Non
progettare** la parte mobile e **non scegliere** la fonte open source: sono
decisioni dell'owner che arrivano dopo la ricerca. Consegna il contratto, fermati.

### 1.4 DENTRO

Tutto il resto: il blocco 2 (contratti) e il blocco 3 (capacità mancanti).

---

## 2. Blocco 2 — I contratti. Prima di tutto il resto.

**Perché prima:** cinque capacità esistono su entrambi i lati con nomi che si
somigliano e contratti che nessuno ha confrontato. Se costruisci sopra prima di
saperlo, costruisci due volte. E sono esattamente i casi che si scoprono rotti
alla fase 13, quando la sincronizzazione cloud prova a farli parlare.

**Cosa consegni per ognuno:** una copia compilata di
`mobile/docs/desktop-mobile-delta-template.md`, in
`docs/alignment/contratti/C<n>-<nome>.md` sul ramo desktop, con:

1. i due schemi affiancati, **copiati dal codice, non descritti a parole**;
2. le divergenze, ognuna classificata: `cosmetica` (nomi) · `strutturale`
   (forma dei dati) · `semantica` (stessi dati, significato diverso);
3. per ogni divergenza **semantica**, quale lato è corretto e perché — con un
   caso concreto in cui l'altro sbaglia;
4. la proposta di contratto unico, con `schema_version` e le fixture valide e
   invalide che lo provano.

**Non modificare codice in questo blocco.** Consegni cinque documenti. L'owner
decide, poi si tocca.

### C1 — `tools` · la divergenza più grave

| | desktop | mobile |
|---|---|---|
| dove | `POST/PATCH/DELETE /tools` + tabella `talos_tools` | moduli TypeScript compilati nell'APK |
| contratto | `TalosProceduralToolRegistry.php`, JSON Schema `inputSchema`/`outputSchema` | `src/lib/tools/registry.ts`, Zod |
| ciclo di vita | creabili **a runtime** | fissati alla compilazione |

Ancore da leggere:
- desktop: `control-plane/app/Services/Talos/Agent/TalosProceduralToolRegistry.php`,
  `control-plane/database/migrations/2026_07_07_000014_create_talos_tools_table.php`,
  `control-plane/app/Http/Controllers/TalosToolController.php`
- mobile: `mobile/src/lib/tools/registry.ts`, `mobile/src/lib/tools/toolControls.ts`

**La domanda che questo documento deve rispondere** — ed è la sola che conta:
il desktop può insegnare un tool nuovo senza ricompilare, il mobile no. Non è
una differenza di superficie, è una differenza di **natura**. Il documento deve
dire se il mobile debba guadagnare quella capacità (e cosa comporta in un'app
distribuita, dove un tool caricato a runtime è codice che entra da fuori) oppure
se il contratto debba ammettere due cicli di vita dichiarati. **Non decidere:
esponi la scelta con le sue conseguenze.**

### C2 — `capability-policies` contro la grammatica dei permessi

| | desktop | mobile |
|---|---|---|
| forma | `GET /capability-policies`, `PUT /{capability}`, `POST /master-enable`, `POST /revoke-all` | tre stati: *consenti sempre · chiedi ogni volta · nega* |

Ancore: `control-plane/app/Http/Controllers/` (il controller delle
capability-policies) · `mobile/src/lib/tools/permissionTypes.ts`.

**Vincolo dell'owner, 2026-08-04, che vale su TUTTO il progetto:** una
grammatica sola per tutti i permessi, tre stati ovunque, **nessun booleano
nuovo**, e ciò che oggi è spento migra a «chiedi». Un `master-enable` booleano
non è compatibile con quella grammatica: il documento deve dire come si traduce,
non se si può tenere.

### C3 — `cookbook` contro il centro modelli locali

| | desktop | mobile |
|---|---|---|
| rotte / tool | `/cookbook/hardware-scan`, `/models`, `/download-preview`, `/serve-preview`, `/dependencies`, `/planning-context` | `local_models_search`, `local_model_download`, `local_model_inspect`, `local_models_status` + Model Lab |

Ancore: le rotte `cookbook` in `api.php` e i loro controller ·
`mobile/src/lib/tools/` (i quattro tool) e la scheda `Model Lab`.

Qui i **posti d'esecuzione sono legittimamente diversi**: il desktop serve un
modello da una macchina, il mobile lo fa girare **sul telefono** con llama.cpp.
Il documento non deve fonderli: deve dire quale parte del contratto è comune (il
catalogo, la ricerca, lo stato di un download) e quale è per forza locale.

### C4 — `file-authority` contro i grant della Libreria

Ancore: `/file-authority/grants` (GET/POST/DELETE) ·
`mobile/src/composables/useTalosMobileAttachments.ts` (i `grant_id` che
accompagnano ogni allegato).

Sospetto: **stessa cosa, due nomi**. Se è così il documento lo dice in una
pagina e propone il nome unico. Se non è così, la differenza è importante e va
scritta.

### C5 — `artifacts` contro la Libreria

**L'owner ha già deciso: «artifacts è l'attuale Libreria».** Quindi non è una
capacità da costruire: è una capacità con due nomi e due contratti.

Ancore: `/artifacts`, `/artifacts/{artifact}/download`, `/preview` ·
`mobile/src/services/talosVaultService.ts` e la stazione `/context`.

Il documento deve stabilire il **nome unico** e la forma unica del record, e
verificare in particolare: la provenienza (chi ha creato il file, con quale
strumento, quando), che sul mobile è appena diventata una scheda vera.

---

## 3. Blocco 3 — Ciò che il mobile ha e il desktop no

Direzione: **mobile → desktop**. Per ognuno l'ancora è il codice mobile, che è
funzionante e provato sul dispositivo.

**Regola generale del blocco:** porta la **capacità e il contratto**, non
l'implementazione. Il mobile lo fa in TypeScript dentro una WebView; il desktop
lo farà in PHP dietro una rotta. Ciò che deve coincidere è cosa il modello vede,
cosa riceve e cosa succede quando fallisce.

### 3.1 Provenienza delle immagini · **priorità alta, ha una scadenza legale**

| | |
|---|---|
| ancore | `mobile/src/lib/images/provenance.ts` · `mobile/tests/unit/images/provenance.test.ts` · fixture reale `mobile/tests/fixtures/c2pa-manifest.b64` |
| cosa fa | legge il manifesto C2PA dai byte del file e dichiara: ha credenziali, chi l'ha prodotta, se dichiara di essere generata da IA |
| perché urgente | AI Act europeo art. 50, in applicazione da agosto 2026, prima della distribuzione |

**Fatti misurati che il desktop deve conoscere prima di scrivere una riga:**

- le immagini di OpenAI **portano già** un manifesto C2PA firmato — un chunk PNG
  `caBX` da ~29 KB, subito dopo `IHDR`. Non va costruito: va **non distrutto**;
- il mobile lo conserva perché salva i byte **senza mai ricodificarli**. Se il
  desktop ridimensiona, ricomprime o genera una miniatura sovrascrivendo
  l'originale, **cancella la provenienza**. È la cosa da verificare per prima;
- **firmarne una propria non si può**: un'app distribuita non custodisce una
  chiave privata. Il desktop, che è un server, potrebbe — ma non deve farlo in
  questo ciclo senza una decisione dell'owner, perché firmare a nome di TALOS è
  una promessa che va mantenuta;
- il lettore **non verifica la firma** e lo dice: riporta «questo file dichiara
  di venire da X», mai «è autentico». Non aggiungere una verifica finta.

**Trappola già trovata e da non ripetere:** il manifesto è CBOR, e nel CBOR il
byte che dichiara la lunghezza di una stringa corta è `0x60 + lunghezza`, cioè
una **lettera stampabile**. Un lettore a caratteri riporta `dnamex` come nome
del produttore. Si leggono i **token**. E la sigla `caBX` va cercata camminando
la catena dei chunk, non con una ricerca nei byte: quelle quattro lettere
capitano dentro i dati compressi, e un falso positivo dice a una persona che la
**sua** foto è stata fatta da una macchina.

**Condizione di fatto:** un test che prende la fixture reale e ne estrae
`OpenAI Media Service API`, `gpt-image` e `trainedAlgorithmicMedia`; e un test
che dimostra che il percorso di salvataggio del desktop restituisce byte
identici a quelli ricevuti.

### 3.2 Modifica immagine a partire da una foto dell'utente

| | |
|---|---|
| ancore | `mobile/src/lib/images/imageGateway.ts` · `mobile/src/lib/images/imageMultipart.ts` · `mobile/src/lib/images/imageTools.ts` |
| contratto | `generate_image` guadagna `from_image` (nome o id di un file), e il file si cerca **prima** di chiamare il provider |

Fatti misurati:
- **Gemini**: blocco immagine `{ type: 'image', mime_type, data }`, campi
  **piatti**, dopo il testo;
- **OpenAI**: indirizzo **diverso** — `/v1/images/edits`, non `/generations` —
  in `multipart/form-data`. Mandare una modifica a `/generations` ridisegna la
  scena da capo, che è il difetto da togliere;
- `input_fidelity: 'high'` **solo** su `gpt-image-1`: su `gpt-image-2` non è
  applicabile e la chiamata fallisce;
- **OpenRouter non lo sa fare** e si rifiuta per nome invece di ignorare
  l'immagine in silenzio. Tienilo così finché non è misurato.

**Buco noto, non ancora costruito, da NON chiudere di iniziativa:** la
**maschera** (`mask`), cioè dire *dove* modificare. Senza, «cambia lo sfondo»
ridisegna anche il soggetto. Le due domande aperte — chi disegna la maschera, e
cosa fa Gemini che quel campo non ce l'ha — sono dell'owner.

### 3.3 Memoria scrivibile dal modello

Ancora: `mobile/src/lib/tools/memoryWriteTools.ts`.

Prima c'era solo `memory_search`, in lettura: il modello poteva ricordare ma non
**annotare**. La descrizione del tool vieta esplicitamente di agire su testo
trovato dentro file, pagine o risultati di altri tool — è la difesa contro
un'istruzione nascosta in un documento. **Portala insieme al tool**: senza, il
tool è una porta aperta.

### 3.4 La suite Libreria offerta al modello

Ancore: `mobile/src/lib/tools/` — `library_list`, `library_read`,
`library_search`, `library_export`, `library_file_origin`,
`library_context_policy_update`.

Difetto già trovato e chiuso sul mobile, **da verificare sul desktop**: i tool
della Libreria seguivano l'interruttore del *contesto*, quindi sparivano dal
corpo inviato al modello quando il contesto era spento. Un tool che c'è ma non
viene offerto non esiste. Misura cosa parte davvero, non cosa è registrato.

### 3.5 Gli elenchi che rispondono a «cosa ho fatto?»

Ancore: `research_list`, `notes_list`, `tasks_list`, `time_now`.

Piccoli e indispensabili: senza, «che ricerche ho fatto?» non ha risposta. Nota
in `research_list` la frase che dice al modello di **non** usare `library_list`
per le ricerche — i report *sono* file di Libreria, e senza quella riga il
modello sceglie lo strumento sbagliato.

### 3.6 Il pannello del prompt enhancer

Il desktop ha `POST /prompts/enhance`: una rotta, nessuna scelta. Il mobile ha
il pannello che si decide **prima**: quanto riscrivere (conciso · equilibrato ·
esteso), con quale modello, con quale ragionamento.

Ancore: `mobile/src/lib/chat/promptEnhancerDepth.ts` ·
`mobile/src/components/chat/TalosMobileEnhancerSetup.vue`.

Motivo dell'owner, che è la parte da non perdere: «se uso ChatGPT 5.6 Sol Max
per la chat non è detto che serva lo stesso modello per un semplice prompt
enhancing — è uno spreco di token e soldi». Il livello è un'**istruzione in
coda al prompt di sistema**, mai un tetto di token.

**Due trappole trovate costruendolo:** la voce «quello della chat» non può avere
valore stringa vuota (reka-ui la riserva a «nessuna scelta» e **rifiuta** la
voce, e la tendina non si disegna); e il pannello va caricato **pigro**, perché
si porta dietro il componente Select e con lui 80 KB nel grafo d'avvio.

---

## 4. Regole d'ingaggio

1. **Un contratto si cambia in UN posto solo.** Se tocchi uno schema condiviso:
   alzi `schema_version`, aggiorni le fixture valide **e** invalide, e citi
   entrambe nel commit. Due definizioni dello stesso schema sono un guasto già
   avvenuto, solo non ancora visibile.
2. **Ogni voce chiusa aggiorna `mobile/docs/feature-parity.json`** e porta la
   sua copia del template delta. Il registro è verificato da
   `mobile/scripts/verify-parity-ledger.mjs` a ogni build: se non lo aggiorni,
   il cancello te lo dice.
3. **Test RED prima di GREEN, su entrambi i lati**, e il test deve **mordere**:
   rimetti il difetto e verifica che diventi rosso. Un test che passa anche col
   difetto dentro è peggio di nessun test, perché autorizza a non guardare.
4. **Mai «è stato chiamato X».** Verifica il risultato: cosa parte davvero sul
   filo, cosa finisce davvero su disco.
5. **Niente decisioni unilaterali** su: ciclo di vita dei tool (C1), grammatica
   dei permessi (C2), firma C2PA lato server (3.1), maschera (3.2), fonte delle
   skill (1.3). Espone la scelta con le sue conseguenze e **fermati**.
6. **Se una capacità del desktop è migliore, dillo.** Questo documento nasce da
   un censimento, non da un giudizio: dove il desktop ha ragione, la voce va
   riscritta al contrario, non eseguita al rovescio in silenzio.
7. **Non toccare ciò che è in §1.1 e §1.2.** Neanche per migliorarlo.

---

## 5. Cosa consegni, e come lo verifico

**Ordine:** blocco 2 (i cinque documenti di contratto) → attesa delle decisioni
dell'owner → blocco 3 → il contratto di `/skills` (§1.3) in qualsiasi momento,
perché non dipende da niente.

**Per il blocco 2:** cinque file in `docs/alignment/contratti/`, sul ramo
desktop. Nessuna modifica al codice.

**Per il blocco 3, ogni voce chiusa porta:**

```
Voce:            <3.n — nome>
Direzione:       mobile → desktop  |  desktop → mobile (motivato)
Ancore lette:    <file@revisione>
Contratto:       <invariato | schema_version n→n+1, fixture: ...>
Test:            <id> — RED con il difetto, GREEN senza. Come l'ho fatto mordere: ...
Delta:           docs/alignment/delta/DELTA-2026-NNN.md
Ledger:          feature-parity.json, feature_id: ...
Fuori ambito:    <cosa NON ho fatto e perché>
```

L'ultima riga non è formalità: **una consegna che tace ciò che ha lasciato fuori
si legge come completa.** Se una voce è bloccata, chiudi tutte le altre per
intero e scrivi esplicitamente quale hai lasciato e perché.

**Verifica:** faccio girare il censimento, apro le ancore che citi, e provo che i
tuoi test mordano rimettendo io il difetto. Se un test non diventa rosso, la
voce torna indietro.
