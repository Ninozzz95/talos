# Progetti

## Cosa fa

Raggruppa le sessioni per progetto — non per singola cartella: un progetto può
vivere in più cartelle di lavoro.

Per ogni progetto si vedono le **tre** sessioni più recenti, e l'ordine è per
quanto di recente ci hai lavorato, non alfabetico: il progetto su cui sei appena
stato sta in cima.

In più rispetto a un semplice elenco: per ogni progetto si vede anche **cosa è
costato** — giri e parole-macchina — perché è la domanda che una persona si fa
guardando una lista di progetti.

Le sessioni senza progetto hanno comunque una casa, invece di sparire.

## Cosa non fa

- ⛔ **Non inventa l'ultima riga.** Se un progetto non ha sessioni lo dice,
  invece di mostrare uno zero che sembra una misura.
- Non crea progetti da sé: nascono dalle cartelle su cui lavori.

## Come si usa

Dalla voce **Progetti** della barra laterale. Da lì si riapre una sessione
recente senza passare dall'elenco generale.

## Se va storto

- **Un progetto non compare** — non ha ancora nessuna sessione registrata.

> Verificato in `harness-ui/frontend/src/components/progetti.js`: le **tre**
> sessioni recenti per progetto sono `QUANTE_RECENTI = 3` alla riga 29 (la riga 12 lo
> dice in un **commento**, non in codice eseguito) e si applicano alla riga
> 142 (`ultimeSessioni(p, quanteRecenti)`); giri e token per progetto si sommano
> alle righe 69-82 e si scrivono alle righe 105-107, e ciò che non c'è non viene
> stampato.
