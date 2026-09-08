# Immagini nella chat e provider diretti — 08/09/2026

Il nome dell'allegato non è più il suo unico contenuto inviato al modello. PNG, JPEG e WebP vengono conservati atomicamente e risolti in byte nel boundary del provider. In chat compare una scheda immagine separata dalla bolla, con anteprima apribile, Escape e ritorno del fuoco. Allegati conservati nei seguiti, nella coda, nei reindirizzi e dopo riavvio.

I collegamenti nativi usano gli SDK fissati dietro il contratto TALOS: OpenAI Responses, Anthropic Messages e Gemini GenerateContent. Il kernel continua a eseguire gli strumenti. Non ci sono passaggi impliciti fra provider, né segreti nello storico. Il selettore Diretti carica i cataloghi ufficiali.

## Prove reali dal composer

Sessione isolata di verifica: `e66c9fcb-c367-4a97-99b2-609fd2bf7f72`. Nessuna conversazione dell'owner modificata.

| Collegamento | Esito osservato |
|---|---|
| Gemini via OpenRouter | Cerchio rosso e quadrato blu riconosciuti; seguito corretto. |
| Gemini diretto | Quadrato verde e cerchio giallo riconosciuti; strumento `leggi` reale, parola `melograno`; firma Google conservata nel checkpoint. |
| OpenAI diretto | Cerchio viola e quadrato arancione riconosciuti; strumento `leggi` reale, nuova parola `zaffiro`; continuità con stato opaco Responses. |
| Claude via OpenRouter | Nuova figura non descritta: triangolo nero e cerchio ciano riconosciuti. Dopo riavvio con chat aperta, lettura reale e nuova parola `giada`, testo visibile completo. |
| Anthropic diretto | Richiesta reale raggiunge l'API ma viene rifiutata per saldo insufficiente. Inferenza, immagini e strumenti nativi NON qualificati sul servizio reale; adapter coperto da test di protocollo. Nessun acquisto effettuato. |

Insuccessi mantenuti: primo stream Gemini troncato; incompatibilità OpenAI Chat Completions con reasoning e strumenti; errore saldo Anthropic; perdita iniziale del prefisso dopo restart. Le correzioni hanno regressioni permanenti. Non attribuire il primo stream Gemini al successivo HTTP503: la causa remota della prima richiesta non è stata registrata.

## Verifica e limiti

- Backend: 1.798/1.798; successivo controllo etichette credenziali: 9/9 (un nuovo scenario).
- Frontend unitari: 465/465; componenti: 126/126; percorso immagini nel browser: 7/7; kernel: 552/552.
- Build frontend e `git diff --check` verdi. Asset aggiornati su `http://127.0.0.1:4174`.
- Screenshot PNG esatti 1920×1080, 2560×1440, 3840×2160: scheda e dialogo ispezionati personalmente. Manifest e file in `.claude/immagini/immagini-chat-2026-09-08/`. Tema chiaro verificato nelle tre misure, tema scuro anche nel browser integrato. Le catture 4K tagliate del browser integrato sono escluse; i PNG validi provengono da Playwright sul medesimo server reale.
- Limiti espliciti: 5 MiB per immagine, 10 per messaggio, 12 MiB complessivi risolti per richiesta. Nessun allegato eliminato silenziosamente per rientrare nel limite. Formati non supportati rifiutati.
- I messaggi storici che contengono soltanto il nome dell'immagine non permettono di ricostruirne i byte: occorre riallegarla.
- Guardia confronto kernel: divergenza con copia mobile già più vecchia dichiarata; nessuna sovrascrittura del checkout fratello.
- Audit dipendenze: due segnalazioni preesistenti nella catena `pptxgenjs/image-size`; nessun downgrade forzato.

SSE: `WorkspaceChanged` è effimero e ora non consuma numeri durevoli. I primi eventi dopo restart non collidono con notifiche non persistite. Ricaricare una volta il browser che era aperto sulla versione precedente.

Ricerca, file/simboli, RED→GREEN, pin, rollback: `LEDGER-IMMAGINI-CHAT-2026-09-08.md`. Licenze: `harness-ui/THIRD_PARTY_NOTICES.md`. Evidenza privata e log restano sul disco; niente pubblicazione né push.

**Cosa deve fare l'owner:** ricaricare 4174 e riallegare una vecchia immagine per provarla; credito Anthropic solo se vuole qualificare anche quell'account.
**Cosa fai tu dopo:** correggere Accesso pieno fuori dalla cartella della sessione, con ricerca e prove reali.
**Cosa rimane:** gate reale Anthropic quando disponibile, Accesso pieno, scelta Autocompact e proposte nella coda.
