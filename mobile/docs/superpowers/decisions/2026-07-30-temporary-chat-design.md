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

**Correzione al disegno, dopo aver guardato l'interfaccia da vicino.**
Un decoratore che copia i 38 metodi NON va bene, per due ragioni trovate
leggendo il codice e non ragionando a mente:

1. I metodi non parlano la stessa lingua. Alcuni prendono un `sessionId`, altri
   un oggetto che lo contiene, **altri l'id di un messaggio** — e da quello la
   sessione non si ricava senza chiederla a qualcuno.
2. Peggio: il giorno che qualcuno aggiunge il **39° metodo**, un decoratore
   scritto a mano lo lascia cadere sul disco **in silenzio**. Che è esattamente
   il fallimento che questa funzione esiste per impedire.

**Quindi: una tabella di instradamento che FALLISCE CHIUSO.** Per ogni metodo,
una riga che dice come si trova la sessione. Un metodo non elencato **solleva un
errore** invece di scrivere. Il 39° metodo rompe un test il giorno che lo
aggiungi, invece di far uscire in silenzio una chat che l'utente aveva chiesto
fosse temporanea.

`TalosChatRepository` ha 38 metodi (debito A6): la tabella è ~38 righe corte e
leggibili, contro ~400 di copie che possono divergere una per una.

**Da decidere in implementazione:**
- la sessione temporanea è visibile nell'elenco mentre è viva? (ChatGPT: no,
  esiste solo come chat corrente) → propongo **no**, coerente con l'aspettativa;
- cosa succede riaprendo l'app con una temporanea aperta → **sparisce**, ed è il
  punto della funzione; va detto prima, non scoperto dopo;
- memoria e Libreria: esclusi in entrambe le direzioni (non letti, non scritti).

## Stato

Ricerca ✅ · enumerazione ✅ · disegno ✅ · implementazione ⬜
