# Checkpoint, integrità e cronologia

| Checkpoint | SHA | Contenuto |
| --- | --- | --- |
| Base della prima PR | `51cbc6d8307b7b49fdfc37c48f77b652ecf82183` | Guardia iniziale e documentazione, prima di questo passaggio |
| CP00 | `99941e856f91fa9349e65de4eb709902b4e801b2` | Hash della versione approvata e stato prima della review |
| Guardia robusta | `2bc9266b0c569c57399c92d6a603bab73bc77220` | Hardening del solo CSS operativo |
| CP01 applicativo | `073f661966c1443bf5049b43940529aedad6cb67` | Tutti i sorgenti del laboratorio migliorato e build riproducibile |
| CP02 verifica e handoff | Commit successivo a CP01 nella stessa branch | Test riproducibili, fixture ampliata, dossier e checkpoint JSON |

Il riferimento finale della consegna viene registrato in `DELIVERY.json` nel pacchetto, dopo il commit della documentazione: non si tenta di inserire lo SHA di un commit dentro il contenuto che lo determina.

## Baseline conservata

HTML approvato SHA-256:
`82b7e6942acf28f36c0b9c286d4bdb4779c22053cc75d10c6cde2a4ec9ba9fb3`

Archivio originale SHA-256:
`db7d960a21eb62a5e949dbe09ac09d2161df430069a814e3336ad45e510ef0a1`

Questi file restano nel pacchetto come checkpoint storico, non come versione corrente. Eventuali numeri di test e limiti riportati nei loro README si riferiscono alla baseline.

## Integrità dei sorgenti e dell'HTML

I 14 blob in `prototype/src/` e `build.py` sono stati confrontati con gli SHA Git restituiti dal repository per CP01: tutti corrispondono. Il rapporto `source-upload-verification.json` contiene la mappa. La CSS del laboratorio ha lo stesso blob del foglio operativo: `8fe88027162573a56999a807c6d2902668a5aea1`.

L'HTML si rigenera dai sorgenti senza rete. `build.py --check` verifica corrispondenza esatta. L'hash dell'HTML finale è in `TESTING.md`; il pacchetto include inoltre un manifesto SHA-256 dei file consegnati. Non sono stati usati force-push, merge o refactor esterni alla sidebar.
