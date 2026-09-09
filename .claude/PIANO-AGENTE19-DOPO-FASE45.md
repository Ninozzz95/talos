# Piano — cosa fa Agente 19 dopo Fase 4/5

> Scritto il 2026-08-24, **prima** che Fase 4/5 chiuda, su richiesta esplicita
> dell'owner di "pensare avanti". Non è un ordine di partenza: Agente 19
> consegna (commit, mai push) e aspetta la review della sessione principale
> prima di aprire questo, esattamente come già scritto in
> `RIPRESA-SESSIONE.md` §3.

## Perché SUPERSET e non un'altra tappa di MAX PERFORMANCE

`.claude/CONSEGNA-MOTORE-LOCALE-MAX-PERFORMANCE.md` chiude con Fase 0-3
fatte e Fase 4/5 (P2/P3) come ultima tappa pianificata di quel programma —
non ne segue una quarta scritta da nessuna parte. Nel frattempo
`MEMORY.md` (APERTI) tiene da giorni, alla cima della lista per priorità
dichiarata (💎🔜⭐⭐⭐), il SUPERSET su Hermes: **fermo, non iniziato**,
mentre motore locale ha avuto tutta l'attenzione. È il prossimo blocco di
lavoro sostanzioso già progettato e pronto, non uno nuovo da inventare.

## Cosa c'è già, da non rifare

- `superset-hermes-design-22-agosto.md` (memoria) — 2.699 righe custodite,
  baseline congelate (`hermes 8e475ed2`, `talos 9f4140f8`), 35 capability
  Hermes tradotte negli invarianti TALOS, 20 PR in 11 fasi. Non copiare
  meccanicamente: `execute_code`→PlanVM verificabile, subagent
  capability-attenuated, MCP quarantine-first sono le tre deviazioni
  dichiarate e voluto così.
- `.claude/CENSIMENTO-SUPERSET-35-RIGHE.md` — blocco 0, il punto di
  partenza: cosa esiste già nel codice privato contro cui non costruire due
  volte.

## Il primo passo vero, quando Agente 19 apre questo

Non "PR 1 di 20" alla cieca: prima uno `state check` come quello che ha
aperto Fase 0 di MAX PERFORMANCE (dichiarato==spedito) — verificare quali
delle 35 capability di Hermes sono **già** coperte da lavoro fatto da
allora (voce personale, motore locale, motion-art sono tutti successivi al
22/8), e ripartire il censimento da lì. Il design di 4 giorni fa non sa di
tutto quello che è successo dopo.

## Confini, invariati

- ⛔ Stessa disciplina di sempre: niente push, la review prima del merge.
- ⛔ `execute_code`/PlanVM: verificabile per costruzione, non un sandbox
  che si promette sicuro a parole.
- ⛔ Nessuna capability nuova entra senza il suo test **e** la prova che
  fallisce senza la capability (non solo che passa con).
