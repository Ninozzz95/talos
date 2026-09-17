# PIANO APPROVATO — le righe in coda accorpate in tre fasi (17/09/2026) — ✅ owner: «sì»

> Owner, 17/09: «BC-73, la fase degli attrezzi dei file, PO-26, BC-66, BC-65, BC-68, BC-70, BC-71, BC-72, BC-77: accorpa questi
> per fasi, cosa proponi?». Criterio: la PROPRIETÀ DEI FILE (due righe sullo stesso file stanno nella stessa corsia, in fila) e il
> tetto di DUE agenti vivi, con le review fatte da me. Ogni fase = due corsie disgiunte, una backend e una frontend.

## Fase A — «L'agente locale, e ciò che esce dalla macchina»
| corsia | righe, nell'ordine | file | note |
|---|---|---|---|
| backend | **BC-76** → **BC-73** | `src/session-registry.mjs`, `src/agent-service.mjs`, (kernel solo se dimostrato) | BC-76 prima per ordine dell'owner. Brief pronti: `BRIEF-BC-76-…`, `BRIEF-BC-73-…` |
| frontend | **BC-77** → **BC-71** → **BC-70** → **BC-68** | `frontend/src/legacy/app.js`, template, `components/browser.js`, notifiche, `schede.js` | difetti che arrivano sullo schermo dell'owner; BC-68 per ultima (è la più grossa) |

## Fase B — «Attrezzi dei file come Hermes»
| corsia | righe, nell'ordine | file | note |
|---|---|---|---|
| kernel | **CLI-REQ-11 → 10 → 08 → 09** | `src/kernel/talosHarness.mjs` | un agente, una richiesta per commit, interruttore per il banco; brief `BRIEF-ATTREZZI-FILE-…` |
| prove | **BC-72** | solo `frontend/tests/browser/*` | DOPO la Fase A frontend; alla fine la consegna gira la CARTELLA |

## Fase C — «Dove stanno i dati, e sessioni lunghe che reggono»
| corsia | righe, nell'ordine | note |
|---|---|---|
| backend | **PO-26** → **BC-66** → **BC-65** | PO-26 prima: sposta anche lo store di BC-66, farlo dopo = migrare due volte. BC-65 sopra BC-66 (già deciso dall'owner). Qui si chiude il residuo di CLI-REQ-05 sulla compattazione |
| frontend | l'interfaccia di BC-65: barra di avanzamento e separatore | la barra esiste (`components/context-progress.js`), va accesa e collegata; il separatore va disegnato |

## In coda, con l'owner
Decisione sulla sorgente del kernel · valutazione della FASE 12 (audit indipendente) · pre-release.

## Fuori dalle tre fasi, da collocare se l'owner lo vuole (mini-fase backend fra A e B)
Hook dei plugin che riverificano la fiducia solo all'avvio · nove punti che ereditano l'ambiente intero del server
(`.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md`) · hook standalone che accettano ancora `node -e` · `scansionaPatternSospetti`.
