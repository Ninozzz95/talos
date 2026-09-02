# Decisione — le DUE copie di `talosHarness.mjs`: nessuna si archivia

> Richiesta dalla lane **mobile** (worktree `AVM`, branch
> `lane/voce-personale`), che si è fermata per ordine dell'owner su
> qualunque voce tocchi il kernel finché non c'è una decisione tracciata.
> Scritta qui perché sopravviva alla sessione, come vuole la disciplina
> del progetto.

## Il fatto che ribalta la domanda

La lane mobile ha descritto la copia B come *«mai provata end-to-end su un
Pad reale, solo committata»*. **Non è così**, e non poteva saperlo:

⛔ **La copia B è il kernel del server desktop che sta girando ADESSO.**

- Il server su `127.0.0.1:4174` viene avviato con
  `TALOS_OWNER_RUNTIME_MODULE=C:\Users\Antonino\Desktop\projects\AVM-harness\mobile\scripts\harness-talos\talosHarness.mjs`
  — cioè **copia B**.
- L'ho riavviato io stesso con quella variabile oggi verso le 16:20
  (vedi `LEDGER-RUNTIME-OWNER-MODULE-2026-09-02.md`, che documenta il
  percorso come la correzione verificata di un guasto in produzione:
  senza, *ogni* giro reale falliva con `OWNER_RUNTIME_NOT_CONFIGURED`).
- Prova diretta nel log d'avvio: `[runtime-owner] catalogo task non
  disponibile…` — è B che è stata caricata e ha risposto.

⇒ Il quadro vero non è «una copia viva e una parallela morta». È:

| | copia A — `AVM` | copia B — `AVM-harness` |
|---|---|---|
| righe | 3.186 | 6.226 |
| ultimo commit del file | 02/09 | 30/08 |
| **chi la esegue** | **il telefono** (APK, verificato dal vivo oggi) | **il server desktop 4174** (in esecuzione ora) |
| capability | 7 attrezzi storici + opzionali | + FASE E→N (MCP, skill, plugin, Library, Notes, Tasks, Memory, Deep Research, Tool Forge) |

**Due prodotti diversi eseguono due kernel diversi.** Ognuna delle due è
in produzione per qualcuno.

## Decisione

⛔ **Le opzioni 1 e 2 sono entrambe da scartare, e per lo stesso motivo:
romperebbero un prodotto vivo.**

- **Opzione 1** (archiviare B) spegnerebbe il kernel del server desktop.
- **Opzione 2** (B diventa la base, A si allinea sopra) metterebbe a
  rischio l'unica copia con prova di funzionamento sul dispositivo, e lo
  farebbe sostituendo il file che l'APK impacchetta.

✅ **Si va con l'opzione 3 — fusione selettiva** — ma con un bersaglio
dichiarato che l'opzione 3 da sola non nomina, e che è **già a verbale
come volontà dell'owner**: [[il-kernel-e-uno-solo-anche-per-il-codice]].
Il difetto vero non è «quale copia vince»: è che **un file logico ha due
proprietari e nessuna fonte unica**. Finché resta così, ogni capability
va scritta due volte e le due copie divergono di nuovo.

### Stato bersaglio

Un solo kernel canonico, consumato da entrambi i prodotti — il desktop
via `TALOS_OWNER_RUNTIME_MODULE`, il mobile via la pipeline di staging
dell'APK. Non due file da tenere allineati a mano: **un file, due
consumatori.**

### Ordine di lavoro, e perché questo

1. **Nell'immediato la lane mobile scrive su A.** È il file che il
   telefono esegue; scriverci non tocca il desktop (che carica B da un
   worktree diverso), quindi è l'unica scelta senza rischio incrociato.
2. **B è la sorgente da cui si porta, non da cui si copia.** Ha la
   capability più ampia, ma i nomi non combaciano uno a uno: si porta
   **una capability per volta**, col metodo già in uso su quella lane
   (leggere il backend vero, collegare invece di ricostruire, provare
   anche al verso contrario, verificare dal vivo sul dispositivo).
   Nessuna delle due è un sovrainsieme stretto dell'altra: un merge in
   blocco produrrebbe un file che non gira da nessuna parte.
3. **L'unificazione (un file solo) è una fase a sé**, dopo che A ha
   raggiunto B sulle capability che servono davvero al mobile. Farla
   prima significherebbe unificare due cose ancora divergenti.

### Vincoli operativi

- ⛔ **Non toccare il worktree della copia B** finché la sessione che lo
  possiede (`avm-03`) risulta occupata: ha lavoro non committato. Si
  legge B, non si scrive.
- ⛔ **Nessun riavvio del server desktop senza
  `TALOS_OWNER_RUNTIME_MODULE`**: oggi è già successo, per ~30 secondi il
  4174 era mal configurato e ogni giro reale sarebbe fallito.
- ⛔ Prima di dichiarare portata una capability: prova sul **dispositivo
  reale**, non solo test verdi.

## Cosa si sblocca SUBITO per la lane mobile

Tutto ciò che **non** tocca il kernel: le voci della tabella composer che
sono client-side (`attach`, `photo`, `photos`, `attach_file`,
`browser-url`) e il picker Planner. Su quelle non c'è nulla da decidere:
si scrive su A e si procede.

Resta legato al kernel, e quindi al punto 2 qui sopra:
- `browse` («Browse the web»), che richiede il dispatch FASE G;
- **Tool Forge**, che nella copia A non esiste per intero.

## ⚠️ La parte che NON decido io — serve l'owner

Due cose eccedono una decisione tecnica di lane e le lascio esplicite
invece di prenderle di nascosto:

1. **Se e quando unificare davvero** i due kernel in un file solo (punto
   3): è un cambio strutturale che tocca il modo in cui il desktop trova
   il suo runtime, e l'owner ha già una voce aperta su questo tema.
2. **Cosa fare della sessione `avm-03`**, ferma da 4+ giorni con lavoro
   non committato su un asse diverso (parità interna del desktop). Il suo
   lavoro non committato è a rischio finché resta così, e non tocca a me
   chiuderla né recuperarla.
