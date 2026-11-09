/*
 * La tabella di Accesso pieno del PC PRIMA delle decisioni 156 e 159 dell'owner (04/11/2026), tenuta qui come strumento delle prove.
 *
 * Le prove storiche delle protezioni e del ciclo (PROT-*, CICLO-*, PR19-*, RIL-*) usavano Accesso pieno come «rivelatore»: con quella
 * tabella ogni protezione non chiesta FERMAVA, e «ferma» diceva che il riconoscimento aveva visto il pagamento, l'invio, la
 * cancellazione. La decisione 159 ha cambiato la tabella del prodotto (fermano solo l'invio col sospetto, la credenziale in chiaro e
 * l'anti-robot; il pagamento fa una carta; il resto passa e si segna). Quelle prove restano sul riconoscimento e sulla macchina del ciclo
 * (pause, riga «Posso», causa dell'arresto) con questa tabella vecchia; la tabella nuova del prodotto la fissano REV-R-25..27
 * (`computer-use-revisione-r.test.mjs`). Non è una politica del prodotto: non sta in `POLITICHE`.
 */
import { dominioSotto } from '../src/computer-use/protezioni.mjs';

const sospetto = (c) => Boolean(c?.sospetto);
const richiesto = (c, cosa) => c?.richiesta?.[cosa] === true && !sospetto(c);
const segretoLegittimo = (r) => r.motivo === 'portachiavi' || r.motivo === 'testo-della-persona';
const riservata = (r) => r.motivo === 'cookie' || r.motivo === 'permesso' || r.motivo === 'marketing';
const nelPiano = (c, s) => (Array.isArray(c?.piano?.domini) ? c.piano.domini : []).some((x) => dominioSotto(s?.dominio, x));

export const PIENO_PRIMA_159 = Object.freeze({
  nome: 'pc-accesso-pieno',
  piattaforma: 'pc',
  nonValutabile: 'ferma',
  nonValutabilePer: Object.freeze({ 'scritture-miste': 'chiedi' }),
  decidi(r, c, s) {
    switch (r.protezione) {
      case 'credenziale':
        if (sospetto(c)) return 'ferma';
        if (segretoLegittimo(r)) return 'procedi-e-segna';
        return r.motivo === 'riempimento-automatico' && nelPiano(c, s) ? 'procedi-e-segna' : 'ferma';
      case 'consenso': return riservata(r) ? 'scegli-riservato' : (nelPiano(c, s) && !sospetto(c) ? 'procedi-e-segna' : 'ferma');
      case 'anti-robot': return 'ferma';
      case 'cancellazione': return richiesto(c, 'cancellare') ? (r.sostitutiva ? 'riscrivi' : 'procedi-e-segna') : 'ferma';
      case 'pagamento': return richiesto(c, 'pagare') ? 'procedi' : 'ferma';
      case 'invio': return richiesto(c, 'inviare') ? 'procedi' : 'ferma';
      default: return 'ferma';
    }
  },
});
