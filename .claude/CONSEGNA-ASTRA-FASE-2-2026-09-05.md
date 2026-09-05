# Consegna Astra — fase 2, 05/09/2026

## B3 · Board

La Board usa le **73 sessioni reali** dello store copiato. Apri [la app locale](http://127.0.0.1:4177) e premi **Board**.

- Filtri di stato, cartella e quattro ordinamenti funzionanti.
- Click o Invio sulla riga apre la chat. Il tasto destro conserva il menu della sessione.
- Cache in percentuale e token, motivi di chiusura reali. I valori mancanti restano dichiarati; il costo attende la fase 3.
- Tabella scorrevole con intestazioni ferme. Errori e recupero visibili in alto.

**Prove:** 6/6 unità Board, 12/12 percorsi reali, 27/27 componenti più 3/3 Board dopo l'ultimo batch, 195/195 parità statica, build deterministica di 30 asset. Aperte e confrontate 21 immagini a 1440/1280/1024, elencate nel [ledger](LEDGER-ASTRA-FASE-2-2026-09-05.md).

**Limite aperto:** verify si ferma su PHASE3-TOKEN-CONTRACT-01: il CSS generato contiene i colori del mockup anche nella base 81cc5cc5. 323/324 test passano. Non ho aggirato il controllo né toccato il CSS condiviso fuori dal componente. B3 è consegnata per revisione; il cancello generale non è dichiarato verde.

I test del modello in chat e l'OAuth non sono stati eseguiti: il runtime del modello non è configurato in questa istanza di confronto. I test in chat futuri useranno il linguaggio naturale concordato.

**Cosa deve fare l'owner:** provare la Board su 4177 e rivedere la consegna.
**Cosa fai tu dopo:** B5, a partire da Memoria.
**Cosa rimane:** B5 → B4 → B6 → B2 → B7 → B1 → B8, contratto CSS, poi OAuth e piano computer-use.

## B5.1 — Memoria pronta per review · 05/09/2026

La pagina Memoria usa GET /api/v1/sessions/:id/memory e le righe del mockup. Nello store di confronto non ci sono ricordi: 4177 e 4179 mostrano entrambi il vuoto. Ricerca su titolo e contenuto completo, quattro generi veri, Leggi/Chiudi da tastiera, data di aggiornamento quando presente, errore/ricarico e risposta obsoleta verificati. Correggi resta hidden data-richiede=fase3: nessuna rotta di scrittura inventata.

| Aspetto | Originale desktop | Componente | Evidenza/verdetto |
|---|---|---|---|
| Dati e scope | lista globale nel foglio capability | stessa API e stesso vuoto, genere conservato con nome italiano | app-vuota/originale-vuota a 1440/1280/1024; parità dei dati vuoti |
| Testo | anteprima a 80 caratteri | anteprima + contenuto intero espandibile e data disponibile | MEMORIA-FIXTURE, testo oltre 80 caratteri trovato e letto; beneficio provato con fixture |
| Accesso | aprire il foglio e scorrere alla memoria | voce Memoria, lista dedicata | screenshot aperti; nessuna modifica della sidebar |
| Stato | messaggio nel mount | caricamento, errore distinto da zero, Aggiorna e guardia sulle risposte obsolete | RED numero falso riprodotto e risolto; MEMORIA-RECUPERO 3 viewport |
| Tastiera e forma | righe passive | tab con frecce/Home/End; Enter/Spazio Leggi/Chiudi; focus visibile | parità struttura/parole/pixel e screenshot lettura aperti |
| Responsive | foglio originale con scorrimento | testo espanso va a capo; a 1024 Aggiorna si dispone sotto i filtri ed è raggiungibile | 21 immagini aperte, nessun taglio del contenuto espanso |
| Persistenza | deposito globale sul disco | sola lettura, ricarico rilegge il deposito | niente richieste di scrittura nella prova; filtri temporanei, non impostazioni persistenti |

Blocchi riusati: MemoryRow, MemoryList, FilterChips, Field, Button, Badge, PageHeader, WhereOnDisk e sprite esistente. Blocchi nuovi 0, token nuovi 0; una sola regola CSS scoped alla riga espansa, definita nel mockup e rigenerata. Il codice mobile MemoryScreen.vue conferma ricerca su titolo/contenuto e quattro generi; i suoi scope/CRUD/stato non sono disponibili nell’endpoint desktop e non vengono simulati.

Cancellli: unità Memoria 3/3; componenti completi 30/30, MemoryRow ripetuto dopo il fix 3/3; live Board+Memoria 21/21, Memoria ripetuta dopo il fix 9/9; statico 195/195; build 30 asset e determinismo verde. verify rimane ROSSO per il solo PHASE3-TOKEN-CONTRACT-01 preesistente (326/327 unità/contratti): index.css generato contiene colori già nella base 81cc5cc5; nessun bypass del test. Ultimo fix cambia solo la testata in caricamento/errore, non il mockup statico. Tutti i 21 PNG del manifesto sono stati aperti; i tre errori sono stati riaperti dopo il fix. Dati fixture separati dai risultati reali.

Richieste a Claude: allineare contratto CSS e generazione canonica; collegamento Note assente (decisione C2, NavItem data-conteggio=note senza data-vaia, nessuno schermoNote nel mockup e nessuna mappa nel ponte). Per §9 non invento una rotta o una pagina e non tocco sidebar/ponte. rigaNota resta da estrarre quando il contenitore è definito. C22/C23 richiedono API per strati, ultima lettura e modifica; non certificati da questa pagina.

Non verificato: lettura di memorie realmente scritte da un modello, chat multi-turn, screen reader su dispositivo, volumi superiori alle quattro fixture, CRUD e uso effettivo nel prompt. TALOS_OWNER_RUNTIME_MODULE assente: nessuna prova modello dichiarata.

**Cosa deve fare l’owner:** aprire http://127.0.0.1:4177 → Memoria e valutare gli screenshot.
**Cosa fai tu dopo:** TaskRow/Attività, prossimo componente B5.
**Cosa rimane:** Note e altre pagine B5, B4 → B6 → B2 → B7 → B1 → B8; debito CSS/rotte fase 3; OAuth e piano computer-use.
