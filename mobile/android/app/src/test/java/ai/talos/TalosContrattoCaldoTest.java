package ai.talos;

import static ai.talos.TalosContrattoCaldo.TRIM_MEMORY_COMPLETE;
import static ai.talos.TalosContrattoCaldo.TRIM_MEMORY_RUNNING_LOW;
import static ai.talos.TalosContrattoCaldo.TRIM_MEMORY_UI_HIDDEN;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * ⛔⛔⛔ LA DECISIONE, provata senza telefono e senza modello.
 *
 * Questa e la parte pericolosa — liberare gigabyte al momento sbagliato — e per
 * questo e stata scritta come funzione pura: una tabella di casi la copre tutta,
 * mentre un modello vero caricato ne coprirebbe uno per corsa.
 *
 * Il tempo e iniettato: ogni prova dichiara «adesso» invece di aspettare
 * l'orologio, cosi il contratto a tempo si verifica in millisecondi.
 */
public class TalosContrattoCaldoTest {

    private static final long DURATA = 30_000L;

    private TalosContrattoCaldo nuovo() {
        return new TalosContrattoCaldo(DURATA);
    }

    @Test
    public void fuoriDallaVistaNonScaricaSubito() {
        // ⛔ Il difetto vecchio: UI_HIDDEN scaricava sempre. Ora apre un contratto.
        TalosContrattoCaldo c = nuovo();
        assertFalse("uscire dallo schermo non e pressione: non si scarica",
                c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L));
        assertTrue("un contratto e aperto", c.contrattoAperto());
    }

    @Test
    public void ilContrattoScadeEAlloraScarica() {
        TalosContrattoCaldo c = nuovo();
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L);

        assertFalse("dentro la finestra: si tiene", c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L + DURATA - 1));
        assertTrue("scaduta la finestra: si scarica", c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L + DURATA));
    }

    @Test
    public void unSecondoSegnaleNonProlungaLaFinestra() {
        // ⛔ La finestra parte da quando si e usciti, non da ogni segnale: altrimenti
        // un'app che manda UI_HIDDEN ripetuti terrebbe il modello per sempre.
        TalosContrattoCaldo c = nuovo();
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L);
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 10_000L);
        assertTrue("la scadenza resta quella iniziale",
                c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L + DURATA));
    }

    @Test
    public void tornareInPrimoPianoAnnullaIlContratto() {
        TalosContrattoCaldo c = nuovo();
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L);
        c.ripreso();
        assertFalse("nessun contratto dopo il ritorno", c.contrattoAperto());
        // ⇒ E un successivo UI_HIDDEN riparte da zero, non da una scadenza vecchia.
        assertFalse("riparte una finestra nuova", c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 50_000L));
    }

    @Test
    public void pressioneVeraScaricaSubitoAnchoDentroLaFinestra() {
        // ⛔ Il caso che il contratto NON deve rovinare: si e in secondo piano con
        // un contratto aperto, e arriva pressione vera. Si scarica ORA.
        TalosContrattoCaldo c = nuovo();
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L);
        assertTrue("pressione vera batte il contratto",
                c.vaScaricato(TRIM_MEMORY_RUNNING_LOW, 2_000L));
        assertFalse("e il contratto e chiuso", c.contrattoAperto());
    }

    @Test
    public void completeScaricaSempre() {
        TalosContrattoCaldo c = nuovo();
        assertTrue("COMPLETE e la pressione massima: si scarica",
                c.vaScaricato(TRIM_MEMORY_COMPLETE, 1_000L));
    }

    @Test
    public void sottoLaSogliaNonToccaNiente() {
        TalosContrattoCaldo c = nuovo();
        assertFalse("un livello lieve non e ne pressione ne occasione",
                c.vaScaricato(5, 1_000L));
        assertFalse("e non apre nessun contratto", c.contrattoAperto());
    }

    @Test
    public void unLivelloLieveNonChiudeUnContrattoAperto() {
        // ⛔ Un segnale che non ci riguarda non deve annullare la finestra in corso.
        TalosContrattoCaldo c = nuovo();
        c.vaScaricato(TRIM_MEMORY_UI_HIDDEN, 1_000L);
        c.vaScaricato(5, 2_000L);
        assertTrue("il contratto sopravvive a un segnale lieve", c.contrattoAperto());
    }
}
