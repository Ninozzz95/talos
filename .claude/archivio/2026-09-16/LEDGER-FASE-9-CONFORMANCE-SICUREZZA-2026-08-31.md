# Ledger esecutivo — Fase 9 Conformance, performance e sicurezza

Data: 2026-08-31  
Owner: Harness Desktop (solo worktree desktop; mobile esclusivamente come bundle statico già condiviso)

## Obiettivo

Certificare il contratto comune dei runtime locali senza fingere provider
installati: fixture deterministiche per llama.cpp/Ollama/LM Studio, gate di
sicurezza per binding/path/segreti/processi orfani e una corsa CDP ripetibile
per Model Lab ai due viewport desktop.

## File esatti e simboli

1. `harness-ui/tests/local-runtime-conformance.test.mjs` (nuovo)
   - fixture `createResponse`, `streamResponse`, `fakeFetchRouter`;
   - test `CONFORMANCE-LLAMA-STREAM-01`, `CONFORMANCE-OLLAMA-STREAM-01`,
     `CONFORMANCE-LMSTUDIO-STREAM-01`, `CONFORMANCE-MALFORMED-01`,
     `CONFORMANCE-CANCEL-01`, `CONFORMANCE-TIMEOUT-01`,
     `CONFORMANCE-CONTEXT-01`, `SECURITY-LOOPBACK-01`, `SECURITY-PATH-01`,
     `SECURITY-NO-SECRETS-01`, `SECURITY-ORPHAN-01`.
2. `harness-ui/scripts/qa-visual-pipeline.mjs` (modifica)
   - scenario `qa-model-lab-runtime-security`;
   - screenshot e controlli UI gated a 1440×900 e 1024×800;
   - verifica assenza di segreti/path assoluti e nessuna richiesta >=400.
3. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` (modifica)
   - risultato della corsa CDP, screenshot e taccuino competitor.
4. `docs/superpowers/plans/2026-08-30-local-runtime-desktop.md` (modifica)
   - spunte Task 9 solo con evidenza reale.
5. `.claude/CONSEGNA-FASE-9-CONFORMANCE-SICUREZZA-2026-08-31.md` (nuovo)
   - consegna semplice, gate chiusi/aperti, rollback.

## RED atteso

Prima dell'implementazione il test nuovo deve fallire perché la fixture di
conformance non esiste e perché la pipeline non contiene lo scenario nominato.

## GREEN e regressioni

- `node --test tests/local-runtime-conformance.test.mjs`.
- `node --test tests/*.test.mjs`.
- `npm exec vitest run tests/unit/harness`.
- `npm run typecheck`.
- `node --check mobile/public/harness-ui/app.js` e `git diff --check`.

## Gate upstream reale

- Se disponibile, interrogare il binario llama.cpp pinato e registrare
  versione/build, `/health`, `/v1/models`, stream, cancel e `/metrics`.
- Se Ollama/LM Studio non sono installati, registrare `not installed` senza
  sostituire il risultato con un mock.

## Ricerca ufficiale e decisione

- Adottare i contratti documentati da llama.cpp `/health`, `/v1/models`,
  `/v1/chat/completions` e streaming SSE.
- Adattare Ollama `/api/tags` + `/api/chat` e LM Studio REST v1 dietro gli
  adapter TALOS già esistenti.
- Applicare OWASP SSRF: loopback esplicito, nessun endpoint client arbitrario,
  path modello assoluto e verificato dal catalogo, segreti solo server-side.

Fonti: llama.cpp server README (master), LM Studio REST v1, OWASP SSRF e
Node.js security cheat sheets (consultate il 2026-08-31).

## Prova umana e rollback

La prova umana deve aprire Model Lab, osservare lo stato gated e verificare che
i controlli non diventino attivi senza runtime reale, con screenshot completi
ai due viewport. Rollback: rimuovere il test nuovo e lo scenario QA, ripristinare
le sole modifiche documentali; non toccare i moduli runtime Task 0–8.

## Stato di esecuzione

- [x] RED osservato: `tests/local-runtime-conformance.test.mjs` non esisteva.
- [x] GREEN: fixture conformance e sicurezza, 11/11 pass.
- [x] Regression mirata adapter/supervisor, 20/20 pass.
- [x] Porte reali Ollama `11434` e LM Studio `1234` verificate: `not installed or unreachable`.
- [x] Scenario CDP eseguito a 1440×900 e 1024×800; 4 screenshot ispezionati per intero, 0 eccezioni e 0 richieste fallite.
- [ ] Gate con binario llama.cpp pinato e misure performance reali.
- [ ] CDP visuale 1440×900 e 1024×800 con ispezione screenshot completa.
- [ ] Commit (nessun commit/push autorizzato in questa fase).
