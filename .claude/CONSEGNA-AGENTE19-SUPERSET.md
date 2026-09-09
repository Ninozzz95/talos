# CONSEGNA — Agente 19, SUPERSET su Hermes

> Le regole di lavoro, il ramo e i confini stanno in
> `.claude/PROMPT-AGENTE19-SUPERSET.md`: **leggi quello per primo.**
>
> Qui dentro: perché questo è il prossimo lavoro, cosa è già deciso, e la
> roadmap delle 11 fasi.

# 0 · Perché SUPERSET e non una sesta fase di MAX PERFORMANCE

`CONSEGNA-MOTORE-LOCALE-MAX-PERFORMANCE.md` non elenca una fase dopo la
5 — quel programma finisce dove finisce. `MEMORY.md` tiene SUPERSET in
cima agli aperti per priorità dichiarata da giorni (💎🔜⭐⭐⭐), fermo
mentre l'attenzione era sul motore locale. È il prossimo blocco di
lavoro sostanzioso già progettato, non uno da inventare adesso.

# 1 · Cosa è VERIFICATO

- Il design esiste, per intero, 2.699 righe — non un riassunto perso nel
  tempo: il documento originale del 22/8.
- Le baseline sono congelate e dichiarate: `hermes 8e475ed2`,
  `talos 9f4140f8`.
- 35 capability Hermes, tradotte negli invarianti TALOS, 20 PR in 11
  fasi — l'ordine e l'argomentazione sono già nel documento, non si
  ridiscutono qui.
- Il censimento del 22/8 (`CENSIMENTO-SUPERSET-35-RIGHE.md`) dice cosa nel
  codice privato copriva già qualcosa, a quella data.

# 2 · Cosa NON è verificato

- Se qualcosa di successo dopo il 22/8 (voce fluida, Fase 4/5 del motore
  locale, i tre bug corretti in revisione) ha cambiato lo stato di
  copertura di una delle 35 capability. **Questo è il tuo primo compito**
  (§4 del prompt), non un dettaglio a margine.
- Se le baseline congelate (`hermes 8e475ed2`, `talos 9f4140f8`) sono
  ancora quelle giuste per un confronto onesto, o se Hermes stesso è
  cambiato nel frattempo — verificalo prima di aprire la PR 1.

# 3 · La roadmap — 11 fasi, come nel design originale

L'ordine e il contenuto di ciascuna fase sono nel documento da 2.699
righe — non li ripeto qui per non creare due copie che possono
divergere. Questa consegna aggiunge solo i due passi che **precedono** la
fase 1:

1. **Riverifica del censimento** (§4 del prompt) — obbligatoria, prima di
   tutto il resto.
2. **Riverifica delle baseline** — un confronto rapido fra
   `hermes 8e475ed2` e la punta attuale del suo repository pubblico: se
   Hermes ha avuto commit sostanziali dopo il 22/8, dichiaralo prima di
   procedere (non blocca necessariamente il lavoro, ma va scritto).

Solo dopo questi due, la fase 1 del design originale.

# 4 · I cancelli

- ⛔ Ogni PR: `npm run typecheck` + `npx vitest run` verdi, non solo
  all'ultima delle 20.
- ⛔ Ogni capability nuova: il suo test **e** la prova che fallisce senza
  la capability.
- ⛔ `npm run leve` verde prima di dichiarare chiusa una fase (non solo le
  leve toccate da quella fase — tutte e cinque).
- ⛔ Le tre deviazioni dichiarate (PlanVM, subagent attenuation, MCP
  quarantine-first) restano quelle — un cambio richiede di fermarsi e
  riportare, non una decisione presa da soli.

# 5 · Cosa NON si fa

- Non si riparte dal design del 22/8 senza il censimento riverificato
  (§3, punto 1).
- Non si cambia l'ordine delle 11 fasi senza una ragione misurata e
  dichiarata.
- Non si tocca `execute_code`/PlanVM per renderlo "più comodo" se questo
  ne riduce la verificabilità — è il punto centrale della prima
  deviazione dichiarata.
- Push mai, in nessuna fase.
