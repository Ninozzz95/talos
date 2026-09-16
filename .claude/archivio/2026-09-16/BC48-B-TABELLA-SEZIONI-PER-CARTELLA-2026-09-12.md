# BC-48 · mossa B — `AGENTS.md` di radice: quale sezione va dove (tabella per l'owner, 12/09/2026)

Regola: la radice tiene solo ciò che vale in OGNI cartella; il resto va nel file della cartella che lo riguarda (la catena esistente lo carica già per cwd). **Owner, 12/09/2026 ore 19:20: «Tabella ok»** — la tabella è approvata così com'è; restano da approvare a parte la riscrittura della sezione 3 e il testo di `harness-ui/AGENTS.md`. «Su richiesta» = resta in radice ma entra dall'indice della mossa A, non sempre.

| # | Sezione (righe di oggi) | Byte | Destinazione proposta | Perché |
|---|---|---:|---|---|
| 1 | Non-Negotiable User Rule (5-9) | 230 | **radice, sempre** | tre regole universali, il blocco che A tiene intero |
| 2 | Architecture Boundaries (11-17) | 800 | **radice, tre righe** (core PHP · validator · control-plane · TALOS UI · Kadmos, un rigo ciascuno) + dettaglio in `core/AGENTS.md`, `validator/AGENTS.md`, `control-plane/AGENTS.md` | i confini servono ovunque, i dettagli solo dentro |
| 3 | Persistent Three-Lane Collaboration (19-32) | 900 | **radice, su richiesta** — da aggiornare: oggi le lane sono desktop (`lane/harness-desktop`), mobile, banco, e Astra ha sostituito i sub-agenti (12/09) | la sezione descrive Codex/Fable/Kimi del 03/09: va riscritta prima di spostarla, decide l'owner |
| 4 | Before Coding (34-40) | 450 | **radice, sempre** (5 righe) | universale e corto |
| 5 | Code-Level Planning Ledger (42-59) | 1.300 | **radice, su richiesta** | universale ma lungo: entra quando si pianifica |
| 6 | Standards-First Engineering (61-83) | 2.500 | **radice, su richiesta** | la regola «ricerca prima» è vincolante ovunque; il testo lungo entra dall'indice |
| 7 | Direct Open-Source Integration (85-90) | 900 | **radice, su richiesta** | universale |
| 8 | Regression Prevention (92-100) | 1.500 | **radice, su richiesta**; il punto «For UI work … desktop and mobile viewports» va in `harness-ui/AGENTS.md` e `mobile/AGENTS.md` con le viewport vere di ciascuno (1024×800 e 1440×900 per il desktop; tablet portrait primo per il mobile) | la regola UI è diversa per cartella |
| 9 | Tool Routing (102-109) | 400 | **radice, sempre** senza l'ultima riga; «Use Laravel APIs for browser-facing TALOS behavior» → `control-plane/AGENTS.md` | corto; l'ultima riga è del control-plane |
| 10 | No fake feature rule (111-120) | 700 | primo capoverso **radice, sempre**; i quattro punti «For TALOS specifically» → `control-plane/AGENTS.md` (parlano di chat pages, benchmark panels, ingestion, trace/replay della UI Laravel) e una versione per `harness-ui/AGENTS.md` (nessun pannello senza rotta vera, «non c'è la rotta» non è una risposta, CRUD completo) | la regola vale ovunque, gli esempi no |
| 11 | AVM ON/OFF Benchmark Rule (122-124) | 350 | `core/AGENTS.md` + cartella del banco (TALOS-BANCO) | riguarda solo chi misura |
| 12 | State And Context Discipline (126-130) | 500 | **radice, su richiesta** | vale per core, control-plane e harness (sessioni, eventi) |
| 13 | Typed Tool Response Parsing (132-138) | 900 | `core/AGENTS.md` (`fromJson()`/`fromArray()` sono PHP) + `validator/AGENTS.md` (Zod) | specifico del core |
| 14 | Error Handling (140-144) | 300 | **radice, sempre** | tre righe universali |
| 15 | UI Product Rules (146-153) | 600 | `control-plane/AGENTS.md` (`/chat`, `/dashboard`, shadcn-vue: è la UI Laravel) e un `harness-ui/AGENTS.md` con le regole VERE del desktop (tema Calm e sistema di design esistente, niente nomi tecnici a schermo, più di due azioni ⇒ menu ⋯ + tasto destro, chiaro e scuro sempre, confronto col mockup) | oggi la sezione descrive un'altra UI: sul desktop è fuorviante |
| 16 | Security And Policy (155-160) | 450 | **radice, sempre** | universale |
| 17 | Verification (162-172) | 700 | per cartella: `core/`, `validator/`, `control-plane/` con i loro comandi; `harness-ui/AGENTS.md` con i suoi (`node --test tests/*.test.mjs`, `npm run test:unit` nel frontend, `npm run test:kernel`, foto nei due temi sul 4174); in radice resta «Report failures honestly …» | i comandi sono per cartella |

**Risultato atteso in radice, sempre:** sezioni 1, 2 (tre righe), 4, 9, 10 (capoverso), 14, 16 ≈ 2.400 byte (~600 token) invece di 11.480; le sezioni «su richiesta» (3, 5, 6, 7, 8, 12) restano nel file e entrano dall'indice di A. `harness-ui/AGENTS.md` nasce con: fake feature (versione desktop), regressioni UI con le viewport, regole di prodotto del desktop, verifica; ≈ 1.500 byte.

**Da decidere dall'owner, riga per riga:** (a) la sezione 3 va riscritta (lane e Astra) prima di spostarla; (b) le «regole vere del desktop» per `harness-ui/AGENTS.md` le propongo io da `MEMORY.md` e dalle memorie di settembre, in un file a parte da approvare; (c) `mobile/AGENTS.md` non lo scrivo io (nessuna ownership su mobile): lo segnalo alla lane mobile.
