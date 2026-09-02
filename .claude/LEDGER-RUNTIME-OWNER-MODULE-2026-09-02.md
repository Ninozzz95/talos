# Ledger — TALOS_OWNER_RUNTIME_MODULE mancante: OGNI giro rotto per due giorni (02/09)

> ⛔⛔⛔ Owner dal vivo, in produzione: *"se invio un messaggio ad una
> sessione esistente mi dà errore [internal-error] Il runtime agente non è
> configurato per questa installazione."* Trovato riavviando il server per
> aggiornarlo con le correzioni di Fable — il riavvio stesso ha rivelato il
> difetto, non l'ha causato.

## Il fatto

`GET /api/v1/health` tornava 200. Il server sembrava sano. Ma **ogni**
chiamata a `talosLavora` — messaggio nuovo o ripreso, qualunque sessione —
falliva con `OwnerRuntimeUnavailableError('Il runtime agente non è
configurato per questa installazione.')`.

## Causa, isolata alla riga

Commit `16677c48` (31/8, "chiude i tre blocchi runtime desktop") ha
sostituito l'import diretto di `talosHarness.mjs` (cartella sorella
`AVM-harness/mobile/scripts/harness-talos/`) con un adapter
(`runtime-owner-adapter.mjs#createOwnerRuntimeAdapter`) che carica il kernel
SOLO se la variabile d'ambiente `TALOS_OWNER_RUNTIME_MODULE` punta a un
percorso assoluto — **scelta dichiarata nel commento di testa del file**:
*"il server deve indicare un modulo assoluto... il caricamento fallisce in
modo esplicito quando la dipendenza non è disponibile"*. Il commento di
`agent-service.mjs` (che USA quell'adapter per `talosLavora`, riga 104)
**non è mai stato aggiornato** — descriveva ancora l'import diretto per due
giorni, mentre il codice sotto già richiedeva la variabile.

## Perché nessuno l'aveva visto prima di oggi

Il server `4174` è rimasto **acceso ininterrottamente** dal prima del
commit `16677c48` fino al mio riavvio di oggi (02/09) — confermato dalla
consegna di Fable stessa: *"Server owner... mai riavviato"* per l'intera
sua review. Un processo Node già in memoria non rilegge l'ambiente: il
buco esisteva nel codice da due giorni ma non si era MAI manifestato,
perché nessuno aveva riavviato il processo con la variabile mancante fino
a questo pomeriggio. Il primo riavvio dopo la modifica era il mio.

## Corretto

Riavviato il server con `TALOS_OWNER_RUNTIME_MODULE` impostata al percorso
reale del kernel (`C:\Users\Antonino\Desktop\projects\AVM-harness\mobile\
scripts\harness-talos\talosHarness.mjs`, verificato esistente). Commento di
`agent-service.mjs` riscritto per raccontare cosa è successo davvero, non
la vecchia architettura.

**Verificato dal vivo, non solo dedotto**: `POST /api/v1/sessions/
6aa5159a…/resume` sulla STESSA sessione che aveva prodotto l'errore
originale (`ultimoEsito` era `"errore"`) — dopo la correzione,
`ultimoEsito: "successo"`, un giro reale completato (`giri:1`, risposta del
modello ricevuta). Non un test sintetico: la sessione vera dell'owner.

⛔ Nota a margine, non bloccante: lo stesso avvio ha loggato
`[runtime-owner] catalogo task non disponibile` — `taskCatalogProvider()`
si aspetta che il modulo esponga anche `listaTaskDisponibili`/
`preparaEsecuzione` (per il catalogo task del corpus benchmark), e
`talosHarness.mjs` non li espone con quei nomi esatti o non è quello
collegato a quella funzione. Non blocca l'uso normale ("libero"/Full
access), non investigato oltre in questo giro — un secondo debito della
stessa causa, di severità minore.

## Perché serve un modo per non ripeterlo — la richiesta owner, e cosa è fatto

*"fai in modo che il server si riavvii tutto automaticamente, ricerca web
di come fanno i migliori."* Vedi
`.claude/DOSSIER-RICERCA-RESILIENZA-SERVER-2026-09-02.md` per la ricerca
completa. Due problemi distinti, trattati diversamente:

1. **Configurazione mancante invisibile** (la causa di oggi) — **CORRETTO**:
   `server.mjs` ora chiama il Doctor (`diagnosi()`, già scritto in
   `doctor.mjs` con esattamente i campi giusti — `ownerRuntime`,
   `sessioniPersistenza` — ma mai collegato a niente prima di oggi) UNA
   volta all'avvio, e logga forte (`[doctor] ATTENZIONE...`) se il runtime
   non è configurato o se sessioni sono corrotte. Stesso principio di
   `hermes doctor`/`claude doctor` (fonte nel dossier). Distingue severità:
   `TALOS_OWNER_RUNTIME_MODULE` assente è "ATTENZIONE" (blocca tutto,
   verificato); il catalogo task non esposto è solo un "avviso" (non blocca
   l'uso normale, verificato che `talosLavora` continua a funzionare nello
   stesso stato). Verificato dal vivo: il log del riavvio finale mostra
   entrambe le righe corrette con la severità giusta.
2. **Crash vero del processo** — ricercato, **non implementato**: tre
   opzioni con costo dichiarato (PM2, servizio Windows nativo, watchdog
   minimo a zero dipendenze) — decisione owner, vedi dossier.

## Verificato dopo tutte le correzioni

Backend completo dalla radice `harness-ui/`: **1262/1262**. Sintassi
(`node --check`) pulita su entrambi i file toccati
(`server.mjs`, `agent-service.mjs`). Riavviato il server una terza volta
con la correzione finale: health 200, log corretto, un secondo giro reale
sulla stessa sessione (`giri:1`, `ultimoEsito:"successo"`) confermato.

## Stato

✅ **Sbloccato, verificato dal vivo, DUE volte.** ✅ Doctor collegato
all'avvio, verificato. 🔜 La resilienza per un crash vero è proposta, non
implementata — decisione owner. 🔜 Il debito minore sul catalogo task
(non blocca l'uso, non investigato oltre) resta aperto.
