# F-14 — chat temporanea: ricerca, enumerazione, disegno

Data: 2026-07-30 · Stato: **disegno chiuso, implementazione da fare**

## Checkpoint di ricerca web

Query: *ChatGPT temporary chat incognito implementation not saved history 2026
design privacy expectations*.

Il verdetto del settore, testuale: **«incognito nel 2026 significa perlopiù: ce
l'abbiamo ancora, semplicemente non te la mostriamo»**.

- ChatGPT e Claude **conservano** le conversazioni temporanee per una finestra
  dichiarata (~30 giorni) per sicurezza e abuse detection.
- OpenAI è stata **obbligata da un tribunale** (causa New York Times) a preservare
  tutte le conversazioni, **incluse le temporanee**.
- Quello che la modalità dà davvero è privacy **verso chi ti guarda il telefono**,
  non verso il fornitore.

**Impatto sul progetto.** TALOS è local-first e BYOK: la metà locale la possiamo
mantenere per davvero — mai scritta su disco, non solo nascosta da una lista. La
metà remota no: il fornitore riceve comunque i messaggi.

**L'one-up (L3): non essere più privati, essere gli unici che lo dicono.**
La superficie deve leggere:

> Non salvata su questo telefono.
> Il tuo fornitore la riceve comunque e la conserva secondo le sue regole.

Nessun concorrente scrive la seconda riga, perché per loro sarebbe l'ammissione
che la prima è falsa. Per noi la prima è vera, quindi la seconda si può scrivere.

## Enumerazione (vincolo iper-bloccante)

- **Le sessioni nascono in UN punto**: `chatController.ts:3670` →
  `chat.createSession(...)`, chiamato da `ChatScreen.vue`. Nessun altro.
- **Le scritture durevoli passano tutte dal repository** in `stores/chat.ts`:
  `repository.createSession(...)` (riga 594) e `repository.appendMessage(...)`
  (riga 937).
- **`repository` è `const`**, assegnato una volta alla creazione dello store
  (riga 414): non si può sostituire a metà vita.
- Esistono già tre implementazioni complete dell'interfaccia:
  `sqliteChatRepository`, `memoryChatRepository`, `lazyChatRepository`.
- Da sopprimere non c'è solo la scrittura dei messaggi: **memoria di profilo e
  contesto Libreria** vanno esclusi anche loro, altrimenti "temporanea" è falsa
  in un altro modo — la chat non finisce su disco ma alimenta la memoria che ci
  finisce.

## Il disegno

**Un repository che instrada, non un `if` sparso.**

`memoryChatRepository` esiste già e implementa l'interfaccia intera. Una chat
temporanea non è quindi un ramo di codice da ricordarsi di controllare: è
**l'assenza della cosa che scrive**. Un decoratore tiene entrambi i repository e
instrada per id di sessione — gli id temporanei alla memoria, tutto il resto al
disco.

Perché questa forma e non un flag: un flag va controllato in ogni punto di
scrittura, e il giorno che se ne aggiunge uno nuovo nessuno se ne ricorda. Con
l'instradamento, una scrittura temporanea non ha proprio un disco davanti.

**Costo noto, misurato prima di partire:** `TalosChatRepository` ha **38 metodi**
(debito A6 del registro). Il decoratore è meccanico ma lungo, ed è la ragione per
cui questo blocco non si improvvisa a fine turno.

**Da decidere in implementazione:**
- la sessione temporanea è visibile nell'elenco mentre è viva? (ChatGPT: no,
  esiste solo come chat corrente) → propongo **no**, coerente con l'aspettativa;
- cosa succede riaprendo l'app con una temporanea aperta → **sparisce**, ed è il
  punto della funzione; va detto prima, non scoperto dopo;
- memoria e Libreria: esclusi in entrambe le direzioni (non letti, non scritti).

## Stato

Ricerca ✅ · enumerazione ✅ · disegno ✅ · implementazione ⬜
