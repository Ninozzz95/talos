# MEMORIA — il banco di misura TALOS-BANCO

> ⛔ **QUARTO file dell'indice di memoria**, importato da `CLAUDE.md` come gli altri tre. Nato il
> **2026-09-10**, quando `.claude/MEMORIA-REGOLE.md` è arrivato a **28.850 byte** contro un tetto di
> **25.000** oltre il quale il contenuto si taglia **in silenzio**: era già SOPRA di 3.850 byte, cioè
> stava già perdendo righe senza che nessuno lo vedesse.
>
> ⇒ Stessa regola di sempre: **non si accorciano le glosse, si sposta un blocco intero**. Qui stanno
> gli aperti del banco — campagne, giri, 429, leve, corpus. Nessuna riga persa.
>
> ⛔ I file citati stanno in
> `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.

## 🔜 APERTI del banco TALOS-BANCO — spostati qui il 2026-09-04

> ⛔ `MEMORY.md` era a **20.796 byte** contro il tetto d'allarme di 19.900 dopo la lezione
> sul codice d'uscita dei task in background. Questi cinque aperti riguardano tutti il banco
> di misura (campagne, giri, 429, leve): blocco intero spostato, non accorciato. Restano
> APERTI e vincolanti come prima.

- 🔜⛔⛔⛔⭐⭐⭐ [28/8 — TALOS-BANCO: 24 righe su 27 perse da uno script di ri-misura precedente](corri-riscrive-il-file-se-ripetizioni-non-combacia.md) — scoperto ORA, non segnalato da chi l'ha causato: `ri-misura-fase4-tool-args.mjs` (27/8, ~23:30) ha chiesto `ripetizioni:2` contro le `ripetizioni:1` già sul disco, e `corri()` ha riscritto `talos.jsonl` prima di girare — restano solo 3 righe, modello sbagliato (`qwen/qwen3.7-flash`), nessun backup. 🔜 Decide l'owner: accettare la perdita e ripartire da questo stato, o altro — nel frattempo NON lanciare altre `corri()` su `talos.jsonl` senza aver riletto questa nota
- 🔜⛔⛔⛔⭐⭐⭐ [TALOS ESAURISCE I GIRI, non le capacita](talos-esaurisce-i-giri-non-le-capacita.md) — misurato 22/8 su `storia`: **fallisce in 80 s** mentre gli altri ne usano 332-630, e l'ultima frase e troncata a meta ricerca ⇒ `GIRI_MASSIMI = 24` finiti. ⛔ La cura NON e alzarli: i token sono la **somma sui giri**, quadratica — servono contesto magro **e poi** piu giri. Gia paghiamo **2,3× aider**
- 🔜⛔⛔⛔⭐⭐⭐ [TALOS NON VEDE i file del corpus STORIA](talos-non-vede-i-file-del-corpus-storia.md) — `elenca` arriva a **profondità 2**, i 106 percorsi dei task stanno a **4-6**, e **35 consegne su 35** non nominano i file: non può risolverne **nessuno**, e non per bravura. ⛔ La cura ovvia è sbagliata — un elenco piatto è **13.489 token** contro i 505 su cui abbiamo scommesso ⇒ serve **`cerca`**, non un elenco più profondo. ⛔ Prima che parta la corsa `storia`
- 🔜⛔⛔⭐⭐⭐ [LE CINQUE LEVE DI TALOS — quattro DISARMATE](le-cinque-leve-di-talos-quattro-disarmate.md) — `npm run leve`, automatico: ⛔ non ritenta MAI su 429 · i 24 giri finiscono in silenzio · il taglio a 4.000 caratteri **butta la diagnosi in 4 task su 6**. ⛔ Le cure NON si applicano a campagna in corso: due TALOS sotto un nome solo
- 🔜⛔⛔⛔⭐⭐⭐ [IL 429 NON E UN FALLIMENTO — la campagna del 20/8 e CONTAMINATA](il-429-non-e-un-fallimento.md) — il fornitore rispondeva **429** e il banco scriveva `fallito`: **codex 48 righe su 66**, **talos 18 su 66**, e tutti e diciotto i fallimenti di talos erano limiti di traffico. Il `codex 1/11` **non era codex**; letto bene, **talos fa 8/8**. ⛔ Causa: `qwen/qwen3.7-flash` ha **UN SOLO fornitore** su pool condiviso ⇒ il modello del banco deve averne **piu di uno**

