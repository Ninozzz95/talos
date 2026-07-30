# Chat temporanea — ricognizione competitor e cosa manca a noi

Data: 2026-07-30 · Checkpoint di ricerca richiesto dall'owner.

## Cosa fanno gli altri

| | ChatGPT | Claude | TALOS |
|---|---|---|---|
| Non compare nella cronologia | ✅ | ✅ | ✅ |
| Non usata per addestrare | ✅ | ✅ | n/a (BYOK) |
| **Davvero non scritta sul dispositivo** | ❌ | ❌ | ✅ |
| Conservata dal fornitore | ~30 giorni | ~30 giorni | non è nostro |
| Auto-cancellazione a tempo delle chat normali | ✅ 30/60/90 gg | ❌ | ❌ |
| Tornare indietro da temporanea a salvata | ❌ | ❌ | ✅ (2026-07-30) |

## Il fatto che decide tutto

Il verdetto del settore, testuale: **«incognito nel 2026 significa perlopiù: ce
l'abbiamo ancora, semplicemente non te la mostriamo»**. OpenAI è stata obbligata
da un tribunale a preservare tutte le conversazioni, incluse le temporanee.

Loro non possono dire la verità sul proprio limite senza ammettere che la parola
che usano è falsa. Noi sì, perché la metà locale da noi è vera.

## Cosa hanno chiesto gli utenti e nessuno ha dato

Dalle segnalazioni raccolte (issue GitHub, estensioni di terze parti):

1. **Un timer di auto-cancellazione configurabile** — ChatGPT ce l'ha per le
   chat normali, Claude no ed è la richiesta più votata.
2. **Convertire una temporanea in salvata** — nessuno dei due lo permette.
   ⇒ **fatto oggi**, in entrambe le direzioni, finché la chat è vuota.
3. **Trasparenza su cosa succede davvero** — l'unico caso citato di
   cancellazione automatica *senza avviso* (Claude Code, 30 giorni al riavvio)
   è finito sulla stampa come problema di privacy.
   ⇒ la nostra seconda riga di avviso è esattamente questo, al contrario.

## Candidati per il one-up, non ancora costruiti

Non aperti senza GO dell'owner; elencati perché la ricerca li ha resi ovvi.

- **L1 parity** — auto-cancellazione a tempo per le chat NORMALI (30/60/90 gg,
  o mai). È l'unica riga in cui ChatGPT ci batte.
- **L2 one-up** — convertire una temporanea in salvata anche DOPO che si è
  parlato: oggi l'offerta esiste solo a chat vuota perché "temporanea" è decisa
  dall'id. Servirebbe travasare i messaggi dalla memoria al disco su richiesta
  esplicita. Fattibile, non banale, e va progettato con cura: è l'unico punto in
  cui qualcosa esce dalla memoria e finisce su disco.
- **L3 strutturale** — un **conto alla rovescia visibile** dentro la chat
  temporanea: quanto resta prima che sparisca, e la sparizione la esegue il
  dispositivo, non un server. Nessun concorrente può offrirlo perché nessuno di
  loro può promettere che la propria copia sparisca. È la stessa asimmetria
  della riga onesta, resa visibile e continua.

## Cosa NON copiare

L'auto-cancellazione silenziosa. Il caso Claude Code dimostra che cancellare
roba dell'utente senza dirglielo prima è un danno di reputazione, non una
funzione — anche quando è la scelta tecnicamente giusta.
