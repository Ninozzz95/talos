# Debiti mobile dopo Codice — 2026-08-25

Owner: Antonino

Stato: **DEBT-MOBILE-001 verde su landscape, portrait fisico pendente**;
DEBT-MOBILE-002 verde su statici e percorso Privacy del Pad, prima scelta locale
da ripetere con consenso azzerato; DEBT-MOBILE-003…009 registrati

Ordine vincolante: iniziare diagnosi, ricerca, ledger e fix soltanto dopo la
chiusura completa delle fasi Codice/Harness in corso.

## Evidenze ricevute

- `C:\Users\Antonino\Downloads\bug\unnamed (1).jpg`: apertura del documento
  Markdown appena generato con testata compenetrata nella status bar.
- `C:\Users\Antonino\Downloads\bug\unnamed.jpg`: schermata Provider e accessi
  con errore OpenRouter visibile mentre la stessa scheda indica «Chiave
  salvata» e 418 modelli disponibili.

## DEBT-MOBILE-001 — Safe area del documento appena generato

Stato: fix minimo applicato, regressioni larghe verdi e Pad verde su landscape;
portrait fisico pendente.

Se si tocca la scheda del file `.md` appena generato, la testata entra nella
status bar del dispositivo. Aprendo lo stesso contenuto dalla Libreria il
difetto non si presenta. La diagnosi dovrà confrontare i due percorsi reali e
convergere sul contratto safe-area canonico, senza correggere soltanto lo
screenshot allegato.

## DEBT-MOBILE-002 — Verifica GPU senza avanzamento reale

Stato: **GREEN focalizzato; gate largo e Pad ancora pendenti**.

La verifica GPU nativa è stata riprodotta sul Pad (CPU `VALID` in logcat). La
prima scelta locale ora mostra un toast persistente durante la corsa e un esito
o errore alla fine; Privacy mantiene il loading e mostra il rifiuto del ponte.
Restano da eseguire suite/build/APK e la verifica visiva sul Pad.

Alla prima scelta di un modello locale compare la modale di verifica GPU, ma
«Verifica ora» la chiude senza loading né prova visibile. In Privacy e
autorizzazioni, «Fallo girare ora» non produce alcuna reazione. Vanno provati
entrambi i punti di ingresso, gli stati loading/successo/errore/annullamento e
la reale operazione sottostante; una sola animazione decorativa non chiude il
debito.

## DEBT-MOBILE-003 — Streaming strutturato senza cursore da prompt

Durante lo streaming il cursore da prompt deve restare esclusivo del testo
continuo. Tabelle e altre strutture devono usare una rivelazione dinamica in
fade, senza lampeggi, salti di layout o rianimazione del contenuto già stabile,
e con un equivalente senza animazione quando è attiva la riduzione movimento.

Direzione proposta, da confermare dopo ricerca web primaria aggiornata al mese
di implementazione: il parser/renderer segnala quando un nuovo blocco
strutturale è sintatticamente stabile; solo quel blocco riceve una breve
transizione di opacità tramite i token motion dell'app. I token testuali
continuano invece a usare l'indicatore corrente. Prima del codice servono RED
su testo, tabella incompleta, tabella stabilizzata, blocchi consecutivi,
riduzione movimento e streaming interrotto.

## DEBT-MOBILE-004 — Scala caratteri della prima installazione

Su una nuova installazione la dimensione caratteri predefinita deve essere
«Molto piccola», non «Piccola». Il gate dovrà usare stato applicazione realmente
pulito e verificare anche che upgrade e preferenze già salvate non vengano
sovrascritti.

## DEBT-MOBILE-005 — «Autorizza tutti · Sempre» e strumenti agente

Se nel setup introduttivo l'owner sceglie «Autorizza tutti in un sol colpo» con
durata «Sempre», nelle impostazioni Strumenti agente devono risultare abilitati
anche «Gestisci la policy libreria» e «Usa un'app al posto tuo». Servono prova
del percorso iniziale, persistenza dopo riavvio e prova inversa per scelte più
restrittive.

## DEBT-MOBILE-006 — Tastiera nascosta, focus e composer compatto

Quando l'utente nasconde la tastiera, il focus deve lasciare il composer Chat.
Se la preferenza di compattezza lo prevede, il composer deve quindi tornare
alla forma compatta. Vanno provati tasto Back/gesture sistema, riapertura,
testo presente/vuoto e nessuna perdita della bozza.

## DEBT-MOBILE-007 — Pinch-to-zoom illimitato nella Chat

La schermata Chat non deve permettere pinch-to-zoom progressivo. La correzione
deve mantenere la scala tipografica e le altre funzioni di accessibilità
dell'app; saranno verificati gesto reale, doppio tap, orientamenti e superfici
adiacenti.

## DEBT-MOBILE-008 — Chiusura gestuale della sidebar globale

La sidebar globale deve potersi chiudere anche con swipe da destra verso
sinistra, oltre che con la X. Il gesto deve seguire i token motion e non
confliggere con scroll verticali, back gesture Android o contenuti orizzontali.

## DEBT-MOBILE-009 — Stato OAuth OpenRouter contraddittorio

Dopo l'aggiunta della chiave OpenRouter appare ancora l'errore «OpenRouter non
ha rilasciato la chiave», mentre la scheda dichiara «Chiave salvata» e mostra i
modelli disponibili. Va diagnosticata la macchina a stati reale di OAuth,
callback, chiave manuale e stale error; il gate deve coprire successo fresco,
reload, errore vero, retry e sostituzione/rimozione della chiave.

## Regola di presa in carico

Ogni debito richiede, prima del codice: riproduzione sul Pad, ricerca web
primaria corrente, ledger a livello di file/simbolo/test, RED automatico,
GREEN focalizzato, regressioni interessate e prova visiva completa. Questo
documento registra gli impegni dell'owner ma non autorizza scorciatoie né
dichiara già nota la causa.
