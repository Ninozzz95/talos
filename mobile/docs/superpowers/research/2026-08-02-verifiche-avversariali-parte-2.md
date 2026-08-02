# Verifiche avversariali, parte 2 — i ribaltamenti

**Come e' nato questo file.** Quattro verificatori hanno demolito otto cluster
dell'atlante (0, 2, 6, 7, 8, 10, 11, 12) con ~250 controlli su fonte primaria. Il
loro genitore e' morto sui limiti di sessione **prima di scrivere il documento**,
quindi i risultati sono esistiti solo dentro una conversazione. Questo e' il
recupero dei verdetti portanti. **I dettagli completi (ogni cifra contestata, ogni
URL) sono nella sessione, non qui**: se servono, vanno rigenerati.

## La regola che ne esce, e che vale piu' dei singoli verdetti

Chi ha compilato le schede si e' fidato, per tre prodotti su sette, di **un
venditore interessato** (eesel, che vende un agente concorrente), di un
**concorrente diretto** (deckary, add-in PowerPoint, per i difetti di Genspark
Slides) e di un **sito ad affiliazione** (toolchase). Se la tesi di TALOS e' «la
prova di cio' che e' stato fatto», la ricognizione che la fonda non applicava a
se stessa la propria regola.

## Gli L3 caduti

| Preteso vantaggio strutturale | Perche' cade |
|---|---|
| **«La sandbox senza cloud»** | E2B pubblica **tutta** l'infrastruttura Apache-2.0 con guida al self-hosting Terraform; Beam e' open source; Daytona e' forkabile. Gratis-e-offline con isolamento microVM esiste **oggi**, ed e' piu' forte del nostro. Resta un L2 di forma. |
| **«Un tool che dice: questo lo faccio in locale, gratis, e' non scrivibile da un concorrente»** | Cline (Apache-2.0, 65.500★) e OpenHands (MIT, 82.873★) lo spediscono oggi. Non e' una funzione che non possono scrivere: e' una che i quotati non hanno interesse a mettere in home. Marketing, non struttura. |
| **«Loro pagano mentre la VM gira, noi no»** | Devin **non consuma** mentre aspetta la risposta, mentre girano i test o nel setup del repo, e dorme dopo ~0,1 ACU di inattivita'; Factory iberna i Droid Computer. Il costo dell'inattivita' non esiste. |
| **«Fuori dal Play Store»** | La policy dice testualmente che Google Play **permette** l'Accessibility API «across a wide range of applications», con disclosure e consenso; VpnService e' permessa a chi ha la VPN come funzione principale. Fossato di conformita', misurabile in settimane. |
| **«Nessun modello computer-use gira on-device»** | Sulla stessa classifica citata dalla scheda c'e' **Holo3-35B-A3B, open weight, quinto assoluto a 82,6%**, sopra Claude Sonnet 5. Il limite e' di QUEL telefono, non del settore. |
| **«Il RAG on-device e' impossibile»** | E' una **dipendenza Gradle di Google**: `com.google.ai.edge.localagents:localagents-rag`, con embedder on-device e `SqliteVectorStore`. Il vantaggio residuo e' di **esecuzione** (chunking, provenienza, cifratura), non di categoria. |

## Il ribaltamento peggiore: il watchdog

La scheda sosteneva che **Android regala il supervisore** con WorkManager, e che
i concorrenti devono comprarlo (Temporal, 100-500$/mese). Due smentite:

1. La documentazione dice l'opposto di cio' che serve: *«WorkManager is not
   intended for in-process background work that can safely be terminated…»* — e'
   un sostituto del **cron**, non della durable execution.
2. **Sul OnePlus scelto come dispositivo di prova la garanzia e' la peggiore del
   mercato**: dontkillmyapp assegna a OxygenOS il punteggio massimo di gravita'
   — *«one of the most severe background limits on the market to date, dwarfing
   even those performed by Xiaomi or Huawei»* — e le impostazioni **si
   reimpostano dopo gli aggiornamenti firmware**.

**Il vantaggio numero uno era, su quell'hardware, il rischio numero uno.**

## Il solo vantaggio che sopravvive intatto — e che non avevamo trovato

*«GenAI API inference is permitted only when the app is the top foreground
application… including using a foreground service, will result in
ErrorCode.BACKGROUND_USE_BLOCKED»*. Inchioda **chiunque costruisca su Gemini
Nano** al primo piano. `llama.cpp` in-process no.

Ma **oggi non lo possiamo incassare**: la nostra mente sta in una webview che
Capacitor dichiara **non disponibile in background**, dentro un foreground
service che Android 15 taglia a **6 ore su 24** ([[android-background-6h-limit]]),
su un telefono che uccide i processi piu' aggressivamente di chiunque.

**La conclusione onesta si capovolge**: non e' «loro non possono», e'
**«noi potremmo, se risolvessimo il background»** — ed e' un problema di
ingegneria nostro, non un vantaggio da annunciare.

## Le correzioni operative immediate

- **NON implementare solo la revisione MCP 2026-07-28**: e' uscita da pochi
  giorni, non e' retrocompatibile, e l'host di riferimento documenta
  2025-03-26 / 2025-06-18 / **2025-11-25**. Un client che parla solo l'ultima
  **non parla con nessuno** dei ~10.000 server esistenti.
- **La firma della Agent Card A2A non e' `Base64(SHA256(json))`** — quella e' un
  digest, non una firma, e chiunque puo' ricalcolarla. La spec impone **JWS
  (RFC 7515) su JSON canonicalizzato JCS (RFC 8785)**. Implementare lo
  «stealable» come scritto avrebbe spedito **una finta firma**.
- **Da copiare pari pari sui tool Shizuku**: il modello Factory — blocklist non
  aggirabile, denylist batte allowlist, e **risoluzione del programma reale
  prima del confronto**, cosi' «un comando bloccato non si intrufola con un
  wrapper shell, un percorso assoluto, trucchi di quoting o sostituzione».

## Il contro-esperimento che nessun cluster ha preteso

Ogni cifra di context bloat (67.300, 143.000, 134.000, 18.000 token) e' misurata
su **finestre da 200k di modelli cloud**. Non esiste **una sola misura** su un
GGUF da 3B sul dispositivo. La tesi piu' importante dell'atlante non ha una riga
di evidenza sul suo bersaglio.
