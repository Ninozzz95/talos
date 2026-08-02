# Programma di review: coerenza funzionale e interfaccia

**Richiesto dall'owner il 2026-08-02**, dopo che tre difetti veri sono usciti in
un'ora di uso reale sul telefono. Non è una rifinitura: è un cancello di qualità
che sta **prima** della piattaforma agentica.

**Metodo imposto:** cluster di agenti, **uno dopo l'altro**, uno per funzione.
Mai tutti insieme — il primo tentativo di atlante competitivo ha bruciato il
limite di sessione in 31 minuti con 43 agenti in parallelo, e 30 sono morti a
metà.

---

## 1. Perché adesso, e non dopo

I tre difetti del 2026-08-02 non sono sfortuna, sono **densità**:

- **D3** — `complete()` non legge `reasoning`, `streamComplete()` sì. Stessa
  classe, stesso file, due strade che sanno cose diverse. Si vede **solo** con un
  modello di ragionamento **e solo** sulla strada non-streaming.
- **D1** — il ri-tentativo dell'intestazione GGUF si ferma a 8 MiB con un tetto
  di 32. Si vede **solo** con un modello dal vocabolario grande.
- **D2** — un file `.imatrix` presentato come modello. Si vede **solo** su un
  repository che pubblica anche gli accessori.

Tutti e tre sono **incoerenze fra configurazioni**, non bug logici. E tutti e tre
sarebbero stati moltiplicati dalla piattaforma agentica, che chiama i modelli
N volte invece di una. Ripararli dopo costa N volte tanto.

## 2. Dove va nella tabella di marcia

| | |
|---|---|
| **R-A e R-B** (censimento + coerenza provider×funzione) | **PRIMA della fase 3.** La piattaforma agentica si costruisce sopra lo strato provider: se quello strato è incoerente, la piattaforma eredita l'incoerenza moltiplicata. |
| **R-C** (comportamenti distruttivi) | **PRIMA della fase 3**, insieme a R-B. Un agente che gira venti minuti in background incontra la morte di processo, il doze e la perdita di rete *di sicuro*, non *forse*. |
| **R-D** (interfaccia su dispositivo vero) | **apre la fase 6** (backlog FE). Il suo esito **è** la lista dei lavori FE: farla prima produrrebbe una lista che invecchia mentre le funzioni atterrano. **Eccezione**: il censimento dei componenti (dropdown legacy, linguette mancanti) si fa subito in R-A, perché costa poco e serve a tutti. |

---

## 3. R-A — Censimento (il cluster che rende possibile «100% preciso»)

Senza una mappa meccanica, «tutte le configurazioni» è un'opinione. Questo
cluster non giudica niente: **enumera**, e produce tabelle leggibili dalla
macchina.

- **Provider**: ogni id, ogni adattatore, cosa dichiara (`requiresSecret`,
  `requiresEndpoint`, capacità), quale strada usa (`complete` / `streamComplete`).
- **Classi di modello**: ragionamento / non ragionamento / visione / con tool /
  locale piccolo / locale grande / con `reasoning_content` / con `reasoning`.
- **Funzioni che chiamano un modello**: chat in streaming, chat non-streaming,
  chiamata a tool, titolo della conversazione, miglioratore del prompt, sintesi
  di Deep Research, giudice di Deep Research, follow-up, visione, embedding,
  elenco modelli, benchmark locale.
- **Schermate e componenti**: ogni schermata, ogni controllo, **quali usano il
  dropdown legacy**, quali non hanno linguette di navigazione, quali divergono
  dal riferimento visivo approvato.

**Esito:** la matrice `funzione × provider × classe di modello` con le celle
vuote segnate. Le celle vuote sono il piano di lavoro di R-B.

## 4. R-B — Coerenza provider × funzione (un cluster per funzione)

Per **ogni funzione** della lista sopra, un cluster:

1. **Lettura**: leggere *tutti* gli adattatori per quella funzione e trovare
   dove divergono — campi letti, ripieghi, errori lanciati, forme accettate.
2. **Verifica avversariale**: un secondo agente prova a smentire ogni divergenza
   trovata e cerca quelle saltate.

**La domanda che ogni cluster deve rispondere** è quella che ha scoperto D3:
*«questa funzione si comporta allo stesso modo su tutti i provider e su tutte le
classi di modello? e se no, l'utente lo capisce dal messaggio?»*

**Casi che vanno cercati per nome**, perché sono già usciti:
- risposta con `content` vuoto e contenuto in `reasoning` / `reasoning_content`;
- risposta con `content` come **array di parti** invece che stringa;
- `finish_reason` di troncamento trattato come successo;
- modello che non tiene un formato richiesto (il 360M che produceva zero
  affermazioni);
- provider che ignora `Range`, o che risponde 200 a una richiesta parziale;
- chiave valida per un modello e non per un altro nello stesso provider;
- modello sparito dal catalogo fra la scelta e l'uso;
- giudice uguale all'autore per via di un cambio di modello a metà.

## 5. R-C — Comportamenti distruttivi (un cluster per classe di abuso)

Gli agenti devono comportarsi **come si comporta un utente vero**, non come si
comporta un test. Un cluster per classe:

1. **Morte del processo**: kill dalla lista attività durante ogni operazione
   lunga (download, ricerca, sintesi, verifica, benchmark, caricamento modello).
2. **Rete che va e viene**: aereo a metà streaming, rete che torna, rete lenta,
   captive portal, DNS che fallisce.
3. **Credenziali**: chiave cambiata a metà run, chiave revocata, chiave di un
   altro provider incollata nel campo sbagliato, nessuna chiave.
4. **Spazio e memoria**: disco che si riempie durante un download, memoria che
   finisce mentre un modello è caricato, secondo modello aperto sul primo.
5. **Permessi**: negati, revocati mentre l'app è in uso, revocati mentre è in
   background.
6. **Dita**: tocchi ripetuti sullo stesso pulsante, doppio avvio della stessa
   operazione, indietro durante una scrittura, rotazione dello schermo.
7. **Ingressi mostruosi**: prompt da 200.000 caratteri, file enorme, nome con
   emoji e a-capo, incolla di HTML, testo in alfabeto diverso.
8. **Sistema Android**: doze, risparmio energetico, telefono che squilla,
   venti minuti in background, aggiornamento dell'app sopra i dati esistenti.
9. **Scelte assurde ma legittime**: modello da 360M per tutto, giudice uguale
   all'autore, modello cancellato mentre è selezionato, profondità Esaustiva su
   rete mobile.

Per ogni caso: **esiste una difesa nel codice? è provata da un test? cosa vede
l'utente?** Le tre risposte vanno insieme — una difesa non provata non è una
difesa, e una difesa che non si spiega è un guasto in un'altra forma.

## 6. R-D — Interfaccia, esperienza e prova sul dispositivo vero

**Vincolo fisico da rispettare: un dispositivo, un guidatore.** Gli screenshot
non si possono parallelizzare — due agenti che pilotano lo stesso tablet si
rubano i tocchi a vicenda. Quindi R-D è **rigorosamente sequenziale**: un cluster
per schermata, uno alla volta, e l'analisi delle immagini può poi fanoutare.

Per ogni schermata:

- screenshot di **ogni stato**: vuoto, in caricamento, con pochi dati, con molti
  dati, in errore, offline, degradato, con testo lunghissimo;
- **componenti**: usa quelli del progetto o ne ha inventato uno? dropdown legacy?
- **navigazione**: ha le linguette dove servono? si torna indietro senza perdersi?
- **coerenza** col riferimento visivo approvato (schermata Locale);
- **mani**: bersagli da 44×44, raggiungibilità col pollice, tastiera che non
  copre il campo, scorrimento che non salta;
- **parole**: messaggi che dicono cosa fare, non solo cosa è andato storto.

## 7. Regole comuni a tutti i cluster

- **Uno dopo l'altro.** Mai due cluster insieme.
- **Ogni scheda viene attaccata** da un verificatore avversariale prima di
  contare, come nell'atlante competitivo: là il verificatore ha ribaltato la
  conclusione portante.
- **Nessun rilievo senza il pezzo di codice o lo screenshot** che lo dimostra.
- **Niente correzioni dentro la review.** Si raccoglie, si verifica, si ordina.
  Le correzioni sono blocchi semi-atomici successivi, come da regola.
- **Ogni cluster chiude con un esito scritto nel repo**, non nella chat.

## 8. Esito finale

Una lista sola, ordinata per danno reale, dove ogni riga ha: cosa si rompe, con
quale configurazione, la prova, e quanto costa ripararla. È quella lista che
diventa i blocchi di implementazione — non un documento da leggere, un piano da
eseguire.
