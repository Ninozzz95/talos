# T-LUOGHI-03 — Capability: costo, percentuale della finestra, e 43 descrizioni in italiano

> Prova d'uso sul **4178**, Chrome vero via Playwright, **1440×900** e **1024×800**, tema **scuro**
> e **chiaro**, screenshot durante. 06/09/2026.

## Le decisioni in gioco, e cosa ho trovato davvero

| # | Decisione | L'audit del 06/09 diceva | Verificato dal vivo |
|---|---|---|---|
| C5 | Costo in token per attrezzo, più il totale in cima | ❌ «Assente» | ⚠️ **l'audit era vecchio**: il costo per attrezzo era già sulla riga (`~60 token`) e il totale in testata (`~7454 token di schema per giro (stima)`) |
| C6 | Il totale come percentuale della finestra | ❌ «Assente» | ✅ **fatto ora** |
| C9 | Pannello di dettaglio a destra | ❌ «Nessun pannello» | ⚠️ **l'audit era vecchio**: il pannello c'era e si riempiva già |
| C10 | Descrizione nostra in italiano, quella del kernel dichiarata | ❌ «solo l'inglese del kernel» | ✅ **fatto ora**, 43 su 43 |

⛔ Due righe su quattro le ho trovate **già fatte**. L'ho verificato aprendo la pagina, non
fidandomi né dell'audit né del mio ricordo: `[data-cap-token]` e `[data-cap-dettaglio]` erano lì,
funzionanti. Registro la correzione all'audit invece di rifare lavoro già fatto.

## Cosa vede una persona, adesso

- Ogni riga dice **cosa fa l'attrezzo, in italiano**: «Riscrive un file del progetto per intero. È
  una modifica al tuo disco.» invece di «Writes one file of the workspace, replacing it entirely.»
- Nel pannello di dettaglio, sotto la nostra frase, c'è **«Testo inviato al modello»**, chiuso: il
  testo del kernel resta visibile e **dichiarato per quello che è**, mai spacciato per una
  descrizione all'utente e mai tradotto (è il contratto col modello).
- La testata dice **«~7454 token di schema per giro (stima) · 0,6% della finestra da 1.310.720»**.
  La percentuale è la cifra che dice se quel numero è tanto o poco: 7.454 token sono lo 0,6% di
  una finestra da 1,3 milioni e il **91%** di una da 8.192.

## Le due descrizioni, e perché non sono una traduzione

Il testo del kernel è scritto **per il modello**: dice quando chiamare l'attrezzo, cosa non fare,
quale id passare («Call notes_list first to get the note id — do not guess it»). A una persona che
guarda l'elenco serve un'altra cosa: che cosa fa questo attrezzo al suo computer e ai suoi dati.
Due destinatari, due testi. ⛔ Quello del kernel **non si tocca**: regola dell'owner del 04/09.

Copertura misurata, non dichiarata: `attrezziSenzaDescrizione` sui 43 nomi veri del server torna
**vuoto**, e non ci sono descrizioni per attrezzi che non esistono.

## Cosa ho trovato dal vivo

| # | Cosa | Gravità | Come è finita |
|---|---|---|---|
| 1 | **Il markdown si vedeva letterale**: avevo scritto «Riscrive un file del progetto \*\*per intero\*\*» e a schermo comparivano gli asterischi, perché le descrizioni finiscono in `textContent` | medio | Curato su 3 frasi; regressione in `C10-DESCRIZIONI` che rifiuta `**` e i link markdown |
| 2 | Il `<details>` del testo del kernel lo **creava il JavaScript**, e il cancello dei componenti è diventato rosso: confronta la struttura disegnata con quella del mockup, e un nodo che nasce solo a runtime la fa divergere | medio | Curato: il nodo sta nel mockup, il codice lo riempie soltanto |
| 3 | Le sei righe di esempio del mockup portavano ancora le **vecchie descrizioni**, diverse da quelle che il componente disegna dai dati veri | medio | Curato: il mockup dice la stessa cosa del prodotto |

## Passi, clic per clic

- **apro Capability** ✅ · visto: «43 di 43 attrezzi offerti», «~7454 token di schema per giro (stima)»
- **guardo le prime cinque righe** ✅ · atteso: nessun inglese del kernel · visto: 0 su 5 in inglese
- **apro il dettaglio del primo attrezzo** ✅ · visto: «elenco della cartella», la nostra frase in
  italiano, «▶ Testo inviato al modello» chiuso col testo inglese dentro, «Schema stimato ~60 token»
- **⛔ verso contrario — cerco `web_search`, l'id tecnico** ✅ · atteso: lo trova lo stesso, perché
  chi ha letto una ricevuta scrive l'id · visto: 2 risultati, `web_search` incluso
- **cerco «terminale», in italiano** ✅ · visto: 1 risultato, `shell`
- **scelgo un modello dal selettore** (nessuna sessione, nessun costo) e torno su Capability ✅ ·
  visto: «~7454 token di schema per giro (stima) · **0,6% della finestra da 1.310.720**»
- **e nelle Impostazioni → Memoria e contesto** ✅ · visto: «7454 token occupati prima che tu scriva
  su 1.310.720 · 0,6% della finestra, 1.303.266 liberi (stima)», **con la barra disegnata**
  (`width: 0.568695%`) — la prova che mancava al blocco 2
- **errori** ✅ · JS 0 · console 0

Foto in `scratchpad/luoghi/foto/T-LUOGHI-03-capability/`: `1440-scuro-*`, `1024-chiaro-*`,
`c6-01-scelta-modello.png`, `c6-02-capability-con-modello.png`, `c6-03-memoria-con-finestra.png`.

## Verdetto

**PASSA** — 0 difetti aperti sulle due viewport e i due temi.

⛔ **NON FATTO / NON VERIFICATO, per nome:**
- **C13** («trasforma questo lavoro in una skill»): **non fatta**. Costruire una skill dai giri
  registrati è lavoro del kernel, non di questa pagina.
- **C21** (costo in token di un file della Libreria): **non fatto** in questo blocco.
- **C8** (ordinare per più usati nella sessione): il conteggio d'uso si vede già per attrezzo,
  l'**ordinamento** no. Non toccato.
- **C11** (attrezzi che il modello non supporta, dichiarati e spenti): **non verificato** — serve
  un modello senza attrezzi.
- **Le schede Skill · Connettori · Plugin · Hook**: aperte solo di sfuggita, **non ispezionate**.
  C3 (il numero su ogni scheda) resta ⚠️: solo «Attrezzi 43» ce l'ha.
- **L'uso registrato per attrezzo**: senza una sessione aperta mostra «Uso non registrato», che è
  corretto ma **non prova** che con una sessione vera conti bene.
