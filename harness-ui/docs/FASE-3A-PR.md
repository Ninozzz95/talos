# Fase 3A — PR summary

## Contratto

Aggiunge `POST /api/v1/sessions/:sessionId/:resource/batch` per cancellazioni batch di Library, Notes, Tasks, Memory e Research.

- massimo 250 id;
- body massimo 64 KiB soltanto sulla route batch;
- input completamente validato prima della prima mutazione;
- esecuzione seriale e deterministica;
- partial failure senza rollback globale;
- esiti individuali nello stesso ordine della richiesta;
- Projects resta read-only.

## Evidenza TDD

- RED valido: `34958725499` — 5/5 test fallivano con 405 prima della produzione.
- GREEN finale prima della PR: `34959728901`.
- Run precedente allargato: `34959401886` — 5/5 batch + 203/203 regressioni HTTP adiacenti.
- Review avversariale aggiunta dopo il primo GREEN: body chunked >64 KiB, query proibita, traversal Research.

## Scope

Nessun file `mobile/**` modificato.
