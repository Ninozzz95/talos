# BC-48 C-bis — prefisso della richiesta intera

Data: 12/09/2026. Registro aperto prima delle modifiche. Sottosistema: harness di orchestrazione desktop e prove del contratto HTTP. Esecuzione di Astra, senza deleghe. Nessuna modifica di prodotto pianificata prima delle misure; kernel e tutti i file vietati rimangono intatti.

**Esito finale:** 13.242 byte stabili sia C sia pre-C nel caso da 11,5 KiB. Corretto nell'adapter un difetto separato del marcatore: 443 → 19.533 byte con 18 KB. Plateau remoto a 2.304 token non determinato; 18 test C-bis verdi.

## Registro di esecuzione preventivo

File da creare:
- `tests/bc48-cbis-prefisso-richiesta.test.mjs`: scenari permanenti BC48-CBIS-RIPRESA-C, PRE-C, RICOSTRUZIONE, MARCATORE, NEGATIVO; soglia del prefisso da fissare dopo la misura. Nessun simbolo pubblico di prodotto aggiunto.
- `tests/fixtures/bc48-cbis-banco.mjs`: `eseguiBanco`, `confrontaCorpi`, `caricaContestoPreC`; banco HTTP reale, registrazione dei byte, fixture Git isolata e confronto senza ordinamento dei campi.
- `.claude/bc48-cbis-turno-1.json`, `.claude/bc48-cbis-turno-2.json`: corpi C grezzi ricevuti dal fornitore finto.
- `.claude/bc48-cbis-pre-c-turno-1.json`, `.claude/bc48-cbis-pre-c-turno-2.json`: corpi pre-C grezzi.
- `.claude/bc48-cbis-misure.json`: misure, ulteriori scenari e metadati senza credenziali.
- `.claude/RAPPORTO-BC48-CBIS-PREFISSO-RICHIESTA-2026-09-12.md`: questo registro e rapporto finale, incluso eventuale diff non applicato.

Contratti conservati: `createSessionRegistry`, `avviaLibero`, `resume`, `avviaSessione`, `createOwnerRuntimeAdapter`, `talosLavora`, `chiamaConRitenta`, `conMarcatoreDiCache`, `contestoDelProgetto`, `aggiornamentoInCoda`, `preamboloVistoDa`, `segnalaFileCambiati`; schema HTTP esistente e ordine JSON del trasporto. Nessuna migrazione.

RED previsto: il controllo negativo deve rifiutare una variazione anticipata in `messages[0]`; la prova del marcatore verifica se un aggiornamento di sistema cambia la forma del preambolo originale. Non si forza un RED artificiale sul caso base se il prefisso risulta già stabile. GREEN: `rtk proxy node --test tests/bc48-cbis-prefisso-richiesta.test.mjs`. Regressione: file completi agent-service, runtime-owner-adapter, session-registry, HTTP sessioni, contesto/preambolo e suite kernel; `git diff --check`. Nessuna build UI, perché non cambia il prodotto.

Prova visibile: due POST HTTP locali, risposte «uno»/«due», corpi ricevuti e offset documentati. Gate upstream reale intenzionalmente escluso dal divieto di chiamate a pagamento: il banco prova il trasporto locale, non una cache GLM reale. Rollback: rimuovere esclusivamente i nuovi file elencati; nessun ripristino di file dell'utente.

## Ricerca preventiva e pin

Consultazione 12/09/2026:
- [Z.AI, Context Caching](https://docs.z.ai/guides/capabilities/cache): cache automatica, stabilità del contenuto e della storia, `prompt_tokens_details.cached_tokens`; nessuna soglia numerica o granularità pubblicata nella pagina.
- [OpenRouter, Prompt Caching, Z.AI](https://openrouter.ai/docs/guides/best-practices/prompt-caching#zai): cache automatica; affinità derivata da account ed eventuale `session_id`. Non dichiara blocchi GLM da 256 token o un minimo GLM.
- [Node.js, module.registerHooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions): hook di caricamento sincrono per eseguire una copia del solo modulo storico senza modificare i sorgenti del worktree.
- [Git, Git Objects](https://git-scm.com/book/en/Git-Internals-Git-Objects): oggetti content-addressed; eventuale istantanea sintetica del banco è dato di fixture, separato dal repository dell'utente.

Decisione upstream: adottare direttamente HTTP, runner e loader di Node già installato (v24.18.0), Git già installato e gli adapter esistenti. Nessuna nuova dipendenza o implementazione di cache. Contratto locale esatto: HEAD `617407e76c7e93c8c08fda9911421ce1e3f59c96`; pre-C `c50f96b0~1` = `4cd01f803af46b70dff0f7445af9ca66962382c4`, solo `harness-ui/src/contesto-del-progetto.mjs`. Le pagine web sono riferimenti datati, non versioni immutabili. Le misure distingueranno byte JSON, testo dei messaggi e token del modello (questi ultimi non disponibili).

Emendamento del banco: il primo avvio si ferma su `ERR_MODULE_NOT_FOUND: zod` da `context-engine/src/contracts.mjs`. Creare `tests/fixtures/bc48-cbis-dipendenze.mjs`, loader esclusivamente di prova che risolve quel solo pacchetto dalla copia già presente in harness-ui (stesso pin 4.5.4). Nessuna installazione, nessun file sotto context-engine modificato. Questo errore ambientale non è un RED del prodotto.

Emendamento dopo la misura, prima della cura di prodotto: scenario permanente **BC48-CBIS-MARCATORE**, RED riprodotto sul kernel reale con 18.000 byte di istruzioni e watcher attivo: `messages[1].content` passa da array a stringa, primo scarto a 443 byte. Nel caso da 11.776 byte il prefisso è già stabile a 13.242 byte in entrambi gli ordini. Estendere il perimetro a `src/runtime-owner-adapter.mjs`, solo un blocco `// BC-48 C-bis` in `createOwnerRuntimeAdapter.talosLavora.fetchConImmagini`: normalizzare a stringa esclusivamente il blocco testuale singolo con la forma esatta del marcatore del kernel, per i modelli `z-ai/glm-*` instradati via OpenRouter. Non modificare immagini, contenuti misti, altri fornitori, strumenti, testo, storia o kernel. Nessuna nuova funzione pubblica. Decisione upstream: adattare il contratto OpenRouter/Z.AI di cache implicita dietro l'adapter esistente; non introdurre soglie o blocchi del fornitore inventati. GREEN: stesso RED sui 18 KB, più prove inverse di immutabilità delle forme non interessate e della rilevazione delle mutazioni anticipate.

Artefatti aggiuntivi di diagnosi: `.claude/bc48-cbis-marcatore-prima-turno-1.json`, `.claude/bc48-cbis-marcatore-prima-turno-2.json`, `.claude/bc48-cbis-marcatore-prima-misura.json` conservano il guasto originale appena riprodotto; `.claude/bc48-cbis-marcatore-dopo-turno-1.json`, `.claude/bc48-cbis-marcatore-dopo-turno-2.json` conserveranno la cura. `.claude/bc48-cbis-verifica.txt` conserverà le verifiche. Il rollback della cura consiste nel togliere solo il blocco BC-48 C-bis appena aggiunto all'adapter, senza ripristinare il file intero.

Emendamento della fedeltà del banco: eliminare l'override iniziale `strumentiEstesi: []`, usando l'elenco predefinito del registro come `server.mjs`. Ripetere anche il controllo prima della cura con la copia dell'adapter da HEAD caricata in memoria in un processo separato; sovrascrivere solo gli artefatti diagnostici di questa attività. Nessun rollback temporaneo dei sorgenti. Aggiungere il caso **BC48-CBIS-WATCHER** da 11.776 byte, oltre ai 18 KB, per distinguere invalidazione pubblica forzata e watcher reale.

Emendamento di verifica: suite ampia 1.335 test, 1.330 passati, 4 falliti, 1 saltato. Scenari da confrontare con HEAD: **CBIS-BASE-GIT** (`agent-service.test.mjs:512`), **CBIS-BASE-TRONCAMENTO** (kernel, LEVA 4), **CBIS-BASE-AMBIENTE-1/2** (kernel, scrub credenziali). Estendere il loader di prova con `BC48_ADAPTER_ORIGINALE=1` per caricare solo l'adapter originale da HEAD e salvare `.claude/bc48-cbis-verifica-base.txt`. Questi scenari hanno già test permanenti: non duplicarli o modificarne le aspettative per ottenere verde. I log delle asserzioni ambientali vengono oscurati prima della consegna.

## Risultato e causa

**Il plateau reale di 2.304 token non è spiegato da una variazione anticipata nel banco da 11,5 KiB.** Il prefisso comune della richiesta è **13.242 byte in entrambi gli ordini**. C cambia davvero il corpo, ma non aumenta il prefisso comune fra il primo turno e il suo resume, perché la storia conserva integralmente il preambolo iniziale. Non è corretto dedurre «C non cambia il corpo» dall'uguaglianza delle due lunghezze.

È stato riprodotto e corretto un secondo problema: sopra la soglia del marcatore, con un aggiornamento effettivo, il kernel cambia la **forma JSON** del preambolo già inviato. La cura autorizzata nell'adapter porta quel prefisso da **443 a 19.533 byte**. Questo prova la stabilità del trasporto; non prova un aumento dei token cacheati da OpenRouter.

La causa dei 2.304 token delle sei sessioni resta **non determinata**. Mancano i loro corpi effettivi, la trasformazione OpenRouter → endpoint GLM, la tokenizzazione e le condizioni della cache remota. I dati allegati sono aggregati di consumo. Un prefisso stabile non implica che il server remoto lo abbia memorizzato, ritrovato o contabilizzato interamente.

## Banco e riproduzione

Catena esercitata: HTTP reale createHttpApp → createSessionRegistry → avviaSessione → createOwnerRuntimeAdapter → kernel reale → HTTP SSE del fornitore finto. Chiamate: **POST /api/v1/sessions/custom** con «Rispondi solo: uno.», modifica di nota.txt, **POST /api/v1/sessions/:id/resume** con «Rispondi solo: due.». Il fornitore restituisce letteralmente «uno» e «due», senza inventare usage o cached_tokens.

Repository di fixture isolato in Temp: **AGENTS.md di 11.776 byte = 11,5 KiB**, altro.txt e nota.txt; ramo banco, stato Git reale da pulito a « M nota.txt», permesso Read only, modello z-ai/glm-5.3-flash. L'AGENTS sintetico è ricostruibile dal codice della fixture: non è l'AGENTS originale della misura del proprietario. La piccola istantanea Git è dato di fixture: oggetti sintetici scritti nella .git temporanea e indice letto con read-tree; mai comandi add/commit/push, né scritture nella .git del worktree.

Elenco strumenti predefinito del registro, filtrato dal permesso reale: **17 strumenti, 9.066 byte JSON**, identici fra tutti i turni. SHA-256 del JSON strumenti: 827a65bda5242272d1213288c55ea3f4d0239e84d3524382dc341d5cd0b55406. MCP/plugin esterni esclusi; store di sessione, note, attività, memoria e forge isolati. Nessun planner, allegato o trial sperimentale contextHooks. parseContextTrial restituisce null senza manifest esplicito; quel trial è inoltre escluso sulla porta 4174 dal codice di configurazione.

Ogni server ascolta con listen(0, '127.0.0.1'); controlli espliciti escludono 4174. La fetch finale ammette soltanto l'origine del fornitore locale, anche sui percorsi di retry. Le porte effettive sono nei metadati delle misure. Nessuna chiave reale letta: store creato con ambiente e keyring finti. L'Authorization finta resta fuori dai corpi; nei metadati è **Bearer [OSCURATA]**. I record di sessione sono scritti dal vero store e verificati prima della pulizia; si attendono tutte le scritture e si verifica il percorso assoluto dentro Temp.

Esecuzione ordinaria:
~~~powershell
rtk proxy node --test tests/bc48-cbis-prefisso-richiesta.test.mjs
~~~

Per rigenerare i corpi e le misure:
~~~powershell
$env:BC48_SALVA = '1'
rtk proxy node --test tests/bc48-cbis-prefisso-richiesta.test.mjs
~~~

Il loader di test risolve zod dal pacchetto già installato, senza cambiare il prodotto. Pin: Node **v24.18.0**, Git **2.55.0.windows.3**, zod **4.5.4**. Il pre-C viene letto da **4cd01f803af46b70dff0f7445af9ca66962382c4:harness-ui/src/contesto-del-progetto.mjs** e caricato tramite hook Node con dipendenze relative originali; nessun checkout o modifica di quel file.

## Corpi ricevuti e primo carattere diverso

Tutti gli offset sono **da zero**. I JSON conservano il corpo ricevuto senza pretty-print e senza newline aggiuntivo. Il test verifica anche JSON.stringify(JSON.parse(raw)) === raw: nessun riordinamento artificiale.

Ordine dei campi di entrambi i corpi:
~~~text
model, messages, tools, tool_choice, stream, stream_options
~~~

| Cattura | Corpo turno 1 | Corpo turno 2 | Byte totali 1 → 2 |
|---|---|---|---:|
| C, sequenza HTTP senza ascoltatore | [bc48-cbis-turno-1.json](bc48-cbis-turno-1.json) | [bc48-cbis-turno-2.json](bc48-cbis-turno-2.json) | 22.394 → 22.479 |
| Pre-C, stessa sequenza | [bc48-cbis-pre-c-turno-1.json](bc48-cbis-pre-c-turno-1.json) | [bc48-cbis-pre-c-turno-2.json](bc48-cbis-pre-c-turno-2.json) | 22.394 → 22.479 |
| 18 KB, prima della cura, watcher attivo | [bc48-cbis-marcatore-prima-turno-1.json](bc48-cbis-marcatore-prima-turno-1.json) | [bc48-cbis-marcatore-prima-turno-2.json](bc48-cbis-marcatore-prima-turno-2.json) | 28.758 → 48.129 |
| 18 KB, dopo la cura, watcher attivo | [bc48-cbis-marcatore-dopo-turno-1.json](bc48-cbis-marcatore-dopo-turno-1.json) | [bc48-cbis-marcatore-dopo-turno-2.json](bc48-cbis-marcatore-dopo-turno-2.json) | 28.685 → 48.056 |

Le catture della ricostruzione forzata e del watcher reale con 11,5 KiB sono in [bc48-cbis-misure.json](bc48-cbis-misure.json), proprietà corpi dei rispettivi scenari. Il guasto originale da 18 KB è anche in [bc48-cbis-marcatore-prima-misura.json](bc48-cbis-marcatore-prima-misura.json).

| Scenario | Primo carattere diverso, UTF-16 | Primo byte diverso, UTF-8 | Prima → dopo | Campo/confine | Stima byte/4 |
|---|---:|---:|---|---|---:|
| C, 11,5 KiB, resume | 13.227 | **13.242** | ] → , | Fine di messages dopo messages[2]; nel turno 2 segue messages[3] assistant | **3.310,50** |
| Pre-C, 11,5 KiB, resume | 13.227 | **13.242** | ] → , | Stesso confine | **3.310,50** |
| C/pre-C con ricostruzione esplicita | 13.227 | **13.242** | ] → , | Stesso confine; aggiornamento aggiunto a messages[5] | **3.310,50** |
| C con watcher reale, 11,5 KiB | 13.227 | **13.242** | ] → , | Stesso confine | **3.310,50** |
| C, 18 KB, marcatore originale | 443 | **443** | [ → " | Inizio del valore messages[1].content, prima del testo | **110,75** |
| C, 18 KB, adapter corretto | 19.518 | **19.533** | ] → , | Fine della storia iniziale, dopo messages[2] | **4.883,25** |

Nel caso principale i caratteri Unicode coincidono con gli indici UTF-16; i 15 byte aggiuntivi derivano dai caratteri multibyte. L'array messages comincia al byte 41: lo scarto principale è al suo offset relativo **13.201 byte**. La chiave content del preambolo comincia al carattere 433; il valore comincia al 443 e il testo al 444.

~~~text
turno 1: ... "content":"Rispondi solo: uno."}],"tools":...
turno 2: ... "content":"Rispondi solo: uno."},{"role":"assistant","content":"uno"},...
~~~

C modifica davvero il corpo: confrontando **turno 1 C contro turno 1 pre-C**, la prima differenza è al byte **444**, I di «Istruzioni» contro S di «Scheda». Sui due **preamboli ricostruiti** pulito/modificato il prefisso comune è **202 byte pre-C** contro **12.435 byte con C**, rispettivamente 50,50 e 3.108,75 token stimati. Ma quei preamboli non sostituiscono il messaggio iniziale nella ripresa: di qui l'uguaglianza di 13.242 byte sulla richiesta intera. La premessa «pre-C deve essere più corto nel resume» è smentita dal banco.

## Percorso dei messaggi: righe e stato locale

Riferimenti al checkout di partenza, invariati salvo il blocco dell'adapter:

- **src/kernel/talosHarness.mjs:6335**: quando riceve messaggiIniziali, copia la storia. Altrimenti :6339 crea messages[0] con ISTRUZIONI, :6362–6363 aggiunge **un secondo messaggio di sistema** con il preambolo, :6383 aggiunge il primo utente. Il preambolo non è nel messaggio utente.
- **src/session-registry.mjs:3764–3766**: resume preferisce messaggiPendente, poi messaggiFinali; :3795 recupera la cronologia tool; :3801–3803 aggiunge il nuovo utente; :3808–3815 persiste il checkpoint e :3833–3835 passa la storia ad avviaESegui.
- **src/session-registry.mjs:2890** passa i messaggi al servizio; :3029–3035 conserva quelli restituiti dal kernel e libera i pendenti.
- **src/agent-service.mjs:595–611** legge il contesto; :630–632 confronta la storia e aggiunge il nuovo sistema **dopo il secondo utente**. :1744–1749 passa sia storia sia preambolo al kernel.
- **src/contesto-del-progetto.mjs:328–338** produce «Aggiornamento del contesto del progetto:» più **l'intero preambolo nuovo**, non soltanto la scheda. :345–358 riconosce l'ultimo aggiornamento e i due ordini storici. Nessuna riscrittura di messages[1].
- **src/session-registry.mjs:1763–1766** chiude il watcher quando la sessione è conclusa senza ascoltatori; :5159–5167 lo riattiva all'iscrizione; :2033 invalida il contesto su WorkspaceChanged. Il file può dunque cambiare mentre il preambolo nella cache locale resta lo stesso.

Nel banco senza ascoltatore: **zero invalidazioni**, preamboli identici e solo **85 byte JSON** aggiunti dalla coppia assistant/utente. Con watcher attivo: invalidazione e scheda nuova in coda; il secondo corpo da 11,5 KiB arriva a **35.474 byte**. Il piccolo incremento prompt_tokens delle sei sessioni è **compatibile** con il primo caso, ma non prova quale fosse lo stato del watcher nella misura del proprietario.

Sul trasporto, creaFetchMultiProvider con provider store instrada anche OpenRouter (**runtime-owner-adapter.mjs:707–710**). creaFetchInstradata invoca preparaRichiestaCompatibile (:558–563): per OpenRouter non si applica la normalizzazione thinking specifica Z.AI e il modello resta z-ai/glm-5.3-flash. Prima della cura i messaggi attraversano questo percorso invariati. Senza provider store OpenRouter può passare direttamente a fetch (:549). fetchConImmagini può aggiungere il plugin di compressione disabilitata con contextHooks o risolvere immagini: queste opzioni non sono attive nel banco. I test confrontano strumenti e tutti i campi diversi da messages, oltre al preambolo.

## Cura applicata e limiti

Il kernel sceglie l'ultimo sistema stringa in conMarcatoreDiCache (**:1036**), conta fino a quel punto (:1078–1086) e, sopra 16.000 caratteri, lo trasforma in un array con cache_control (:1087–1089). Non modifica la storia canonica: la trasformazione è soltanto per l'invio.

Con 18 KB il turno 1 marca messages[1]; al turno 2, dopo l'aggiornamento, marca messages[5]. Il vecchio messages[1] torna stringa: il primo carattere cambia **prima del testo**, anche se il testo è identico. Con 11,5 KiB il primo contesto non è marcato; l'aggiornamento può far superare la soglia totale, ma viene marcato soltanto in coda. Questo guasto non emerge dunque nel caso originario.

Applicate **23 righe** in **src/runtime-owner-adapter.mjs:997**, tra commenti BC-48 C-bis. Per GLM via OpenRouter normalizzano a stringa soltanto un sistema con **un unico blocco testuale nella forma esatta del marcatore del kernel**. Immagini, blocchi multipli, proprietà aggiuntive, TTL diversi, messaggi utente e altre rotte restano integri. Testo, strumenti, ordine dei campi e cronologia persistita non cambiano. La guida ufficiale OpenRouter dichiara automatica la cache Z.AI: non serve introdurre un breakpoint Anthropic per questa rotta.

**Misura dopo: 19.533 byte stabili invece di 443**, con stessi 17 strumenti e stesso progetto; 73 byte di involucro eliminati da ciascun corpo. Le quattro catture C/pre-C da 11,5 KiB sono state confrontate anche con l'adapter originale da HEAD: risultano **byte-identiche prima/dopo la cura**.

Il kernel condiviso non è modificato. Non serve un diff kernel per applicare questa cura locale: il diff concreto è quello dell'adapter qui sotto. Non si propone una generalizzazione ad Anthropic, Z.AI diretto o mobile senza le rispettive prove. Un adapter remoto potrebbe già normalizzare array e stringhe allo stesso prompt: anche per i 18 KB non dichiaro un cache miss remoto provato.

### Diff applicato

~~~diff
diff --git a/harness-ui/src/runtime-owner-adapter.mjs b/harness-ui/src/runtime-owner-adapter.mjs
index 9983f689..a187f80b 100644
--- a/harness-ui/src/runtime-owner-adapter.mjs
+++ b/harness-ui/src/runtime-owner-adapter.mjs
@@ -994,6 +994,29 @@ export function createOwnerRuntimeAdapter({
         onAvviso: input?.onAvviso, onCambioFornitore: input?.onCambioFornitore, onConsumoFornitore: input?.onConsumoFornitore,
       });
       const fetchConImmagini = async (url, init = {}, successiva = fetchInstradata) => {
+        // BC-48 C-bis: GLM via OpenRouter usa cache implicita (fonti nel rapporto
+        // del 12/09/2026). Il kernel sposta il marcatore all'ultimo sistema:
+        // alla ripresa il preambolo diventava stringa dopo essere stato array.
+        // Normalizziamo solo la forma esatta prodotta dal kernel; testo, immagini
+        // e forme estese restano integri. Nessuna mutazione della storia salvata.
+        if (String(url).includes('/chat/completions') && typeof init.body === 'string') {
+          let corpo;
+          try { corpo = JSON.parse(init.body); } catch { /* Il trasporto gestisce il JSON malformato. */ }
+          if (typeof corpo?.model === 'string' && separaFonteModello(corpo.model).fonte === 'openrouter'
+              && /^z-ai\/glm-/.test(separaFonteModello(corpo.model).modelloRemoto) && Array.isArray(corpo.messages)) {
+            let cambiato = false;
+            const messages = corpo.messages.map(m => {
+              const p = Array.isArray(m?.content) && m.content.length === 1 ? m.content[0] : null;
+              if (m?.role !== 'system' || p?.type !== 'text' || typeof p.text !== 'string'
+                  || Object.keys(p).length !== 3 || p.cache_control?.type !== 'ephemeral'
+                  || p.cache_control.ttl !== '1h' || Object.keys(p.cache_control).length !== 2) return m;
+              cambiato = true;
+              return { ...m, content: p.text };
+            });
+            if (cambiato) init = { ...init, body: JSON.stringify({ ...corpo, messages }) };
+          }
+        }
+        // BC-48 C-bis: fine della normalizzazione per la cache implicita GLM.
         if (input?.contextHooks && String(url).includes('/chat/completions') && typeof init.body === 'string') {
           let body;
           try { body = JSON.parse(init.body); } catch { /* Preserve the existing malformed-body path. */ }
~~~


## Granularità della cache e confronto con 2.304

Fonti ufficiali consultate il **12/09/2026**; data di pubblicazione delle pagine Z.AI/OpenRouter non dichiarata:

| Fonte | Riscontro rilevante | Minimo/blocco GLM |
|---|---|---|
| [Z.AI, Context Caching](https://docs.z.ai/guides/capabilities/cache) | Cache automatica; contenuti stabili e storia ordinata; conteggio in prompt_tokens_details.cached_tokens. | Nessun minimo numerico, dimensione del blocco o garanzia di hit nella pagina. |
| [OpenRouter, Prompt Caching — Z.AI](https://openrouter.ai/docs/guides/best-practices/prompt-caching#zai) | Cache automatica; affinità derivata da account ed eventuale session_id. | Nessuna granularità o soglia GLM numerica dichiarata. |
| [RFC 8259, §1 e §4](https://www.rfc-editor.org/rfc/rfc8259), dicembre 2017 | L'ordine dei membri di un oggetto non è il contratto semantico del JSON. | Il prefisso HTTP non definisce da solo il prefisso tokenizzato del modello. |

Ricerche mirate anche su «Z.AI cache block tokens» e «OpenRouter GLM 256 cache»: nessuna fonte primaria trovata che documenti **256** per questa rotta. Non trasferisco a GLM soglie OpenAI, Anthropic o DeepSeek.

**Stima richiesta: 4 byte UTF-8 per token**, senza tokenizer GLM. Il prefisso principale vale 13.242 / 4 = **3.310,50 token stimati**, **1.006,50** oltre i 2.304 misurati. Solo assumendo blocchi da 256 e quella stima, coprirebbe **12 blocchi completi = 3.072 token**, tre blocchi oltre 9 × 256. Nel caso lungo corretto: 19.533 / 4 = **4.883,25**, quindi **19 blocchi = 4.864**. Sono calcoli condizionali, non aspettative contrattuali del fornitore.

Gli strumenti vengono serializzati **dopo messages** nel JSON: il confronto grezzo si ferma prima di raggiungerli, benché i loro 9.066 byte siano identici. Materiale stabile decodificato del banco: testo sistemi/utente **12.960 byte** più JSON strumenti **9.066 byte** = **22.026 byte**, circa **5.506,50 token**, 21 blocchi ipotetici. Questa somma non ricostruisce il chat template GLM.

Una coincidenza utile: soli strumenti più istruzioni kernel sono **9.066 + 337 = 9.403 byte**, circa **2.350,75 token**; arrotondando ipoteticamente a blocchi da 256 si ottengono proprio **2.304**. È coerente con l'idea di un prefisso condiviso fra sessioni, ma non dimostra né la granularità né quali token siano conteggiati. La differenza JSON ]/virgola è sintassi di trasporto, non il primo token GLM osservato.

## Verifica e regressioni esistenti

| Cancello | Risultato |
|---|---|
| Nuovo file permanente, esecuzione focalizzata | **18/18**, nessun salto o fallimento |
| Suite ampia con cura, 13 file incluso kernel | **1.335 test: 1.330 passati, 4 falliti, 1 saltato** |
| Stesse suite esistenti con adapter originale da HEAD, senza il nuovo file | **1.317 test: 1.312 passati, stessi 4 falliti, stesso salto** |
| Quattro corpi principali contro adapter originale | **4/4 byte-identici** |
| node --check src/runtime-owner-adapter.mjs | Passato |
| git diff --check | Passato |

Il RED vero di **BC48-CBIS-MARCATORE** falliva sull'uguaglianza di messages[1], array prima/stringa dopo. Il GREEN mantiene almeno **19.533 byte** e conserva il testo canonico. RIPRESA e RICOSTRUZIONE nei due ordini richiedono almeno **13.242 byte**, oltre all'uguaglianza dei messaggi preesistenti e degli altri campi.

I controlli inversi fanno rifiutare una variazione in messages[0] e il ritorno della forma array/stringa al byte **443**. Otto controlli del perimetro includono immagini, blocchi estesi, messaggio utente, Claude via OpenRouter e Z.AI diretto. Il watcher vero è esercitato sia a 11,5 KiB sia a 18 KB.

I quattro fallimenti preesistenti, confermati sul controllo HEAD:
- **CBIS-BASE-GIT**: agent-service.test.mjs:512 pretende un ramo stringa ma riceve null (typeof null è object) in questo worktree.
- **CBIS-BASE-TRONCAMENTO**: il test kernel «un uscita lunga tiene testa E coda» non trova l'indicazione del taglio attesa.
- **CBIS-BASE-AMBIENTE-1/2**: due aspettative kernel sullo scrub delle credenziali non corrispondono all'ambiente/implementazione correnti.

Non modificati quei test o il kernel per nascondere i fallimenti. Log con valori sensibili oscurati: [bc48-cbis-verifica.txt](bc48-cbis-verifica.txt) e [bc48-cbis-verifica-base.txt](bc48-cbis-verifica-base.txt). Comando ampio:
~~~powershell
rtk proxy node --import ./tests/fixtures/bc48-cbis-dipendenze.mjs --test tests/bc48-cbis-prefisso-richiesta.test.mjs tests/agent-service.test.mjs tests/runtime-owner-adapter.test.mjs tests/runtime-owner-adapter-fallback.test.mjs tests/session-registry.test.mjs tests/http-routes-sessions.test.mjs tests/openai-compatible-runtime.test.mjs tests/contesto-del-progetto.test.mjs tests/contesto-del-progetto-prefisso-stabile.test.mjs tests/preambolo-quattro-blocchi.test.mjs tests/usage-cache.test.mjs tests/usage-cache-sessione.test.mjs src/kernel/talosHarness.test.mjs
~~~

Per il confronto HEAD: stesso comando senza il nuovo file C-bis, con BC48_ADAPTER_ORIGINALE=1; il loader cambia in memoria solo l'adapter, senza toccare il worktree.

## File consegnati

Un file modificato e sedici nuovi. I due file preesistenti nella .claude della radice del repository sono intatti. Percorsi relativi a harness-ui:

1. src/runtime-owner-adapter.mjs — unico file di prodotto modificato.
2. tests/bc48-cbis-prefisso-richiesta.test.mjs.
3. tests/fixtures/bc48-cbis-banco.mjs.
4. tests/fixtures/bc48-cbis-dipendenze.mjs.
5. .claude/RAPPORTO-BC48-CBIS-PREFISSO-RICHIESTA-2026-09-12.md.
6. .claude/bc48-cbis-turno-1.json.
7. .claude/bc48-cbis-turno-2.json.
8. .claude/bc48-cbis-pre-c-turno-1.json.
9. .claude/bc48-cbis-pre-c-turno-2.json.
10. .claude/bc48-cbis-misure.json.
11. .claude/bc48-cbis-marcatore-prima-turno-1.json.
12. .claude/bc48-cbis-marcatore-prima-turno-2.json.
13. .claude/bc48-cbis-marcatore-prima-misura.json.
14. .claude/bc48-cbis-marcatore-dopo-turno-1.json.
15. .claude/bc48-cbis-marcatore-dopo-turno-2.json.
16. .claude/bc48-cbis-verifica.txt.
17. .claude/bc48-cbis-verifica-base.txt.

Agent-service, kernel, registry, HTTP app, server, contesto, istruzioni di progetto e tutte le directory vietate non sono modificati. Nessuna dipendenza installata. rg non è disponibile nel PATH: dopo il primo tentativo, ispezione con Node e Git tramite rtk proxy.

## Cosa NON ho verificato

- Nessuna chiamata GLM/OpenRouter reale, nessun hit o risparmio effettivo attribuito alla cura.
- Nessun tokenizer esatto o primo token GLM: misurati caratteri e byte HTTP, con la stima richiesta.
- Nessuna cattura delle sei sessioni del proprietario: AGENTS sintetico e loro parametri completi non allegati.
- Nessuna prova della granularità 256, del minimo GLM, della residenza della cache o del provider finale selezionato.
- Nessun riavvio/reload del processo di prodotto, browser/composer, mobile, trial sperimentale, allegati reali o MCP/plugin. È provata la scrittura durabile della storia del banco, non il reload UI.
- Nessuna build UI/Laravel o suite intera del repository. Le suite coinvolte sopra sono state eseguite integralmente; la verifica ampia non è interamente verde per i quattro casi preesistenti.

## Testo di commit proposto, non eseguito

~~~text
BC-48 C-bis: misura il prefisso HTTP e stabilizza i marcatori GLM

Aggiunge un banco reale HTTP/registry/agent-service/kernel con fornitore
finto, catture C e pre-C e controlli del prefisso nei due versi.
Documenta che il resume conserva 13.242 byte in entrambi gli ordini.

Normalizza nell'adapter OpenRouter GLM il solo involucro cache del kernel:
con aggiornamento di sistema e 18 KB il prefisso passa da 443 a 19.533 byte.
Non attribuisce al fix un miglioramento remoto della cache non misurato.
~~~

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

- **Cosa deve fare l'owner:** rivedere il diff e decidere l'integrazione. Per spiegare i 2.304, catturare nella prossima misura autorizzata i corpi effettivi, stato del watcher, provider/endpoint e usage; quando disponibile, ispezionare anche la trasformazione upstream OpenRouter. Valutare separatamente l'affinità session_id documentata, mantenendola stabile. Non dedurre il beneficio dalla sola percentuale o dall'uguaglianza JSON.
- **Cosa faccio io:** consegno i 17 file, la cura limitata all'adapter, i 18 test C-bis verdi, la diagnosi a byte e il confronto delle suite contro HEAD. Nessuno staging, commit, push, chiamata a pagamento o accesso alla porta 4174.
- **Cosa rimane:** identificare la causa del plateau remoto sulla rotta effettiva, misurare l'effetto reale della cura e risolvere nelle rispettive corsie i quattro test preesistenti. Il comportamento locale richiesto è misurato; un aumento di cache remota non è dichiarato.
