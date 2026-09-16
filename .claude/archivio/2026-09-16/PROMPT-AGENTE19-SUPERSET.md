# Prompt d'avvio — Agente 19, SUPERSET su Hermes

> ⛔ **Leggi questo solo dopo aver chiuso e consegnato Fase 4/5 di MAX
> PERFORMANCE.** Non è il prossimo compito automatico — è il piano pronto
> per QUANDO arriva un nuovo via. Se stai ancora lavorando su Fase 4/5,
> torna a `.claude/CONSEGNA-MOTORE-LOCALE-MAX-PERFORMANCE.md`: questo file
> aspetta.

# 1 · Il lavoro, in una riga

Tradurre le 35 capability di Hermes negli invarianti TALOS, seguendo un
design già scritto e approvato (2.699 righe, 20 PR in 11 fasi) — non
progettando da zero.

# 2 · Dove lavori

Stessa cartella di sempre: `C:\Users\Antonino\Desktop\projects\AVM`, sul
ramo che apri **da dove Fase 4/5 è stata consegnata** (non da
`lane/voce-personale` direttamente se nel frattempo la sessione principale
ha già fuso e spinto la tua consegna altrove — verifica con `git log
--oneline -5` prima di ramificare). Nome proposto: `lane/superset-hermes`.

```bash
cd C:/Users/Antonino/Desktop/projects/AVM
git log --oneline -5              # dove sei ADESSO, non dove pensavi di essere
git checkout -b lane/superset-hermes
```

# 3 · I documenti da leggere, in ordine

1. `~/.claude/projects/.../memory/superset-hermes-design-22-agosto.md` — il
   design intero, 2.699 righe. Leggilo TUTTO prima di aprire la prima PR,
   non solo il riassunto qui sotto.
2. `.claude/CENSIMENTO-SUPERSET-35-RIGHE.md` — blocco 0 del design, cosa
   nel codice privato copre già qualcosa delle 35 capability, misurato
   il 22/8.
3. `.claude/PIANO-AGENTE19-DOPO-FASE45.md` — la proposta che ha portato a
   questo prompt, coi suoi riferimenti.

# 4 · ⛔ Il primo passo NON è la PR 1 — è riverificare il censimento

Il design ha 4 giorni. Nel frattempo sono usciti: voce fluida (0.1.19),
tre bug corretti in una revisione indipendente, e la tua stessa Fase 4/5.
Nessuno di questi tocca esplicitamente le 35 capability Hermes — ma la
regola resta: **non si riparte da un censimento vecchio senza
riverificarlo contro il codice di OGGI**.

Scrivi `CENSIMENTO-SUPERSET-RIVERIFICATO.md`: tre colonne per ciascuna
delle 35 capability — nome, stato nel censimento del 22/8, stato oggi
(con `file:riga` a supporto di ogni riga che è cambiata, non
un'impressione). Solo dopo, apri la PR 1.

# 5 · Le tre deviazioni dichiarate — non si toccano senza fermarsi

Il design del 22/8 si scosta da Hermes in tre punti, per scelta
esplicita e argomentata:

1. `execute_code` → **PlanVM verificabile**, non un sandbox "fidato a
   parole".
2. Subagent **capability-attenuated** (un subagent non eredita più
   capacità del genitore).
3. MCP **quarantine-first** (un server MCP nuovo parte isolato finché non
   si dimostra sicuro).

Se durante l'implementazione una di queste tre sembra sbagliata alla
prova dei fatti: **fermati e riporta**, non cambi la decisione
architetturale da solo — è la stessa regola che protegge ogni scelta di
design già presa in questo progetto.

# 6 · Le regole — le stesse di sempre

## Sul dire il vero
Ogni capability nuova porta il suo test **e** la prova che il test
fallisce senza la capability (non solo che passa con) — se non hai
entrambi, la capability non è verificata, è solo scritta.

## Sul lavorare
Commit sì, push mai. `npm run typecheck` + `npx vitest run` dopo OGNI PR,
non solo alla fine delle 20. `npm run leve` prima di dichiarare chiusa
qualunque fase.

## ⛔ Quando fermarsi
1. Il censimento riverificato (§4) trova una capability già coperta in un
   modo che il design del 22/8 non aveva previsto.
2. Una delle tre deviazioni dichiarate (§5) sembra sbagliata alla prova.
3. Una PR delle 20 richiede di toccare codice fuori da `mobile/` in modo
   che il design non aveva previsto.
4. Hai chiuso le 20 PR — non ripartire su un compito nuovo da solo.

# 7 · Consegna

Stesso schema di Fase 0-3 di MAX PERFORMANCE: un documento di ritorno con
ogni PR, il suo commit, i numeri misurati, cosa resta aperto. Non pushare.
