# Distribuzione: probabilmente fuori dal Play Store

Data: 2026-07-31
Stato: **direzione probabile, non decisione presa.** Owner: «molto probabilmente
ignoreremo il PlayStore per una release solo su GitHub o F-Droid, staremo a
vedere».

Scritto adesso perché cambia vincoli che stiamo già usando per progettare, e
scoprirlo dopo costerebbe lavoro buttato.

---

## Cosa NON cambia

**D0 resta intero: nessuna chiave nell'APK.** Non era una regola del Play Store,
era una regola sulla distribuzione — chiunque può aprire un APK, da qualunque
canale arrivi. Vale identica su GitHub e su F-Droid.

**Nessun elenco che invecchia cablato nell'APK.** Stessa ragione: fuori dagli
store gli aggiornamenti sono più lenti, non più veloci, quindi un catalogo
remoto e firmato conta *di più*.

**Le licenze dei modelli** non dipendono dal canale. Llama, Gemma e le licenze
non commerciali obbligano chi distribuisce e chi usa, non chi pubblica sullo
store.

## Cosa si SBLOCCA — ed è la parte grossa

Il Play Store limita duramente due cose che servono alla **piattaforma
agentica**: i servizi di **Accessibilità** e le **VPN**, entrambi con policy che
rifiutano l'uso «per automazione» e richiedono giustificazioni che un agente
generalista non può dare. Era il vincolo citato nelle decisioni sui tool
(«Play limita Accessibility/VPN») e modellava l'intero blocco C.

Fuori dallo store quel vincolo **non esiste**. Shizuku, l'accesso al dispositivo
e il terminale diventano progettabili per quello che sono, non per quello che
una policy tollera. Se la direzione si conferma, il blocco C / I=K va
**riprogettato più ambizioso**, non semplicemente portato.

Spariscono anche: i limiti di dimensione dell'APK, le regole sul «codice
scaricato a runtime» (che pesavano sul download dei modelli), e le revisioni.

## Cosa si COMPLICA — F-Droid non è «nessuna regola»

F-Droid è più severo del Play Store su altri assi, e vale la pena saperlo prima:

- **Build riproducibile dai sorgenti**, fatta da loro. Ogni dipendenza binaria
  precompilata è un problema — e noi ne abbiamo (llama.cpp nativo, SQLCipher,
  plugin Capacitor).
- **Niente componenti proprietari.** Le librerie non libere vanno rimosse o
  isolate in un flavor.
- **Anti-feature dichiarate**: un'app che parla con servizi di rete non liberi
  (i provider BYOK) viene etichettata. Non è un rifiuto, è un'etichetta — ma va
  scritta onestamente da noi, non subita.
- **Nessun canale di pagamento.** Il servizio cloud opzionale in abbonamento
  ([[cloud-service-predisposition]]) perde la rotaia del Play Billing e ne serve
  un'altra.
- **Aggiornamenti più lenti e nessuna consegna automatica** per chi installa
  l'APK da GitHub: serve un **aggiornatore in-app** onesto, che oggi non esiste.

## Cosa faccio adesso

Niente di irreversibile. Continuo su Hugging Face come previsto: nessuna delle
prime fette dipende dal canale di distribuzione. Ma da qui in poi, quando una
scelta dipende dal canale, la segnalo invece di assumere il Play Store.

**Due cose da riprendere quando la direzione si conferma:**
1. il blocco C / piattaforma agentica va **riaperto in progettazione**, perché è
   stato pensato dentro un recinto che potrebbe non esserci;
2. serve un **aggiornatore in-app**, o gli utenti restano su una versione vecchia
   senza sapere che ne esiste una nuova.
