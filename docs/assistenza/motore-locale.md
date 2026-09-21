# Motore locale

## Cosa fa

Fa girare un modello **su questo computer**, senza mandare niente in rete.

TALOS riconosce tre motori: il proprio (che avvia e ferma lui), e due programmi
esterni se li hai già — Ollama e LM Studio.

Per il motore proprio, TALOS dice **su cosa sta girando il modello**, in parole
d'uso comune:

- **scheda grafica** (con il nome della scheda), oppure
- **processore**, oppure
- un percorso scelto a mano da te.

Lo stato è distinto dalla disponibilità: «raggiunto» non vuol dire «ha un
modello caricato». Sono due righe diverse, apposta.

## Cosa non fa

- ⛔ **Non c'è un modello consigliato, e non se ne forza nessuno.** Quale modello
  usare lo decidi tu. Le regolazioni del motore valgono per un modello qualunque,
  lette dal file del modello stesso.
- Se la scheda grafica non è disponibile, TALOS **lo dice** e lavora sul
  processore — ma non chiama «funzionante» un ripiego che poi non è riuscito.
- Se la memoria della scheda grafica non basta per quel modello, **non decide da
  solo**: te lo dice e ti propone il processore, più lento, nel menu del motore
  locale. La proposta resta una proposta.

## Come si usa

1. Impostazioni → **Laboratorio modelli**, scheda dei modelli installati.
2. Si vede quali sono sul disco e quale è caricato in memoria, con la dimensione
   in GB e il verdetto «entra / non entra» nella memoria disponibile.
3. Da lì si carica o si scarica un modello.

## Se va storto

- **«La scheda grafica non è disponibile: il modello gira sul processore»** — è
  un avviso, non un errore: funziona, più lentamente.
- **«La memoria della scheda grafica non basta»** — scegli «Processore» dal menu
  del motore locale, oppure un modello più piccolo.
- **«Avvio non riuscito»** — il motore non è partito. Il Doctor e la scheda del
  motore dicono l'ultimo errore letto.
- **La generazione finisce subito** — capita con i modelli locali: un modello di
  chat servito senza il suo formato di conversazione, una finestra già piena, o
  un campionamento che tronca al primo segno.

> Verificato in `harness-ui/frontend/src/components/runtime-modelli.js`: i tre
> motori riconosciuti sono alla riga 2 (`ollama` «Ollama», `lmstudio` «LM Studio»,
> `llama.cpp`); le parole su cosa sta girando il modello alla riga 13 («Motore
> locale: scheda grafica (Vulkan) · <nome>», «Motore locale: processore», «Motore
> locale: percorso scelto a mano») e gli avvisi alla riga 15 — compreso quello che
> **non** chiama funzionante un ripiego fallito, e quello che propone il
> processore senza sceglierlo al posto tuo. Il verdetto «Entra / Non entra» sulla
> memoria è in `harness-ui/frontend/src/components/modelli-installati.js:50-53`.
