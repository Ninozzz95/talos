# Dossier di ricerca — ciclo run, ragionamento, stop, coda e reindirizzamento

Data: 2026-09-01  
Perimetro: Harness Desktop (`AVM-harness-desktop`), mobile solo riferimento.

## Problema osservato

- Quando arriva `ReasoningMessageStart`, la UI rimuove il loader iniziale. Se
  `showReasoning` è disattivato, non resta alcun segnale visibile che TALOS stia
  ragionando.
- Il pulsante nel composer resta sempre “Invia”; lo stop reale vive altrove e
  il bottone `.stop-run` del mockup cambia soltanto stato locale.
- Un messaggio inviato durante un run usa la coda FIFO. Il kernel lo legge solo
  quando una risposta del modello termina senza tool call: non è un vero
  reindirizzamento prioritario.
- L'owner vuole conservare la coda sicura e aggiungere un'azione esplicita che
  forzi il cambio di direzione il prima possibile.

## Fonti primarie e pin

### OpenAI Codex

- App Server ufficiale, commit `90ae0c4ef944bb80a3c725d15910289dfbb7db51`:
  `turn/steer` aggiunge input al turno attivo senza aprirne uno nuovo;
  `turn/interrupt` è una richiesta separata e il client aspetta
  `turn/completed` per sapere che è stata applicata.
  https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/codex-rs/app-server/README.md
- Esempio SDK ufficiale sullo stesso pin: `steer()` e `interrupt()` sono due
  operazioni diverse, entrambe correlate al turno corrente.
  https://github.com/openai/codex/blob/90ae0c4ef944bb80a3c725d15910289dfbb7db51/sdk/python/examples/14_turn_controls/async.py

Decisione upstream: **adattare dietro un contratto TALOS**, non copiare il
protocollo Codex. TALOS non usa l'App Server Codex come runtime e deve restare
provider-neutral; adottiamo invece la separazione semantica fra stop, coda e
steer e la correlazione alla sessione attiva.

### Anthropic Claude

- Managed Agents, documentazione ufficiale letta il 2026-09-01, beta
  `managed-agents-2026-04-01`: un redirect è modellato come
  `user.interrupt` seguito da `user.message`; la chiamata ritorna quando gli
  eventi sono accodati, mentre l'interruzione può richiedere più tempo se un
  tool è già in corso.
  https://platform.claude.com/docs/en/managed-agents/events-and-streaming

Decisione upstream: **adattare** il confine sicuro. Il desktop richiede subito
lo stop ma non tronca a metà un tool locale già partito; conserva i risultati
conclusi, poi riparte nella stessa sessione con la correzione dell'utente.

### Hermes Agent

- Guida ufficiale, commit `18a76be124d7c16ed98b629a358b23fef76a7f46`:
  distingue `queue`, `steer` e `interrupt`. `queue` aspetta il turno seguente;
  `steer` entra nel run dopo il prossimo tool call senza interrompere;
  `interrupt` ferma e avvia una nuova direzione.
  https://github.com/NousResearch/hermes-agent/blob/18a76be124d7c16ed98b629a358b23fef76a7f46/website/docs/user-guide/messaging/index.md
- Lo stesso upstream separa `thinking_callback`, `reasoning_callback` e
  `tool_progress_callback`; il renderer mantiene un indicatore animato mentre
  il modello pensa e lo sostituisce con stati specifici dei tool.
  https://github.com/NousResearch/hermes-agent/blob/18a76be124d7c16ed98b629a358b23fef76a7f46/agent/display.py

Decisione upstream: **adattare, non adottare il default interrupt di Hermes**.
La coda TALOS resta non distruttiva; il reindirizzamento è una scelta esplicita
e lo stop non viene confuso con un messaggio di follow-up.

### Accessibilità e movimento

- W3C consiglia un messaggio di stato in una live region `aria-live="polite"`
  senza spostare il focus.
  https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA25
- `prefers-reduced-motion` richiede una variante statica che comunichi ancora
  lo stato senza movimento.
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion

Decisione upstream: **adottare direttamente** `role="status"` + live region e
riusare il loader TALOS già tokenizzato; in movimento ridotto la linea resta
visibile ma ferma.

## Contratto TALOS scelto

Stati dell'azione primaria nel composer:

| Run | Testo | Azione primaria | Azione aggiuntiva |
| --- | --- | --- | --- |
| inattivo | vuoto | Invia, disabilitato dal submit vuoto | nessuna |
| inattivo | presente | Invia | nessuna |
| attivo | vuoto | Stop | nessuna |
| attivo | presente | Stop | Reindirizza |

- `Enter` durante un run conserva la coda FIFO esistente.
- `Reindirizza` richiede priorità: mette da parte la correzione, chiede lo stop,
  aspetta il confine sicuro e riparte nella **stessa sessione** con la storia
  prodotta fino a quel punto.
- Uno stop esplicito annulla un reindirizzamento ancora pendente.
- Un reindirizzamento non consuma né fonde i messaggi già in coda.
- Una sola correzione prioritaria può essere pendente: doppio click o seconda
  richiesta vengono rifiutati in modo deterministico.
- La UI non mostra il testo come già letto dal modello finché non arriva il
  nuovo `RunStarted` autoritativo.
- Se il provider va in timeout prima del primo token, il redirect non viene
  perso: se esiste una cronologia precedente la conserva; al primissimo giro
  ricostruisce il task con richiesta originale + correzione e lascia al runtime
  la ricostruzione del proprio system prompt. Non fabbrica una cronologia
  parziale che il provider non ha mai restituito.

## Limite dichiarato del runtime attuale

Il runtime owner controlla `AbortSignal` fra i giri del modello, non dentro un
tool locale già avviato. Quindi “subito” significa “al primo confine sicuro”:
una risposta del modello può fermarsi rapidamente, ma un comando o una
scrittura già partiti arrivano alla loro conclusione prima del redirect. È la
stessa cautela esplicitata da Claude per le tool call in corso e impedisce file
o processi lasciati a metà.

## Finding emerso dal gate reale

La prima prova Qwen isolata su `4175` ha restituito un timeout prima del primo
token. La prima implementazione trattava l'assenza di `messaggiFinali` come
redirect impossibile (`RunRedirectFailed`). Il dato misurato ha invalidato
quella scelta: il task iniziale era ancora noto e sufficiente per una ripartenza
sicura. È stato quindi aggiunto il contratto permanente
`REGISTRY-REDIRECT-TIMEOUT-14`; la cronologia canonica precedente non viene più
cancellata da un giro senza esito e il primo giro può essere ricostruito senza
inventare messaggi interni del runtime.

La ripetizione sul codice corretto ha chiuso il caso reale: la stessa sessione
ha emesso `RunRedirectApplied`, è ripartita con richiesta originale e
correzione esplicita, quindi Qwen 3.8 Flash ha concluso con `OK`.

## Finding della review indipendente

La review separata ha riprodotto tre classi di gara che il percorso felice non
copriva:

- il runtime locale restituiva come `messaggiFinali` la sola risposta parziale
  dell'assistente, perdendo la richiesta utente originale al redirect;
- un riavvio fra richiesta/applicazione e nuovo `RunStarted` lasciava nel
  replay una richiesta apparentemente ancora attiva;
- una cancellazione autoritativa poteva arrivare prima del `200` della POST:
  il client cancellava comunque il testo e mostrava un falso successo. Inoltre
  il pulsante restava azionabile durante un redirect già pendente.
- il ripristino leggeva il primo record `messaggi-finali` invece dell'ultimo:
  una conversazione con più turni poteva riaprire o forkare una cronologia
  vecchia pur avendo su disco lo snapshot più recente.
- le append degli eventi possono completarsi in ordine fisico diverso da
  quello logico; usare l'ultima riga fisica come prossima sequenza poteva
  collidere con un evento già emesso e far scartare al browser proprio la
  chiusura fail-closed del redirect.
- Stop e Redirect sono due richieste HTTP concorrenti: se Stop raggiunge il
  server prima che Redirect sia registrato, non esiste ancora un evento
  `RunRedirectCancelled`. Un id creato soltanto dal server non può chiudere
  questa gara; serve un intento correlato dal client e riconosciuto da entrambe
  le richieste.

Questi finding non cambiano la decisione upstream: la correlazione tramite
`redirectId` e gli eventi autoritativi resta l'adattamento provider-neutral
scelto. Rafforzano il contratto: la storia canonica include sempre l'input del
turno, un riavvio chiude gli intenti orfani in fail-closed e un evento terminale
o di cancellazione prevale su una risposta HTTP tardiva. Lo store append-only
resta la fonte autoritativa, ma per gli snapshot sostitutivi vale esplicitamente
la semantica last-write-wins già applicata alle impostazioni sessione. Per gli
eventi, `_sequenza` è l'ordine canonico: quando tutti i record lo espongono il
replay li riordina; il contatore riparte sempre dal massimo osservato, mai
dall'ultima append fisica.

La correlazione Codex/Claude già scelta viene quindi resa simmetrica: il client
genera un UUID prima del trasporto, Redirect lo registra e Stop può cancellarlo
anche se arriva per primo. Il registro conserva per la vita della sessione un
insieme piccolo e limitato di id annullati; una POST tardiva con lo stesso id
fallisce chiusa. Non viene introdotto un protocollo provider-specifico.
