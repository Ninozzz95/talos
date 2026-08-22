package com.getcapacitor.myapp;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Il test che arrivava col modello di Capacitor, corretto.
 *
 * Com'era, asseriva che il pacchetto fosse `com.getcapacitor.app` — che non è
 * mai stato il nostro. Era quindi **rosso dal giorno in cui il progetto è nato**
 * e nessuno lo sapeva, perché i test strumentati non erano mai stati eseguiti:
 * fino al 2026-08-01 su questa postazione `adb` non partiva, e senza un
 * dispositivo un test strumentato non fallisce — semplicemente non esiste.
 *
 * Vale la pena tenerlo invece di cancellarlo: è il controllo più economico che
 * ci sia — l'APK si installa, il processo parte, il contesto risponde — e ora
 * dice il vero.
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        // Prefisso e non uguaglianza: le build affiancate aggiungono un suffisso
        // al pacchetto per potersi installare accanto a quella dell'utente
        // senza cancellarne i dati, e restano la stessa applicazione.
        assertTrue(
                "pacchetto inatteso: " + appContext.getPackageName(),
                appContext.getPackageName().startsWith("ai.talos"));
    }
}
