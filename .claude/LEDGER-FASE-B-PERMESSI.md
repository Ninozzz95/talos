# FASE B — Permessi per-tool — ledger a basso livello

> Scorporata da `elegant-spinning-dongarra.md` ("Harness Desktop al
> 100% — piano globale, analisi competitiva, ledger per fase"),
> approvato dall'owner il 28/8. Aperta subito dopo FASE A (Hooks,
> ✅ chiusa 28/8, `LEDGER-FASE-A-HOOKS.md`) — è il prerequisito
> dichiarato dal piano madre, non una scelta arbitraria d'ordine.

## Stato: ✅ CHIUSA 28/8 (con un pezzo dichiarato BLOCCATO, non nascosto)

> ✅ **B.1 (kernel)**, `AVM-harness` commit `22fed002`. Correzione trovata
> LEGGENDO il codice reale (non presunta da questo ledger): il perimetro
> di `verificaPermessoScrittura` è **4 attrezzi** (`scrivi`/`prova`/
> `shell`/`document_create`), non 3 — `prova` vi era stata aggiunta lo
> stesso giorno da un altro giro di lavoro (review ledger permessi
> §2.5/§7.E), *diverso e più recente* di quando questo ledger era stato
> scritto la prima volta. `AZIONI_MUTANTI_PER_HOOK` resta a 3 (perimetro
> di un ALTRO meccanismo, gli hook — mai stato lo stesso perimetro).
> Confermato anche: `azione` è SEMPRE un oggetto `{tipo, percorso?,
> comando?, formato?}`, mai una stringa nuda — `permessiPerAttrezzo` è
> quindi indicizzato per `azione.tipo`. Il nome del parametro, in dubbio
> quando questo ledger è stato scritto, è confermato invariato.
>
> ✅ **B.2 (backend) + B.3 (frontend)**, `AVM-harness-desktop`.
> `config.mjs`/`http-app.mjs`/`session-registry.mjs`/`agent-service.mjs`
> + foglio Permessi (4 `<select>` per-attrezzo). 452/452 test backend,
> 158/158 frontend, tutti verdi.
>
> ⛔⛔⛔ **Bug reale trovato DAL VIVO, corretto con un ripiego SICURO
> (non la cura finale)**: la prima versione costruiva il canale di
> approvazione (`chiediApprovazioneFn`) ogni volta che ALMENO UN
> attrezzo voleva `'chiedi'`, anche sotto "Workspace write" — ma questo
> fa TRAPELARE l'approvazione anche su `scrivi` (nessun override),
> perché il kernel usa "il canale è presente" come segnale implicito di
> "la sessione chiede SEMPRE" per un attrezzo senza override proprio —
> un contratto pre-esistente, testato, che FASE B non può cambiare da
> sola senza romperlo per chi lo usa così. **Trovato SOLO dal vivo**
> (screenshot ispezionato), invisibile a ogni test a unità perché nessuno
> esercitava la COMBINAZIONE "un attrezzo chiede, un altro no, nella
> stessa sessione".
>
> ⛔⛔⛔ **La cura finale è BLOCCATA da coordinamento fra sessioni, non da
> un dubbio tecnico**: mentre questo bug veniva trovato, un'ALTRA
> sessione (avm-75) stava estendendo `livelloAccesso` a un vocabolario a
> **4 valori** nello STESSO file kernel condiviso (`talosHarness.mjs`,
> commit `51deba87`/`242caf75`/`6c852115`, "SS7.B/SS7.C", "FASE D") — con
> un valore ESPLICITO `'su-richiesta'` che è esattamente ciò che serve
> per distinguere "la sessione chiede sempre" da "solo questo attrezzo
> chiede" senza fare leva sulla presenza nuda del canale. Editare quella
> stessa funzione mentre un'altra sessione aveva 111 righe non
> committate sarebbe stato il rischio già descritto in memoria
> (`due-sessioni-stessa-cartella-intrecciano-i-commit.md`) — non preso.
>
> ⇒ **Ripiego applicato, sicuro e verificato DAL VIVO**: `chiediApprovazioneFn`
> torna a costruirsi SOLO per "On request" (comportamento pre-FASE-B,
> invariato). Un override per-attrezzo `'chiedi'` sotto un'altra policy
> FALLISCE CHIUSO (REFUSED, motivo esplicito) invece di mostrare la
> card — mai un bypass, mai una perdita verso altri attrezzi.
> `'sempre'`/`'nega'` restano pienamente funzionanti sotto qualunque
> policy, non toccati da questo limite. Verificato DAL VIVO (modello
> reale, `talos-prova-harness`, screenshot ispezionati): `shell:'chiedi'`
> sotto "Workspace write" → REFUSED onesto, motivo esatto, zero card; lo
> stesso turno seguito da `scrivi` (nessun override) → passa DRITTO,
> zero card, file scritto per davvero — isolamento per-attrezzo provato
> nei due versi, nella STESSA sessione, con un modello a pagamento.
>
> 🔜 **Resta aperto**, dichiarato non nascosto: la card di approvazione
> interattiva per un `'chiedi'` per-attrezzo sotto una policy diversa da
> "On request" — quando il lavoro dell'altra sessione sul vocabolario a
> 4 valori è committato e stabile, il passo è mappare "On request" su
> `livelloAccesso:'su-richiesta'` in `session-registry.mjs` invece del
> segnale implicito di oggi. Non una fase nuova: la stessa B.2, la sua
> ultima riga.

## Contesto

Oggi un permesso è per l'INTERA sessione (Read only/Workspace
write/On request/Full access) — un livello solo, scelto all'avvio,
mai per singolo attrezzo. Hermes ha 6 livelli annidati
(global/provider/agent/group/sandbox/subagent). Il salto minimo di
valore, senza inseguire tutti e 6 i livelli in un colpo: un permesso
**per singolo attrezzo** dentro una sessione — es. "in questa
sessione, `shell` chiede sempre conferma anche se il resto è
Workspace write".

## Obiettivo

Un override più specifico (per-attrezzo) che PRECEDE la valutazione
del livello generale di sessione — mai un secondo sistema parallelo,
un affinamento dello stesso gate (`verificaPermessoScrittura`) già
verificato in FASE "pillola permessi" (28/8).

## Confronto competitivo

Pareggia il tier "agent-level" di Hermes (un permesso più fine del
globale, più grosso del per-invocazione). Non replica gli altri 5
livelli Hermes (provider/group/sandbox/subagent/global) — fuori scope
finché non emerge un bisogno reale e misurato (stessa disciplina
"un attrezzo si aggiunge quando serve" già in uso per `GIRI_MASSIMI`).

## Criterio di completamento

⛔ Rivisto dal criterio originale dopo il bug/ripiego raccontato sopra —
onestamente più stretto, non riscritto per far combaciare l'esito.

**Raggiunto, verificato dal vivo (modello reale, non solo unit test)**:
un override `'nega'`/`'sempre'` per-attrezzo vince SEMPRE sulla policy
di sessione, in entrambe le direzioni; un override `'chiedi'` su un
attrezzo, sotto una policy diversa da "On request", FALLISCE CHIUSO
(REFUSED, motivo esplicito) — mai un bypass, mai una perdita di
approvazione verso un ALTRO attrezzo della stessa sessione (provato
nella stessa sessione, stesso turno-seguito: `shell:'chiedi'` rifiutato,
`scrivi` senza override passato dritto, file scritto per davvero).

**NON raggiunto, dichiarato**: la card di approvazione INTERATTIVA per
un `'chiedi'` per-attrezzo sotto una policy diversa da "On request" —
oggi fallisce chiuso invece di chiedere. Bloccato da coordinamento
(vedi Stato sopra), non da un limite tecnico: la cura è già progettata,
aspetta solo che il vocabolario a 4 valori dell'altra sessione sia
stabile.

## Ledger tecnico

### B.1 — Kernel (`AVM-harness/.../talosHarness.mjs`)

`verificaPermessoScrittura` guadagna un terzo parametro opzionale
`permessiPerAttrezzo?: Record<nomeAttrezzo, 'sempre'|'chiedi'|'nega'>`.
Se la voce per l'azione corrente esiste, PRECEDE la valutazione di
`livelloAccesso` — un override più specifico vince su quello generale.
Gate sui 4 attrezzi che chiamano DAVVERO `verificaPermessoScrittura`
(`scrivi`/`prova`/`shell`/`document_create` — verificato leggendo i 4
call-site reali, non i 3 di `AZIONI_MUTANTI_PER_HOOK`, che è il
perimetro di un meccanismo diverso, gli hook) — un permesso per-attrezzo
su un attrezzo di sola lettura (`elenca`/`cerca`/`leggi`/`naviga`) non è
previsto in questa fetta (vedi Rischi sotto).

Semantica dei tre valori, per attrezzo:
- `'sempre'` — l'attrezzo passa SEMPRE, anche se `livelloAccesso`
  sarebbe più restrittivo (es. "Read only" globale ma `leggi:'sempre'`
  — irrilevante qui perché leggi è già fuori dal gate, ma il principio
  vale per un futuro ampliamento).
- `'nega'` — l'attrezzo è SEMPRE rifiutato, anche se `livelloAccesso`
  sarebbe "Full access".
- `'chiedi'` — passa per `chiediApprovazioneFn`, indipendentemente da
  cosa direbbe `livelloAccesso` da solo.
- Assente per un dato attrezzo → cade sul comportamento di oggi
  (`livelloAccesso` decide da solo, invariato bit-per-bit).

⛔ Zero impatto per costruzione se `permessiPerAttrezzo` è assente
(TALOS-BANCO non lo passa mai) — stesso principio già verificato per
`livelloAccesso`/`chiediApprovazioneFn`/`hookFn`. Ri-misura TALOS-BANCO
obbligatoria prima/dopo.

### B.2 — Backend (`AVM-harness-desktop/harness-ui/src/`)

- `session-registry.mjs`: `voce.permessiPerAttrezzo`, ereditato da
  fork/resume come `voce.permessi` già oggi (stesso meccanismo di
  eredità, non uno nuovo).
- `config.mjs`: `permessiPerAttrezzoRichiestaValido(valore)` — valida
  che le chiavi siano nomi attrezzo REALI (`ATTREZZI`/`ATTREZZI_ESTESI`
  del kernel, mai un nome inventato che il gate ignorerebbe in
  silenzio) e i valori siano uno dei tre letterali ammessi.
- `http-app.mjs`: il corpo di `/sessions`/`/sessions/custom` accetta
  `permessiPerAttrezzo` opzionale, validato con la funzione sopra
  prima di passare oltre — stesso schema di `permessiRichiestaValido`
  già in uso per il livello globale.

### B.3 — Frontend (`mobile/public/harness-ui/`)

Il foglio "Permessi" (`sheetTemplates.permissions`) guadagna una
sezione per-attrezzo sotto la scelta globale già esistente — un
controllo a tre stati (sempre/chiedi/nega) per ciascuno dei 7 attrezzi
base + i 4 estesi (quando attivi per la sessione). Default: nessuna
riga selezionata esplicitamente = comportamento di oggi, invariato.

## Test previsti

- Kernel: override `'nega'` blocca anche con `livelloAccesso:'Full access'`;
  override `'sempre'` passa anche con `livelloAccesso:'Read only'`
  (verificato che oggi 'Read only' blocchi comunque le mutazioni: da
  confermare leggendo `verificaPermessoScrittura` prima di scrivere il
  test, non presunto); assenza della voce per un attrezzo → comportamento
  identico a prima (PARITÀ, stesso principio già usato per `hookFn`).
  AL CONTRARIO: un `permessiPerAttrezzo` con un nome attrezzo INVENTATO
  non deve mai matchare silenziosamente un attrezzo vero.
- Backend: validazione nomi attrezzo (accetta i reali, rifiuta gli
  inventati), eredità corretta su fork/resume.
- Dal vivo: sessione reale, `shell:'chiedi'` esplicito con il resto
  "Workspace write" — la card di approvazione appare per `shell` ma
  NON per `scrivi`. Verificato con screenshot ispezionati, come FASE A.

## Rischi/decisioni aperte

- Permesso per-attrezzo su un attrezzo di SOLA LETTURA: fuori scope in
  questa fetta (il gate esiste solo per le mutazioni oggi) — se emerge
  un bisogno reale, è un'estensione dichiarata per dopo, non presunta
  qui.
- ✅ Nome del parametro (`permessiPerAttrezzo`) — confermato leggendo il
  codice reale: `azione` è sempre `{tipo, ...}`, la chiave naturale è
  `azione.tipo`, il nome resta invariato.
- ✅ Un valore non riconosciuto per un attrezzo vero (refuso, es.
  `'SEMPRE'` maiuscolo) cade sul comportamento base (`livelloAccesso`),
  MAI un bypass silenzioso — deciso e testato in B.1, non lasciato
  aperto: era un rischio non esplicitamente previsto quando questo
  ledger è stato scritto la prima volta.
