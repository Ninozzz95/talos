# ISPEZIONE PRIMA DELLA RELEASE — 08/09/2026

> Owner: «ispeziona tutte le proposte, i debiti e tutto quello che è rimasto in sospeso, compreso
> bug hunting e mockup appesi, e dimmi cosa manca prima di una release stabile».
>
> ⛔ Metodo: i documenti dicono lo stato di **due giorni fa**. Ogni riga qui sotto è stata
> **riverificata nel codice di oggi** con un `grep` che si può rifare. Dove non l'ho verificata,
> lo dico.

---

## 1 · Quello che i documenti davano per aperto ed è CHIUSO (verificato oggi)

| riga | come stava | verifica di oggi |
|---|---|---|
| **O-40** «tutti i tooltip custom» | «zero lavoro, 208 tooltip nativi» | `components/tooltip.js` esiste e `collegaTooltip(document)` è montato (`app.js:17096`): **un ascoltatore delegato**, vale anche per ciò che nasce dopo. I 160 `title=` restano come sorgente del testo, non come fumetto di Windows |
| **O-39** «scrollbar custom» | «zero regole che dipingano» | 2 dichiarazioni `::-webkit-scrollbar-thumb` in `styles/index.css` |
| **CB-18-bis** «Approvato e Negato identici» | «zero regole `approval__esito--`» | 3 regole presenti |
| **CB-11** «la palette italiana che nessuno apre» | «nessun riferimento in JS» | 4 riferimenti a `#veloComandi`, aperta da `app.js:16022` (curata il 07/9) |
| **CB-14** «l'unico interruttore non stilato» | «creato senza classe» | `app.js:14088` → `reasoningInput.className = 'talos-switch'` |
| **CB-07** «il suggerimento sopravvive alla sessione» | «campo non azzerato» | 3 riferimenti a `ultimoBersaglioAttrezzo`, incluso l'azzeramento |
| **12 veli irraggiungibili** (07/9) | 12 su 22 | **2 su 30**: restano `veloPermessiNota` e `veloPermessiScelte` |
| **4 fogli legacy morti** | board · environment · modelLab · realSession | 0 riferimenti in `bridge/legacy-dom.js`: cancellati |
| **O-42** «il Browser mostra un riquadro rotto» | curato il 07/9, da riprovare | chiuso e riprovato oggi: la pagina viva riempie il riquadro (926×738, scoperto 0) e il giro del curioso passa gli 8 passi |
| **O-45** «i tre pallini non animati» | da misurare durante un giro | misurato il 07/9 durante un giro vero: 8 scatti, 8 tempi di animazione diversi |
| **suite ASTRA** | 69 rosse su 195, nessuno la manteneva | tolta oggi su ordine dell'owner (l'aveva scritta ChatGPT-6 Astra, senza più crediti) |

---

## 2 · Quello che è ANCORA APERTO, verificato nel codice di oggi

### 2.1 · ⛔ T03-permessi-D2 — RITIRATO: era già chiuso, e l'ho visto

**Questa riga era sbagliata, ed era la prima della lista.** L'avevo dichiarata aperta cercando le
stringhe «anche shell» e «due cancelli» e non trovandole: **ho cercato le parole invece del
comportamento**. La cura esiste da giorni in `frontend/src/components/permessi.js`
(`porteLateraliAperte`), chiamata da `app.js` in due punti.

Provata a schermo l'08/09 sull'istanza di prova (serve una sessione attiva, quindi non sul 4174):
mettendo «scrittura di un file» su *Nega sempre* compare l'avviso

> «Hai chiuso «Scrivi un file», ma restano vie per scrivere lo stesso: un comando nel terminale, la
> creazione di un documento e la generazione di un'immagine. Sono attrezzi diversi, ognuno col suo
> cancello.»

con il pulsante **«Chiudi anche quelle»**, e sotto una riga che dichiara il limite del kernel invece
di nasconderlo. Copre **tre** porte laterali, non solo la shell.
Foto: `scratchpad/prove/foto/C41/foglio-permessi.png`.

⛔ La lezione, che vale più della riga: un'ispezione fatta con `grep` su stringhe attese trova solo
ciò che è stato chiamato come me lo aspettavo. Il resto di questo documento è verificato allo stesso
modo, quindi **può avere lo stesso difetto** — dove una riga dice «zero occorrenze», il dubbio resta
finché non si guarda il comportamento.

### 2.2 · Si vedono, e mentono

| riga | verifica di oggi | cosa manca |
|---|---|---|
| **CB-10** icone inesistenti | `app.js:1136` — `icon(id)` scrive `<use href="#${id}">` **senza validare**; 11 nomi non sono nello sprite | validare contro lo sprite (o disegnare gli 11 simboli) + una prova che fallisca su un nome finto |
| **BH-06** CSP del terminale | `src/http-app.mjs` — `style-src 'self'` senza hash né nonce per lo `<style>` che xterm inietta | un hash. Sono ~12 errori rossi a ogni apertura del terminale: il rumore in cui un errore vero non si vede |
| **T15-D1/D2** | 2 occorrenze di «non è ancora disponibile qui» ancora in `index.template.html` | sono la ragione d'essere di due sezioni (rapporti riapribili, codice dell'attrezzo) |
| **BH-04** «English» | 25 `data-t` nel template contro **45 `<h2>`**: i titoli non si traducono | portare sotto `data-t` titoli, spiegazioni e stati vuoti, o dichiarare che «English» copre solo i menu |
| **O-47** l'attesa | lo STOP è immediato (4 ms misurati), ma il primo pezzo arriva dopo 96 s e la striscia non dice cosa sta succedendo | la striscia deve dire cosa succede e da quanto |
| **O-50** messaggio d'errore | «Sessione non pronta per questa azione» mentre il kernel ha una busta molto migliore | leggere `title`/`explanation`/`action` invece del solo `message` |

### 2.3 · Codice morto, che non si vede ma pesa

- **7 funzioni dichiarate e mai chiamate** in `app.js`: `apriIntroPrimoAvvio`,
  `costruisciConversationHero`, `creaRigaSessioneBoard`, `filtraCatalogoModelLab`,
  `monogrammaProvider`, `renderizzaDettaglioModelLab`, `segmentoProvider` (1 solo riferimento
  ciascuna = la definizione).
- **2 veli irraggiungibili**: `veloPermessiNota`, `veloPermessiScelte`.

### 2.4 · Delegato ad altri (non è mio da chiudere)

- **O-18** «la schermata huggingface è orrenda» — worktree `AVM-harness-luoghi`.

---

## 3 · Le 19 righe CHIUSO-NON-PROVATO: un solo giro le chiude quasi tutte

O-10, O-26, O-31, O-34, O-35, O-36, O-37, O-18, T09-D4, T02-D1, T20-D4 e almeno sei `NV-*` sono
**curate nel codice e mai viste funzionare**. Non si chiudono leggendo: vogliono una sessione vera
col modello, con le foto. È anche il blocco 2 della release.

⛔ Il registro dell'owner su O-10 dice testualmente: «si chiude con una **foto della scheda piena**,
non con una riga di codice».

---

## 4 · Cosa manca per una release STABILE

### Blocca davvero (in ordine)

1. ~~T03-permessi-D2~~ — **RITIRATO l'08/09**: era già chiuso, provato a schermo (§2.1). Non è più
   un blocco; resta come lezione sul metodo dell'ispezione.
2. **Il giro vero col modello** che chiude le 19 righe non provate, con le foto. Senza, stiamo
   rilasciando funzioni che nessuno ha visto funzionare.
3. **La prova da macchina pulita** — il pacchetto si installa e gira, ma solo su questa macchina,
   dove Node e la chiave c'erano già (blocco 4 dello stato release, l'unico dei cinque non chiuso).
4. **CB-10** (icone che non esistono) e **BH-06** (CSP): i due difetti che si vedono a ogni uso.

### Non blocca, ma va deciso prima di pubblicare

5. **Le tracce di agenti AI nel repo** — owner 07/9. I file di istruzioni sono fuori; restano i
   commenti nel codice (~87 file citano Claude/Codex/Astra/Fable) e **la storia dei commit**
   (122 righe `Co-Authored-By` negli ultimi 400, 50 titoli su 300 che nominano un agente).
   ⛔ La storia non si cambia con un commit: o si riscrive il ramo, o si accetta.
6. **BH-04** — o si traduce davvero, o «English» si dichiara parziale. Oggi promette e non mantiene.
7. **T15-D1/D2** — due sezioni che dicono all'utente «non ancora disponibile».

### Debito che non blocca il rilascio

8. Le 7 funzioni morte e i 2 veli irraggiungibili.
9. Il **proxy universale (corsia A)** mai acceso: ogni sito che vieta la cornice passa dal browser
   pilotato — che però ora funziona bene, quindi è un'ottimizzazione, non un buco.
10. **35 foto** delle serie `durante-NN` e `attesa-N` mai ispezionate.

---

## 5 · Quello che NON ho verificato, e va detto

- I **193 punti dell'audit decisioni** non sono stati rieseguiti sulla app di oggi: il documento
  stesso avverte che almeno 4 delle sue ❌ erano già false quando è stato scritto. **I suoi numeri
  non si possono citare** finché non gira di nuovo.
- Le righe **T-LUOGHI-01…05** (18 aperte) riguardano schermate di un'altra lane.
- **I mockup appesi: non ce ne sono.** Verificato: l unico mockup vivo è
  `harness-ui/frontend/mockup/talos-mockup.html` (597 KB), ed è la FONTE del disegno — da lì
  `mockup-to-template.mjs` rigenera template e foglio di stile a ogni modifica, come oggi otto
  volte. `MOCKUP-REDESIGN-TALOS-2026-09-04.html` non esiste più in `.claude/`, e nessuno script
  lo nomina.
