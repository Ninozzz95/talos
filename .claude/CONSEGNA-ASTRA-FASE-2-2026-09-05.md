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
