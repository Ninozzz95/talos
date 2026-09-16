# Ledger — riavvio 4174: 1/17 sessioni ripristinate, 15 in silenzio (02/09)

> Trovato riavviando il server per l'owner con le ultime modifiche di Fable.
> Non investigato a fondo (non era il compito di questo turno) — registrato
> per intero, non lasciato solo in chat.

## Fatto misurato

Log del riavvio: `[session-store] sessione b7b1b7d2… non ripristinata: riga
corrotta` poi `1/17 sessioni ripristinate`. 17 è il conteggio REALE dei file
in `.sessions-store/` (verificato con `ls`). Solo UNA sessione (quella
corrotta) produce un log — le altre 15 non compaiono da nessuna parte.

## Causa isolata, non solo ipotizzata

`session-registry.mjs`, `ripristina()` (~riga 1207): dopo una lettura
riuscita, `if (!record || record.length === 0) continue;` e
`if (!intestazione) continue;` sono **entrambe silenziose**, a differenza del
`catch` di lettura (riga 1221-1222) che LOGGA sempre. Verificato su un file
campione (`015def7b…jsonl`, 210 righe, 112KB): **zero** righe
`"tipo":"intestazione"`, tutte `"type":"WorkspaceChanged"` — un frammento
orfano, non una conversazione con la testa mancante per corruzione.

## Non ancora capito

Perché esistono 15 file fatti SOLO di `WorkspaceChanged` orfani, senza mai
un'intestazione — nati prima della cura effimera (`666a5fa8`, che ora non li
scrive più su disco) o un sintomo diverso. Le dimensioni sono sospettosamente
vicine fra loro (112.381/112.591/112.306/121.198 byte) — profilo di sessioni
generate da corse automatiche ripetute (QA pipeline), non chat reali con
testo. `b7b1b7d2` (5,4 MB, l'unica con un vero errore di lettura) è l'unica
che merita un controllo per capire se contenga lavoro vero perso.

## Non fatto in questo giro

- Non letto il contenuto di `b7b1b7d2` per capire se conteneva una
  conversazione reale.
- Non deciso se `ripristina()` deve loggare anche gli scarti silenziosi
  (probabile sì: un conteggio "N corrotte, M senza intestazione, K
  ripristinate" invece del solo totale).
- Non cancellati i 15 file orfani: potrebbero essere innocui, ma cancellare
  senza aver capito la causa sarebbe un'ipotesi, non una misura.

## Stato

🔜 Registrato, non deciso. Non blocca il resto: il server è sano, la
sessione attiva dell'owner (se c'era) non risulta fra i 17 file toccati da
questo problema in modo diverso da prima.
