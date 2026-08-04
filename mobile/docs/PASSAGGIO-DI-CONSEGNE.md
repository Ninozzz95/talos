# Passaggio di consegne — 2026-08-04 sera

**Ramo:** `lane/talos-mobile` · **ultimo commit:** `9288fcc` · **non pushato**
**Cancello all'ultimo commit:** 3546 test passati, exit 0 · pacco d'avvio 597.055 / 600.000

Questo documento esiste perché una sessione nuova non erediti solo il codice ma
anche il *perché*. Il codice lo racconta già nei commenti; qui c'è ciò che non
sta dentro un file: cosa è aperto, cosa è stato deciso, e cosa non va
riscoperto.

---

## 0. Leggi questi tre, in quest'ordine

1. **La memoria** (`~/.claude/projects/.../memory/`) si carica da sola. Il primo
   elemento dell'indice è `session-state-2026-08-04` — è il punto di ripresa.
2. **`git log`** dei commit di oggi: i messaggi sono lunghi apposta e portano le
   misure. `git log --format='%h %s%n%b' -12`.
3. **Questo file**, per l'insieme.

Non serve altro. Se qualcosa qui contraddice il codice, **vince il codice**:
questo documento è di ieri, il codice è di adesso.

---

## 1. Cosa è successo, in ordine

### Immagini

`generate_image` sa partire da una foto dell'utente. Il contratto di Gemini è
stato ottenuto **facendo parlare l'API** — un `type` inventato le fa elencare
quelli che accetta. Quello di OpenAI è un indirizzo diverso (`/v1/images/edits`)
e un corpo `multipart/form-data`, che è **l'unica richiesta di TALOS che non
parte in JSON**.

Misurato dal dispositivo, in quattro passi: 401 sulla chiave → il corpo arriva;
modello inesistente → `"param": "model"`, quindi il corpo viene letto; PNG 8×8 →
`invalid_image_file`, quindi il file viene letto; 512×512 vero → **HTTP 200 con
l'immagine**.

`input_fidelity` si manda **solo** a `gpt-image-1`: su gpt-image-2 non è
applicabile e fa fallire tutto.

### Provenienza

Le immagini di OpenAI **portano già** un manifesto C2PA firmato — un chunk PNG
`caBX` da ~29 KB. TALOS lo conserva perché salva i byte senza ricodificarli.
Quindi il lavoro non era costruire una provenienza: era leggerla e non
distruggerla.

Firmarne una nostra sarebbe impossibile da fare onestamente: un'app distribuita
non custodisce una chiave privata.

**Due trappole già pagate:** il manifesto è CBOR, e lì il byte che dichiara la
lunghezza di una stringa corta è una **lettera stampabile** — un lettore a
caratteri riporta `dnamex` come nome del produttore. E `caBX` va cercato
camminando la catena dei chunk, non con una ricerca nei byte.

### Navigazione lineare

Memoria, Note e Attività hanno la loro pagina di dettaglio, con `parent`
dichiarato nella tavola delle rotte. Prima **le schede non si aprivano affatto**.

Il pulsante `←` in alto chiudeva tutto: conosceva i vecchi `subView` dei fogli ma
non le pagine-figlie di rotta. Ora legge la stessa `stationParent` che usa la
gesture di sistema, e **dice dove va** — «Torna a Memoria» contro «Torna alla
chat».

### Modelli locali

La lista si **sfoglia**: omettendo `search` il Hub risponde già ordinato. Cinque
chip filtro, ordinamento a tendina, e su ogni riga l'**etichetta di capienza**.

I numeri sono **veri**: `expand[]=gguf` restituisce parametri esatti, byte su
disco e finestra di contesto, in una sola richiesta per tutta la lista.

Ogni modello ha la sua pagina, con la descrizione presa dal README dell'autore e
le varianti (Q4, Q5, Q6…) ognuna col suo verdetto.

### RAM contro disco

Il verdetto misura la **RAM**, ed è giusto: con `mmap` llama.cpp apre modelli più
grandi della memoria, ma per generare un token servono quasi tutti i pesi.

L'owner aveva ragione a temere una confusione: le **parole** dicevano «ci sta»,
che si legge come spazio su disco. Ora sono verbi — «Gira bene», «Non gira qui»
— e la frase lo dice esplicito.

---

## 2. Cosa è aperto

| | perché non è chiuso |
|---|---|
| **La maschera non ha chi la disegna** | Il contratto e il trasporto ci sono. Il modello non può disegnarla (non ha i pixel): serve il dito sullo schermo o una segmentazione da descrizione. Due superfici, nessuna costruita |
| **Lo spazio su disco non è un vincolo** | Il verdetto guarda solo la RAM. Sul tablet dell'owner ci sono 38 GB liberi, non 395: lì un modello grosso potrebbe non entrare sul disco. Sarebbe una riga distinta da «non gira qui» |
| **`git push` non fatto** | Codex legge il ramo dal remoto. Serve prima di dargli il Blocco 3 |
| **Pacco d'avvio a 597.055 / 600.000** | Tremila byte. La prossima cosa che entra va misurata **prima** di scriverla |
| **OAuth** | L'owner l'ha messo come «da valutare assieme». Servono le sue decisioni |
| **Cursore a metà parola** | Debito accettato da lui |

---

## 3. Il lavoro con la corsia desktop

Il desktop **non è su un'altra macchina**: è `origin/main` dello stesso
repository. Lo scambio è git.

- `mobile/docs/alignment/census.json` — il censimento, rigenerabile con
  `node scripts/census.mjs`
- `mobile/docs/alignment/ORDINE-DI-LAVORO-DESKTOP.md` — l'ordine di lavoro per
  Codex, con l'ambito chiuso dalle sette decisioni dell'owner

**Codex ha già corretto due cose**, entrambe giuste: una contraddizione fra due
sezioni del documento, e il fatto che le ancore citassero un ramo in movimento
invece di una revisione fissa. Il documento è pinnato a `643035b`; **il ramo è
avanti**, quindi il baseline va riemesso prima di dargli il Blocco 3.

---

## 4. Come si verifica, che è la regola più importante

L'owner, testuale: *«assicurati di verificare tutto realmente e visivamente,
REGOLA SUPER MEGA BLOCCANTE da non dimenticare mai»*.

Non basta la sonda: serve lo **screenshot**. In questa sessione quattro giri di
screenshot hanno trovato quattro difetti che i test non vedevano — un numero non
formattato, una chiave i18n sbagliata, una descrizione che pescava markdown
grezzo, due tendine che mangiavano mezzo schermo.

```bash
adb shell cat /proc/net/unix | grep webview_devtools   # il socket CAMBIA a ogni riavvio
adb forward tcp:9444 localabstract:<socket>
node cdp.mjs <wsUrl> "<espressione>"                   # in .claude/jobs/.../tmp
adb exec-out screencap -p > schermo.png
```

- Il router: `document.querySelector('#app').__vue_app__.config.globalProperties.$router`
- Le voci reka-ui vogliono la **sequenza puntatore intera**, non `.click()`
- I contenuti teleportati si cercano da `document`, non dal wrapper

---

## 5. Come si lavora, dalle sue parole

- **Un test che non morde è peggio di nessun test.** Rimettere il difetto e
  verificare che diventi rosso, ogni volta.
- **Mai «è stato chiamato X».** Guardare il risultato: cosa parte sul filo, cosa
  finisce su disco.
- **Ricerca web prima di implementare**, sempre. In questa sessione ha cambiato
  il disegno tre volte: C2PA già presente, `expand[]=gguf`, RAM contro mmap.
- **Dire cosa si è lasciato fuori.** Una consegna che tace ciò che manca si
  legge come completa.
