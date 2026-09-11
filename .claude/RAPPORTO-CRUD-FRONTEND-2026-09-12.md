# CRUD completo di Note / Attività / Memoria — il FRONTEND

> Ordine dell'owner (11/09/2026, «non negotiable»): «le note, se sono markdown, devono essere
> renderizzate in markdown; tutte le Note, Attività, Memoria, Libreria devono avere **CRUD
> completi**».
>
> Il backend è del lotto di ieri (`.claude/RAPPORTO-CRUD-BACKEND-2026-09-11.md`, commit `c6ddfbdc`).
> Questo rapporto copre **solo la metà della persona**: il pulsante, il modulo, la validazione, le
> parole, il menu, l'eliminazione, l'annullamento e la resa Markdown.
>
> Lane `lane/harness-desktop` · nessun commit, nessun push, nessun giro col modello, **mai la 4174**.

---

## 1. Cosa c'era prima (misurato, non ricordato)

| | Prima di stanotte | Adesso |
|---|---|---|
| Note | elenco + dettaglio in sola lettura · `Copia` · `Esporta` | **crea · leggi · modifica · elimina**, resa Markdown con interruttore |
| Attività | elenco + dettaglio · la spunta era un **segno `aria-hidden`** | **crea · modifica · tre stati · elimina**, la spunta è un comando |
| Memoria | elenco + dettaglio · `Copia` · un `h3 Origine` col valore grezzo | **crea · modifica · elimina**, duplicato spiegato a parole |

⛔ **La ragione per cui non c'erano NON vale più, ed è scritta nel file.** La testata di
`sezioni-adattatori.js` diceva: «sul server vero `notes`, `memory`, `tasks` espongono **solo GET**
(`http-app.mjs`, righe 762 e 840): un pulsante Modifica o una casella da spuntare qui sarebbe una
promessa che nessuna rotta può mantenere — la lezione ‹APERTA› non è ‹FATTA›». Era vero l'11/09;
**la notte stessa** il lotto di backend ha aperto le sette rotte che mancavano. La premessa era vera
quando è stata scritta e oggi è falsa: si riapre, e si scrive perché (`sezioni-adattatori.js:29-40`).

Due fatti misurati che hanno deciso il disegno:

- **L'elenco non porta tutto.** `session-registry.mjs` proietta a mano `id/titolo/contenuto/…`:
  niente `formato`, niente `origine`, niente `creataAlle` (rapporto backend §6). ⇒ il dettaglio fa
  **una GET sua per voce aperta**, una volta sola, e finché non arriva non indovina niente. Il fatto
  è chiuso da una prova che legge il **sorgente** del registro
  (`tests/integration/crud-vivo-frontend.test.mjs`, `BANCO-PROIEZIONE`): il giorno in cui qualcuno
  allarga la proiezione quella riga diventa rossa e la GET si può togliere.
- **Il motivo di un 400 non esce dalla busta** — ⇒ **si valida PRIMA di mandare**, coi tetti veri dei
  magazzini. Vedi §6 per ciò che ho misurato e che **smentisce in parte** il rapporto di backend.

## 2. Le fonti (ricerca fatta PRIMA di scrivere)

⛔ **WebSearch era esaurita per la sessione (200/200 chiamate)**: dichiarato, e usate le **fonti
primarie con WebFetch**, come prevede il brief.

| Fonte | Data lettura | Cosa ha cambiato nel codice |
|---|---|---|
| **MDN, `aria-invalid`** | 12/09/2026 | «**Do not set `aria-invalid="true"` on empty required elements until after the user attempts to submit the form.** They may still be working on filling it out» ⇒ la validazione gira **sul Salva**, mai a ogni tasto, e un modulo appena aperto non ha nessun campo accusato (prova `MOD-NIENTE-ACCUSE-ANTICIPATE`). Stessa pagina: l'errore si lega con `aria-errormessage` e si annuncia con `role="alert"`. |
| **W3C WAI, «Forms · User Notifications»** | 12/09/2026 | «Form fields can be associated with the corresponding error message using **`aria-describedby`**», e il messaggio sta **accanto al campo**, non in un elenco in cima ⇒ qui `aria-describedby` (supporto più largo) **e** `aria-errormessage`, testo sotto il campo. |
| **NN/g, «Error-Message Guidelines»** | 12/09/2026 | «Keep error messages **next to the fields** in error minimizes working-memory load» e «**avoid showing an error until the user has finished with the field**» ⇒ un campo già segnalato si ripulisce mentre lo si corregge, ma nessun campo viene accusato per la **prima** volta mentre si scrive. |
| **NN/g, «Confirmation Dialogs Can Prevent User Errors»** | 12/09/2026 | «provide response options that **summarize what will happen**… use buttons labeled *Delete file* and *Keep file*» e «Do not ask *Are you sure*… **explain what *this* is**» ⇒ la conferma dice il nome della voce e la conseguenza, e il bottone si chiama «Elimina la nota». Stessa pagina: «do try your best to **offer undo**… to reduce reliance on confirmation dialogs» ⇒ modifica e stato **non** chiedono conferma, hanno «Annulla» nel toast. |
| CommonMark 0.31.2, RFC 9110 §15.3.2, RFC 5789 | già citate dal lotto backend (11/09), riusate | i marcatori del rilevamento nel finto di laboratorio; 201+`Location`; `PATCH` parziale. |

## 3. La cura (file:riga)

### 3.1 `src/components/modulo-voce.js` — NUOVO, 620 righe

Il modulo crea/modifica, uno solo per tre risorse. È il gemello di `magazziniDellaPersona`
(`http-app.mjs:1902`): una tabella, tre righe, invece di tre moduli scritti a mano che il giorno in
cui cambia un tetto restano indietro in silenzio.

| Cosa | Dove | Nota |
|---|---|---|
| `SCHEMI` — i tre schemi (campi, tetti, scelte, articolo, **genere**) | `:57-134` | i tetti sono quelli dei magazzini: 120/8.000 · 200/2.000 · 80/600 |
| `accordo()` — la desinenza, in un posto solo | `:154` | nata da un difetto **visto nella foto**: vedi §5 |
| `parolaOrigine()` | `:163` | «Scritta da te» / «Scritto da TALOS»; `undefined` ⇒ **tace** (non è «del modello», è «non lo so ancora») |
| `valoriIniziali()` | `:174` | un valore fuori vocabolario non entra nel `<select>` |
| `validaValori()` | `:202` | vuoto sul **ritagliato**, lunghezza sull'**intero** — le due misure diverse che stanno nella stessa riga dei magazzini |
| `corpoCreazione()` / `corpoModifica()` | `:231` / `:254` | «riconoscilo dal testo» **non si manda** in creazione (`formato:null` è un 400) e diventa `formato:null` sul `PATCH`; il `PATCH` porta **solo ciò che cambia**, e se non cambia niente non parte |
| `paroleErroreRete()` | `:276` | il **codice** diventa una frase; il `message` del server non si ripete mai a schermo |
| `servizioVoci()` | `:296` | le cinque porte del contratto, scritte **una volta**; senza sessione o senza rete torna `null` e i comandi non compaiono |
| `costruisciModulo()` | `:348` | etichette, campi, errore sotto il campo, contatore sull'ultimo decimo; **niente `maxlength`** (taglierebbe un incollato in silenzio); i tasti premuti aggiornano lo stato **senza ridisegnare** |
| `montaTestoVoce()` | `:455` | l'interruttore «Anteprima · Testo», `role="tablist"`, stesso della Libreria; un modo solo ⇒ niente striscia |
| `costruisciStatoAttivita()` | `:536` | i tre stati in un `radiogroup` (si sceglie **un valore**, non si cambia vista) |
| `confermaEliminazione()` | `:582` | la conferma NN/g; è una funzione **apposta** perché la prova che conta è quella al contrario |

### 3.2 `src/components/sezioni-adattatori.js` — l'impianto della scrittura

| Cosa | Dove |
|---|---|
| Il blocco «LA SCRITTURA», con il perché della premessa caduta | `:143-171` |
| `magazzinoScrittura()` — modulo aperto, voci lette per intero, modo scelto, bozza | `:173` |
| `scrittura()` — crea/modifica/elimina/stato/copia/esporta/menu, per tutte e tre | `:203-508` |
| `montaScrivibile()` — monta, aggancia, e rimonta **una volta sola** | `:511` |
| `montaNote` · `aggiornaPaginaMemoria` · `aggiornaPaginaAttivita` | `:521` · `:616` · `:685` |

⛔ **Come il modulo sta nel dettaglio senza toccare l'impianto.**
`sezione-elenco-dettaglio.js` **non è un file di questa lane** (ci lavora un altro agente stanotte) e
apre il dettaglio solo su una voce **selezionata**. Quindi la voce in scrittura **esiste**: è una
BOZZA (`__bozza`) infilata nell'elenco che l'impianto riceve, e la selezione la si aggancia da fuori
con `statoSezione()`, che l'impianto **esporta**. Nessuna sua riga è cambiata.

- La bozza **non entra in nessun conto**: ogni filtro la respinge (`filtriSenzaBozza`, «Tutte»
  compreso) e i due sommari contano l'elenco vero. Un «4 note» con tre note sul disco sarebbe la
  stessa bugia dei contatori che puntavano a una pagina inesistente.
- Se la persona apre un'altra scheda o chiude il dettaglio, la selezione cambia sotto il modulo:
  quello è il segnale che il modulo va chiuso, e **la bozza si tiene da parte** invece di essere
  buttata (riaprendo «Nuova nota» il testo è ancora lì).

### 3.3 `src/legacy/app.js` — solo il cablaggio (e una riga chiesta dal coordinatore)

| Cosa | Dove |
|---|---|
| `apiScrivi()` — `PATCH`/`DELETE` in **una** funzione, col `.code` conservato | `:4651` |
| `apiPatch` / `apiDelete` — **dichiarazioni**, non `const` | `:4672-4673` |
| `reteVociDellaPersona()` — **funzione** e non costante: una `const` letta in anticipo da un gestore è un errore a runtime, cioè la classe di guasto che il cancello dell'11/09 ha dovuto inseguire nel browser | `:4684` |
| Note: `sessionId`, `rete`, `onMenu`, `onCambiata`, `copia`, `rendiMarkdown` | `:1650-1661` |
| Attività / Memoria: le stesse sei iniezioni | `:5318-5330` / `:5369-5381` |
| ⭐ **Cassetto della barra: `× 1,3` come nel mockup** (`openDrawer`: `motion(…, 'surface-enter', 1.3)`) — misurato 180 ms contro 234, scarto del 30 % | `:1840-1843` |

### 3.4 `src/styles/mockup-td.css` — **solo in coda**, col perché

`:509-587`. Il foglio non è mio stanotte (un altro agente lavora sulle animazioni in `styles/*`):
qui si **aggiunge**, non si riscrive, e nessuna regola di sopra cambia. Niente di nuovo dove esiste
già: `.td-field-label`, `.td-edit-title`, `.td-edit-body` sono le classi del **mockup** (righe
4081-4084) coi loro valori, e la rifinitura della nota — titolo e corpo senza cornice, come un
documento invece che come un campo — è la sua regola `[data-kind=note]` (4305-4306), agganciata alla
classe del modulo perché il nostro `.td-detail` non scrive `data-kind`. **Solo token**, così il
modulo nasce già giusto in chiaro e in scuro.

### 3.5 Laboratorio

`lab/fixtures/crud.js` (NUOVO) — la rete in memoria, stessa busta e stesse chiavi del contratto;
`lab/fixtures/note.js` — una nota **in Markdown** (prima non ce n'era nessuna, e l'interruttore non
si sarebbe mai visto in una foto); `lab/main.js` — `montaCrud()` e **dodici** pagine nuove, che
raggiungono ogni stato **coi gesti veri** (si preme il pulsante, si apre il menu, si sceglie
«Elimina»): la foto di uno stato costruito a mano proverebbe che il disegno esiste, non che ci si
arrivi.

## 4. Confronto testa a testa col mockup

Foto affiancate in **`.claude/foto-crud-2026-09-12/`** (100 immagini: `<vista>-<tema>-<larghezza>.png`
per la app, `MOCKUP-…` per il mockup; chiaro **e** scuro, 1440 **e** 1024, tema `calm` forzato su
entrambi).

### 4.1 Elenco (`note-elenco-*` ↔ `MOCKUP-note-elenco-*`)

| | Mockup | TALOS | Perché |
|---|---|---|---|
| Pulsante «Nuova nota» | primario `＋` in `.td-tools`, in testa, a destra | **identico** | `initSection`, riga 6063. La testata è del prodotto e `montaSezione` non la tocca (sostituisce `.talos-page`): ci sta senza toccare l'impianto |
| `⋯` «Opzioni della sezione» accanto | c'è | **non c'è** | non esiste nessuna azione **di sezione** da metterci: un menu vuoto è la promessa che questo lotto sta togliendo, non aggiungendo |
| Azioni della scheda | un segnalibro «Fissa» in alto a destra | un `⋯` **menu** + tasto destro | il «fissato» non esiste nel magazzino; e la regola dell'owner del 10/09 dice che più di due azioni su un oggetto vogliono un overflow, non bottoni affiancati |
| Filtri | 4 (Tutte / In evidenza / Checklist / Testo) | 1 (nascosto) | tre di quei quattro sono concetti che il disco non ha (`pin`, `checklist`, `tipo`); un filtro solo non è un filtro e la riga sparisce |
| «Aggiorna» nella barra | non c'è | c'è | qui ricarica **davvero** (`onAggiorna`); il mockup non ha niente da ricaricare |
| Riga di stato sotto l'introduzione | non c'è | «5 note» | è la riga del **prodotto** (`data-note-stato`), che l'impianto sposta invece di riscrivere: divergenza del lotto C, non di questo |

### 4.2 Modulo di MODIFICA (`note-modifica-*` ↔ `MOCKUP-note-modifica-*`)

| | Mockup | TALOS | Perché |
|---|---|---|---|
| Dove sta | nel **dettaglio** (`renderDetail`, `v.editing`) | **identico** | |
| Testata | «Note / Modifica» | «Note / Modifica» | ✔ |
| Campi | `Titolo` (`.td-edit-title`) + `Contenuto` (`.td-edit-body`), senza cornice | **identici**, stesse classi e stessi valori | |
| Terza voce | nessuna | `Come si legge` (Markdown / Testo semplice / Riconoscilo dal testo) | il `formato` esiste nel contratto e **si può dichiarare**: nasconderlo vorrebbe dire che l'unico modo di disfare una dichiarazione sbagliata non c'è |
| Piede | «Salva modifiche» + «Annulla modifica» + «Demo locale» | «Salva» + «Annulla» + «Modifiche non ancora salvate» | lo **stesso** modulo serve creazione e modifica, e il toast dice «Salvata»: un'azione tiene lo stesso nome per tutto il percorso |
| Nota sotto il corpo | «La bozza della demo resta disponibile…» | l'errore del campo e il contatore dei caratteri | la bozza resta davvero, ma lo dice il piede |
| Espandi | icona a tutto schermo | icona griglia/affianca | è il pulsante dell'impianto, non mio |

### 4.3 Modulo di CREAZIONE (`note-nuova-*`)

⛔ **Divergenza dichiarata, chiesta dal brief.** Il mockup crea dentro una **modale**
(`newItem`, riga 6128: `modalShow(m.create, <form id="td-new-form">…)`); qui il modulo di creazione
sta nel **dettaglio**, come quello di modifica. Una modale per creare e un pannello per modificare
sarebbero due posti in cui scrivere la stessa cosa, con due larghezze diverse per lo stesso testo.
⛔ **Nessuna foto del mockup per questa vista**: i miei quattro tentativi di aprirne la modale via
Playwright hanno fotografato l'elenco intatto, e ho **cancellato** quelle quattro immagini invece di
lasciarle spacciare per un confronto. Il fatto è letto **alla fonte**, riga 6128.

### 4.4 Attività (`attivita-*` ↔ `MOCKUP-attivita-*`)

| | Mockup | TALOS | Perché |
|---|---|---|---|
| Casella della scheda | `role="checkbox"` premibile | **identica**, e adesso **funziona** | `POST …/tasks/:id/stato` esiste da ieri notte; con toast e «Annulla», perché uno stato è la cosa più reversibile che ci sia |
| Stato nel dettaglio | non c'è (solo la casella) | `radiogroup` a tre («Da fare · In corso · Fatta») | gli stati del contratto sono **tre**: una casella a due valori non può dire «In corso» |
| Barra dei passi, `checks`, `due` | ci sono | non ci sono | `tasks-store.mjs:18-28` dichiara alla fonte che quelle colonne **non sono state portate**; il rapporto di backend lo ripete per la `scadenza` |
| Rientro a sinistra | solo sulle fatte | su tutte le comandabili | la casella adesso c'è su tutte: senza il rientro finirebbe **sopra** il testo |

### 4.5 Memoria (`memoria-*` ↔ `MOCKUP-memoria-*`)

| | Mockup | TALOS | Perché |
|---|---|---|---|
| «Metti in pausa / Riattiva» | c'è | non c'è | `memory-store.mjs` non ha nessuno stato di pausa: sarebbe un interruttore che non spegne niente |
| Origine | `h3 Origine` + testo | una **parola** nella riga dei metadati | prima qui usciva il valore grezzo (`persona`/`modello`): un nome di campo a schermo |
| Duplicato | non esiste (i dati sono in memoria) | «**Esiste già**: ho aperto quello, e il testo che avevi scritto non l'ha sostituito» | il contratto risponde **200 `duplicato:true`** con la voce **vecchia**; dire «Salvato» sarebbe una bugia con la ricevuta |

### 4.6 Conferma di eliminazione (`*-elimina-*`)

Il mockup chiede conferma con `modalShow` (`deleteItem`, riga 6130). Qui passa da `confermaModale`
(`modale-td.js`), che è un `<dialog>` nativo, e le parole seguono NN/g: **che cosa** viene
cancellato (col nome fra virgolette), **la conseguenza** («Non c'è un cestino: l'eliminazione è
definitiva»), il bottone che **dice quel che fa** («Elimina la nota», non «OK»), e il fuoco che
parte dalla **via d'uscita** — un Invio di troppo non cancella niente.

## 5. I difetti che hanno trovato le FOTO (e non i numeri)

1. ⛔⛔ **«Il ricordo … viene CANCELLATA dal disco»** e **«SCRITTA da te»** su un sostantivo
   maschile (`memoria-elimina-scuro-1440.png`). Un modulo solo per tre risorse mette in comune anche
   le **frasi**, e una frase comune non può avere un genere fisso. Cura: `accordo(schema, radice)`
   in un posto solo (`modulo-voce.js:154`), usata da **undici** messaggi; prova
   `MV-ACCORDO` + la metà maschile di `DEL-CONFERMA`. ⇒ Nessuna sezione scrive più participi a mano.
2. ⛔ **«Note / Nuova voce»** nella testata del dettaglio: «voce» è una parola di sistema, e chi
   guarda sta scrivendo una **nota**. Adesso il nome lo porta lo schema, lo stesso del pulsante da
   cui si è arrivati.
3. ⛔ **L'attività diceva due volte la stessa cosa**: l'introduzione dice «Le attività vivono in
   `.tasks-store/`» e il piede del dettaglio ripeteva la frase identica due centimetri più sotto.
   Non è ridondanza innocua: è spazio tolto a ciò che non è ancora stato detto.
4. ⛔ **Il finto non aveva nessuna nota in Markdown**: con quattro note di solo testo l'interruttore
   «Anteprima · Testo» non sarebbe mai comparso in una foto — e giustamente, perché un modo solo non
   è un interruttore. Senza la fixture nuova avrei dichiarato «fatto» una funzione **mai vista**.
5. ⛔ **Il confronto col mockup era vuoto e sembrava pieno**: le **nove** sezioni del mockup vivono
   tutte insieme nel DOM, e senza `[data-section]` il primo `[data-td="open-item"]` è quello della
   Board, invisibile. Quattro «dettagli del mockup» erano l'elenco intatto. Corretto lo strumento,
   non la conclusione.
6. ⛔ Sospetto **smentito da una misura**: nel modulo la riga d'aiuto sotto il `<select>` sembrava
   color accento invece che grigia. Misurata nel browser: `rgb(98,100,106)` in chiaro e
   `rgb(156,157,162)` in scuro, cioè **esattamente `--talos-muted`**, la stessa dell'etichetta. Era
   l'occhio sull'immagine ridotta. (Regola: si strumenta sempre, mai ipotesi.)

## 6. ⚠️ Una riga del rapporto di BACKEND è smentita dalla misura

Il rapporto di ieri (§4, «Errori») dice: «**Il `message` di un 400 è generico** («Query non
valida»)». **Misurato dal banco**: per i sei codici nuovi il messaggio pubblico è una **frase umana**
— `«Questa nota non è valida»` (`tests/integration/crud-vivo-frontend.test.mjs`,
`BANCO-NOTE-AL-CONTRARIO`).

Resta vero però **ciò che conta per il modulo**: quel messaggio **non dice quale campo** né
**perché**, e quindi non basta a chi sta scrivendo. La validazione davanti serve lo stesso, e la
prova lo mette per iscritto in tutti e due i versi (la frase è umana / la frase non nomina il campo).

## 7. Le prove

### 7.1 Unit — `tests/unit/modulo-voce.test.mjs`, **27 prove**

Ogni prova si gioca **due volte**: che la cosa giusta succeda, e che quella sbagliata **non** succeda.

| Gruppo | Che cosa morde |
|---|---|
| `MV-INIZIALI` | un valore fuori vocabolario **non** entra nel `<select>` (ci arriverebbe un campo senza selezione, e il primo salvataggio sarebbe un 400) |
| `MV-VALIDA`, `MV-TETTO-GREZZO` | i tre schemi accettano ciò che i magazzini accettano; il vuoto si giudica sul **ritagliato**, la lunghezza sull'**intero** |
| `MV-CREA`, `MV-PATCH` | «auto» non si manda in creazione, diventa `null` sul `PATCH`; niente toccato ⇒ **nessun corpo**; lo `stato` non entra mai in un `PATCH` |
| `MV-ACCORDO`, `MV-PAROLE` | il genere lo decide lo schema; `origine` assente ⇒ **si tace** |
| `MV-CONTEGGIO` | ⛔ misurato: in italiano un numero di **quattro** cifre non prende il punto (`useGrouping:'auto'`, raggruppamento «min2»): scrivere «8.000» avrebbe fatto passare il test contro una stringa che il prodotto non produce |
| `SV-INDIRIZZI`, `SV-NIENTE-PROMESSE` | le cinque porte sono quelle del contratto; senza sessione o con una rete a metà il servizio **non esiste** |
| `MOD-*` (8) | il testo digitato finisce nello stato **senza ridisegno**; l'errore è legato in ARIA e sparisce appena si corregge; **nessuna accusa** su un modulo appena aperto; nessun `maxlength`; le opzioni sono parole, mai valori |
| `TESTO-*` | il markdown passa dal motore **iniettato**, chiamato **una volta sola**; testo semplice e formato ancora ignoto **non** mostrano la striscia |
| `STATO-*` | `radiogroup`, la casella giusta spuntata, ripremere quella corrente **non** chiama niente |
| `DEL-*` (4) | la conferma dice cosa succede e mai «Sei sicuro?»; ⛔ **«Annulla» non fa partire nessuna `DELETE`**; il bottone rosso cancella una volta sola; il fuoco parte dalla via d'uscita |

### 7.2 Banco — `tests/integration/crud-vivo-frontend.test.mjs`, **6 prove**

Server **vero** (`createHttpApp`) su **porta libera**, i tre magazzini in una cartella **temporanea**;
i corpi li costruisce il codice vero del frontend e li spedisce `servizioVoci`. È la prova di
**parità fra le due metà**, che provandole separatamente non si vedrebbe.

1. **Note, il giro intero**: crea (201, `origine:'persona'`, `formato:'markdown'` dal cancelletto) →
   appare nell'elenco → la GET della voce porta formato e origine → modifica **solo il campo toccato**
   → l'annullamento del toast rimette esattamente com'era → «auto» disfa la dichiarazione → elimina,
   **e il file è sparito dal disco** → rileggere dà 404.
2. **Al contrario**: ciò che il modulo rifiuta, il server lo rifiuterebbe **allo stesso modo**
   (400 `NOTE_INVALID`); `PATCH {}` è 400 **e il frontend non ci arriva mai**; `formato:null` in
   creazione è 400 e `corpoCreazione` non lo manda.
3. **Attività**: crea → priorità → i tre stati uno per uno → `fatta` calcolata → ⛔ `PATCH {stato}`
   **400** (marcare fatta non è modificare: lo dice il server, non solo noi) → stato inventato 400 →
   elimina → cambiare stato a una eliminata dà `TASK_NOT_FOUND`.
4. **Memoria**: il duplicato risponde **200** con la voce **vecchia**, il testo nuovo non sovrascrive,
   **sul disco c'è UNA voce**; un titolo davvero diverso crea davvero; note e attività **non** hanno
   `duplicato` (due note con lo stesso titolo sono due note).
5. **Sessione inesistente**: 404 `NOT_FOUND` e **nessuna scrittura arriva al disco**.
6. **Proiezione**: letta **alla fonte** in `session-registry.mjs` — l'elenco non porta `formato`,
   `origine`, `creataAlle`, e porta `titolo`.

### 7.3 Suite e cancelli

- `npm run test:unit` ⇒ **843 pass / 0 fail** (erano 810 prima di stanotte: +27 unit, +6 banco).
- `nessun-errore-a-runtime` + parità dei componenti: `npm run test:componenti` — vedi §9 per l'esito
  e per la nota sulle porte.
- **Nessun errore JavaScript** in nessuna delle 64 pagine fotografate (ogni pagina ascolta
  `pageerror` e `console.error`; lo script lo dichiara a fine giro).

## 8. Le foto — che cosa ho guardato

100 immagini in `.claude/foto-crud-2026-09-12/`. Ispezionate una per una quelle qui sotto; le altre
sono le stesse viste negli altri tre incroci tema × larghezza e sono state guardate in blocco per
cercare differenze di impaginazione, non di contenuto.

- `note-elenco-chiaro-1440` — il pulsante primario è in testa a destra come nel mockup; ogni scheda
  ha il suo `⋯`; nessun troncamento nelle schede.
- `note-elenco-scuro-1024` — due colonne, la testata perde il sommario e il pulsante non collide.
- `note-nuova-chiaro-1440` — modulo nel dettaglio, il pulsante in testa è **spento** mentre si
  scrive, piede «Salva · Annulla · Non ancora salvata».
- `note-invalido-chiaro-1440` — i due errori stanno **sotto** i rispettivi campi, in rosso, e i
  filetti dei campi diventano rossi.
- `note-modifica-scuro-1440` — il titolo e il corpo hanno la scala della **prosa**, non del modulo.
- `note-markdown-chiaro-1440` / `note-markdown-testo-scuro-1440` — la striscia «Anteprima · Testo»
  c'è, e «Testo» mostra il markdown grezzo in monospazio.
- `note-elimina-chiaro-1440` — conferma col nome, la conseguenza e «Elimina la nota»; dietro, il
  dettaglio mostra «Nota · 19:58 · **Scritta da TALOS**».
- `attivita-elenco-chiaro-1440` — la casella è un comando su tutte le schede, la fatta è piena e
  barrata; il dettaglio ha «Stato» a tre e «Descrizione».
- `attivita-modifica-chiaro-1440` — campi **con** cornice (non la prosa della nota), «Priorità: Alta»;
  ⛔ **nessun campo Stato**, che è giusto: ha la sua porta.
- `attivita-elenco-chiaro-1024` — sotto la soglia il dettaglio prende tutta la larghezza (regola
  dell'impianto): le tre caselle e il piede restano leggibili.
- `memoria-nuova-scuro-1024`, `memoria-elimina-chiaro-1024`, `memoria-elimina-scuro-1440` — «Elimino
  **il** ricordo?», «viene **cancellato** dal disco», «**Scritto** da te».
- `MOCKUP-note-elenco-*`, `MOCKUP-note-modifica-*`, `MOCKUP-*-dettaglio-*` — il termine di paragone
  di §4.

## 9. Cosa NON ho verificato, e cosa ho lasciato fuori apposta

- ⛔⛔ **La resa Markdown col motore VERO non l'ho vista a schermo.** Il laboratorio non carica il
  monolite, quindi `rendiMarkdown` è `null` e `prosaInNodi` cade sulla sua lettura strutturale: nelle
  foto i titoli si vedono resi, ma `**grassetto**`, gli elenchi col trattino e i recinti di codice
  restano **letterali**. Nel prodotto la funzione è iniettata (`app.js:1661`), e la prova
  `TESTO-MARKDOWN` verifica che **quel** motore venga chiamato, una volta sola, e che il suo nodo
  finisca nel pannello — ma è una prova di **contratto**, non un pixel. Per una foto vera serve una
  sessione viva sul 4174, cioè un giro col modello: **vietato dal brief**.
- ⛔ **Nessun giro sul 4174 e nessuna foto della app vera**: tutto il visivo è laboratorio con
  fixture (banco proprio, porta 4185) e il banco di rete è un `createHttpApp` su porta libera con
  magazzini temporanei.
- ⛔ **La riga di stato duplicata** («5 note» nella testata **e** sotto l'introduzione) è di prima di
  stanotte: viene dall'impianto del lotto C, che sposta la riga del prodotto dentro la sezione.
  Registrata, non toccata — non è il mio file.
- ⛔ **Concorrenza**: due schede aperte sulla stessa voce restano «l'ultima vince», come il backend.
  Se la voce sparisce sotto le mani il modulo si chiude e l'elenco si rilegge (`codiceAssente`), ma
  **non** ho provato il caso di due finestre vere.
- ⛔ **Il `⋯` di sezione del mockup, il «fissato», i `checks`, la `scadenza` e la «pausa» dei ricordi
  non ci sono**: non esistono nel magazzino. Scelte dichiarate, non dimenticanze (§4).
- ⛔ **`prosaInNodi` (di `ricerca-dettaglio.js`) non rende grassetti, elenchi e recinti** nel suo
  ripiego: è di prima ed è fuori dal mio lotto. Registrato qui perché è la ragione per cui le foto
  del laboratorio non mostrano un Markdown pieno.
- ⛔ **Trovato per strada, non curato**: il `.gitignore` alla radice ha `banco/` (riga 296), e la mia
  cartella `tests/banco/` veniva **ignorata in silenzio** — la prova sarebbe esistita sul disco e non
  nel repo. Spostata in `tests/integration/`. Il pattern sta lì per un'altra ragione e **non l'ho
  toccato**; la trappola vale per chiunque crei una cartella con quel nome.
- ⛔ **Porte**: `npm run test:componenti` è stato lanciato su `TALOS_LAB_PORT=4200` e
  `TALOS_ASPETTO_PORT=4201` perché 4176, 4177, 4186, 4191, 4192 e 4193 erano occupate da server di
  **altre sessioni** (risalita la catena con `Get-CimInstance`, date di creazione dell'11/09 e di
  un'altra shell): **non ne ho ucciso nessuno**. L'unico processo terminato è stato un mio
  `serve-lab.mjs` orfano sulla 4186, nato da un mio tentativo fallito.
