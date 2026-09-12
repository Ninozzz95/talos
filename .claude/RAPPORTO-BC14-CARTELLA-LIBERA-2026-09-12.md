# BC-14 — una cartella scelta a mano parte con QUALUNQUE permesso

**12/09/2026 · lane `lane/harness-desktop` · banco mio sulla porta 4211 (mai il 4174).**
Owner: «BC-12 / BC-14 importante anche questo: **il pulsante dice serve accesso pieno**».

> ⛔ **La cura è completa nel server e nella decisione della modale, NON nel giro completo.** Un
> secondo cancello vive in `frontend/src/legacy/app.js` (riga 18275), che questo lotto non può
> toccare: dopo aver premuto «Continua nella chat», l'invio del primo messaggio mostra ancora il
> toast **«Serve Full access»** e non avvia niente. Riprodotto dal vivo oggi (§6.4, foto
> `BC14-toast-app-js-chiaro.png`). **Finché quel diff (§5.1) non viene applicato, l'owner vedrà
> ancora la frase che ha segnalato**, solo un gesto più tardi.

---

## 1. Ricerca prima di scrivere (12/09/2026) — fonti e date

⛔ Il budget delle ricerche web di questa sessione era esaurito (200/200 `WebSearch`). Ho usato le
due vie che restano e che valgono di più per questa domanda: **il codice dei concorrenti già
clonato a commit fissato** (regola «dossier competitor: funzioni distintive lette NEL CODICE»,
03/09) e `WebFetch` sulle pagine ufficiali.

### 1.1 Hermes Agent (Nous Research) — obbligo, primo nome

Clone `NousResearch/hermes-agent@365e2835` (2/9/2026, v0.21.0 «Pantheon»), letto oggi in
`%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21`.

* **Hermes non lega il livello di autonomia alla cartella.** La fiducia su una cartella è un elenco
  a parte: `hermes_cli/config_defaults.py:2316-2322` — `trusted_project_dirs: []`, gestito da
  `hermes skills trust` / `hermes skills untrust`, e serve **solo** a decidere se le *skill* del
  progetto vengono scoperte. Nessuna riga lega quella fiducia ai permessi di scrittura.
* **I permessi stanno su un asse loro**: `tools/approval.py` (`_YOLO_MODE_FROZEN` letto una volta
  all'import, `detect_hardline_command`, deny rule dell'utente, contesti `cron`/`unattended`) e
  `hermes_cli/config_defaults.py:2209` («Flip to true only if you trust delegated work to run
  dangerous cmds»). Dossier interno: `cap-01-hermes.md`, righe H3 e H10.
* ⇒ **Nessun concorrente primario chiede il massimo dei poteri per lavorare in una cartella scelta
  dall'utente.** Il nostro cancello era un unicum, e nella direzione sbagliata.

### 1.2 Codex CLI (OpenAI)

Clone `openai/codex@728cb12f` (3/9/2026) + `https://learn.chatgpt.com/docs/config-file/config-basic`
(letta oggi, 12/09/2026).

* Le tre modalità testuali esatte sono `"read-only"`, `"workspace-write"`, `"danger-full-access"`.
* `codex-rs/protocol/src/permissions.rs:1464` — `get_writable_roots_with_cwd(&self, cwd: &Path)`:
  le radici scrivibili si calcolano **a partire dalla cwd**, qualunque essa sia (`--cd` la sposta),
  più `writable_roots` espliciti. `has_full_disk_write_access()` è un ramo a parte che **svuota**
  l'elenco delle radici: è l'opposto del nostro cancello — full access serve a *non avere* confini,
  non a *poterne scegliere uno*.
* ⇒ In Codex, scegliere una cartella arbitraria e restare in `workspace-write` è il caso normale.

### 1.3 Claude Code (Anthropic)

Clone `claude-code@f173a697` (2/9/2026), `CHANGELOG.md` letto oggi.

* **Due assi separati e dichiarati.** Fiducia sulla cartella: il *trust dialog*, richiesto per
  cartella e per repo root (`CHANGELOG.md:568` «…now require that folder's trust dialog to have been
  accepted»; `:1034` «Improved trust dialogs to name the repository root the grant covers»;
  `:838` prompt di fiducia anche per `claude agents`).
  Livello di autonomia: i *permission mode* (`default`, `acceptEdits`, `plan`, `bypassPermissions`)
  — `CHANGELOG.md:59` parla di `defaultMode` per directory, `:242` di `--restricted` che «keeps file
  tools inside the working directory».
* `--add-dir` / `/add-dir` / `additionalDirectories` **aggiungono una cartella di lavoro senza
  cambiare il permission mode** (`CHANGELOG.md:95`, `:140`, `:2453`, `:2697`).
* ⇒ Aggiungere una cartella e alzare i poteri sono due gesti distinti, e il secondo non è il prezzo
  del primo.

### 1.4 VS Code Workspace Trust — il modello che `custom-task.mjs` già dichiarava

`https://code.visualstudio.com/docs/editing/workspaces/workspace-trust` (letta oggi).
La domanda è «Do you trust the authors of the files in this folder?», le scelte sono due, e il
principio è esattamente la separazione qui sopra: **la fiducia decide cosa può *eseguirsi da solo*,
non cosa si può *aprire***. In Restricted Mode il codice resta leggibile e modificabile.
⛔ `harness-ui/src/custom-task.mjs:33` nomina Workspace Trust come proprio modello **dal 28/8** —
e il cancello tolto oggi era proprio il punto in cui quel modello non era applicato.

### 1.5 Pulsanti disabilitati (ricerca dell'11/09, ancora valida e usata)

Smashing Magazine «Usability Pitfalls of Disabled Buttons», Adam Silver «The problem with disabled
buttons and what to do instead», discussione `w3c/wcag#3845` (lette l'11/09/2026, citate nella
testata di `avvio-sessione.js`): un bottone spento non dice mai perché lo è. In questo lotto il
principio si applica al contrario — non c'è più niente per cui spegnerlo.

---

## 2. Perché il cancello esisteva — la ragione originale, con le prove

`git log -S 'richiede il permesso "Full access"' -- harness-ui/src/session-registry.mjs` dà **un solo
commit**: **`6c37f8d5`** (28/08/2026), *«feat(harness-ui): la pillola permessi diventa reale»*.

Il suo messaggio, alla voce Frontend, dice cosa la UI faceva allora:

> «"Nuova sessione" mostra un campo percorso libero **al posto del select quando il permesso è "Full
> access"** (zero GET /api/v1/projects: non serve l'allowlist).»

⇒ **`cartellaLibera` nasce come funzionalità DI «Full access»**: il campo del percorso libero esisteva
solo dentro quella modalità. Il cancello nel registro era il secondo giro di chiave sulla stessa
porta — così lo diceva il commento che ho sostituito:

> «il confine che conta è "questa richiesta HTTP ha dichiarato **Full access**?", non "il percorso è
> valido?" … ANCHE SE il frontend non dovesse mai offrire quella combinazione — un client HTTP
> diretto non passa dal frontend».

**Il rischio di sicurezza c'era, ed è coperto altrove — prove:**

| che cosa protegge davvero | dove sta | prova |
|---|---|---|
| il percorso deve essere assoluto, esistere, essere una cartella, leggibile e scrivibile | `custom-task.mjs:64-92` (`validaCartellaLibera`) | `tests/custom-task.test.mjs`, verde oggi |
| la cartella scelta **non si allarga**, nemmeno con «Accesso pieno» | `session-registry.mjs` `cartellaEffettivaPerPermessi` + `cartellaGiaScelta:true` | `tests/session-registry.test.mjs` «cartellaLibera resta SEMPRE sulla cartella esatta scelta» |
| mai una denylist di percorsi sensibili (strategia dichiarata fallita, ricerca 28/8) | scelta esplicita, `custom-task.mjs:19-33` | commento + commit `6c37f8d5` |
| solo quattro nomi di permesso ammessi | `config.mjs` `permessiRichiestaValido` | test nuovo §4.2 |

**E il cancello non restringeva niente.** L'ambito effettivo di una `cartellaLibera` è la cartella
scelta **con tutti e quattro i permessi** (lo tiene `cartellaGiaScelta`, non il permesso). Quindi
l'unico effetto misurabile era: *per lavorare in una cartella scelta a mano devi accettare il livello
di accesso più alto* — quello che toglie approvazioni e cancelli. **Un cancello che, per proteggere,
imponeva il massimo dei poteri.** È anche il motivo per cui l'owner non lo vuole: con «Accesso
pieno» su una cartella dell'allowlist `cartellaEffettivaPerPermessi` ritorna la **radice del disco**
(lezione 11/09, `il-workspace-largo-non-e-un-posto-dove-scrivere`).

---

## 3. Le cure, file per file

### 3.1 `harness-ui/src/session-registry.mjs` — il cancello tolto

Dentro `avviaLibero`, le due righe

```js
if (cartellaLibera && permessiScelto !== 'Full access') {
  return { erroreAvvio: 'cartellaLibera richiede il permesso "Full access" per questa sessione', code: 'QUERY_INVALID' };
}
```

sono sostituite da un commento che dice **perché non ci sono più** e che cosa dovrebbe fare un
eventuale cancello futuro («restringere qualcosa di misurabile — non imporre il livello di accesso
più alto»). La doc del metodo è riscritta per intero con la storia, le fonti e la separazione dei due
assi. Aggiornati anche due commenti che spiegavano `cartellaGiaScelta` chiamando «Full access» «il
cancello obbligato per poterla scegliere»: quella frase ora sarebbe falsa.

⛔ **Non rinominato** `taskId: 'libero:full-access'`: è scritto nei `.jsonl` già su disco, e la mappa
dei nomi umani lo traduce già in «Compito libero · cartella scelta a mano»
(`frontend/tests/unit/componenti-sidebar.test.mjs:139`). A schermo non compare mai. Aggiunto un
commento che dice che è un nome storico, non un permesso.

### 3.2 `harness-ui/frontend/src/components/avvio-sessione.js` — la decisione

* Sparisce la situazione `permesso-insufficiente` e con lei l'etichetta **«Serve «Accesso pieno»»**:
  con una cartella scelta si parte sempre, con tutti e quattro i permessi.
* Tolta la costante `PERMESSO_PER_CARTELLA_LIBERA` invece di lasciarla inerte — «una costante che
  nomina un requisito morto è il modo più veloce per farlo tornare».
* **Il piede lo comanda ora il permesso**, non la provenienza della cartella: quattro frasi diverse
  (§6.3), perché «Scrive nel progetto» e «Solo lettura» sulla stessa cartella promettono due cose
  opposte e chi legge deve distinguerle senza tornare su a guardare quale tasto è acceso. La
  provenienza resta in coda, come informazione.
* Un permesso sconosciuto non si racconta: si nomina e basta (stessa disciplina di
  `nomeUmanoPolitica`).

### 3.3 Test

| file | che cosa cambia |
|---|---|
| `harness-ui/tests/session-registry.test.mjs` | la prova «senza Full access è rifiutato» è **invertita** e diventa tre prove: «Workspace write» parte (cartella esatta, `livelloAccesso: undefined`), «Read only» parte con `livelloAccesso: 'lettura'`, «On request» parte con `'su-richiesta'` **e** la `chiediApprovazioneFn` |
| `harness-ui/tests/http-routes-sessions.test.mjs` | tolto dalla **finta** il cancello duplicato (una finta che rifiuta farebbe passare per verde una rotta che accetta); la prova del 400 diventa «parte, e il permesso arriva verbatim»; **nuova** prova al contrario: un permesso inventato resta 400 per la forma, prima del registro |
| `harness-ui/frontend/tests/unit/avvio-sessione.test.mjs` | invertita la prova del blocco; nuove: il permesso comanda la frase (quattro frasi **distinte**), mai il valore del kernel a schermo con nessuna combinazione, un permesso sconosciuto non inventa poteri, il nome della cartella non si ripete nella stessa riga |

### 3.4 File dichiarati e NON toccati

`http-app.mjs`, `legacy/app.js`, `index.template.html` (non è servito), `src/styles/**`,
`config.mjs`. I diff che servirebbero sono al §5.

---

## 4. Prove eseguite, coi numeri

| comando | esito |
|---|---|
| `node --test tests/session-registry.test.mjs` | **319 pass, 0 fail** |
| `node --test tests/http-routes-sessions.test.mjs` | **140 pass, 0 fail** |
| `node --test tests/custom-task.test.mjs tests/delega-parallelo-sequenza-cartella.test.mjs tests/full-access-root-e2e.test.mjs tests/http-routes-workspace-launch.test.mjs tests/documento-non-finisce-nella-radice.test.mjs` | **37 pass, 0 fail** |
| `cd frontend && npm run test:unit` | **934 pass, 0 fail** |
| `cd frontend && npm run build` | 32 asset verificati, nessun cutover |

⛔ Non ho lanciato `verify:all` né `test:componenti` (accendono server propri, suite condivisa con
altre corsie che stanno scrivendo adesso).

---

## 5. I diff che servono nei file di altri

### 5.1 ⛔ BLOCCANTE — `frontend/src/legacy/app.js:18275` (il toast «Serve Full access»)

È il pezzo che l'owner vede. Riprodotto oggi (§6.4).

```diff
-      /* … Una cartella fuori
-       * elenco richiede Full access (lo esige il server): se la pillola è
-       * stata spostata altrove, il messaggio resta nel composer e si dice
-       * cosa manca, invece di spedire un permesso che la pillola non mostra.
-       */
-      if (cartellaLibera && state.permissions !== 'Full access') {
-        toast('Serve Full access', `${nomeCartella} è fuori dall'elenco delle cartelle: per avviarla serve Full access. Cambia il permesso dalla pillola e invia di nuovo.`);
-        return false;
-      }
+      /* ⛔ 12/09 BC-14: qui c'era un secondo cancello sul permesso di una cartella scelta a mano.
+       * Il server non lo chiede più (session-registry.mjs, avviaLibero): l'ambito lo tiene
+       * `cartellaGiaScelta`, non il permesso. Il toast diceva anche «Full access» a schermo,
+       * cioè il valore del kernel (regola owner 04/09). Tolto: si spedisce `state.permissions`,
+       * che è quello che la pillola mostra — la riga qui sotto lo faceva già. */
```

⛔ Nota per chi applica: le due righe che seguono spediscono già `permessi: state.permissions`,
quindi non serve altro.

### 5.2 `frontend/src/legacy/app.js:13635-13639` — «Usa come radice» promuove da sola

```diff
-  function avviaComeNuovaRadice(percorsoAssoluto, nome) {
-    impostaPermesso('Full access', `Full access · nuova radice: ${nome}`);
-    avviaSessionePendente({ cartellaLibera: percorsoAssoluto, nomeCartella: nome, modello: state.model, effort: state.effort, permessi: 'Full access', permessiPerAttrezzo: { ...state.permessiPerAttrezzo } });
-  }
+  function avviaComeNuovaRadice(percorsoAssoluto, nome) {
+    // ⛔ 12/09 BC-14: non si alza più il permesso al posto della persona. Serviva solo a superare
+    // il cancello del server, che non c'è più; e una promozione silenziosa a «Accesso pieno» è
+    // esattamente ciò che la consegna del 01/09 vieta.
+    avviaSessionePendente({ cartellaLibera: percorsoAssoluto, nomeCartella: nome, modello: state.model, effort: state.effort, permessi: state.permissions, permessiPerAttrezzo: { ...state.permessiPerAttrezzo } });
+  }
```

Da aggiornare insieme, righe **12461-12462**, che promettono a schermo un permesso:
`aria-label` «…apre una sessione nuova con Full access» e `title` «Usa come radice (sessione nuova,
Full access)» → «…apre una sessione nuova su questa cartella» / «Usa come radice (sessione nuova)».
⛔ Doppia violazione: nome tecnico a schermo **e** promessa ora falsa.

### 5.3 `frontend/src/legacy/app.js:17252-17255` — ramo diventato morto

`statoAvvioSessione` non produce più `rimedioSu: 'permesso'`: il ramo che scorre ai permessi e mette
il fuoco su «Full access» non parte più. Innocuo, ma va tolto quando si applica il 5.1.

### 5.4 `src/http-app.mjs` — solo commenti, nessun cambiamento funzionale

Verificato nel sorgente: **la rotta non ha mai avuto un cancello sui permessi** — valida la forma
(i quattro nomi, `cartellaId` XOR `cartellaLibera` XOR `workspaceLaunchId`) e inoltra. Restano due
commenti oggi falsi:

* righe 1265-1271: «`cartellaId`/`cartellaLibera` MUTUAMENTE ESCLUSIVI (permesso "Full access"…) …
  La validazione FINE (**il permesso è davvero "Full access"?** …) resta nel registro» → togliere le
  due parentesi sul permesso, lasciare «il percorso esiste davvero?».
* riga 4889: «sono solo SUGGERIMENTI per il campo "Full access" (`cartellaLibera`)» → «per il campo
  della cartella scelta a mano (`cartellaLibera`)».

---

## 6. La prova dal vivo — banco sulla 4211, nessun provider cloud

**Banco.** `node server.mjs` con `TALOS_HARNESS_UI_PORT=4211`, store di sessioni, cartella-progetto
e cartelle di lavoro in una cartella temporanea della sessione, `TALOS_HARNESS_UI_PUBLIC_DIR=frontend/dist`.
Modello: `TALOS_OWNER_RUNTIME_MODULE` puntato a un modulo che **ri-esporta il kernel vero del repo**
(`src/kernel/talosHarness.mjs`) e gli sostituisce solo `fetchDiRete` con un flusso SSE finto — quindi
permessi, `livelloAccesso`, attrezzi, cancelli di scrittura e ricevute sono il codice vero.
⛔ **Il 4174 non è stato toccato**: la 4211 è stata scelta a mano dopo aver visto che 4193 era di
un'altra sessione (PID 34540, avviato ieri: **non l'ho ucciso**); a fine lavoro il mio PID 28500 è
stato chiuso e il 4174 è ancora in ascolto **con lo stesso PID 36268** di prima.

### 6.1 «Scrive nel progetto» su una cartella scelta a mano — PARTE, e scrive solo lì

`POST /api/v1/sessions/custom` con `cartellaLibera` + `permessi: "Workspace write"` → **200**
(prima della cura sarebbe stato **400 QUERY_INVALID**).

Dal `.jsonl` della sessione `5cd8e955-4d04-4101-8460-ca8eba80ad52`:

```
intestazione: permessi=Workspace write | cartellaGiaScelta=true
  cartella: …\scratchpad\banco\cartella-scelta-a-mano
ToolCallStart   {"toolCallName":"scrivi"}
ToolCallResult  {"content":"written: prova-bc14.txt"}
RunFinished
```

Sul disco: `cartella-scelta-a-mano/prova-bc14.txt`, 23 byte, «scritto dal banco BC-14». ✅
⛔ La cartella della sessione è **esattamente quella scelta**, non la radice del disco.

### 6.2 AL CONTRARIO — «Solo lettura»: parte, e la scrittura è rifiutata

Sessione `7bd180d9-24ef-4228-9f4b-992add493c64`, stessa consegna, cartella diversa:

```
intestazione: permessi=Read only | cartellaGiaScelta=true
ToolCallResult  {"content":"REFUSED. la sessione è in sola lettura: nessuna scrittura, comando o
                 documento è permesso in questo momento. Nothing was written."}
```

La cartella è rimasta **vuota**. ✅ Il permesso scelto vale davvero dentro la cartella scelta.

### 6.3 «Chiede prima» — chiede, e il file appare solo dopo il sì

Sessione `9fbe2923-d2fa-4e9a-8a09-374ffa3d345d`, `permessi: "On request"`:

1. `ApprovalRequested` nel `.jsonl` (`requestId 418dc9ba-…`), giro **in attesa**;
2. cartella **vuota** in quel momento (verificata);
3. `POST /api/v1/sessions/9fbe2923…/approve {approvato:true}` → 200;
4. `prova-bc14.txt` **esiste**, 23 byte. ✅ Il kernel era davvero fermo, non una simulazione.

### 6.4 La modale — quattro permessi, due temi, 1440×900

`.claude/foto-bc14-2026-09-12/`, otto foto (`BC14-<permesso>-chiaro|scuro.png`) più
`BC14-toast-app-js-chiaro.png`. Misurato a schermo:

| permesso | bottone | spento | piede |
|---|---|---|---|
| Solo lettura | «Continua nella chat — cartella-scelta-a-mano» | no | «Con «Solo lettura» TALOS legge cartella-scelta-a-mano e non ci scrive niente. Non è fra i progetti già autorizzati: viene verificata all'avvio.» |
| Scrive nel progetto | idem | no | «…TALOS resterà nella cartella scelta: scrive solo dentro cartella-scelta-a-mano. …» |
| Chiede prima | idem | no | «…TALOS resterà nella cartella scelta e chiederà conferma prima di ogni scrittura. …» |
| Accesso pieno | idem | no | «…TALOS lavora in cartella-scelta-a-mano senza i cancelli ordinari su file e rete. …» |

Identico nei due temi. **La frase «Serve «Accesso pieno»» non compare più da nessuna parte.**

**Il secondo cancello, fotografato:** premuto «Continua nella chat» con «Scrive nel progetto» e
inviato il primo messaggio, arriva il toast

> **Serve Full access** — «cartella-scelta-a-mano è fuori dall'elenco delle cartelle: per avviarla
> serve Full access. Cambia il permesso dalla pillola e invia di nuovo.»

e la sessione **non parte**. È `app.js:18275` (diff al §5.1). ⛔ Dice anche «Full access» a schermo.

**Taccuino dell'ispettore — difetti visti guardando le foto:**

1. ⭐ *Curato nello stesso giro:* la riga del piede nominava la cartella **due volte** («…scrive solo
   dentro X. **X** non è fra i progetti…»). Accorciata la coda, e la prova ora conta le ripetizioni.
2. ⭐ *Curato:* nel primo giro il suggerimento del puntatore restava aperto e copriva il pannello
   «Accesso al workspace». Era un artefatto della mia foto (mouse fermo sul tasto), non del
   prodotto: lo script ora sposta il puntatore. Resta visibile nella sola foto «Accesso pieno», dove
   il tasto ha il **fuoco** — ed è corretto che lì il suggerimento si veda.
3. ⛔ *Non mio, già segnalato l'11/09 (§4.1 di quel rapporto):* il testo del `.primary-btn` ha
   contrasto **1,67:1** (chiaro) e **1,58:1** (scuro), sotto WCAG 1.4.3. `src/styles/**` è di
   un'altra corsia.
4. Una richiesta di rete risponde **503** su questo banco (nessuna chiave vera): non è un errore
   JavaScript, e **nessun errore a runtime** è stato registrato in nessuno degli otto giri.

---

## 7. Cosa NON ho verificato

* **Il giro completo dell'owner** (modale → «Continua nella chat» → primo messaggio → sessione) con
  un permesso diverso da «Accesso pieno»: è bloccato da `app.js:18275`, che non posso toccare. Ho
  provato i due tratti separatamente: la modale (foto) e il server (POST + `.jsonl`).
* **Il tasto destro di Windows** (`workspaceLaunchId`) dal vivo: il server lo accettava già con
  qualunque permesso e i suoi due test restano verdi; non ho fatto il giro Esplora file → URL.
* **«Usa come radice»** dopo il diff §5.2: non applicato, quindi non provato.
* **Viewport 1024×800 e 1280×800**: fotografato solo 1440×900, la viewport della segnalazione.
* **`test:componenti` e `verify:all`**: non lanciati (server propri, suite condivisa).
* **Un modello vero**: mai. Il kernel è quello vero, il modello è finto — quindi la prova dice che
  *permessi e cartella* funzionano, non che un modello vero si comporti bene.

---

## 8. Proposta di testo per il commit

```
fix(sessione): una cartella scelta a mano parte con qualunque permesso, non solo con quello massimo

Owner 12/09: «il pulsante dice serve accesso pieno». Il cancello in avviaLibero
(cartellaLibera && permessi !== 'Full access' → QUERY_INVALID) nasceva il 28/8
(6c37f8d5) dalla forma di allora della UI — il campo del percorso libero compariva
solo dentro «Full access» — non da un requisito di sicurezza: l'ambito di una
cartella scelta a mano lo tiene cartellaGiaScelta (cartellaEffettivaPerPermessi),
non il permesso. L'unico effetto era obbligare al livello di accesso PIÙ ALTO chi
voleva lavorare in una cartella scelta a mano.

Ricerca prima di scrivere (12/09/2026): Hermes Agent v0.21 (clone 365e2835) tiene
la fiducia sulla cartella (trusted_project_dirs, config_defaults.py:2316) separata
dai permessi (tools/approval.py); Codex CLI calcola le radici scrivibili dalla cwd
qualunque essa sia (codex-rs/protocol/src/permissions.rs:1464), e danger-full-access
serve a NON avere confini; Claude Code separa il trust dialog per cartella dai
permission mode, e --add-dir non li cambia (CHANGELOG.md:568, :95, :242); VS Code
Workspace Trust (docs letti il 12/09) è il modello che custom-task.mjs già
dichiarava dal 28/8 e che qui non era applicato.

Server: tolto il cancello; l'ambito resta la cartella scelta per tutti e quattro i
permessi, «Full access» invariato. Prove invertite nei due versi + due nuove
(Read only → livelloAccesso 'lettura'; On request → 'su-richiesta' con la funzione
di approvazione). La finta di http-routes-sessions non replica più il cancello.

Frontend: statoAvvioSessione non ha più la situazione «permesso insufficiente» né
l'etichetta «Serve «Accesso pieno»»; il piede della modale ora dice per ogni
permesso che cosa TALOS farà e fin dove, quattro frasi distinte.

Dal vivo sul banco 4211 (kernel vero, modello finto, mai il 4174): Workspace write
scrive dentro la cartella scelta (written: prova-bc14.txt), Read only la rifiuta
(REFUSED, cartella vuota), On request chiede e il file appare solo dopo il sì.
Foto in .claude/foto-bc14-2026-09-12/, tema chiaro e scuro, 1440×900.

⛔ Resta fuori: app.js:18275 mostra ancora il toast «Serve Full access» all'invio
del primo messaggio (diff pronto nel rapporto §5.1) — file di un'altra corsia.
```

---

## 9. Chiusura

**Cosa deve fare l'owner**

1. **Applicare (o farmi applicare) il diff §5.1 su `app.js:18275`** — sì/no/dopo. Senza quello la
   frase che hai segnalato ricompare al primo messaggio: è l'unico pezzo che manca.
2. **§5.2 — «Usa come radice» smette di alzare il permesso a «Accesso pieno» da sola** — sì/no/dopo.
3. **§5.4 — due commenti di `http-app.mjs` da correggere** (nessun cambio di comportamento) — sì/no.

**Cosa faccio io**

Niente `git add/commit/push`: i file sono su disco, elencati qui sotto. Se dici sì al §5.1 e al §5.2,
li applico io appena la corsia di `app.js` è libera, e rifaccio il giro completo dal vivo (modale →
messaggio → sessione) con le foto nei due temi.

**Cosa rimane**

* Il **secondo cancello in `app.js`** (§5.1) e la **promozione silenziosa** di «Usa come radice»
  (§5.2): entrambi con diff pronto, nessuno applicato.
* Il **ramo morto** `rimedioSu === 'permesso'` in `app.js` (§5.3).
* Il **contrasto del `.primary-btn`** (1,67:1 / 1,58:1), debito di un'altra corsia dall'11/09.
* `taskId: 'libero:full-access'` resta come **nome storico** nei `.jsonl`: mai a schermo, ma il nome
  mente sul contenuto.
* Non verificati: giro completo dell'owner, tasto destro di Windows dal vivo, viewport 1024 e 1280,
  `test:componenti`, qualunque giro con un modello vero.

### File toccati su disco

```
harness-ui/src/session-registry.mjs
harness-ui/tests/session-registry.test.mjs
harness-ui/tests/http-routes-sessions.test.mjs
harness-ui/frontend/src/components/avvio-sessione.js
harness-ui/frontend/tests/unit/avvio-sessione.test.mjs
harness-ui/frontend/dist/**                     (rigenerato da `npm run build`; gitignored, serve solo al banco)
.claude/RAPPORTO-BC14-CARTELLA-LIBERA-2026-09-12.md
.claude/foto-bc14-2026-09-12/                   (9 foto)
```

⛔ `git status` mostra anche `frontend/src/components/cronologia.js`, `frontend/src/styles/index.css`,
`src/llama-server-supervisor.mjs` e i loro test come modificati: **non sono miei** — sono corsie che
stanno scrivendo adesso nello stesso worktree. Chi committa guardi `git status --short` prima
dell'`add`, mai `git add -A`.

### BC-12 — conferma richiesta

Le schede per fornitore ci sono e sono quelle chiuse l'11/09: non ho toccato una riga di
`fonti-modelli.js`. ⛔ **Non ho la foto**: il selettore dei modelli su questo banco parte senza
chiavi vere, quindi le schede «Anthropic / Gemini / OpenAI» sarebbero tutte vuote e la foto
mostrerebbe una cosa peggiore della realtà invece della prova che chiedevi. La prova buona resta
quella dell'11/09 (`.claude/prove-bc12-bc14-2026-09-11/BC12-1-cinque-schede-*`, chiaro e scuro, con
i conteggi veri 443 · 2 · 11 · 31 · 71). Dico che non l'ho rifatta invece di far passare per nuova
una foto vuota.
