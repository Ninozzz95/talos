# BC-48 · mossa C — prefisso stabile e cache di sessione

Data: 12/09/2026. Rapporto e registro di esecuzione in `harness-ui/.claude/`: la `.claude/` alla radice è fuori dalle radici scrivibili della sessione. Nessun commit, staging, push, accesso alla porta 4174 o chiamata a pagamento.

**Stato della consegna:** riordino applicato, calcolo additivo e componenti implementati e verificati. Il collegamento alle API e alla sessione aperta è nel diff **non applicato**, perché richiede i tre file vietati dal brief. La percentuale della sessione reale non è quindi ancora collegata nel prodotto: i componenti senza proiezione mostrano «non misurato». Build ordinaria tentata ma bloccata da un errore di accesso alle directory di esbuild; prove locali e visive di fixture verdi.

## Registro prima delle modifiche

Sottosistemi: orchestrazione desktop e TALOS UI. Implementazione locale a cura di Astra, senza deleghe. I divieti specifici del brief prevalgono sulle corsie generali del repository.

File da modificare:

- `src/contesto-del-progetto.mjs`: `costruisciPreambolo`, `preamboloVistoDa`; firme pubbliche di `contestoDelProgetto`, `aggiornamentoInCoda`, `segnalaFileCambiati`, costanti e metadati conservati. Nuovo ordine istruzioni → mappa → scheda, anche con ripiego della scheda. Riconoscimento sia storico sia nuovo nella storia.
- `src/usage-cache.mjs`: sole aggiunte, `tokenIngressoDaUsage` e `cacheSessioneDaEventi`. Contratto additivo `cacheSessione` con `percentuale`, `tokenIngresso`, `tokenDaCache`, `giriMisurati`, `giriNonMisurati`, `fonte`. Nessun cambiamento a `normalizzaUsage`, `tokenDaCache`, `tokenNonDaCache`, `scontoDaCache` o al registro dei fornitori.
- `frontend/src/components/consumo-sessione.js`: aggiunta `testoRiusoCache`, unico testo umano della misura.
- `frontend/src/components/inspector.js`: `righeFinestra`, `aggiornaInspector`, parametro additivo `cacheSessione`.
- `frontend/src/components/costi-consumo.js`: `aggiornaCosti`, opzione additiva `sessioneId`; riga riferita esplicitamente alla sessione aperta, senza sommare percentuali di sessioni diverse.
- `frontend/tests/unit/inspector.test.mjs`: sole aspettative della nuova riga; le righe della finestra restano identiche.

File da creare:

- `tests/fixtures/bc48-preambolo.mjs`: `progettoBC48`, `separaBlocchi`, `primoByteDiverso`; costruzione riproducibile di un piccolo progetto isolato, git simulato e orologio iniettato.
- `tests/fixtures/bc48-preambolo.json`: testi dei tre blocchi, due stati git, misura prima/dopo in byte UTF-8, fixture dichiarata simulata.
- `tests/contesto-del-progetto-prefisso-stabile.test.mjs`: ordine, minuto trascorso con ricostruzione forzata, solo scheda diversa, scheda assente, riconoscimento e aggiornamento della storia.
- `tests/istruzioni-di-progetto-stabili.test.mjs`: testo delle istruzioni e della mappa senza istanti generati, metadati temporali esclusi dalla resa.
- `tests/usage-cache-sessione.test.mjs`: due giri misurati più uno senza usage; zero dichiarato distinto da assenza; fornitori e forme; ordine dei percorsi; nessun doppio conteggio con `/usage`; replay; ingressi incoerenti.
- `frontend/tests/unit/cache-sessione.test.mjs`: testo, inspector, costi, aggiornamento e stato assente tramite DOM di prova.
- `.claude/BC48-C-INTEGRAZIONE-NON-APPLICATA.patch`: collegamenti nei file vietati, da integrare a cura dell'owner.
- `.claude/RAPPORTO-BC48-C-PREFISSO-STABILE-2026-09-12.md`: questo registro, poi esiti e consegna.

Nessun file da eliminare. Nessuna migrazione, dipendenza o protocollo nuovo. `src/istruzioni-di-progetto.mjs` e `src/mappa-cartelle.mjs` non richiedono modifiche: nessun istante del momento entra nel testo; `Date.now()` in `contesto-del-progetto.mjs` governa solo la cache locale, `msImpiegati` nella mappa è metadato. Le date scritte dall'autore dentro AGENTS.md sono contenuto del file, non orari generati.

RED: i nuovi test devono fallire sull'ordine precedente, sul mancato riconoscimento del nuovo prefisso, sugli export della misura assenti e sulle righe UI assenti. GREEN: test nuovi e poi `node --test tests/contesto-del-progetto*.test.mjs tests/istruzioni-di-progetto*.test.mjs tests/usage-cache*.test.mjs`, più `tests/preambolo-quattro-blocchi.test.mjs`, `tests/mappa-tempo-e-cache-stantia.test.mjs`, `tests/bc40-mappa-minima.test.mjs`. Frontend: `npm run test:unit` con filtro dei nomi BC48/INSP e suite direttamente coinvolte; build in destinazione temporanea, senza aggiornare file generati vietati. Controllo finale `git diff --check`.

Regressione permanente BC48-STORIA: il riordino rende falso `startsWith(INIZIO_SCHEDA)` come unico riconoscimento; serve compatibilità prima di consegnare. Prova visibile: medesima dicitura «Riusato dalla cache · 63 % · su 2 giri» in entrambe le superfici; senza misura «non misurato». Stesso carattere, classi `talos-kv`/`talos-muted` esistenti, nessun colore o movimento nuovo. La quota della sessione non modifica Conversazione/Libera.

Gate reale: riservato all'owner, con almeno tre chiamate identiche per fornitore/modello/configurazione e confronto del campo cache grezzo prima/dopo. Nessuna affermazione di risparmio senza quel gate. Rollback: rimuovere esclusivamente le aggiunte BC48 e ripristinare il precedente ordine e relativo riconoscimento dai diff; non cancellare modifiche altrui. Nessun rollback eseguito.

## Ricerca primaria, letta il 12/09/2026 prima del codice

Letta anche la ricerca fornita `.claude/RICERCA-BC48-ISTRUZIONI-DI-PROGETTO-2026-09-12.md`. Recupero pagine con Web open/fetch; DeepSeek ha richiesto GET HTTPS diretto tramite Node dopo due errori del lettore Web (HTTP 200). Nessun endpoint di generazione chiamato.

| Fornitore e fonte | Regola verificata e minimo |
|---|---|
| [OpenRouter — Prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching), consultata 12/09/2026 | Le modalità dipendono dall'upstream: automatiche per Z.AI/DeepSeek, marcatori per il controllo esplicito Anthropic. Tenere uguali prefisso, ordine, strumenti e instradamento; affinità di sessione utile. La pagina riporta 1.024 token per Sonnet 4.5/4.6, 4.096 per Opus 4.5–4.8 e Haiku 4.5, 2.048 per Haiku 3.5. Nessun minimo unico del router. |
| [OpenAI — Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), consultata 12/09/2026 | Prefisso identico; istruzioni e strumenti stabili all'inizio, variazioni dopo. Documentazione attuale: GPT-5.6+ minimo 1.024 token visibili, modalità implicita o `prompt_cache_breakpoint` esplicito; senza breakpoint in modalità solo esplicita non si scrive cache. Prima di GPT-5.6 il minimo dipende anche da strumenti, immagini, schema, reasoning e verbosity: non assumere universalmente 1.024. |
| [Anthropic — Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), consultata 12/09/2026 | Gerarchia `tools → system → messages`; cambiare strumenti invalida tutto ciò che segue. Hit sul prefisso fino al blocco marcato, identità completa, lookback di confini di blocco. Minimi diretti: 512 per Fable/Mythos/Opus 5; 1.024 Sonnet 4.5/4.6/5 e Opus 4.8; 2.048 Opus 4.7/Mythos Preview; 4.096 Opus 4.5/4.6 e Haiku 4.5. La tabella OpenRouter diverge su Opus 4.7/4.8: non sostituire il minimo di una rotta con quello dell'altra. |
| [Z.AI — Context caching](https://docs.z.ai/guides/capabilities/cache), consultata 12/09/2026 | Automatico; system stabile, documenti riusati e storia mantenuta in ordine. Espone `prompt_tokens_details.cached_tokens`. La pagina non pubblica una soglia numerica minima né un contratto separato sull'ordine degli strumenti: non inventarli. Mantenere gli strumenti identici è una precauzione coerente col prefisso, da verificare sulla rotta effettiva. |
| [DeepSeek — Context caching](https://api-docs.deepseek.com/guides/kv_cache), consultata 12/09/2026 | Automatico, unità di prefisso persistite da riusare interamente; confini delle richieste, rilevamento di prefissi comuni e intervalli fissi. Per A+B poi A+C, A può diventare riusabile alla terza richiesta A+D. La pagina attuale non dichiara il minimo numerico né l'intervallo: il vecchio valore 64 non è un vincolo verificato attuale. `prompt_cache_hit_tokens` è il conteggio di lettura. |

Decisione upstream: **adattare dietro l'adapter AVM esistente**, senza nuova libreria. Il riordino è coerente col requisito del prefisso stabile di tutti e cinque; non garantisce un hit. In particolare il kernel marca l'intero preambolo come unico blocco: su Anthropic una scheda cambiata dentro quel blocco impedisce di riusare la sua precedente voce anche se i primi byte sono identici. Non sposto né aggiungo marcatori, come richiesto. OpenAI recente e DeepSeek hanno anch'essi confini di lookup/persistenza da rispettare. I giri reali restano necessari.

Pin: contratto locale P-B/P-H del checkout corrente (hash da registrare a fine lavoro), pagine ufficiali consultate il 12/09/2026, wire esistenti `openai-chat`, `openai-responses`, `anthropic-messages`. Non viene installato alcun upstream, quindi nessuna nuova licenza o versione di pacchetto da dichiarare. Fixture di conformità sui nomi dei campi; nessuna promessa che i documenti web siano immutabili.

## Esiti

RED backend: 6 casi del runner, 1 superato (caratterizzazione dell'assenza di istanti), 5 falliti: quattro regressioni del preambolo e il modulo di test cache privo degli export richiesti. RED frontend: 11 casi, 9 superati e 2 falliti (export assente e riga assente).

Primo GREEN focalizzato: 23/24. La sola discrepanza era nella nuova fixture DeepSeek, che assumeva erroneamente precedenza del nome nativo; ispezione del registro conferma `prompt_tokens_details.cached_tokens` prima di `prompt_cache_hit_tokens`. Corretto il test, senza cambiare il lettore né il registro; aggiunto il caso con il solo campo nativo.

Emendamento prima dell'ulteriore modifica: aggiungere all'elenco `frontend/tests/unit/finestra-contesto-unica.test.mjs:105`. La suite interessata ha trovato 39/40 verdi: il test sul doppio conteggio enumera tutte le etichette e deve includere la nuova riga. Scenario permanente BC48-NON-OCCUPAZIONE: la riga cache resta fuori da occupazione e Libera; nessuna modifica ai calcoli, asserzione esplicita sull'assenza di righe stimate conservata.

Il diff non applicato nomina `createSessionRegistry.elenca`, `.elencaMetriche`, `.esporta`, il passaggio HTTP `/metrics`, e `caricaCacheSessioneDalRegistro` nel monolite. Il caricamento legge la proiezione backend, raggruppa le richieste durante il replay e scarta risposte per sessioni/generazioni superate; nessuna aritmetica della cache nel monolite.

Risultati conclusivi nelle sezioni seguenti.

Emendamento per la verifica visiva: creare `frontend/tests/bc48-cache-sessione.visual.mjs` e le due immagini `.claude/BC48-C-1440.png`, `.claude/BC48-C-390.png`. Banco locale esplicitamente di fixture, componenti e CSS reali, server su porta assegnata dal sistema (mai 4174), nessuna API di modello. La build ordinaria in destinazione temporanea è stata tentata e bloccata dai permessi del processo esbuild sulla risalita delle directory; non è un risultato GREEN.

Emendamento della fixture già elencata: `tests/fixtures/bc48-preambolo.json` conterrà anche `istantaneaRepository`: istruzioni e mappa lette dal checkout, due schede ottenute simulando solo git pulito/modificato e un minuto trascorso. L'ordine precedente viene ricomposto dagli stessi blocchi; nessun salvataggio di stato git reale viene modificato e nessuna chiamata al fornitore è necessaria.

## Prima e dopo: byte, non stime di token

Istantanea del repository `harness-ui`, ramo `lane/harness-desktop`, HEAD `4cd01f803af46b70dff0f7445af9ca66962382c4`, con le aggiunte BC48 presenti. Istruzioni, mappa e filtro `.gitignore` letti dal disco; solo git simulato pulito → un file modificato. Stessi permesso (`Workspace write`), modello (`z-ai/glm-5.3-flash`) e piattaforma (`win32`). Ricostruzione forzata dopo 60.000 ms di orologio iniettato: nessuna attesa reale di un minuto.

| Blocco UTF-8 | Git pulito simulato | Git modificato simulato | Posizione prima → dopo |
|---|---:|---:|---|
| Istruzioni | 11.845 byte | 11.845 byte | seconda → prima |
| Mappa | 1.159 byte | 1.159 byte | terza → seconda |
| Scheda | 468 byte | 469 byte | prima → ultima |
| Due separatori `\n\n` | 4 byte | 4 byte | stessi byte |
| Totale | 13.476 byte | 13.477 byte | uguale per ciascuno stato nei due ordini |

Prima: **scheda → istruzioni → mappa**. Dopo: **istruzioni → mappa → scheda**.

Il primo carattere che cambia è la `n` di «niente da salvare», sostituita da `1` in «1 file non salvati». Offset da zero:

| Misura sull'istantanea repository | Prima | Dopo |
|---|---:|---:|
| Primo byte diverso | **214** | **13.222** |
| Primo carattere Unicode diverso | 209 | 13.196 |
| Inizio della scheda | 0 byte | 13.008 byte |

Il riordino colloca **13.008 byte** prima della scheda. Sono byte di un prefisso identico, **non token di cache misurati**. La versione «prima» dell'istantanea repository è la ricomposizione dei medesimi blocchi nell'ordine originario; non è un giro fatto sul modello prima della modifica.

La fixture minima, catturata effettivamente prima di modificare il modulo, dà un controllo indipendente: istruzioni **419**, mappa **371**, scheda **263→264**, totale **1.057→1.058 byte**; primo byte diverso **202→996**, primo carattere **197→979**. I test confrontano le costruzioni nuove con questa fixture. [Fixture completa](../tests/fixtures/bc48-preambolo.json).

Ricerca testuale eseguita nei tre moduli per `toISOString`, `Date`, `oggi`: `contesto-del-progetto.mjs:154,181` usa `Date.now()` solo per la cache locale, `:251` contiene «oggi» in un commento; `istruzioni-di-progetto.mjs:96` solo un commento; nessuna occorrenza in `mappa-cartelle.mjs`. Nessun istante da spostare. Il testo della mappa non stampa `msImpiegati`. Le date eventualmente scritte dall'autore nei file di istruzioni restano contenuto statico del progetto.

## Usage per chiamata e proiezione proposta

La fonte scelta è **una sola**: `CUSTOM` con `name: 'consumo-fornitore'` e `value.usage`, non `/usage`.

- `src/runtime-owner-adapter.mjs:635`: `consumoPubblico` copia solo i campi di consumo pubblici. `:771` prende `risultato.usage`; `:773` emette il consumo della chiamata. `:752` emette `usage: null` per un tentativo fallito osservato.
- `src/agent-service.mjs:1770`: incapsula in `CUSTOM` e passa `{ durable: true }` a `onEvento`.
- `src/session-registry.mjs:1992`: `broadcast` deposita gli eventi; `_sequenza` identifica lo stesso evento nei replay. La nuova funzione non dipende dall'ordine per la somma, non muta il log e deduplica la medesima sequenza.
- `src/session-registry.mjs:1038`: il lettore storico mantiene l'ultimo `/usage` per esecuzione, perché quello è cumulativo. Sommarlo ai consumi P-H conterebbe due volte le chiamate. La nuova metrica non aggiunge nemmeno i riepiloghi separati della compattazione.

Formula: `100 × somma(tokenDaCache) / somma(tokenIngresso)` sulle **stesse chiamate misurabili**. I campi cache vengono letti da P-B nell'ordine del registro, mai sommando alias. Il totale pubblico `prompt_tokens` include la cache; per un usage nativo Anthropic con il solo `input_tokens`, il totale è ingresso + letture + scritture. Se manca una misura necessaria, il giro rimane non misurato. Conteggi incoerenti, cache superiore al totale e denominatore nullo non producono percentuali.

Esempio provato: 1.000 token in ingresso / 900 riusati, poi 2.000 / 990, poi usage assente → **1.890 / 3.000 = 63 %**, «su 2 giri», un giro non misurato. Un giro senza cache esposta non abbassa il rapporto; uno zero dichiarato invece entra come zero misurato. «Giri» qui significa chiamate/tentativi osservati da P-H, non messaggi della persona.

Campo additivo da esporre, senza cambiare `usage` né `usageSessione`:

```json
{
  "cacheSessione": {
    "percentuale": 63,
    "tokenIngresso": 3000,
    "tokenDaCache": 1890,
    "giriMisurati": 2,
    "giriNonMisurati": 1,
    "fonte": "consumo-fornitore"
  }
}
```

Senza chiamate misurabili: `percentuale`, `tokenIngresso`, `tokenDaCache` sono `null`; `giriMisurati` è 0. I log precedenti a P-H o i percorsi che non emettono P-H restano **non misurati**, anche se hanno un riepilogo `/usage`: non si inventa retroattivamente la copertura per chiamata. L'adapter ha un percorso senza P-H quando mancano pool/fallback (`runtime-owner-adapter.mjs:657`); verificarlo nella configurazione dei giri reali.

Pin locale dei contratti adottati: blob Git di `provider-registry.mjs` **`a569e38bc7e62765846ee96157d88a4890a1ccd7`**, blob di `runtime-owner-adapter.mjs` **`9983f68996f25b07ef5126b0ca95b32c38d73dd3`**, entrambi al HEAD sopra. Nessun upstream installato, protocollo riscritto o versione di pacchetto modificata.

## File toccati e righe

Percorsi relativi a `harness-ui/`; le righe sono quelle della consegna, salvo la tabella dei diff non applicati che usa gli originali.

| File | Righe e risultato |
|---|---|
| `src/contesto-del-progetto.mjs` | 30 commento ordine; 219–230 composizione; 345–359 riconoscimento storico/nuovo |
| `src/usage-cache.mjs` | 248 `tokenIngressoDaUsage`; 270 `cacheSessioneDaEventi`, sole aggiunte |
| `frontend/src/components/consumo-sessione.js` | 83 `testoRiusoCache`, unico testo umano |
| `frontend/src/components/inspector.js` | 58 e 77 riga cache; 462 passaggio della misura al renderer |
| `frontend/src/components/costi-consumo.js` | 169 `sessioneId`; 188–192 misura della sessione aperta |
| `tests/fixtures/bc48-preambolo.mjs` | 7 progetto isolato; 45 separazione blocchi; 51 confronto byte |
| `tests/fixtures/bc48-preambolo.json` | 1 fixture minima e istantanea del repository |
| `tests/contesto-del-progetto-prefisso-stabile.test.mjs` | 7 ordine; 17 minuto/git; 36 scheda assente; 50 storia/reload |
| `tests/istruzioni-di-progetto-stabili.test.mjs` | 6 orologio e durata esclusi dalla resa |
| `tests/usage-cache-sessione.test.mjs` | 8 rapporto; 13 assenza; 23 unica fonte; 30 replay; 38 wire; 49 incoerenza |
| `frontend/tests/unit/cache-sessione.test.mjs` | 9 testo; 15 indipendenza dalla finestra; 42 DOM/costi/sessione |
| `frontend/tests/unit/inspector.test.mjs` | 18, 21, 22: aspettative con la nuova riga |
| `frontend/tests/unit/finestra-contesto-unica.test.mjs` | 105, 110: stessa nuova riga nei due rami; calcoli invariati |
| `frontend/tests/bc48-cache-sessione.visual.mjs` | 1 banco browser locale, autonomo e senza modelli |
| `.claude/BC48-C-INTEGRAZIONE-NON-APPLICATA.patch` | 1 diff per l'owner; 39 HTTP; 50 monolite |
| `.claude/BC48-C-1440.png` | immagine della fixture a 1440 px |
| `.claude/BC48-C-390.png` | immagine della fixture a 390 px |
| `.claude/RAPPORTO-BC48-C-PREFISSO-STABILE-2026-09-12.md` | questo rapporto, registro e dossier |

Nessuna asserzione dei test storici del preambolo è stata cambiata: non imponevano l'ordine complessivo dei tre blocchi. Le sole aspettative esistenti aggiornate sono le cinque righe frontend elencate sopra. Tutti i nuovi scenari sono test permanenti.

## Diff non applicati: collegamenti necessari

[Patch completa](BC48-C-INTEGRAZIONE-NON-APPLICATA.patch), applicabile dalla radice del monorepo. `git apply --check` è passato; **non** è stato eseguito `git apply` senza `--check`. La sintassi dei tre risultati proposti è stata verificata in copie temporanee con `node --check`.

| File vietato, riga originale | Collegamento nel diff |
|---|---|
| `src/session-registry.mjs:1` | import del calcolo additivo |
| `src/session-registry.mjs:4188` | `cacheSessione` nel dettaglio delle metriche |
| `src/session-registry.mjs:5347` | `cacheSessione` nell'elenco delle sessioni |
| `src/session-registry.mjs:5414` | `cacheSessione` nel dettaglio esportato |
| `src/http-app.mjs:5420` | inoltra `cacheSessione` in `/sessions/:id/metrics`; elenco a 5081 ed export a 5312 già inoltrano gli oggetti del registro |
| `frontend/src/legacy/app.js:372` | stato iniziale della misura |
| `frontend/src/legacy/app.js:4270` | passa l'identità della sessione aperta ai costi |
| `frontend/src/legacy/app.js:9183` | lettura delle metriche con raggruppamento delle richieste concorrenti e guardia id/generazione |
| `frontend/src/legacy/app.js:9208` | passa la proiezione all'inspector |
| `frontend/src/legacy/app.js:14303` | aggiorna dopo deduplicazione degli eventi di consumo/inizio/fine |
| `frontend/src/legacy/app.js:15255` | azzera la misura e invalida la lettura quando cambia sessione |

Nessun diff al kernel: `conMarcatoreDiCache` resta a `src/kernel/talosHarness.mjs:1034`. Il commento in `src/agent-service.mjs:1746–1748` resta pertinente e non è stato toccato. Nessun file vietato presenta modifiche in `git diff`.

### Testo integrale del diff non applicato

```diff
--- a/harness-ui/src/session-registry.mjs
+++ b/harness-ui/src/session-registry.mjs
@@ -1,4 +1,5 @@
-import { validaFallbackProviders } from './model-destination.mjs';
+import { validaFallbackProviders } from './model-destination.mjs';
+import { cacheSessioneDaEventi } from './usage-cache.mjs';
 import { contextUsageFromEvents } from '../../context-engine/src/usage.mjs';
 
 /**
@@ -4185,7 +4186,7 @@
       const chiusura = interrotta && metriche.chiusura && metriche.chiusura.motivo === null
         ? { ...metriche.chiusura, motivoAssente: MOTIVO_CHIUSURA_INTERROTTA }
         : metriche.chiusura;
-      return { ok: true, ...metriche, chiusura, interrotta };
+      return { ok: true, ...metriche, chiusura, interrotta, cacheSessione: cacheSessioneDaEventi(voce.eventi) };
     },
 
     async elencaServerMcp(sessionId) {
@@ -5344,7 +5345,8 @@
            * misurato su tre invii veri, 23.060 token contro i 7.716 che si
            * vedevano. Vedi il blocco di testa di `usageSessioneDaEventi`.
            */
-          usageSessione: usageSessioneDaEventi(voce.eventi),
+          usageSessione: usageSessioneDaEventi(voce.eventi),
+          cacheSessione: cacheSessioneDaEventi(voce.eventi),
         }))
         .sort((a, b) => b.avviataAlle.localeCompare(a.avviataAlle));
     },
@@ -5411,7 +5413,8 @@
         forkDa: voce.forkDa,
         modello: voce.modello ?? null,
         fallbackProviders: voce.fallbackProviders ?? [],
-        eventi: voce.eventi,
+        cacheSessione: cacheSessioneDaEventi(voce.eventi),
+        eventi: voce.eventi,
       };
     },
   });
--- a/harness-ui/src/http-app.mjs
+++ b/harness-ui/src/http-app.mjs
@@ -5417,7 +5417,7 @@
            * sessione indistinguibile da una viva. Un difetto dello stesso tipo era già stato
            * trovato e curato in `elencaFigli` (06/9). Il campo si dichiara, non si deduce.
            */
-          data = { registrato: esito.registrato, motivo: esito.motivo, giri: esito.giri, cache: esito.cache, primoToken: esito.primoToken, chiusura: esito.chiusura, interrotta: esito.interrotta === true };
+          data = { registrato: esito.registrato, motivo: esito.motivo, giri: esito.giri, cache: esito.cache, cacheSessione: esito.cacheSessione ?? null, primoToken: esito.primoToken, chiusura: esito.chiusura, interrotta: esito.interrotta === true };
         } else if (skillsMatch) {
           requireNoQuery(url);
           let sessionId;
--- a/harness-ui/frontend/src/legacy/app.js
+++ b/harness-ui/frontend/src/legacy/app.js
@@ -369,7 +369,8 @@
        * il nodo «Main» dell'albero e la Board. `null` finché nessun invio ha
        * riportato consumo — mai uno zero fabbricato.
        */
-      usageSessione: null,
+      usageSessione: null,
+      cacheSessione: null,
       eventiUsageContesto: new Map(),
       cachePromptPrecedenti: 0,
       /** La somma dei totali degli invii GIÀ CHIUSI (fino all'ultimo `RunStarted`). */
@@ -4267,7 +4268,7 @@
     if (!pannello) return;
     try {
       const sessioni = (await apiGet('/api/v1/sessions'))?.items || [];
-      aggiornaCosti(pannello, sessioni);
+      aggiornaCosti(pannello, sessioni, { sessioneId: state.realSession.id });
     } catch {
       const nota = $('#costiNota');
       if (nota) nota.textContent = 'Le sessioni non si leggono adesso: il server locale non risponde.';
@@ -9180,7 +9181,34 @@
     apriMenuAzioniLibreria(voci, dove?.ancora ? { ancoraEl: dove.ancora } : { x: dove?.x ?? 0, y: dove?.y ?? 0 });
   }
 
-  function aggiornaInspectorDaStato() {
+  // BC-48 C: il rapporto arriva dal registro, anche dopo replay o riapertura.
+  let richiestaCacheSessione = null;
+  function caricaCacheSessioneDalRegistro() {
+    const sessionId = state.realSession.id;
+    const generation = state.realSession.generation;
+    if (!sessionId) { state.realSession.cacheSessione = null; return; }
+    if (richiestaCacheSessione?.sessionId === sessionId && richiestaCacheSessione.generation === generation) {
+      richiestaCacheSessione.ancora = true;
+      return;
+    }
+    const richiesta = { sessionId, generation, ancora: true };
+    richiestaCacheSessione = richiesta;
+    void (async () => {
+      do {
+        richiesta.ancora = false;
+        let misura = null;
+        try {
+          const dati = await apiGet(`/api/v1/sessions/${encodeURIComponent(sessionId)}/metrics`);
+          misura = dati?.cacheSessione ?? null;
+        } catch { /* La lettura fallita lascia una misura assente, mai quella di un'altra chat. */ }
+        if (richiestaCacheSessione !== richiesta || state.realSession.id !== sessionId || state.realSession.generation !== generation) return;
+        state.realSession.cacheSessione = misura;
+        aggiornaInspectorDaStato();
+      } while (richiesta.ancora);
+    })().finally(() => { if (richiestaCacheSessione === richiesta) richiestaCacheSessione = null; });
+  }
+
+  function aggiornaInspectorDaStato() {
     const inspector = $('#inspectorSessione') || $('.talos-inspector');
     if (!inspector) return;
     const file = [...(state.realSession.reviewFiles?.values?.() || [])].map((v) => { const c = contaDiff(v); return { path: v.path, aggiunte: c.aggiunte, rimozioni: c.rimozioni }; });
@@ -9205,7 +9233,8 @@
     aggiornaInspector(inspector, {
       titolo: state.realSession.id ? (state.session || 'Sessione') : 'Nessuna sessione aperta',
       contesto: state.realSession.contesto || null,
-      usage: finestra.perInspector.usage,
+      usage: finestra.perInspector.usage,
+      cacheSessione: state.realSession.id ? state.realSession.cacheSessione : null,
       /*
        * ⛔ Il NUMERO, non il descrittore: `righeFinestra` fa aritmetica su questo valore
        * (`finestra - occupati`), e un oggetto le fa produrre NaN — a schermo «Libera — · 100,0%»,
@@ -14300,8 +14329,9 @@
      */
     if (typeof evento._sequenza === 'number') {
       if (state.realSession.sequenzeViste.has(evento._sequenza)) return;
-      state.realSession.sequenzeViste.add(evento._sequenza);
-    }
+      state.realSession.sequenzeViste.add(evento._sequenza);
+    }
+    if ((evento.type === 'CUSTOM' && evento.name === 'consumo-fornitore') || ['RunStarted', 'RunFinished', 'RunError'].includes(evento.type)) caricaCacheSessioneDalRegistro();
     /*
      * ⭐⭐⭐ O-02 (04/9) — il registro degli attrezzi si riempie QUI, in un
      * punto solo e DOPO il dedup `_sequenza`: sotto, i tre `case` hanno già
@@ -15252,7 +15282,9 @@
       state.realSession.redirectRequestIntentId = null;
       state.realSession.attesaBubble = null; // il nodo è già sparito con replaceChildren() qui sopra
       state.realSession.usage = null; // Fase 3 — un resume (continua:true) TIENE il conto, una sessione nuova riparte da IGNOTO
-      state.realSession.usageSessione = null; // 06/9 CB-04 — idem per il totale della conversazione
+      state.realSession.usageSessione = null; // 06/9 CB-04 — idem per il totale della conversazione
+      state.realSession.cacheSessione = null;
+      richiestaCacheSessione = null;
       state.realSession.eventiUsageContesto = new Map();
       state.realSession.cachePromptPrecedenti = 0;
       state.realSession.usageEsecuzioniPrecedenti = null;
```

## Verifica conclusiva

| Comando / prova | Esito |
|---|---|
| `rtk proxy node --test tests/contesto-del-progetto*.test.mjs tests/istruzioni-di-progetto*.test.mjs tests/usage-cache*.test.mjs tests/preambolo-quattro-blocchi.test.mjs tests/mappa-*.test.mjs tests/bc40-*.test.mjs` | **80/80**, nessun fallimento |
| `rtk proxy node --test frontend/tests/unit/cache-sessione.test.mjs frontend/tests/unit/inspector.test.mjs frontend/tests/unit/consumo-sessione.test.mjs frontend/tests/unit/costi-contesto.test.mjs frontend/tests/unit/finestra-contesto-unica.test.mjs` | **40/40**, nessun fallimento |
| Da `frontend/`: `rtk proxy npm.cmd run test:unit -- --test-name-pattern="BC48\|INSP\|DOPPIO CONTEGGIO\|FINESTRA-UNICA"` | **136/136 unità riportate dal runner**. Sono 10 test selezionati e 126 file caricati senza casi corrispondenti: non equivale all'intera suite frontend |
| Da `frontend/`: `rtk proxy node tests/bc48-cache-sessione.visual.mjs` | **2/2 viewport**, 1440×900 e 390×900; testo intero, assenza di overflow, movimento ridotto, Tab/Invio e reload con misura assente. Immagini ispezionate |
| `node --check` delle tre copie temporanee del diff proposto | **3/3**, sintassi valida |
| Dalla radice: `rtk proxy git apply --check harness-ui/.claude/BC48-C-INTEGRAZIONE-NON-APPLICATA.patch` | passato, nessuna applicazione |
| `rtk proxy git diff --check` | passato |
| Build `buildProduction({outputDir: .../Temp/talos-phase1-bc48-c-20260912})` | **fallita per permessi ambiente**: esbuild non può leggere `../../../../..`; conseguenti errori di risoluzione `src/avvio.js`, `src/main.js`, `src/styles/main.css`. Non modificati build script o directory protette |

Il runner `npm run test:unit` enumera sempre tutti i file e inoltra le opzioni a Node; è stato quindi usato il filtro dei nomi, affiancato all'esecuzione integrale dei cinque file direttamente coinvolti. I numeri sono riportati separatamente per non trasformare file senza casi eseguiti in copertura inesistente.

L'ambiente non espone `rg` nel PATH: dopo il tentativo iniziale, ricerca testuale con letture Node e numeri di riga. RTK usato tramite `rtk proxy`: `rtk git` diretto aveva fallito per configurazione Claude non accessibile. Gli avvisi Git sul file globale ignore non leggibile non hanno impedito `diff --check` o `apply --check`.

## Cosa non è stato verificato

- **Nessun giro reale a pagamento**, nessun `cached_tokens` reale prima/dopo, nessun risparmio di denaro o durata dichiarato.
- Nessun percorso completo composer → backend → fornitore → consumo → reload sulla sessione reale: l'integrazione resta nel diff vietato. La persistenza del banco visivo è quella della fixture, non una prova dello store di produzione.
- Il raggruppamento delle richieste e le guardie del diff del monolite hanno verifica sintattica e revisione, non test end-to-end sull'app reale. L'owner deve verificare anche cambio chat durante una risposta HTTP e replay della SSE.
- Nessuna build completa riuscita in questo ambiente. Import e resa dei componenti sono stati invece esercitati nel browser reale con i CSS del progetto.
- Nessun congelamento nuovo della mappa per tutta la sessione: rimane la finestra SWR esistente e l'invalidazione esplicita. Dopo una modifica dei file di istruzioni o della mappa il testo può cambiare legittimamente.
- Per Anthropic il riordino dentro un unico blocco marcato non crea un breakpoint sul confine istruzioni/mappa. Non si può promettere riuso di quel segmento quando cambia la scheda. Minimi e confini effettivi della rotta vanno verificati nei giri dell'owner.

## Testo di commit proposto, non eseguito

```text
BC-48 C: stabilizza il prefisso e prepara la misura cache della sessione

Ordina istruzioni, mappa e scheda; conserva il riconoscimento dei preamboli
storici. Aggiunge la quota di cache dai consumi durabili P-H e le righe
dei componenti inspector e costi, con copertura dei giri misurati.

Include fixture prima/dopo, test e rapporto; collegamenti a registro,
HTTP e monolite consegnati come diff non applicato per l'owner.
```

## Cosa deve fare l'owner · Cosa faccio io · Cosa rimane

- **Cosa deve fare l'owner:** integrare il diff dei tre file riservati; rifare build e smoke del percorso reale; eseguire tre o più giri con stesso prompt, modello, ordine dei messaggi, strumenti e marcatori. Salvare i consumi grezzi, confrontare `cached_tokens`/campo nativo e `cacheSessione`, ripetere dopo reload. Includere zero dichiarato, usage assente e fornitore senza conteggio cache. Su Anthropic verificare il limite del blocco marcato prima di attribuire un guadagno al riordino.
- **Cosa faccio io:** consegno i 18 file elencati, il calcolo, i componenti, le prove verdi, le due immagini di fixture e il diff verificato ma non applicato. Non eseguo operazioni Git di pubblicazione o giri pagabili.
- **Cosa rimane:** collegamento nel prodotto, build nell'ambiente dell'owner e misura reale del riuso. Il solo prefisso byte-identico è provato; il beneficio della cache del fornitore resta da misurare.


---

## Misura vera sul 4174 (aggiunta in review, 12/09 20:05-20:20)

Sei sessioni `z-ai/glm-5.3-flash` via OpenRouter, cartella banco con `AGENTS.md` di 11,5 KB, due turni ciascuna con modifica di `nota.txt` fra i turni (cambia la scheda). Backend PRIMA = `97b1cc88` (scheda in testa), DOPO = `617407e7` (mossa C).

| etichetta | sessione | turno 1 prompt / cache | turno 2 prompt / cache | cache della sessione |
|---|---|---:|---:|---:|
| prima | `b48f5af3` | 5048 / 2304 | 5061 / 2304 | — |
| prima | `7c6747b8` | 5049 / 0 | 5062 / 2304 | — |
| prima | `b424911d` | 5049 / 2304 | 5063 / 2304 | — |
| dopo | `73d51d88` | 5049 / 0 | 5062 / 0 | 0.0 % |
| dopo | `5f2298b7` | 5049 / 2304 | 5062 / 2304 | 45.6 % |
| dopo | `7896745e` | 5049 / 2304 | 5062 / 2304 | 45.6 % |

**Esito: nessuna differenza misurabile.** Al turno 2 i token letti dalla cache sono **2.304** sia prima sia dopo (45,6 % dell'ingresso); lo stesso 2.304 compare spesso già al turno 1, cioè è un prefisso condiviso fra sessioni (istruzioni del kernel + attrezzi, non il preambolo). Con C istruzioni e mappa (~3.400 token) sono identiche fra i due turni e precedono la scheda, ma il prefisso cacheato non cresce ⇒ il primo token diverso sta prima del preambolo, o il preambolo del turno 2 non è nella stessa forma/posizione, o il fornitore cacheggia a blocchi. La percentuale per sessione (`cacheSessione`, anche retroattiva sulle sessioni «prima») funziona. Aperto come **C-bis** (brief `.claude/PROMPT-ASTRA-2026-09-12-BC48-Cbis-dove-si-ferma-il-prefisso.md`).
