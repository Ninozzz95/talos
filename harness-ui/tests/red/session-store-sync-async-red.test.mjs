// 24/09/2026 — F2, corsia STORE: i due RED diagnostici di Codex che vivevano qui
// (`CTX-STORE-SYNC-LEAPFROGS-QUEUED`, `CTX-STORE-SYNC-DURING-PARTIAL-ASYNC`, 0/2 sulla base `e2eb2a5ce`)
// sono stati PROMOSSI in `tests/session-store-sync-policy.test.mjs`, dove girano sotto la politica
// esplicita `impostaPoliticaScritturaSync('busy')` (default di oggi: `'scavalca'`, finché l'onda 2 non
// migra i chiamanti del registro). Questo file resta vuoto apposta: niente da eseguire.
