# I permessi della sessione

## Cosa fa

Il permesso della sessione è **la risposta a una domanda sola**: quanto può fare
TALOS da solo, senza fermarsi a chiedertelo.

Si sceglie quando apri una sessione, si vede sotto ogni tuo messaggio mentre la
sessione lavora, e si può cambiare a sessione aperta.

Le scelte sono quattro, dalla più prudente alla più libera:

| scelta | cosa vuol dire | rischio |
|---|---|---|
| **Solo lettura** | Legge il progetto e lancia comandi che non cambiano niente. Ogni scrittura viene rifiutata. | minimo |
| **Scrive nel progetto** | Scrive da sola dentro la cartella della sessione; per scrivere fuori ti chiede. Comandi e prove passano dal controllo. | consigliato |
| **Chiede prima** | Ti chiede conferma prima di ogni azione che lascia traccia: scritture, comandi, rete. | controllato |
| **Accesso pieno** | File e rete senza i controlli ordinari. Solo se sai già cosa sta per fare. | alto |

## «Scrive nel progetto» e i file fuori dalla cartella

Dentro la cartella della sessione TALOS scrive e modifica i file da solo. Se
vuole scrivere **fuori** — un percorso completo altrove, un `../`, o un
collegamento dentro il progetto che porta altrove — si ferma e ti mostra una
richiesta con la cartella dove finirebbe il file. Anche la cartella temporanea
del sistema conta come fuori.

- **Consenti una volta**: vale per quel file.
- **Consenti in questa cartella per la sessione**: le scritture successive in
  quella cartella, e nelle sue sottocartelle, non chiedono più fino alla fine
  della sessione. Un riavvio dell'app la richiede.
- **Nega**: il file non viene scritto, e TALOS lo sa.

Il permesso «Sempre» dato all'attrezzo di scrittura non toglie questa domanda:
il permesso dell'attrezzo dice *se* può scrivere, quello della sessione dice
*dove*. Per scrivere ovunque senza domande c'è «Accesso pieno».

In un'automazione o in un passo di un Workflow nessuno può rispondere: la
scrittura fuori viene rifiutata subito, e la cronologia lo dice.

## «Accesso pieno», per esteso

È l'unica scelta che chiede una **conferma esplicita** prima di essere attivata,
e l'unica che toglie i controlli **fuori** dalla cartella su cui stai lavorando.

Cosa cambia davvero quando la accendi:

- **Da dove legge si allarga.** Non più la sola cartella della sessione: l'intero
  disco su cui quella cartella si trova. È la funzione, non un effetto
  collaterale — serve quando il lavoro sta in più cartelle, o fuori dal progetto.
- **Dove deposita un file che genera NON si allarga.** Un documento o
  un'immagine creati durante la sessione finiscono nella cartella da cui la
  sessione è partita, quella che hai scelto tu. Sono due domande diverse, e la
  seconda resta legata alla tua scelta.
- ⚠ **Sulla cartella scelta a mano, il velo del primo avvio e il server non
  dicono la stessa cosa.** Il velo blocca «Avanti» se scegli una cartella fuori
  dai progetti autorizzati con un permesso diverso da questo. Il server quel
  cancello **non ce l'ha più** dal 12/09/2026: una cartella scelta a mano parte
  con qualunque permesso. Finché le due parti non concordano, questa pagina non
  promette né l'una né l'altra.

⛔ Quello che «Accesso pieno» **non** è: non è un interruttore che rende
l'agente più capace. È un interruttore che **toglie delle domande**. Le stesse
cose le fa anche con «Chiede prima» — solo che te le chiede.

## Cosa non fa

- ⛔ **Il permesso della sessione non è l'unico cancello.** Ogni attrezzo ha il
  suo, e il suo può essere più stretto. Vedi
  [I permessi di ogni singolo attrezzo](permessi-per-attrezzo.md).
- ⛔ **Chiudere la scrittura non chiude tutte le strade per scrivere.** Un
  comando nel terminale, la creazione di un documento e la generazione di
  un'immagine possono lasciare un file sul disco anche quando l'attrezzo di
  scrittura è chiuso. Il prodotto lo dichiara a schermo invece di far credere il
  contrario. È un limite reale, non un dettaglio.
- Non è una sandbox. Non isola il resto del computer.
- Non si eredita in silenzio: una sessione nuova riparte dalla scelta che fai in
  quel momento.

## Come si usa

1. Apri una sessione nuova e scegli la cartella.
2. Scegli quanto può fare da solo. Il consiglio è **«Scrive nel progetto»**.
3. Se scegli «Accesso pieno», conferma la casella che compare: serve a rendere
   deliberata una scelta che altrimenti si fa per inerzia.
4. Durante la sessione, il permesso attivo è scritto sotto il tuo messaggio. Se
   lo cambi, il cambio vale da lì in avanti.

## Se va storto

- **«… è fuori dai progetti autorizzati: con questa cartella funziona solo
  «Accesso pieno». Scegli un'altra cartella o l'accesso pieno.»** — è il velo del
  primo avvio, e da lì la via d'uscita è quella. ⚠ La stessa cartella, avviata
  fuori dal velo, oggi il server la accetta con qualunque permesso: vedi l'avviso
  qui sopra.
- **Una scrittura viene rifiutata e non capisci perché** — controlla due cose,
  in quest'ordine: il permesso della sessione, e il permesso di quel singolo
  attrezzo. Il secondo vince sul primo quando è più stretto.
- **Hai cambiato il permesso e l'agente si comporta come prima** — ⚠ *non
  verificato*: è stato osservato almeno un caso in cui un cambio di permesso a
  sessione già viva non è arrivato alla conversazione in corso. Se succede, apri
  una sessione nuova con il permesso che vuoi.
- **Un file generato finisce in un posto inatteso** — con «Accesso pieno» la
  lettura si allarga ma il deposito no: il file è nella cartella da cui la
  sessione è partita.

> Verificato in `harness-ui/frontend/src/components/politiche.js:22-52`
> (`POLITICHE`, «le quattro, nell'ordine in cui si presentano: dal più prudente
> al più libero» — `Read only` → «Solo lettura», `Workspace write` → «Scrive nel
> progetto», `On request` → «Chiede prima», `Full access` → «Accesso pieno»); per
> le tre vie di scrittura che restano aperte, in
> `harness-ui/frontend/src/components/permessi.js:20-24` (`SCRIVONO_LO_STESSO`:
> `shell`, `document_create`, `generate_image`). Per «Accesso pieno»:
> `harness-ui/src/session-registry.mjs:2380-2382`
> (`cartellaEffettivaPerPermessi` allarga la **lettura** alla radice del disco) e
> `harness-ui/src/agent-service.mjs:538-541` (`cartellaCreazioni` decide **dove si
> deposita** un file generato — sono due domande diverse). La casella di conferma
> è `harness-ui/frontend/src/components/intro.js:28-34` (`passoConsentito`, ramo
> `politica === 'Full access' && !confermaPieno`).
> ⚠ Resta **non verificato** il caso del cambio di permesso a sessione già viva.
> Per «Scrive nel progetto» e i file fuori: `harness-ui/src/kernel/talosHarness.mjs` (`posizioneNelProgetto`,
> livello `scrittura-progetto` in `verificaPermessoScrittura`), `harness-ui/src/session-registry.mjs`
> (`livelloDaPermessi`, `rispondiApprovazione` con `ambito: 'cartella'`), prove in
> `harness-ui/tests/scrittura-fuori-dal-progetto.test.mjs`.
