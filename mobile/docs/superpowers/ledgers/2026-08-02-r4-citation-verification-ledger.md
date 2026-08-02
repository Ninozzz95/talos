# R-4 — Verifica delle citazioni a tre livelli + rapporto a livelli

Fase 2 (Deep Research), tappa R-4. Dipende da R-3 (`21a8ab5`, chiusa).
Riferimento: `specs/2026-07-26-deep-research-spec.md` §4 e §5.

---

## 1. Checkpoint di ricerca (REGOLA ZERO — prima del codice)

| Query | Fonti | Cosa ha cambiato nel disegno |
|---|---|---|
| `LLM citation attribution verification NLI entailment MiniCheck AlignScore 2026` | arXiv **2606.23915** «Do LLM Attribution Metrics Transfer?»; AttributionBench; AlignScore | **La granularità decide se la verifica funziona.** Uno scorer NLI che fa AUROC **0.90** sulle affermazioni brevi crolla a **0.53 — il caso** sulle risposte lunghe. Quindi L3 non deve MAI giudicare «il rapporto è sostenuto»: giudica *una* affermazione contro *un* passaggio. È esattamente la forma che R-3 ha prodotto, e ora è una scelta motivata invece che una coincidenza. |
| `Cited but Not Verified: source attribution in deep research agents` | arXiv **2605.06635** | La tassonomia dei concorrenti misurata: **link valido >94%**, **pertinenza >80%**, **accuratezza fattuale 39–77%**. Il difetto NON è il link morto: è che la fonte non dice quello che il rapporto sostiene. Conseguenza: **L1 è a basso rendimento, L3 è dove vive tutto il valore**, e va speso lì il giro di modello. |
| (stessa fonte) | arXiv 2605.06635 | **L'accuratezza delle citazioni cala del ~42% passando da 2 a 150 chiamate di recupero.** Cioè: *più la ricerca è profonda, peggiori sono le citazioni.* Quindi la verifica non può essere un'opzione da togliere quando costa: la modalità Esaustiva è proprio quella che ne ha più bisogno. |
| `LLM-as-judge self-preference bias evaluating own output 2026` | arXiv **2604.06996** (rubric-based), arXiv 2604.22891, UDA 2508.09724 | Un modello che giudica sé stesso è fino al **50% più probabile che marchi come soddisfatto un criterio che in realtà fallisce**. Questo trasforma «meglio un altro modello» in **un rifiuto**: se l'unico giudice disponibile è l'autore, l'esito è `unchecked` con il motivo scritto — mai un auto-timbro. L'ensemble attenua ma non elimina → non ci si appoggia. |
| `small language model 3B judge entailment on-device 2026` | Galileo Luna-2 (3B/8B), Patronus Lynx 8B, Prometheus 2 7B; on-device LLM state of the union 2026 | Un giudice distillato da 3B fa **0.88–0.95** sui compiti di valutazione agentica con **−97% di costo**. Cioè il giudizio di implicazione è proprio il compito in cui un modello piccolo regge. **Con il motore locale spedito nella fase 1, L3 può girare sul telefono: gratis, offline, e strutturalmente diverso dall'autore in cloud.** |
| `link rot soft 404 HEAD request unreliable` | Wikipedia:Link rot, dev.to soft-404, Wayback `archive.org/wayback/available` | HEAD è inaffidabile (405 diffusi) e i **soft-404 rispondono 200 con una pagina d'errore**: un controllo di stato HTTP mente. Ma noi **abbiamo conservato il testo**, quindi la domanda giusta non è «risponde?» ma «risponde *ancora la stessa cosa*?» — che è insieme L1 e la ri-verifica R12. Corollario: rifare una richiesta subito dopo averla fatta è teatro → **L1 si registra dalla lettura, non si ripete.** |

### Le due conseguenze che vale la pena rileggere fra un mese

1. **L3 è il livello che conta** (39–77% contro >94% di L1) e **peggiora con la profondità** (−42%): la verifica va fatta sempre, e va fatta per coppia affermazione↔passaggio, mai sul rapporto intero.
2. **L'autore non può essere il giudice** (+50% di indulgenza verso sé stesso): non è una preferenza di stile, è un errore misurato, e quindi è un rifiuto codificato.

---

## 2. Dottrina competitiva (COMPETITIVE-ONE-UP-DOCTRINE)

- **L1 — parità**: mostrare le citazioni in linea. Ce l'hanno tutti.
- **L2 — one-up**: il passaggio confrontato meccanicamente col testo conservato. *(costruito in R-3)*
- **L3 — strutturale, l'unico che vince**: **il verbale di verifica è un artefatto conservato, non un momento.**
  Chi tiene solo i link può, al massimo, verificare *mentre* scrive. Noi conserviamo passaggio,
  intervallo esatto, identità del giudice e data: la stessa verifica si può **rifare più tardi, da un
  altro giudice, e confrontare**. È R12 gratis, ed è impossibile da copiare per un prodotto che
  conserva URL.

---

## 3. Decisioni prese qui

1. **L1 non fa una seconda richiesta.** Si deduce da come la fonte è stata ottenuta (`page` = letta e risolta quel giorno; `snippet` = mai aperta) e porta la data. Ripetere la GET appena fatta costerebbe rete per confermare ciò che si è appena visto.
2. **L2 restituisce l'intervallo**, non un sì/no. Senza l'offset il rapporto non può evidenziare il passaggio, e R8 («tocca la citazione e vedi il punto esatto») resterebbe una promessa.
3. **L3 vede solo affermazione + passaggio.** Non la domanda, non il riassunto, non le altre affermazioni: tutto ciò che aggiunge contesto sposta il giudizio verso il «sì, torna».
4. **Ordine dei giudici**: motore locale → modello economico in cloud diverso dall'autore → *nessuno*, e allora `unchecked` col motivo. Mai l'autore.
5. **`partial` esiste** ed è un esito di prima classe: il passaggio parla dell'argomento ma non sostiene la portata dell'affermazione. È il caso più frequente e appiattirlo su «sì» o «no» sarebbe la bugia più comoda.
6. **Il rapporto porta il suo verbale** in un blocco recintato, come il dossier: una lettura per la persona, una per la macchina, scritte nello stesso respiro perché non possano divergere.

---

## 4. Cosa è stato costruito

- `src/lib/research/researchVerification.ts` — i tre livelli, puri. L2 restituisce l'**intervallo** nel testo conservato (mappa carattere per carattere, così l'offset punta al testo vero e non alla copia normalizzata); L3 è prompt isolato + verdetto `si/parziale/no`; `talosResearchPickJudge` **rifiuta** l'autore; `talosResearchJudgeOrder` mette il dispositivo per primo, poi un'altra casa, per ultima quella dell'autore.
- `src/lib/research/researchReport.ts` — il rapporto porta il **verbale**: passaggio, intervallo, verdetto, motivo, nome del giudice, data. Prosa a livelli per la persona, blocco recintato per la macchina.
- `chatController.synthesise` — dopo il parse, ogni affermazione passa dal giudice; il rapporto viene scritto col verbale dentro; i token del giudice entrano nella spesa della run.
- `ResearchScreen.vue` — rapporto a livelli: risposta → affermazioni con esito → tocco → passaggio esatto + motivo + fonte + come è stata ottenuta → elenco fonti.
- `talosResearchProgressOf` — **una sola** definizione di «a che punto è», usata dalla stazione e dalla notifica: il `3/2` è chiuso.

## 5. Prova sul dispositivo (OnePlus Pad 3, `ai.talos.dev`)

Run «in che anno è stata fondata la FIAT», modello della chat `deepseek-v4-flash`:

- **5 su 5 sostenute · 0 in parte · 0 smentite · 0 non verificate**
- «Verificate da un altro modello, mai da quello che ha scritto il rapporto: `local:qwen2.5-3b-instruct`»
- Tocco su un'affermazione → il passaggio conservato («Fondata l'11 luglio 1899 a Torino da Giovanni Agnelli e altri investitori presso il Palazzo Bricherasio»), il motivo del giudice («FIAT è menzionata e data corrispondente»), la fonte e «pagina letta».

Run precedente «quanto è alto il Monte Bianco» → **5 su 6, 1 smentita** dal giudice locale: L3 fa lavoro vero, non timbra.

**Il giudice è girato sul telefono: nessuna chiave, nessuna rete, costo zero.** È la fase 1 che paga la fase 2.

## 6. Quattro difetti trovati DAL DISPOSITIVO, non dai test

1. **`0 su 0 sostenute`** — con un modello da 360M scelto nel compositore la sintesi non tiene il formato e non produce nessuna affermazione, e il rapporto veniva **scritto lo stesso**. Ora il passo **fallisce** con `TALOS_RESEARCH_NO_CLAIMS` e la stazione dice cosa fare; la raccolta pagata resta.
2. **«AFFERMAZIONE» come testo dell'affermazione** — il modello ricopiava l'etichetta del formato. Il prompt ora mostra un esempio invece di un segnaposto, e il parser scarta la riga che è solo l'etichetta.
3. **«Verifica non eseguita» mentre un giudice c'era** — il pannello leggeva il giudice dai verdetti, quindi una run con tutte le citazioni bocciate a L2 dichiarava che non c'era nessun giudice. Il giudice ora è **registrato una volta per la run**.
4. **`local:&#x2F;storage&#x2F;…`** — vue-i18n riscappa i parametri: **seconda volta** che questo progetto paga lo stesso errore. Il nome del giudice sta ora ACCANTO alla frase, in monospaziato, mai dentro. E il nome è il `displayName`, non il percorso assoluto.

## 7. Review critica avversariale — cosa NON è chiuso

| # | Rilievo | Stato |
|---|---|---|
| 1 | **Il giudice può essere della stessa famiglia**: la regola esclude lo stesso modello, non lo stesso fornitore. `deepseek-flash` può giudicare `deepseek-pro`. | Mitigato dall'ordine (altra casa prima) e dal nome scritto nel rapporto. Residuo **accettato**. |
| 2 | **L1 non fa una verifica viva**: registra come la fonte è stata ottenuta, non che il link risponda oggi. | **Voluto** (una GET subito dopo la GET è teatro), ma la domanda «risponde ancora?» è **R12** e non è costruita. |
| 3 | **Il costo della verifica non è dichiarato prima** (R-2 dice che il costo si dichiara prima). Oggi il giudice predefinito è locale e costa zero, ma con un giudice in cloud è spesa non annunciata. | **APERTO.** |
| 4 | **Verifica sequenziale senza avanzamento visibile**: in Esaustiva sono molte affermazioni, e il passo `synthesis` resta `running` senza dire a che punto è. | **APERTO.** |
| 5 | **Motore locale occupato**: se una chat sta generando sul modello locale, il giudice riceve `TALOS_LLAMA_BUSY` e tutte le affermazioni risultano non verificate con un codice grezzo come motivo. | **APERTO.** |
| 6 | Il parser scarta il segnaposto **italiano**; un modello che rispondesse `CLAIM \| 1 \| …` passerebbe. | Minore. |
| 7 | `quoteSpan` è conservato ma la UI mostra il passaggio **da solo**, non evidenziato dentro il testo intero della fonte. | Rifinitura, R-5. |
| 8 | **R7 non è completo**: il modello «economico» esiste come *giudice scelto da una regola*, non come **scelta dell'utente** in Impostazioni, e il «lettore» che riassume le pagine non è mai stato costruito (la lettura è meccanica). | **APERTO — è il prossimo pezzo naturale.** |

---

## 8. R7 — i due modelli li sceglie l'utente (richiesta owner, stesso blocco)

**Ricerca prima.** GPT Researcher — l'implementazione OSS di riferimento — tiene
da anni `FAST_LLM`, `SMART_LLM` e `STRATEGIC_LLM` come impostazioni **separate**,
e l'hanno separate anche per **fornitore** dopo che gli utenti l'hanno chiesto
(issue #539, PR #813). Non è ordine: i due ruoli vogliono cose opposte — chi
scrive vuole capacità, chi verifica vuole costare poco (gira una volta per
citazione) ed essere **indipendente** da chi scrive. La letteratura sui
verificatori aggiunge il motivo forte: fra generatore e verificatore i modi di
sbagliare sono **correlati**, e la correlazione è massima quando è lo stesso
modello o la stessa famiglia.

**Costruito:**

- `settings.research_models = { author, judge }`, ciascuno `provider:modelId` o
  **null**. Null è una risposta vera, non un campo vuoto: `author: null` = «quello
  del compositore» (istruzione permanente che resta giusta quando il compositore
  cambia); `judge: null` = «automatico, prima il dispositivo».
- La sezione **«I DUE MODELLI — LI SCEGLI TU»** sta nella stazione Ricerca
  approfondita, **sopra il piano**: cambia quanto costa la run e quanto valgono i
  suoi verdetti, e sono decisioni da prendere prima di spendere.
- **Il selettore del verificatore non offre chi scrive.** Un'opzione che la run
  rifiuterebbe comunque non deve essere sullo schermo; e se lo scrittore viene
  cambiato in quello che era il verificatore, il verificatore torna automatico.
- **Stessa casa = avviso, non divieto**: l'indulgenza verso sé stessi si estende
  alla famiglia, ma è una scelta che spetta all'utente farla sapendolo.
- **Scrittore scomparso = la run si ferma** (`TALOS_RESEARCH_AUTHOR_UNAVAILABLE`)
  invece di scivolare su un altro modello: un rapporto depositato sotto il nome
  di un modello che nessuno ha scelto è una bugia sulla provenienza, e la
  provenienza è tutto il prodotto qui. Il **verificatore** scomparso ripiega
  sull'automatico, e il rapporto scrive chi ha giudicato davvero — quindi la
  sostituzione si vede.

**Provato sul tablet.** Verificatore scelto a mano = `deepseek-v4-pro` (mentre
l'automatico avrebbe preso il modello locale). Run «chi ha scritto il Nome della
Rosa» → 2 su 2 sostenute, e il rapporto dice **«Verificate da un altro modello,
mai da quello che ha scritto il rapporto: deepseek:deepseek-v4-pro»**.
La scelta vince sull'automatismo.

**Resta aperto di R7:** il **lettore** della spec (§7) — un modello economico che
riassume ogni pagina ed estrae i passaggi — non esiste: oggi la lettura è
meccanica. Non è un difetto, è la metà di R7 che non è mai stata costruita.

**Trappola di verifica, da ricordare:** `npx vue-tsc --noEmit -p tsconfig.json`
**non** vede quello che vede `vue-tsc -b` dentro `npm run build` (i tipi di
dipendenza dichiarati a mano nel controller). Il cancello è `npm run build`. E
`npm run build | tail` dentro una catena `&&` **passa comunque**, perché lo stato
d'uscita è quello di `tail`: è così che un APK vecchio è finito installato mentre
la build era rossa.
