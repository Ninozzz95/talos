// Il ponte fra Java e llama.cpp.
//
// Scritto contro `examples/simple/simple.cpp` del commit esatto a cui il
// sottomodulo è pinnato, non contro l'API ricordata a memoria: oggi stesso un
// difetto è nato dall'aver modellato il comportamento di un plugin invece di
// leggerlo, e i test verificavano l'ipotesi anziché il codice.
//
// Una scelta di forma che vale la pena spiegare: il conteggio dei token è un
// contatore atomico che Java INTERROGA, non una callback per token. La
// generazione gira su un thread e il campionatore su un altro, e la finestra di
// misura si prende insieme alla temperatura nello stesso istante — che è ciò
// che TalosBenchmarkHarness pretende. Una callback per token attraverserebbe il
// confine JNI a ogni token per poi essere quasi sempre buttata.

#include <jni.h>
#include <android/log.h>
#include <sys/stat.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <atomic>
#include <cstring>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

#include "llama.h"
#include "gguf.h"
#include "ggml-backend.h"
#include "sampling.h"
#include "chat.h"

/**
 * ⛔ L'identita' della BUILD di llama.cpp, non dell'app.
 *
 * Il formato dello stato di una sequenza e' interno a llama.cpp e non promette
 * compatibilita' fra versioni: e' quella, la cosa che invalida un prefisso
 * congelato. L'impronta usava `TALOS_APP_BUILD`, che cambia a **ogni**
 * compilazione — e MISURATO il 2026-08-08 questo butta via un gigabyte di
 * lavoro a ogni aggiornamento, facendo ripagare 150 secondi al primo messaggio
 * per una ragione che non esiste.
 *
 * Dichiarata a mano perche' `build-info` non ha un header pubblico: la
 * definizione arriva dalla libreria comune con cui siamo gia' linkati.
 */
// ⛔ SENZA `extern "C"`: `build-info.cpp` e' C++, quindi il simbolo e'
// decorato. Dichiararlo con linkage C fa cercare al linker un nome che non
// esiste, e l'errore — `undefined symbol` — non dice affatto che il problema
// e' la decorazione.
const char * llama_build_info(void);
// `chat.h` si accontenta della dichiarazione anticipata (`json_fwd.hpp`); qui il
// tipo va COSTRUITO, quindi serve l'intestazione intera. È la stessa copia
// vendorizzata che compila `common`, non una dipendenza nuova.
#include <nlohmann/json.hpp>

#define TALOS_TAG "TalosLlama"
#define TALOS_LOGI(...) __android_log_print(ANDROID_LOG_INFO, TALOS_TAG, __VA_ARGS__)
#define TALOS_LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TALOS_TAG, __VA_ARGS__)

namespace {

thread_local std::string talos_last_open_error;

struct talos_session {
    llama_model *       model   = nullptr;
    llama_context *     ctx     = nullptr;
    common_sampler *    sampler = nullptr;
    const llama_vocab * vocab   = nullptr;

    // Letti dal thread del campionatore mentre la generazione gira sull'altro.
    std::atomic<int>  produced{0};
    std::atomic<bool> cancelled{false};

    /**
     * I token che il contesto ha GIÀ elaborato, nell'ordine in cui li ha visti.
     *
     * ⭐ È la struttura che toglie la maggior parte dei 9-12 secondi. Fino a ieri
     * ogni generazione cominciava con `llama_memory_clear`, e il commento diceva
     * il perché: «ogni PROVA parte da zero». Vero per un banco di prova —
     * misurare due giri con stati diversi non misura niente — ma questa funzione
     * è anche la strada della chat, e lì significava ripagare il prefill
     * dell'INTERA conversazione a ogni messaggio.
     *
     * In chat il prompt del turno nuovo comincia con tutto il turno vecchio.
     * Sapendo quali token il contesto ha già visto si trova il prefisso comune
     * e si decodifica solo la coda. Il pezzo difficile — un contesto che
     * sopravvive fra due chiamate — c'era già: `ctx` vive fino a `nativeClose`.
     *
     * ⛔ Contiene anche i token GENERATI, non solo quelli del prompt: anche
     * quelli sono finiti nella KV. Ometterli farebbe credere al giro successivo
     * che la KV sia più corta di com'è, e il prefisso comune verrebbe calcolato
     * su una bugia.
     */
    std::vector<llama_token> cached;

    /**
     * Il tipo di cache che è stato DAVVERO creato.
     *
     * `type_k`/`type_v` sono sperimentali e la compatibilità dipende dalla
     * combinazione modello × backend × Flash Attention. Chiedere `q8_0` non
     * garantisce di ottenerlo, e chi calcola quanto contesto ci sta deve
     * leggere il risultato, non la richiesta: sbagliare qui vuol dire promettere
     * una conversazione che poi non entra in memoria.
     */
    std::string kv_type = "f16";

    /**
     * Il testo prodotto finora, e il lucchetto che lo rende leggibile da fuori.
     *
     * Una chat deve mostrare le parole mentre arrivano, non alla fine. Il
     * conteggio atomico bastava a MISURARE — quante ne sono uscite — ma non a
     * mostrarle. Stessa forma però: chi guarda INTERROGA, invece di ricevere
     * una callback per token attraverso il confine JNI.
     *
     * Il lucchetto non è pedanteria: senza, un thread appende a una
     * `std::string` mentre un altro la legge, e quella è memoria letta mentre
     * viene riallocata — un guasto che si manifesta una volta su mille e
     * sempre sul telefono di qualcun altro.
     */
    std::mutex  text_lock;
    std::string text;
    /*
     * ⛔ Quanti byte di `text` sono GIA' stati consegnati a Java, per il drain
     * incrementale. Senza, ogni sguardo copiava tutta la risposta accumulata:
     * su una risposta lunga i byte trasferiti crescono col QUADRATO della
     * lunghezza, mentre il modello ne produce in modo lineare.
     */
    size_t text_drained = 0;

    /**
     * Il tempo fino alla prima parola, SPEZZATO.
     *
     * «Nove secondi» non è una diagnosi: è la somma di tokenizzazione, prefisso
     * ricalcolato, prefill, prima decodifica e ponte. Senza separarle qualunque
     * intervento ha una probabilità su cinque di toccare la parte giusta — e le
     * cinque parti si riparano in modi completamente diversi.
     *
     * Millisecondi dall'ingresso in JNI, non orari assoluti: un orologio che
     * l'utente può spostare non serve a misurare durate.
     */
    struct talos_cronometro {
        long long tokenizzazione_ms = -1;
        long long prefisso_ms       = -1;
        long long prefill_ms        = -1;
        long long primo_token_ms    = -1;
        long long totale_ms         = -1;
        int       token_prompt      = 0;
        int       token_riusati     = 0;
        int       token_nuovi       = 0;
        int       token_prodotti    = 0;
        bool      contesto_riusato  = false;
    };
    std::mutex       tempi_lock;
    talos_cronometro tempi;

    /**
     * Il template VERO del modello, eseguito da un motore Jinja.
     *
     * Non è la stessa cosa di prima con un nome diverso.
     * `llama_chat_apply_template`, l'API di basso livello che usavamo, **non
     * esegue mai** il Jinja che sta nel GGUF: lo passa a
     * `llm_chat_detect_template`, che lo ANNUSA cercando sottostringhe, e poi
     * applica una reimplementazione C++ cablata della famiglia indovinata. Per
     * qualunque Qwen3 il verdetto è «CHATML» e ne esce ChatML nudo.
     *
     * Ciò che va perso in quel passaggio è esattamente ciò che l'owner ha
     * segnalato: la logica `enable_thinking` (che decide se i tag `<think>` li
     * scrive il template o li deve inventare il modello) e l'intero blocco
     * `<tools>`. Da lì i tag di ragionamento stampati nel corpo e
     * l'impossibilità di offrire un tool a un modello locale — che sono la
     * stessa mancanza, non due.
     */
    common_chat_templates_ptr templates;

    /**
     * Come rileggere ciò che il modello ha appena detto.
     *
     * `common_chat_templates_apply` restituisce, insieme al prompt, il FORMATO
     * con cui quel modello parlerà: dove mette il ragionamento, come annuncia
     * una chiamata. Va conservato fra la formattazione e la lettura, perché è
     * il ponte fra le due — e senza, `common_chat_parse` non sa che cosa sta
     * leggendo e restituisce tutto come contenuto, cioè il difetto di prima
     * scritto in modo più moderno.
     */
    common_chat_params chat;
    bool               chat_ready = false;

    /**
     * I parametri con cui il campionatore e' stato costruito all'apertura.
     *
     * Conservati perche' la GRAMMATICA arriva dopo: la restituisce
     * `common_chat_templates_apply` insieme al prompt, e cambia a ogni
     * messaggio (dipende da quali tool sono offerti). Ricostruire il
     * campionatore vuol dire ripartire da questi, non da zero, altrimenti a
     * ogni turno si perderebbero temperatura e filtri.
     */
    common_params_sampling sampling;
};

/**
 * Quello che llama.cpp chiede MENTRE calcola: «devo fermarmi?».
 *
 * `noexcept` non è decorazione: viene invocata dall'interno di codice C, e
 * un'eccezione che lo attraversasse porterebbe giù il processo. `relaxed`
 * basta: l'unica cosa che conta è che il valore arrivi presto, e chi lo scrive
 * non deve ordinare nient'altro attorno.
 */
bool talos_deve_fermarsi(void * opaco) noexcept {
    auto * session = static_cast<talos_session *>(opaco);
    return session != nullptr && session->cancelled.load(std::memory_order_relaxed);
}

/** Millisecondi da un istante, con un orologio che nessuno può spostare. */
long long talos_da(const std::chrono::steady_clock::time_point & inizio) {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - inizio).count();
}

/**
 * Quanti token in testa sono gli stessi. È tutto il guadagno, in tre righe.
 *
 * ⛔ Non arriva MAI a coprire l'intero prompt nuovo: se combaciasse per intero
 * non resterebbe niente da decodificare, e il campionatore lavorerebbe sui
 * logit del turno precedente — cioè risponderebbe alla domanda di prima. Si
 * lascia sempre almeno un token da rielaborare.
 */
size_t talos_prefisso_comune(const std::vector<llama_token> & vecchi,
                             const std::vector<llama_token> & nuovi) {
    const size_t tetto = std::min(vecchi.size(), nuovi.size());
    size_t comune = 0;
    while (comune < tetto && vecchi[comune] == nuovi[comune]) comune += 1;
    if (comune >= nuovi.size() && comune > 0) comune = nuovi.size() - 1;
    return comune;
}

/**
 * Quante volte un modello e' stato aperto da quando il processo e' partito.
 *
 * ⛔ Sembra un dettaglio da niente ed e' la diagnosi che mancava. MISURATO dal
 * registro dell'owner il 2026-08-06: il primo messaggio impiegava **111
 * secondi** prima della prima parola, e i giri successivi 195 millisecondi.
 * La causa era che il modello veniva aperto **due volte** — una col contesto
 * predefinito, e subito dopo di nuovo per allargarlo, buttando gigabyte di pesi
 * gia' caricati.
 *
 * Un numero che dice «2» dove dovrebbe dire «1» rende quel difetto visibile in
 * un istante, invece che dopo aver letto una traccia di trecento righe.
 */
std::atomic<int> g_open_count{0};

/**
 * Quante volte il CONTESTO e' stato ricostruito tenendo il modello in memoria.
 *
 * Distinto dalle aperture apposta: un contesto ricostruito costa millisecondi,
 * un modello riaperto costa i gigabyte. Sommarli nasconderebbe la differenza
 * che questo lavoro esiste per creare.
 */
std::atomic<int> g_context_rebuild_count{0};

std::once_flag g_init_once;

void talos_log_bridge(ggml_log_level level, const char * text, void * /*user*/) {
    if (text == nullptr) return;
    // I log di llama.cpp finiscono in logcat: senza, un caricamento fallito sul
    // telefono è un valore di ritorno nullo e nient'altro. I livelli si
    // rispettano invece di appiattirli su INFO: il caricamento di un modello
    // stampa una riga per tensore, e centinaia di righe a INFO seppelliscono
    // l'unica che conta.
    int priority;
    switch (level) {
        case GGML_LOG_LEVEL_ERROR: priority = ANDROID_LOG_ERROR; break;
        case GGML_LOG_LEVEL_WARN:  priority = ANDROID_LOG_WARN;  break;
        case GGML_LOG_LEVEL_INFO:  priority = ANDROID_LOG_INFO;  break;
        default:                   priority = ANDROID_LOG_DEBUG; break;
    }
    __android_log_print(priority, TALOS_TAG, "%s", text);
}
/**
 * ⛔ Porta `stderr` dentro logcat, una volta sola.
 *
 * ## Perche' serve, con un caso vero
 *
 * llama.cpp scrive i propri errori di dettaglio con `fprintf(stderr, ...)`. Su
 * Android `stderr` non va da nessuna parte: il messaggio esiste, e nessuno lo
 * legge mai. MISURATO il 2026-08-08: la grammatica per 46 tool non si compila e
 * il registro dice soltanto «failed to parse grammar» — che e' il testo
 * dell'eccezione, non la diagnosi. La diagnosi vera, con la regola e il punto in
 * cui il parser si e' fermato, la scrive il parser su `stderr` e finiva nel
 * nulla. Lo stesso era gia' successo con `ggml_abort` dentro `llama_decode`:
 * l'app moriva e il tombstone non diceva perche'.
 *
 * ## Come
 *
 * Una pipe: `stderr` scrive dentro, un filo legge fuori e ripete su logcat. E'
 * il metodo che usa l'esempio Android di llama.cpp. Il filo e' `detach`ato e
 * vive quanto il processo — non c'e' niente da chiudere, e chiuderlo
 * significherebbe tornare a perdere i messaggi.
 */
void portaStderrNelLog() {
    static bool gia_fatto = false;
    if (gia_fatto) return;
    gia_fatto = true;

    static int tubo[2];
    if (pipe(tubo) != 0) return;
    // Senza buffer: un errore che arriva a meta' e' peggio di uno che tarda.
    setvbuf(stderr, nullptr, _IONBF, 0);
    dup2(tubo[1], STDERR_FILENO);

    std::thread([] {
        char pezzo[512];
        std::string riga;
        for (;;) {
            const ssize_t letti = read(tubo[0], pezzo, sizeof(pezzo) - 1);
            if (letti <= 0) return;
            pezzo[letti] = '\0';
            riga += pezzo;
            size_t fine;
            while ((fine = riga.find('\n')) != std::string::npos) {
                if (fine > 0) TALOS_LOGE("%s", riga.substr(0, fine).c_str());
                riga.erase(0, fine + 1);
            }
            // Una riga senza fine riga non si perde: si tiene per il pezzo dopo.
            if (riga.size() > 4096) { TALOS_LOGE("%s", riga.c_str()); riga.clear(); }
        }
    }).detach();
}


void talos_init_once(const std::string & library_dir) {
    std::call_once(g_init_once, [&library_dir]() {
        llama_log_set(talos_log_bridge, nullptr);
        // Con GGML_BACKEND_DL i backend sono .so caricati a runtime, e ggml li
        // cerca ELENCANDO una cartella (`fs::directory_iterator` in
        // ggml-backend-reg.cpp). Le sue supposizioni — la cartella
        // dell'eseguibile, quella corrente — su Android valgono
        // `/system/bin/app_process` e `/`: nessuna delle due contiene niente.
        // Quindi il percorso glielo diciamo noi, ed è quello che Android
        // riserva alle librerie di QUESTA applicazione.
        portaStderrNelLog();
        if (!library_dir.empty()) {
            ggml_backend_load_all_from_path(library_dir.c_str());
        } else {
            ggml_backend_load_all();
        }
        llama_backend_init();
        const size_t registered = ggml_backend_reg_count();
        TALOS_LOGI("backend registrati: %zu (da %s)", registered,
                   library_dir.empty() ? "(percorsi predefiniti)" : library_dir.c_str());
        if (registered == 0) {
            // Un motore senza backend non è un motore lento: non carica nulla.
            // Detto qui, dove la causa è ancora visibile, invece che più tardi
            // come un modello che «non si apre».
            TALOS_LOGE("nessun backend: la cartella %s non contiene libggml-*.so. "
                       "Su Android serve extractNativeLibs=true, altrimenti le "
                       "librerie restano dentro l'APK e non sono elencabili.",
                       library_dir.c_str());
        }
    });
}

std::string jstring_to_utf8(JNIEnv * env, jstring value) {
    if (value == nullptr) return {};
    const char * raw = env->GetStringUTFChars(value, nullptr);
    if (raw == nullptr) return {};
    std::string out(raw);
    env->ReleaseStringUTFChars(value, raw);
    return out;
}

/**
 * Il prompt formattato dal template del modello, senza toccare una sessione.
 *
 * Estratto perche' serve in due posti che non condividono niente: la chat, che
 * ha un modello aperto, e il PIANIFICATORE, che ha solo un vocabolario. Le
 * regole del formato — Jinja eseguito, tool passati al template, ragionamento
 * gestito dal template — devono essere le stesse in entrambi, o il conteggio
 * fatto prima descriverebbe un prompt diverso da quello che parte.
 */
std::string talos_apply_chat_template(common_chat_templates * templates, JNIEnv * env,
                                      jstring messagesJson,
                                      jstring toolsJson, bool pensa) {
    if (templates == nullptr || messagesJson == nullptr) return {};

    common_chat_templates_inputs inputs;
    inputs.add_generation_prompt = true;
    const std::string messages = jstring_to_utf8(env, messagesJson);
    try {
        inputs.messages = common_chat_msgs_parse_oaicompat(
                nlohmann::ordered_json::parse(messages));
    } catch (const std::exception &) {
        // Anche il testo dell'eccezione di un parser può citare il frammento
        // rifiutato: il codice stabile basta, la conversazione non va in log.
        TALOS_LOGE("messaggi chat non interpretabili");
        return {};
    }
    if (inputs.messages.empty()) return {};
    const std::string tools = jstring_to_utf8(env, toolsJson);
    if (!tools.empty()) {
        try {
            inputs.tools = common_chat_tools_parse_oaicompat(nlohmann::ordered_json::parse(tools));
            inputs.tool_choice = COMMON_CHAT_TOOL_CHOICE_AUTO;
        } catch (const std::exception &) {
            // Un tool illeggibile non spegne il conteggio: si procede senza,
            // e il numero sara' un po' piu' basso del vero — che e' la
            // direzione innocua, perche' il tetto si controlla comunque dopo.
        }
    }
    inputs.use_jinja = true;
    inputs.reasoning_format = COMMON_REASONING_FORMAT_AUTO;
    /**
     * ⛔ IL RAGIONAMENTO SI CHIEDE, e non lo chiedevamo mai.
     *
     * `enable_thinking` nasce a `true` in llama.cpp e noi non lo toccavamo:
     * quindi TALOS domandava a Qwen3 di ragionare **anche per «ciao»**,
     * ignorando l'impostazione della persona. MISURATO sul Pad il 2026-08-08:
     * per rispondere «Ciao! Come posso aiutarti oggi?» il modello ha prodotto
     * **105 token**, di cui una decina di risposta e il resto di pensiero — a
     * 4,3 token al secondo sono venticinque secondi spesi per non dire niente.
     *
     * Non e' censura del ragionamento: e' non pagarlo dove nessuno l'ha
     * chiesto. Chi lo accende continua ad averlo.
     */
    inputs.enable_thinking = pensa;
    try {
        return common_chat_templates_apply(templates, inputs).prompt;
    } catch (const std::exception &) {
        return {};
    }
}

/**
 * La mappa delle capability del Jinja DEL GGUF, non una classificazione
 * indovinata dal nome del modello. Il template può contenere IP, istruzioni o
 * testo dell'utente: qui attraversano il confine soltanto tre booleani stabili.
 */
std::string talos_template_capabilities_json(common_chat_templates * templates) {
    if (templates == nullptr) return {};
    try {
        const std::map<std::string, bool> caps = common_chat_templates_get_caps(templates);
        const auto value_of = [&caps](const char * key) {
            const auto found = caps.find(key);
            // Un campo assente non è supporto implicito. L'API upstream
            // corrente lo restituisce sempre; il ripiego protegge un futuro
            // cambiamento di forma senza promuovere una sintassi inesistente.
            return found != caps.end() && found->second;
        };
        nlohmann::ordered_json out;
        out["supportsTools"] = value_of("supports_tools");
        out["supportsToolCalls"] = value_of("supports_tool_calls");
        out["supportsSystemRole"] = value_of("supports_system_role");
        return out.dump();
    } catch (const std::exception &) {
        TALOS_LOGE("capability del template non leggibili");
        return {};
    }
}


/**
 * ⛔⛔⛔ LA SERRATURA DEL MOTORE — e sta FUORI dalla sessione, di proposito.
 *
 * Il difetto che chiude: applyGrammar() esegue common_sampler_free(session->sampler)
 * e rimette un campionatore nuovo, mentre nativeGenerate() dereferenzia lo stesso
 * puntatore per campionare. Due thread, uno libera e l'altro legge: non una race
 * di valore, un USE-AFTER-FREE.
 *
 * ## Perché GLOBALE e non un campo di talos_session
 *
 * Perché nativeClose() distrugge la sessione. Una serratura che vive dentro
 * l'oggetto distrutto non può proteggere la sua stessa distruzione: se un thread
 * la sta aspettando quando l'oggetto muore, il comportamento non è definito —
 * si sarebbe scambiato un difetto con uno più difficile da vedere.
 *
 * Una serratura globale sopravvive a qualunque sessione, quindi anche la chiusura
 * può prenderla. E non costa niente: TALOS tiene aperto un modello alla volta.
 *
 * ## ⛔ Chi NON la prende, e non è una svista
 *
 *     nativeTokensProduced    atomico
 *     nativeTextSoFar         text_lock suo
 *     nativeCancel            atomico
 *     nativeLastTimings       tempi_lock suo
 *
 * Sono le VEDETTE: il loro mestiere è rispondere «a che punto sei?» MENTRE la
 * generazione va avanti. Se prendessero questa serratura aspetterebbero la fine
 * della generazione per dire a che punto è — cioè risponderebbero sempre alla
 * domanda sbagliata, e la barra di avanzamento si riempirebbe tutta insieme
 * alla fine. E `cancel` in particolare aspetterebbe la cosa che deve fermare.
 *
 * ⛔ La si prende solo agli ingressi JNI, mai negli helper: applyGrammar() è
 * chiamata da dentro un ingresso già chiuso a chiave, e prenderla di nuovo
 * bloccherebbe il thread contro se stesso.
 */
static std::mutex g_motore;

talos_session * as_session(jlong handle) {
    return reinterpret_cast<talos_session *>(handle);
}

/**
 * Rimette in piedi il campionatore con la grammatica che il template ha
 * restituito — ed e' questo che trasforma «il modello prova a chiamare un tool»
 * in «la chiamata e' valida per costruzione».
 *
 * GBNF vincola l'uscita, e la documentazione di llama.cpp e' esplicita su cosa
 * costa: «The JSON schema is only used to constrain the model output and is not
 * injected into the prompt» — quindi non consuma contesto, che su un 4B conta.
 *
 * PIGRA, e non e' un dettaglio. Una grammatica sempre attiva costringerebbe il
 * modello a emettere una chiamata a OGNI messaggio, anche a «ciao»: i
 * `grammar_triggers` sono i punti in cui il vincolo si accende, e senza di loro
 * un modello con dei tool offerti smetterebbe semplicemente di parlare
 * italiano.
 *
 * I `preserved_tokens` vanno tradotti da stringhe a identificativi, perche' il
 * campionatore ragiona su token e non su testo. Si tengono solo quelli che il
 * vocabolario rende con UN token: una stringa che ne produce due non e' un
 * token speciale di questo modello, e proteggerla a meta' non vuol dire niente.
 */
void applyGrammar(talos_session * session) {
    common_params_sampling sampling = session->sampling;
    if (session->chat.grammar.empty()) {
        sampling.grammar = common_grammar();
        sampling.grammar_lazy = false;
        sampling.grammar_triggers.clear();
        sampling.preserved_tokens.clear();
    } else {
        sampling.grammar = common_grammar(COMMON_GRAMMAR_TYPE_TOOL_CALLS, session->chat.grammar);
        sampling.grammar_lazy = session->chat.grammar_lazy;
        sampling.grammar_triggers = session->chat.grammar_triggers;
        sampling.preserved_tokens.clear();
        size_t protetti_scartati = 0;
        for (const std::string & piece : session->chat.preserved_tokens) {
            const std::vector<llama_token> ids =
                    common_tokenize(session->vocab, piece, /*add_special*/ false, /*parse_special*/ true);
            if (ids.size() == 1) sampling.preserved_tokens.insert(ids[0]);
            else protetti_scartati += 1;
        }
        /*
         * ⛔ Gli INNESCHI, stampati per nome.
         *
         * MISURATO il 2026-08-08: dopo che la grammatica ha ricominciato a
         * compilare, il modello locale ha smesso di emettere chiamate — e ha
         * risposto «Fatto, torcia spenta» senza aver fatto niente. La
         * grammatica e' PIGRA con **un solo innesco**: se quell'innesco non
         * scatta, il vincolo non si accende mai e non esce nessuna chiamata.
         *
         * Finche' il registro diceva soltanto «grammatica: pigra» non c'era
         * niente su cui lavorare. Un innesco ha un tipo e una parola: si
         * scrivono, e la prossima volta si sa se il modello quella parola la
         * produce oppure no. Stesso rimedio della GBNF da 55.871 byte, dove
         * bastava vedere il messaggio del parser.
         */
        for (const common_grammar_trigger & innesco : sampling.grammar_triggers) {
            TALOS_LOGI("  innesco: tipo=%d valore=\"%.80s\"",
                       (int) innesco.type, innesco.value.c_str());
        }
        if (protetti_scartati > 0) {
            // Un token protetto che il vocabolario rende con PIU' di un token
            // non e' protetto a meta': non lo e' affatto.
            TALOS_LOGI("  token protetti scartati (non atomici): %zu", protetti_scartati);
        }
    }

    common_sampler * rebuilt = nullptr;
    try {
        rebuilt = common_sampler_init(session->model, sampling);
    } catch (const std::exception & failure) {
        /**
         * `common_sampler_init` NON segnala una GBNF non compilabile con
         * `nullptr`: lancia `std::runtime_error`. Se esce da JNI, libc++ chiama
         * terminate() e Android abbatte l'intera app — il tombstone C2 lo ha
         * provato con Qwen3 e il toolset reale.
         *
         * Il server ufficiale dello stesso pin cattura questa eccezione al
         * proprio confine. Qui il contratto di prodotto e' piu' tollerante: il
         * template e il parser restano validi, quindi perdiamo soltanto il
         * vincolo per costruzione e lasciamo che il modello risponda.
         */
        /*
         * ⛔ Il MOTIVO, non solo il fatto. MISURATO sul Pad il 2026-08-08: la
         * GBNF pigra non si carica, e senza vincolo il modello riscrive la
         * chiamata come testo libero — cinque volte per una torcia sola. Finche'
         * il registro diceva soltanto «failed to parse grammar» non c'era niente
         * su cui lavorare: ne' quanto e' lunga, ne' da dove comincia, ne' se e'
         * arrivata vuota. Ora la prima riga si vede, e con quella si va avanti.
         */
        const std::string & gbnf = session->chat.grammar;
        TALOS_LOGE("grammatica non applicabile (%s), riprovo senza vincolo", failure.what());
        TALOS_LOGE("  GBNF: %zu byte, pigra=%s, %zu inneschi, %zu token protetti",
                   gbnf.size(),
                   session->chat.grammar_lazy ? "si" : "no",
                   session->chat.grammar_triggers.size(),
                   session->chat.preserved_tokens.size());
        TALOS_LOGE("  inizio: %.200s", gbnf.empty() ? "(vuota)" : gbnf.c_str());
    }

    if (rebuilt == nullptr && !session->chat.grammar.empty()) {
        // Ripartire dai parametri BASE e' importante: riusare `sampling`
        // riproporrebbe la stessa grammatica; tenere il sampler precedente
        // potrebbe invece trascinare la grammatica del turno prima.
        common_params_sampling fallback = session->sampling;
        try {
            rebuilt = common_sampler_init(session->model, fallback);
        } catch (const std::exception & fallback_failure) {
            // Anche il piano B sta dentro il confine. In questo caso si tiene
            // il sampler vivo precedente: una risposta puo' fallire, il
            // processo no.
            TALOS_LOGE("campionatore senza grammatica non costruibile (%s)", fallback_failure.what());
            return;
        }
    }

    if (rebuilt == nullptr) {
        TALOS_LOGE("campionatore non ricostruito, tengo quello precedente");
        return;
    }
    if (session->sampler != nullptr) common_sampler_free(session->sampler);
    session->sampler = rebuilt;
}

} // namespace

extern "C" {

/**
 * Registra i backend, una volta sola, dalla cartella delle librerie dell'app.
 * Va chiamata prima di ogni altra cosa; chiamarla due volte non fa niente.
 */
JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeInit(JNIEnv * env, jclass, jstring libraryDir) {
    talos_init_once(jstring_to_utf8(env, libraryDir));
}

/** La build di llama.cpp, per l'impronta dei prefissi congelati. */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeEngineBuild(JNIEnv * env, jclass) {
    const char * info = llama_build_info();
    return env->NewStringUTF(info == nullptr ? "" : info);
}

JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeBackends(JNIEnv * env, jclass) {
    std::string names;
    for (size_t index = 0; index < ggml_backend_reg_count(); index += 1) {
        if (!names.empty()) names += ",";
        names += ggml_backend_reg_name(ggml_backend_reg_get(index));
    }
    return env->NewStringUTF(names.c_str());
}

/**
 * Apre un modello. Restituisce 0 in caso di fallimento — mai un handle a metà:
 * un oggetto costruito per metà è la forma in cui i guasti sopravvivono al
 * punto in cui sono nati.
 */
JNIEXPORT jlong JNICALL
Java_ai_talos_TalosLlamaNative_nativeOpen(JNIEnv * env, jclass, jstring modelPath,
                                          jint threads, jint contextTokens, jint gpuLayers,
                                          jboolean deterministic, jint threadsBatch,
                                          jint microBatch, jstring kvType) {
    talos_last_open_error.clear();
    const std::string path = jstring_to_utf8(env, modelPath);
    if (path.empty()) {
        talos_last_open_error = "path";
        TALOS_LOGE("percorso del modello vuoto");
        return 0;
    }

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = gpuLayers;

    llama_model * model = llama_model_load_from_file(path.c_str(), model_params);
    if (model == nullptr) {
        talos_last_open_error = "model-load";
        TALOS_LOGE("modello non caricato: %s", path.c_str());
        return 0;
    }

    llama_context_params ctx_params = llama_context_default_params();
    // 0 significa "quello con cui il modello è stato addestrato": la scelta
    // giusta quando il chiamante non ha motivo di imporne un'altra.
    ctx_params.n_ctx           = contextTokens > 0 ? (uint32_t) contextTokens : 0;
    // Non è il tetto di quanto prompt si può mandare — è la dimensione dei
    // pezzi in cui `nativeGenerate` lo taglia. Tenerla piccola tiene piccoli i
    // buffer di calcolo su un telefono; era pericolosa solo finché qualcuno
    // consegnava il prompt intero in una volta.
    ctx_params.n_batch         = 512;
    /**
     * ⛔ IL MICROBATCH, che finora non esisteva.
     *
     * `n_batch` è il batch LOGICO — quanti token si possono consegnare a
     * `llama_decode` in una volta. `n_ubatch` è quello FISICO — quanti ne
     * entrano davvero in un lancio di kernel. Erano lo stesso numero solo
     * perché nessuno impostava il secondo, e la libreria lo lasciava al suo
     * valore da scrivania.
     *
     * Contano due cose opposte: un microbatch grande fa correre il prefill e
     * gonfia i buffer di calcolo; uno piccolo tiene bassa la memoria e rende
     * Stop più pronto, perché l'attesa massima per fermarsi è **un microbatch
     * intero**. Su un telefono con 4,5 GB liberi la seconda metà pesa quanto la
     * prima, e va scelta guardando, non ereditata.
     */
    ctx_params.n_ubatch        = microBatch > 0 ? (uint32_t) microBatch : 256;
    /**
     * ⭐ DUE NUMERI, non uno.
     *
     * Erano lo stesso valore, e sono due carichi opposti. Il **prefill** macina
     * matrici per matrici: si spalma sui core e vuole tutti quelli che il
     * sistema concede. La **generazione** produce un token per volta ed è
     * legata alla banda di memoria: oltre un certo punto i thread in più non
     * calcolano di più, si contendono la stessa memoria e rubano tempo
     * all'interfaccia.
     *
     * MISURATO sul Pad 2026-08-06: otto core, sei a capacità 792 e due a 1024,
     * nessuno lento. Non è il classico big.LITTLE, e trattarlo come tale
     * sarebbe stato sbagliato in entrambe le direzioni. Chi chiama passa i due
     * numeri; qui non si indovina più.
     */
    ctx_params.n_threads       = threads > 0 ? threads : 4;
    ctx_params.n_threads_batch = threadsBatch > 0 ? threadsBatch : ctx_params.n_threads;
    ctx_params.no_perf         = true;

    /**
     * ⛔ FERMARE DAVVERO, non fra un pezzo e l'altro.
     *
     * Il flag `cancelled` c'era già, ma veniva letto SOLO fra un chunk di
     * prefill e il successivo. Dentro una singola `llama_decode` non c'è niente
     * che guardi: con un prompt lungo, premere Stop non fermava niente per
     * secondi, ed è esattamente ciò che l'owner ha visto sul dispositivo.
     *
     * Questa callback llama.cpp la interroga MENTRE calcola. Quando dice sì,
     * `llama_decode` torna 2 e il lavoro si ferma dov'è.
     *
     * ⚠️ L'header dichiara, testuale: «currently works only with CPU
     * execution». Se un giorno accenderemo un backend GPU o NPU, questa strada
     * smette di funzionare e Stop torna a essere quello di prima. Va saputo
     * adesso, non scoperto allora.
     */
    ctx_params.abort_callback = nullptr;   // armata sotto, quando la sessione esiste
    ctx_params.abort_callback_data = nullptr;

    /**
     * ⭐ LA CACHE DELLE CHIAVI, più leggera — se questo modello lo permette.
     *
     * La KV è il secondo consumatore di memoria dopo i pesi, e su un contesto
     * lungo diventa il primo: per un modello con 28 strati, 8 teste KV e testa
     * da 128, in f16 sono **112 KiB per token** — cioè 1,63 GB a 14.202 token,
     * su un telefono che ne ha 4,5 liberi. In `q8_0` scende del **47%**, e
     * quello che si libera diventa contesto: quasi il doppio di conversazione
     * nella stessa memoria.
     *
     * ⛔ Ma `type_k` e `type_v` sono marcati `[EXPERIMENTAL]` nell'header, e la
     * compatibilità dipende dalla combinazione backend × modello × tipo K ×
     * tipo V × Flash Attention. Non si deduce da una tabella: **la creazione
     * del contesto È il collaudo**. Se fallisce, si riprova in f16 e si dice
     * quale ha vinto — un modello che non regge la cache leggera deve
     * funzionare comunque, solo con meno contesto.
     */
    const std::string tipoKv = jstring_to_utf8(env, kvType);
    const bool vuoleLeggera = tipoKv == "q8_0";
    if (vuoleLeggera) {
        ctx_params.type_k = GGML_TYPE_Q8_0;
        ctx_params.type_v = GGML_TYPE_Q8_0;
        // Alcune combinazioni con V quantizzata passano solo per la strada
        // della Flash Attention. `AUTO` lascia decidere alla libreria, che sa
        // cosa questo backend sa fare; imporla sarebbe indovinare al posto suo.
        ctx_params.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_AUTO;
    }

    llama_context * ctx = llama_init_from_model(model, ctx_params);
    if (ctx == nullptr && vuoleLeggera) {
        // Il collaudo ha risposto no. Non è un guasto: è il modo in cui si
        // scopre, e l'unico che non richieda una tabella di modelli da tenere
        // aggiornata a mano.
        TALOS_LOGI("cache KV q8_0 rifiutata da questo modello: si torna a f16");
        ctx_params.type_k = GGML_TYPE_F16;
        ctx_params.type_v = GGML_TYPE_F16;
        ctx = llama_init_from_model(model, ctx_params);
    }
    if (ctx == nullptr) {
        talos_last_open_error = "context";
        TALOS_LOGE("contesto non creato");
        llama_model_free(model);
        return 0;
    }

    /**
     * COME SI SCEGLIE IL TOKEN. Qui stava metà del difetto che l'owner ha visto.
     *
     * La catena era `greedy` e basta — nessuna temperatura, nessun top-p,
     * nessun min-p, nessuna penalità — e il commento diceva perché: serviva a
     * far produrre a CPU e GPU *lo stesso identico testo*, altrimenti il
     * confronto fra backend non dice nulla. È un requisito vero, ma del BANCO
     * DI PROVA, e si era preso anche la chat.
     *
     * Greedy prende sempre l'argmax. Su un 4B quantizzato a 4 bit l'errore di
     * quantizzazione sposta i logit di poco, e quando due candidati sono quasi
     * pari greedy si impegna su quello che sta avanti di un millesimo — senza
     * alcun pavimento che rifiuti i token implausibili. Un modello multilingue
     * ha token quasi gemelli fra alfabeti diversi, e da lì escono
     * «non sono in grado di известны il futuro» e «l'es如果你对 su dispositivo»:
     * non traduzioni sbagliate, ma token sbagliati scelti a metà parola
     * ([[local-model-think-tags-and-token-soup]]).
     *
     * I valori NON sono inventati: sono i predefiniti di `common_params_sampling`,
     * cioè esattamente quelli con cui gira `llama-cli` — top_k 40, top_p 0,95,
     * **min_p 0,05**, temp 0,80. Il min_p è il pezzo che conta: scarta ogni
     * token sotto il 5% della probabilità del migliore, che è precisamente il
     * meccanismo che avrebbe tagliato «известны».
     *
     * Il banco di prova non perde niente: con `temp = 0` la catena a monte
     * finisce comunque su `dist`, ma la distribuzione è un solo picco, quindi
     * l'esito è l'argmax e resta deterministico. I filtri prima (top_k, top_p,
     * min_p) non possono togliere il massimo, per costruzione.
     */
    common_params_sampling sampling;
    if (deterministic) sampling.temp = 0.0f;
    common_sampler * sampler = common_sampler_init(model, sampling);
    if (sampler == nullptr) {
        talos_last_open_error = "sampler";
        TALOS_LOGE("campionatore non costruito");
        llama_free(ctx);
        llama_model_free(model);
        return 0;
    }

    auto * session = new talos_session();
    session->model   = model;
    session->ctx     = ctx;
    session->sampler = sampler;
    session->vocab   = llama_model_get_vocab(model);
    session->sampling = sampling;
    // Quale cache ha VINTO, non quale era stata chiesta. Chi calcola quanto
    // contesto ci sta deve sapere quanto pesa un token davvero, e dopo un
    // ripiego silenzioso i due numeri sarebbero diversi.
    session->kv_type = ctx_params.type_k == GGML_TYPE_Q8_0 ? "q8_0" : "f16";

    // Armata QUI e non nei parametri del contesto: la callback ha bisogno
    // dell'indirizzo della sessione, che un istante fa non esisteva ancora.
    // `llama_set_abort_callback` fa esattamente questo, e senza ricreare niente.
    llama_set_abort_callback(ctx, talos_deve_fermarsi, session);

    // Costruito una volta, all'apertura: compilare un template Jinja a ogni
    // messaggio sarebbe lavoro rifatto identico per tutta la conversazione.
    // Un modello senza template non è un errore fatale — la formattazione lo
    // dirà al chiamante — ma è un fatto da registrare qui, dove si vede.
    try {
        session->templates = common_chat_templates_init(model, "");
    } catch (const std::exception & failure) {
        TALOS_LOGE("template non inizializzabile: %s", failure.what());
    }

    g_open_count.fetch_add(1, std::memory_order_relaxed);
    TALOS_LOGI("modello aperto: %s (contesto %u, thread %d gen / %d prefill, microbatch %u)",
               path.c_str(), llama_n_ctx(ctx), ctx_params.n_threads,
               ctx_params.n_threads_batch, llama_n_ubatch(ctx));
    return reinterpret_cast<jlong>(session);
}

JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeLastOpenError(JNIEnv * env, jclass) {
    const char * stage = talos_last_open_error.empty()
            ? "unknown"
            : talos_last_open_error.c_str();
    return env->NewStringUTF(stage);
}

JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeTokensProduced(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    return session == nullptr ? 0 : session->produced.load(std::memory_order_relaxed);
}

/**
 * Formatta una conversazione col template DEL MODELLO.
 *
 * Non è rifinitura: ogni famiglia di modelli è stata addestrata su una
 * punteggiatura di ruoli sua — `<|im_start|>`, `[INST]`, `<|start_header_id|>` —
 * e darle quella sbagliata non produce un errore, produce risposte peggiori.
 * Il difetto si presenta come «questo modello locale è scarso», che è il modo
 * più costoso in cui un difetto possa presentarsi, perché manda a cambiare
 * modello invece che a cambiare prompt.
 *
 * Il template sta dentro il GGUF: lo chiediamo al modello invece di indovinarlo.
 * Se il file non ne porta uno, restituiamo stringa vuota e lo dice il chiamante:
 * inventare un formato «ragionevole» sarebbe esattamente l'errore descritto qui
 * sopra, commesso di proposito.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeApplyChatTemplate(JNIEnv * env, jclass, jlong handle,
                                                       jstring messagesJson,
                                                       jstring toolsJson, jboolean pensa) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");

    if (session->templates == nullptr) {
        TALOS_LOGE("il GGUF non porta un template di chat");
        return env->NewStringUTF("");
    }

    common_chat_templates_inputs inputs;
    inputs.add_generation_prompt = true;
    const std::string messages = jstring_to_utf8(env, messagesJson);
    try {
        inputs.messages = common_chat_msgs_parse_oaicompat(
                nlohmann::ordered_json::parse(messages));
    } catch (const std::exception &) {
        // Anche il testo dell'eccezione di un parser può citare il frammento
        // rifiutato: il codice stabile basta, la conversazione non va in log.
        TALOS_LOGE("messaggi chat non interpretabili");
        return env->NewStringUTF("");
    }
    if (inputs.messages.empty()) return env->NewStringUTF("");
    /**
     * I TOOL, passati al template invece che descritti a parole nel prompt.
     *
     * Owner 2026-08-03: «i locali devono avere le stesse possibilita' dei key».
     * Ogni famiglia annuncia una chiamata a modo suo — `<tool_call>`, JSON
     * puro, blocchi speciali — e quel formato sta nel template del GGUF. Qui i
     * tool arrivano nella forma OpenAI che il registro produce gia' per gli
     * altri provider, e il template li rende nella sintassi che QUESTO modello
     * e' stato addestrato a produrre.
     *
     * Un tool illeggibile non spegne la conversazione: si registra e si va
     * avanti senza. Meglio un modello che non puo' chiamare niente di un
     * modello che non risponde.
     */
    const std::string tools = jstring_to_utf8(env, toolsJson);
    if (!tools.empty()) {
        try {
            inputs.tools = common_chat_tools_parse_oaicompat(nlohmann::ordered_json::parse(tools));
            inputs.tool_choice = COMMON_CHAT_TOOL_CHOICE_AUTO;
        } catch (const std::exception & failure) {
            TALOS_LOGE("tool non interpretabili, procedo senza: %s", failure.what());
        }
    }
    // Il punto di tutta la faccenda: il Jinja del modello viene ESEGUITO,
    // invece di essere annusato per indovinare una famiglia.
    inputs.use_jinja = true;
    // Il ragionamento lo gestisce il template, e quindi il parser: è così che
    // i tag smettono di comparire nel corpo della risposta.
    inputs.reasoning_format = COMMON_REASONING_FORMAT_AUTO;
    /**
     * ⛔ IL RAGIONAMENTO SI CHIEDE, e non lo chiedevamo mai.
     *
     * `enable_thinking` nasce a `true` in llama.cpp e noi non lo toccavamo:
     * quindi TALOS domandava a Qwen3 di ragionare **anche per «ciao»**,
     * ignorando l'impostazione della persona. MISURATO sul Pad il 2026-08-08:
     * per rispondere «Ciao! Come posso aiutarti oggi?» il modello ha prodotto
     * **105 token**, di cui una decina di risposta e il resto di pensiero — a
     * 4,3 token al secondo sono venticinque secondi spesi per non dire niente.
     *
     * Non e' censura del ragionamento: e' non pagarlo dove nessuno l'ha
     * chiesto. Chi lo accende continua ad averlo.
     */
    inputs.enable_thinking = pensa == JNI_TRUE;
    try {
        session->chat = common_chat_templates_apply(session->templates.get(), inputs);
        session->chat_ready = true;
    } catch (const std::exception & failure) {
        // Un template Jinja è codice, e codice può rompersi su un modello che
        // non abbiamo mai visto. Detto per nome invece che come prompt vuoto:
        // «questo modello non si formatta» è un'informazione, un prompt vuoto è
        // un mistero.
        TALOS_LOGE("template di chat non applicabile: %s", failure.what());
        /*
         * ⛔⛔ E LA SEQUENZA DEI RUOLI, che è l'unica cosa che serve per capire.
         *
         * MISURATO sul Pad il 2026-08-19 con Gemma 3: il template rifiuta con
         * «Conversation roles must alternate user/assistant/…» e il messaggio
         * dell'eccezione non dice QUALE sequenza gli è arrivata. Senza quella
         * riga si tira a indovinare: due user di fila? un `tool` che il template
         * non conosce? un `system` che sposta gli indici pari?
         *
         * Si stampano SOLO i ruoli — mai il contenuto: una conversazione in
         * logcat sarebbe la cosa peggiore che questo file possa fare.
         */
        std::string ruoli;
        for (const auto & messaggio : inputs.messages) {
            if (!ruoli.empty()) ruoli += ">";
            ruoli += messaggio.role;
        }
        TALOS_LOGE("ruoli ricevuti: %s", ruoli.c_str());
        session->chat_ready = false;
        return env->NewStringUTF("");
    }

    applyGrammar(session);

    TALOS_LOGI("formato di chat: %s (ragionamento: %s, tool: %zu, grammatica: %s)",
               common_chat_format_name(session->chat.format),
               session->chat.supports_thinking ? "si" : "no",
               inputs.tools.size(),
               session->chat.grammar.empty() ? "no" : (session->chat.grammar_lazy ? "pigra" : "sempre"));
    return env->NewStringUTF(session->chat.prompt.c_str());
}

/**
 * Rilegge la risposta separando ciò che il modello ha PENSATO da ciò che ha
 * DETTO.
 *
 * Owner 2026-08-03, con Holo-3.1-4B: la risposta si apriva con `<think></think>`
 * stampati come testo. TALOS ha il cassetto «Ragionamento» e lo usa con i
 * provider di rete; sul motore locale non riconosceva i tag di questo modello e
 * finivano nel corpo.
 *
 * Non è una ripulitura a stringhe, ed è deliberato: la documentazione di Qwen
 * avverte di NON usare parser basati su parole d'arresto per i modelli che
 * ragionano, «because the model may output stopwords in the thought section».
 * Il formato lo conosce il template, quindi la lettura la fa chi il template
 * l'ha applicato.
 *
 * Restituisce JSON perché attraversare JNI una volta con un oggetto costa meno
 * di attraversarlo tre volte con tre stringhe, e perché il prossimo passo
 * aggiunge qui le chiamate ai tool senza cambiare la firma.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeParseReply(JNIEnv * env, jclass, jlong handle, jstring reply) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    const std::string text = jstring_to_utf8(env, reply);
    if (session == nullptr || !session->chat_ready) {
        // Senza un formato non si inventa una lettura: si restituisce il testo
        // come sta, che è ciò che accadeva prima e almeno non perde nulla.
        nlohmann::ordered_json plain;
        plain["content"] = text;
        plain["reasoning"] = "";
        plain["toolCalls"] = nlohmann::ordered_json::array();
        return env->NewStringUTF(plain.dump().c_str());
    }

    nlohmann::ordered_json out;
    try {
        common_chat_parser_params parsing(session->chat);
        parsing.reasoning_format = COMMON_REASONING_FORMAT_AUTO;
        parsing.parser.load(session->chat.parser);
        // `is_partial` falso: questa è la risposta finita. Lo streaming continua
        // a mostrare il testo grezzo mentre arriva, ed è corretto — è alla fine
        // che si decide che cosa era ragionamento.
        common_chat_msg parsed = common_chat_parse(text, false, parsing);

        /*
         * ââ LA CHIAMATA CHE IL PARSER LASCIAVA CADERE, e con lei la verita'.
         *
         * ## Il difetto, riprodotto sul Pad il 2026-08-08
         *
         * Modello locale, tool offerti, grammatica pigra con un solo innesco:
         * `<tool_call>`, tipo parola. Chiesto Â«accendi la torciaÂ», il modello
         * rispondeva Â«Fatto, torcia accesaÂ» e la torcia restava spenta â
         * nessuna scheda di consenso, nessun evento in `dumpsys media.camera`.
         *
         * ## La causa, che sta a monte di noi
         *
         * llama.cpp, issue #20260: il parser `peg-native` riceve TUTTO l'output,
         * e la radice della sua grammatica si aspetta di cominciare da
         * `<tool_call>`. Qualsiasi testo prima â e un modello che ragiona ne
         * produce SEMPRE â fa fallire la lettura. Il fallimento non Ã¨ rumoroso:
         * torna un messaggio senza chiamate, la prosa sopravvive, e quella prosa
         * dice Â«fattoÂ».
         *
         * â Un difetto che trasforma un tool mancato in una BUGIA Ã¨ peggio di
         * un tool che non parte: chi legge Â«fattoÂ» smette di controllare.
         *
         * ## La cura, e perche' questa
         *
         * Se il parser non ha trovato chiamate ma nel testo c'Ã¨ l'innesco, si
         * rilegge DAL marcatore: al parser si consegna esattamente cio' che la
         * sua radice sa leggere. Il ragionamento e la prosa restano quelli della
         * prima lettura, perche' quelli il parser li aveva presi bene.
         *
         * Non tocchiamo llama.cpp e non indoviniamo un formato: usiamo l'innesco
         * che il TEMPLATE ha dichiarato, quindi la correzione vale per ogni
         * modello, anche per quelli che useremo domani.
         */
        std::string testo_visibile = parsed.content;
        if (parsed.tool_calls.empty()) {
            for (const common_grammar_trigger & innesco : session->chat.grammar_triggers) {
                if (innesco.value.empty()) continue;
                const size_t dove = text.find(innesco.value);
                // `dove == 0` vuol dire che il parser aveva gia' il testo giusto
                // e non ha trovato niente lo stesso: non e' questo il caso.
                if (dove == std::string::npos || dove == 0) continue;

                const common_chat_msg riletto =
                        common_chat_parse(text.substr(dove), false, parsing);
                if (riletto.tool_calls.empty()) continue;

                TALOS_LOGI("chiamata recuperata: il parser era inciampato su %zu byte di prefisso "
                           "(innesco \"%.40s\", %zu chiamate)",
                           dove, innesco.value.c_str(), riletto.tool_calls.size());
                parsed.tool_calls = riletto.tool_calls;

                // La prosa si ferma dove comincia la chiamata: il blocco della
                // chiamata non e' testo per la persona.
                const size_t nel_contenuto = testo_visibile.find(innesco.value);
                if (nel_contenuto != std::string::npos) {
                    testo_visibile.erase(nel_contenuto);
                }
                break;
            }
        }

        /*
         * â E se nemmeno cosi' si recupera, lo si DICE.
         *
         * Il caso peggiore non e' la chiamata persa: e' la chiamata persa in
         * silenzio. Finche' questo ramo taceva, l'unica traccia del difetto era
         * una risposta sbagliata in chat, che nessun registro spiegava.
         */
        if (parsed.tool_calls.empty()) {
            for (const common_grammar_trigger & innesco : session->chat.grammar_triggers) {
                if (!innesco.value.empty() && text.find(innesco.value) != std::string::npos) {
                    TALOS_LOGE("â il testo contiene l'innesco \"%.40s\" ma il parser non ha trovato "
                               "NESSUNA chiamata: la risposta che segue potrebbe affermare il falso",
                               innesco.value.c_str());
                    break;
                }
            }
        }

        out["content"] = testo_visibile;
        out["reasoning"] = parsed.reasoning_content;
        /**
         * Le chiamate ai tool, che uscivano di qui gia' prima e venivano
         * buttate.
         *
         * `common_chat_msg` porta `tool_calls` accanto a `content` e
         * `reasoning_content`, popolate dallo stesso parser che conosce il
         * formato di QUESTO modello. Non serviva scrivere un lettore per
         * famiglia — e la documentazione di Qwen avverte esplicitamente di non
         * provarci con parser a parole d'arresto, «because the model may output
         * stopwords in the thought section».
         */
        nlohmann::ordered_json calls = nlohmann::ordered_json::array();
        for (const common_chat_tool_call & call : parsed.tool_calls) {
            nlohmann::ordered_json entry;
            entry["name"] = call.name;
            entry["arguments"] = call.arguments;
            entry["id"] = call.id;
            calls.push_back(std::move(entry));
        }
        out["toolCalls"] = std::move(calls);
    } catch (const std::exception & failure) {
        // Una risposta che non si lascia leggere non è una risposta persa.
        TALOS_LOGE("risposta non interpretabile: %s", failure.what());
        out["content"] = text;
        out["reasoning"] = "";
        out["toolCalls"] = nlohmann::ordered_json::array();
    }
    return env->NewStringUTF(out.dump().c_str());
}

/**
 * ⛔ Quanti byte di `testo` si possono consegnare a Java SENZA tagliare a metà
 * un carattere.
 *
 * ## Il difetto, con il messaggio della macchina virtuale
 *
 * RIPRODOTTO sul Pad il 2026-08-08. L'app muore, e il tombstone dice:
 *
 * ```
 * JNI DETECTED ERROR IN APPLICATION: input is not valid Modified UTF-8:
 * illegal continuation byte 0
 * ```
 * sul filo `talos-llama-watch`, cioe' quello che fotografa il testo mentre la
 * generazione va avanti per mostrarlo in chat.
 *
 * La causa e' semplice e inevitabile: un token non e' un carattere. «è» sta in
 * due byte, un'emoji in quattro, e llama.cpp li puo' emettere in token
 * diversi. Se la fotografia cade in mezzo, l'ultimo carattere e' monco —
 * `NewStringUTF` lo rifiuta e la macchina virtuale **abbatte il processo**.
 * Non e' un carattere sbagliato a schermo: e' l'app che sparisce, e sparisce
 * piu' spesso quanto piu' si scrive in italiano.
 *
 * ## Perche' TAGLIARE e non aggiustare
 *
 * I byte che mancano non sono persi: arrivano col token successivo, e la
 * fotografia dopo li conterra' tutti. Trattenere una coda incompleta per
 * qualche decina di millisecondi e' invisibile; consegnarla e' fatale.
 *
 * Il conto e' quello di UTF-8 e basta: un byte iniziale dice quanti byte segue
 * (110xxxxx due, 1110xxxx tre, 11110xxx quattro), e se dall'ultimo inizio non
 * ce ne sono abbastanza, il carattere non e' ancora arrivato.
 */
size_t talos_utf8_intero(const std::string & testo) {
    const size_t n = testo.size();
    // Si guardano al massimo gli ultimi tre byte: piu' indietro un carattere
    // non puo' cominciare.
    const size_t minimo = n >= 3 ? n - 3 : 0;
    for (size_t i = n; i > minimo; --i) {
        const unsigned char b = (unsigned char) testo[i - 1];
        if ((b & 0xC0) == 0x80) continue;          // byte di continuazione
        const size_t attesi = (b & 0x80) == 0x00 ? 1
                            : (b & 0xE0) == 0xC0 ? 2
                            : (b & 0xF0) == 0xE0 ? 3
                            : (b & 0xF8) == 0xF0 ? 4
                            : 1;                    // byte invalido: passa e basta
        const size_t disponibili = n - (i - 1);
        return disponibili >= attesi ? n : i - 1;
    }
    return n;
}

/**
 * Il testo prodotto finora. Interrogabile mentre la generazione è in corso: è
 * così che la chat mostra le parole mentre arrivano.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeTextSoFar(JNIEnv * env, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");
    std::lock_guard<std::mutex> guard(session->text_lock);
    // ⛔ Mai un carattere a meta': la macchina virtuale non lo perdona.
    return env->NewStringUTF(session->text.substr(0, talos_utf8_intero(session->text)).c_str());
}

/**
 * ⭐⭐⭐ IL DELTA VERO — solo i byte mai consegnati prima.
 *
 * `nativeTextSoFar` copiava tutta la risposta a ogni sguardo (ogni 90 ms), e
 * Java ne mandava a Vue solo la coda nuova. Ma il costo era GIA' stato pagato:
 * il pezzo caro e' la copia native->Java, e quella era l'intera stringa. Su una
 * risposta lunga i byte attraversati crescono col QUADRATO della lunghezza.
 *
 * Questa funzione consegna soltanto i byte da `text_drained` in poi, e avanza il
 * puntatore. Il totale copiato attraverso il ponte torna LINEARE.
 *
 * ⛔ E il confine UTF-8 e' il punto delicato: se la coda nuova finisce a meta' di
 * un carattere multibyte, quel resto NON si manda — si lascia in `text`, non si
 * avanza `drained` oltre, e il prossimo giro lo raccogliera' completo. Mandare
 * mezzo carattere alla macchina virtuale e' un crash, non un carattere strano.
 *
 * ⛔ `nativeTextSoFar` resta: il benchmark e il recupero da errore leggono il
 * testo intero, e non e' quella la strada calda. Questa e' per lo streaming.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeDrainText(JNIEnv * env, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");
    std::lock_guard<std::mutex> guard(session->text_lock);

    const size_t totale = session->text.size();
    // Niente di nuovo: la coda e' vuota, e restituire "" costa una stringa vuota
    // invece dell'intera risposta.
    if (session->text_drained >= totale) return env->NewStringUTF("");

    // I byte non ancora consegnati, tagliati all'ultimo carattere COMPLETO.
    const std::string coda = session->text.substr(session->text_drained);
    const size_t completi = talos_utf8_intero(coda);
    if (completi == 0) {
        // La coda e' solo l'inizio di un carattere multibyte: si aspetta il
        // resto. `drained` NON avanza, cosi' il prossimo giro riparte da qui.
        return env->NewStringUTF("");
    }

    session->text_drained += completi;
    return env->NewStringUTF(coda.substr(0, completi).c_str());
}


JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeCancel(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session != nullptr) session->cancelled.store(true, std::memory_order_relaxed);
}

JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeContextTokens(JNIEnv *, jclass, jlong handle) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    return session == nullptr ? 0 : (jint) llama_n_ctx(session->ctx);
}

/**
 * La cache che è stata creata davvero: `"q8_0"` oppure `"f16"`.
 *
 * Chiedere non è ottenere — la creazione del contesto è il collaudo, e un
 * ripiego silenzioso lascerebbe chi calcola il tetto di contesto convinto che
 * un token pesi la metà di quanto pesa.
 */
/**
 * ⭐ QUESTO FILE È UN MODELLO CON CUI SI PUÒ PARLARE?
 *
 * ## Il difetto
 *
 * Owner 2026-08-06: nel selettore compariva **`mmproj-F16.gguf`**, e sceglierlo
 * dava «questo file non può essere aperto come modello GGUF compatibile». Non è
 * un modello: è il **proiettore** che accompagna un modello visivo, e da solo
 * non risponde a niente. Peggio: appena installato, all'avvio veniva scelto da
 * solo — MISURATO sul Pad, chip a `mmproj-F16` su un'app appena aperta.
 *
 * ## Perché non si filtra il nome
 *
 * «Se si chiama mmproj» è una stringa scritta a mano, contro la regola che
 * TALOS si adatta: un proiettore chiamato in un altro modo passerebbe lo
 * stesso, e un modello vero che contenesse quella parola verrebbe nascosto.
 *
 * Si chiede al file. Un modello di linguaggio **dichiara quanti strati ha**;
 * un proiettore dichiara l'architettura `clip` e non ha `<arch>.block_count`.
 * Non serve enumerare le architetture buone — che sarebbe la stessa lista
 * scritta a mano, spostata — basta chiedere se c'è ciò che serve per parlare.
 *
 * ## Perché costa quasi niente
 *
 * `gguf_init_from_file` con `no_alloc` legge **solo i metadati**: nessun
 * tensore entra in memoria. È la differenza fra guardare la copertina e
 * caricare in RAM otto gigabyte per scoprire che non era un libro.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeArchitectureOf(JNIEnv * env, jclass, jstring modelPath) {
    const std::string path = jstring_to_utf8(env, modelPath);
    if (path.empty()) return nullptr;

    gguf_init_params params = { /*.no_alloc =*/ true, /*.ctx =*/ nullptr };
    gguf_context * gguf = gguf_init_from_file(path.c_str(), params);
    if (gguf == nullptr) return nullptr;

    std::string architettura;
    const int64_t chiave = gguf_find_key(gguf, "general.architecture");
    if (chiave >= 0) architettura = gguf_get_val_str(gguf, chiave);

    // Quanti strati: la domanda che separa un modello da tutto il resto. Un
    // proiettore ha la sua architettura e non ha questo, e un file che non lo
    // dichiara non puo' generare nemmeno un token.
    int64_t strati = 0;
    if (!architettura.empty()) {
        const std::string chiaveStrati = architettura + ".block_count";
        const int64_t indice = gguf_find_key(gguf, chiaveStrati.c_str());
        if (indice >= 0) strati = (int64_t) gguf_get_val_u32(gguf, indice);
    }
    gguf_free(gguf);

    char json[256];
    snprintf(json, sizeof(json), "{\"architecture\":\"%s\",\"layers\":%lld}",
             architettura.c_str(), (long long) strati);
    return env->NewStringUTF(json);
}

/**
 * La forma del modello, letta dai METADATI e senza aprire niente.
 *
 * ⛔ Non da `llama_model_n_ctx_train` & co. quando si e' aperto con
 * `vocab_only`: upstream `load_hparams` esce alla riga «everything past this
 * point is not vocab-related» e gli iperparametri restano a zero. Non e' un
 * difetto nostro ne' loro — un modello di solo vocabolario non ha iperparametri
 * per definizione. I numeri pero' esistono lo stesso, nelle chiavi
 * `<arch>.*`, e leggerli dai metadati non costa niente.
 *
 * MISURATO il 2026-08-07: senza questa lettura il piano rispondeva
 * `trainedContext: 0`, cioe' avrebbe fatto aprire ogni modello al minimo.
 *
 * `headDim` si ricava da `n_embd / n_head`, la stessa relazione che usa la
 * sonda a modello aperto: una relazione sola, non due che poi divergono.
 */
struct talos_forma_gguf {
    int64_t layers          = 0;
    int64_t kvHeads         = 0;
    int64_t headDim         = 0;
    int64_t trainedContext  = 0;
    int64_t weightBytes     = 0;
};

/** Un intero dai metadati, qualunque larghezza abbia dichiarato chi ha scritto il file. */
static int64_t talos_gguf_intero(const gguf_context * gguf, const std::string & chiave) {
    const int64_t indice = gguf_find_key(gguf, chiave.c_str());
    if (indice < 0) return 0;
    switch (gguf_get_kv_type(gguf, indice)) {
        case GGUF_TYPE_UINT32: return (int64_t) gguf_get_val_u32(gguf, indice);
        case GGUF_TYPE_INT32:  return (int64_t) gguf_get_val_i32(gguf, indice);
        case GGUF_TYPE_UINT64: return (int64_t) gguf_get_val_u64(gguf, indice);
        case GGUF_TYPE_INT64:  return (int64_t) gguf_get_val_i64(gguf, indice);
        case GGUF_TYPE_UINT16: return (int64_t) gguf_get_val_u16(gguf, indice);
        default: return 0;
    }
}

static talos_forma_gguf talos_forma_dai_metadati(const std::string & path) {
    talos_forma_gguf forma;

    gguf_init_params params = { /*.no_alloc =*/ true, /*.ctx =*/ nullptr };
    gguf_context * gguf = gguf_init_from_file(path.c_str(), params);
    if (gguf == nullptr) return forma;

    std::string architettura;
    const int64_t chiave = gguf_find_key(gguf, "general.architecture");
    if (chiave >= 0) architettura = gguf_get_val_str(gguf, chiave);

    if (!architettura.empty()) {
        forma.layers         = talos_gguf_intero(gguf, architettura + ".block_count");
        forma.kvHeads        = talos_gguf_intero(gguf, architettura + ".attention.head_count_kv");
        forma.trainedContext = talos_gguf_intero(gguf, architettura + ".context_length");

        // La testa: dichiarata quando c'e', altrimenti dedotta come fa il
        // lettore ufficiale. Zero resta zero — «non misurabile» e' un esito.
        forma.headDim = talos_gguf_intero(gguf, architettura + ".attention.key_length");
        if (forma.headDim <= 0) {
            const int64_t embedding = talos_gguf_intero(gguf, architettura + ".embedding_length");
            const int64_t teste     = talos_gguf_intero(gguf, architettura + ".attention.head_count");
            if (teste > 0) forma.headDim = embedding / teste;
        }
    }
    gguf_free(gguf);

    /*
     * Il peso e' quello del FILE, non la somma dei tensori: con `vocab_only`
     * nessun tensore e' stato caricato, e cio' che occupera' la memoria e'
     * comunque quello che sta sul disco.
     */
    struct stat info {};
    if (stat(path.c_str(), &info) == 0) forma.weightBytes = (int64_t) info.st_size;

    return forma;
}

/**
 * ⭐⭐ QUANTO CONTESTO SERVE — chiesto PRIMA di caricare i pesi.
 *
 * ## Perche' esiste
 *
 * Il contesto giusto per una conversazione si conosce solo dopo aver applicato
 * il template del modello e contato i token. Ma applicare il template richiedeva
 * un modello aperto, e aprirlo richiede di sapere quanto contesto dargli: un
 * cerchio. La soluzione era: apri col predefinito, scopri che serve di piu',
 * riapri. **Due aperture per un messaggio.**
 *
 * La prima cura ha tolto la seconda LETTURA DAL DISCO ricostruendo il solo
 * contesto — MISURATO: 2875 ms risparmiati su un modello da 1,8 GB, e molti di
 * piu' su uno grande. Restava comunque un contesto costruito e buttato, che su
 * un prompt lungo vale un altro secondo e mezzo di allocazione di cache.
 *
 * ## La cura vera: `vocab_only`
 *
 * `llama_model_params.vocab_only` carica **soltanto il vocabolario, nessun
 * tensore** — l'header lo dice in una riga, e la discussione upstream #7783
 * conferma che i metadati restano leggibili. Cioe' si puo' applicare il
 * template, tokenizzare e contare **senza toccare i gigabyte**.
 *
 * Con questo il cerchio si spezza: prima si conta, poi si apre UNA volta col
 * contesto giusto. Nessun contesto costruito per essere buttato.
 *
 * ⛔ E si chiude subito. Un vocabolario e' qualche megabyte, ma tenerlo aperto
 * accanto al modello vero sarebbe una seconda copia della stessa cosa che
 * nessuno usa.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativePlanPrompt(JNIEnv * env, jclass, jstring modelPath,
                                                jstring messagesJson,
                                                jstring toolsJson, jboolean pensa) {
    const std::string path = jstring_to_utf8(env, modelPath);
    if (path.empty()) return nullptr;

    llama_model_params model_params = llama_model_default_params();
    // Solo il vocabolario: nessun tensore entra in memoria.
    model_params.vocab_only = true;
    llama_model * model = llama_model_load_from_file(path.c_str(), model_params);
    if (model == nullptr) return nullptr;

    std::string prompt;
    int32_t token = -1;
    common_chat_templates_ptr templates;
    try {
        templates = common_chat_templates_init(model, "");
    } catch (const std::exception &) {
        llama_model_free(model);
        return nullptr;
    }
    if (templates) {
        prompt = talos_apply_chat_template(templates.get(), env, messagesJson, toolsJson,
                                           pensa == JNI_TRUE);
    }
    if (!prompt.empty()) {
        const llama_vocab * vocab = llama_model_get_vocab(model);
        token = -llama_tokenize(vocab, prompt.c_str(), (int32_t) prompt.size(),
                                nullptr, 0, true, true);
    }
    llama_model_free(model);
    const talos_forma_gguf forma = talos_forma_dai_metadati(path);

    if (token <= 0) return nullptr;
    char json[384];
    snprintf(json, sizeof(json),
             "{\"promptTokens\":%d,\"trainedContext\":%lld,\"layers\":%lld,"
             "\"kvHeads\":%lld,\"headDim\":%lld,\"weightBytes\":%lld}",
             (int) token, (long long) forma.trainedContext, (long long) forma.layers,
             (long long) forma.kvHeads, (long long) forma.headDim,
             (long long) forma.weightBytes);
    return env->NewStringUTF(json);
}

/**
 * Legge le capability del template senza caricare i tensori. È un preflight:
 * chi usa il risultato decide se passare il contratto OpenAI direttamente al
 * Jinja o usare il profilo prompt; non costruisce né restituisce un prompt.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeTemplateCapabilities(JNIEnv * env, jclass,
                                                          jstring modelPath) {
    const std::string path = jstring_to_utf8(env, modelPath);
    if (path.empty()) return nullptr;

    llama_model_params model_params = llama_model_default_params();
    model_params.vocab_only = true;
    llama_model * model = llama_model_load_from_file(path.c_str(), model_params);
    if (model == nullptr) return nullptr;

    std::string capabilities;
    try {
        common_chat_templates_ptr templates = common_chat_templates_init(model, "");
        capabilities = talos_template_capabilities_json(templates.get());
    } catch (const std::exception &) {
        TALOS_LOGE("capability del template non inizializzabili");
    }
    llama_model_free(model);
    return capabilities.empty() ? nullptr : env->NewStringUTF(capabilities.c_str());
}

/**
 * ⭐ IL CONTESTO SI RIFA', IL MODELLO RESTA.
 *
 * ## Il difetto, letto dal registro dell'owner
 *
 * MISURATO il 2026-08-06: **111 secondi** prima della prima parola al primo
 * messaggio, e **195 millisecondi** ai giri successivi dello stesso invio. La
 * causa non era il prefill: era che il modello veniva aperto **due volte**. Una
 * col contesto predefinito, e subito dopo di nuovo per allargarlo — perche' il
 * fabbisogno vero si conosce solo dopo aver applicato il template, che richiede
 * un modello gia' aperto.
 *
 * ## Perche' era evitabile
 *
 * `llama_model` e `llama_context` sono due cose separate: i pesi da una parte, la
 * cache e i buffer dall'altra. Allargare il contesto **non** richiede rileggere
 * due gigabyte dal disco — richiede buttare il contesto e farne uno nuovo. Erano
 * i nostri `open()` a liberarli insieme, non llama.cpp a pretenderlo.
 *
 * ⛔ Il campionatore invece va rifatto: e' costruito sul modello ma tiene lo
 * stato delle penalita' di ripetizione, e uno stato che sopravvive a un contesto
 * azzerato parla di una conversazione che non esiste piu'.
 *
 * @return il contesto ottenuto, o 0 se la ricostruzione e' fallita — nel qual
 *     caso la sessione resta **senza contesto** e chi chiama deve riaprire tutto.
 */
JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeReopenContext(JNIEnv * env, jclass, jlong handle,
                                                   jint threads, jint contextTokens,
                                                   jint threadsBatch, jint microBatch,
                                                   jstring kvType, jboolean deterministic) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->model == nullptr) return 0;

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx           = contextTokens > 0 ? (uint32_t) contextTokens : 0;
    ctx_params.n_batch         = 512;
    ctx_params.n_ubatch        = microBatch > 0 ? (uint32_t) microBatch : 256;
    ctx_params.n_threads       = threads > 0 ? threads : 4;
    ctx_params.n_threads_batch = threadsBatch > 0 ? threadsBatch : ctx_params.n_threads;
    ctx_params.no_perf         = true;

    const std::string tipoKv = jstring_to_utf8(env, kvType);
    const bool vuoleLeggera = tipoKv == "q8_0";
    if (vuoleLeggera) {
        ctx_params.type_k = GGML_TYPE_Q8_0;
        ctx_params.type_v = GGML_TYPE_Q8_0;
        ctx_params.flash_attn_type = LLAMA_FLASH_ATTN_TYPE_AUTO;
    }

    llama_context * nuovo = llama_init_from_model(session->model, ctx_params);
    if (nuovo == nullptr && vuoleLeggera) {
        ctx_params.type_k = GGML_TYPE_F16;
        ctx_params.type_v = GGML_TYPE_F16;
        nuovo = llama_init_from_model(session->model, ctx_params);
    }
    if (nuovo == nullptr) {
        TALOS_LOGE("contesto non ricostruito a %d token", contextTokens);
        return 0;
    }

    common_params_sampling sampling;
    if (deterministic) sampling.temp = 0.0f;
    common_sampler * campionatore = common_sampler_init(session->model, sampling);
    if (campionatore == nullptr) {
        // Meglio nessun contesto nuovo che un contesto senza chi sceglie i
        // token: chi chiama riapre tutto, che e' lento ma corretto.
        llama_free(nuovo);
        TALOS_LOGE("campionatore non ricostruito");
        return 0;
    }

    // Da qui in poi si sostituisce, e l'ordine conta: prima si stacca il
    // vecchio dalla sessione, poi lo si libera. Un contesto liberato ma ancora
    // puntato e' un uso dopo la liberazione che si manifesta a caso.
    llama_context * vecchio = session->ctx;
    common_sampler * vecchioCampionatore = session->sampler;
    session->ctx     = nuovo;
    session->sampler = campionatore;
    session->sampling = sampling;
    session->kv_type = ctx_params.type_k == GGML_TYPE_Q8_0 ? "q8_0" : "f16";
    // ⛔ La cache e' nuova, quindi VUOTA. Non azzerare qui vorrebbe dire che il
    // turno successivo calcola il prefisso comune su token che non esistono piu'.
    session->cached.clear();
    if (vecchioCampionatore != nullptr) common_sampler_free(vecchioCampionatore);
    if (vecchio != nullptr) llama_free(vecchio);

    llama_set_abort_callback(nuovo, talos_deve_fermarsi, session);
    g_context_rebuild_count.fetch_add(1, std::memory_order_relaxed);
    TALOS_LOGI("contesto rifatto: %u token, thread %d gen / %d prefill, cache %s (modello NON ricaricato)",
               llama_n_ctx(nuovo), ctx_params.n_threads, ctx_params.n_threads_batch,
               session->kv_type.c_str());
    return (jint) llama_n_ctx(nuovo);
}

/** Quante volte il contesto e' stato rifatto tenendo il modello in memoria. */
JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeContextRebuilds(JNIEnv *, jclass) {
    return (jint) g_context_rebuild_count.load(std::memory_order_relaxed);
}

/**
 * I numeri di esecuzione del contesto aperto, chiesti a lui.
 *
 * Non si ripete cio' che era stato CHIESTO: la cache q8_0 puo' non essere stata
 * accettata, il contesto puo' essere stato ridotto. Una diagnostica che mostra
 * la richiesta invece del risultato racconta la bugia che esiste per scoprire.
 */
JNIEXPORT jlongArray JNICALL
Java_ai_talos_TalosLlamaNative_nativeRuntimeConfig(JNIEnv * env, jclass, jlong handle) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->ctx == nullptr) return nullptr;
    jlong valori[3] = {
        (jlong) llama_n_threads(session->ctx),
        (jlong) llama_n_threads_batch(session->ctx),
        (jlong) llama_n_ubatch(session->ctx),
    };
    jlongArray fuori = env->NewLongArray(3);
    if (fuori == nullptr) return nullptr;
    env->SetLongArrayRegion(fuori, 0, 3, valori);
    return fuori;
}

/** Quante volte un modello e' stato aperto da quando il processo e' partito. */
JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeOpensSinceStart(JNIEnv *, jclass) {
    return (jint) g_open_count.load(std::memory_order_relaxed);
}

JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeKvCacheType(JNIEnv * env, jclass, jlong handle) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr) return nullptr;
    return env->NewStringUTF(session->kv_type.c_str());
}

/**
 * La FORMA del modello che è in memoria, dichiarata da lui stesso.
 *
 * ## Perché esiste
 *
 * Il tetto di contesto della chat era `8192`, scritto a mano, uguale per ogni
 * modello e ogni telefono. Su un tablet da 12 GB con un 3B quantizzato rifiutava
 * conversazioni che il dispositivo reggeva comodamente; su un telefono da 4 GB
 * con un 7B avrebbe promesso più di quanto potesse mantenere. Un numero solo non
 * può essere giusto per entrambi, perché non è una politica: è un *fatto*, e i
 * fatti si leggono.
 *
 * `fit.ts` sa già calcolare quel tetto — RAM disponibile, soglia di sfratto di
 * Android, margine, peso dei pesi, byte di cache KV per token — e gli mancava
 * solo la forma del modello. Sul catalogo del Hub la ricava da una lettura
 * parziale del GGUF via HTTP; per un modello *installato* quella strada non
 * c'è, perché il file è di gigabyte e il ponte dei file di Capacitor legge solo
 * tutto-o-niente.
 *
 * Ma qui la lettura è già stata fatta: `llama_model_load_from_file` ha
 * attraversato l'intestazione per costruire il modello. Chiedere a lui costa
 * cinque accessi a campi già in memoria, e soprattutto risponde con ciò che il
 * motore *userà davvero*, non con ciò che un secondo lettore avrebbe dedotto.
 *
 * ## L'ordine, e perché long
 *
 * `[layers, kvHeads, headDim, trainedContext, weightBytes]`. Long per tutti
 * perché l'ultimo è un conteggio di byte che supera i due miliardi appena il
 * modello passa i 2 GB — un `int` lo farebbe diventare negativo proprio sui
 * modelli grandi, cioè quelli in cui il tetto conta di più.
 *
 * `weightBytes` è `llama_model_size`, i byte dei tensori residenti: più esatto
 * della sottrazione «file meno intestazione» che fa il lettore GGUF, e giusto
 * anche per un modello diviso in più file.
 *
 * `headDim` si ricava da `n_embd / n_head`, la stessa relazione che il lettore
 * GGUF usa quando il file non dichiara `attention.key_length`. Per le
 * architetture che quel campo lo dichiarano diverso l'API pubblica di llama.cpp
 * non lo espone; il risultato resta dalla parte prudente perché sotto-stimare la
 * cache alzerebbe il tetto, quindi chi chiama tratta un `n_head` non valido come
 * «non lo so» invece di dividere per zero.
 *
 * Restituisce `nullptr` quando non c'è nessun modello aperto: «non lo so», che
 * non è «zero» e non deve mai diventarlo.
 */
JNIEXPORT jlongArray JNICALL
Java_ai_talos_TalosLlamaNative_nativeModelShape(JNIEnv * env, jclass, jlong handle) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->model == nullptr) return nullptr;

    const llama_model * model = session->model;
    const int32_t embedding = llama_model_n_embd(model);
    const int32_t heads     = llama_model_n_head(model);
    // Non un caso da aggiustare con un valore di comodo: senza teste la
    // divisione non ha senso, e uno zero qui diventerebbe una divisione per zero
    // a valle. Passa come zero e chi legge lo riconosce come «non misurabile».
    const jlong headDim = heads > 0 ? (jlong) (embedding / heads) : 0;

    const jlong values[5] = {
        (jlong) llama_model_n_layer(model),
        (jlong) llama_model_n_head_kv(model),
        headDim,
        (jlong) llama_model_n_ctx_train(model),
        (jlong) llama_model_size(model),
    };

    jlongArray result = env->NewLongArray(5);
    if (result == nullptr) return nullptr;
    env->SetLongArrayRegion(result, 0, 5, values);
    return result;
}

/**
 * Conta il prompt con lo stesso tokenizer e gli stessi flag della generazione.
 * Il chiamante può così scegliere il contesto prima del decode senza stimare
 * token da byte o caratteri, che cambia risposta proprio tra famiglie diverse.
 */
JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativePromptTokens(JNIEnv * env, jclass, jlong handle,
                                                  jstring promptText) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || promptText == nullptr) return 0;
    const std::string prompt = jstring_to_utf8(env, promptText);
    const int wanted = -llama_tokenize(session->vocab, prompt.c_str(), (int32_t) prompt.size(),
                                       nullptr, 0, true, true);
    return wanted > 0 ? (jint) wanted : 0;
}

/**
 * Genera, e restituisce il testo prodotto. `null` significa fallimento e non
 * "niente da dire": il chiamante deve poterli distinguere, perché uno è un
 * backend rotto e l'altro è un modello silenzioso.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeGenerate(JNIEnv * env, jclass, jlong handle,
                                              jstring promptText, jint maxTokens,
                                              jboolean stopAtEndOfGeneration,
                                              jboolean reusePrefix) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr) return nullptr;

    const auto        avvio  = std::chrono::steady_clock::now();
    const std::string prompt = jstring_to_utf8(env, promptText);

    session->produced.store(0, std::memory_order_relaxed);
    session->cancelled.store(false, std::memory_order_relaxed);
    {
        // Azzerato QUI e non a fine generazione: chi guarda deve vedere la
        // risposta nuova crescere da zero, non la coda di quella prima.
        std::lock_guard<std::mutex> guard(session->text_lock);
        session->text.clear();
        session->text_drained = 0;
    }
    /**
     * ⭐ LE DUE MODALITÀ, dichiarate invece che sottintese.
     *
     * Questa funzione serve due padroni con esigenze opposte, e per mesi ne ha
     * servito uno solo. **Il banco di prova** deve partire da zero: due giri
     * con stati diversi non sono confrontabili, e una misura non confrontabile
     * non è una misura. **La chat** deve fare l'esatto contrario: il prompt del
     * turno nuovo comincia con tutto il turno vecchio, e ricalcolarlo significa
     * far aspettare una persona per un lavoro già fatto.
     *
     * Vinceva il banco di prova, perché il motore è nato per misurare. Da qui
     * in poi la modalità si dichiara: `reusePrefix` è la chat, il suo contrario
     * è la misura. Un `if` che si vede, e non due comportamenti che dipendono
     * da chi ha chiamato.
     */
    if (!reusePrefix) {
        llama_memory_clear(llama_get_memory(session->ctx), true);
        session->cached.clear();
    }

    const int wanted = -llama_tokenize(session->vocab, prompt.c_str(), (int32_t) prompt.size(),
                                       nullptr, 0, true, true);
    if (wanted <= 0) {
        TALOS_LOGE("prompt non tokenizzabile");
        return nullptr;
    }

    std::vector<llama_token> tokens((size_t) wanted);
    if (llama_tokenize(session->vocab, prompt.c_str(), (int32_t) prompt.size(),
                       tokens.data(), (int32_t) tokens.size(), true, true) < 0) {
        TALOS_LOGE("tokenizzazione fallita");
        return nullptr;
    }
    const long long tempo_tokenizzazione = talos_da(avvio);

    const int budget = (int) llama_n_ctx(session->ctx);
    if (wanted >= budget) {
        /**
         * SI LANCIA, non si restituisce niente.
         *
         * Prima questo ramo tornava `nullptr`, che sopra diventa una stringa
         * vuota — indistinguibile da «il modello non ha avuto niente da dire».
         * Misurato il 2026-08-04: la sintesi di una ricerca con autore locale
         * falliva con `TALOS_RESEARCH_NO_CLAIMS`, e per sapere che il vero
         * motivo era «11009 token in un contesto da 4096» e' servito leggere il
         * logcat nativo. Un limite superato e' un fatto che il chiamante puo'
         * spiegare all'utente; il silenzio non lo e'.
         */
        TALOS_LOGE("prompt di %d token oltre il contesto di %d", wanted, budget);
        char messaggio[160];
        snprintf(messaggio, sizeof(messaggio),
                 "TALOS_LOCAL_PROMPT_TOO_LONG: %d token, il contesto ne regge %d",
                 wanted, budget);
        jclass eccezione = env->FindClass("java/lang/IllegalStateException");
        if (eccezione != nullptr) env->ThrowNew(eccezione, messaggio);
        return nullptr;
    }
    const int limit = maxTokens > 0 ? maxTokens : 64;

    /**
     * IL PROMPT ENTRA A PEZZI. Questa è la riga che valeva l'applicazione.
     *
     * `n_ctx` e `n_batch` sono due tetti diversi e il codice ne controllava uno
     * solo. Il contesto qui è 4096, la batch 512: un prompt di 1200 token sta
     * comodamente nel contesto, e passarlo a `llama_decode` in un colpo solo
     * viola la batch. llama.cpp in quel caso non restituisce un errore —
     * chiama `abort()`, e con lui se ne va il processo dell'applicazione.
     *
     * Il prompt di sistema di TALOS supera i 512 token da solo, quindi non era
     * un caso limite: OGNI invio in chat uccideva l'app, in modo deterministico,
     * e il tombstone diceva `ggml_abort` dentro `llama_decode` senza dire perché
     * (il messaggio di ggml va su stderr, che su Android non esiste).
     *
     * A pezzi invece che rifiutando: un prompt che sta nel contesto DEVE poter
     * essere elaborato, e spezzarlo è esattamente ciò che fa llama.cpp a monte.
     * I logit servono solo dopo l'ultimo pezzo, ed è ciò che `llama_batch_get_one`
     * già fa da sé quando non gli si chiede altro.
     */
    const int slice = (int) llama_n_batch(session->ctx);
    if (slice <= 0) {
        TALOS_LOGE("batch di dimensione non valida");
        return nullptr;
    }
    /**
     * ⭐ QUANTO DI QUESTO PROMPT IL CONTESTO HA GIÀ VISTO.
     *
     * In una chat il prompt del turno nuovo è il turno vecchio più due
     * messaggi. Il prefisso comune copre quasi tutto, e ciò che resta da
     * decodificare sono le poche decine di token aggiunti.
     *
     * `llama_memory_seq_rm` dal punto di divergenza in avanti: la KV oltre quel
     * punto descrive una conversazione che non è più quella. Se la rimozione
     * parziale fallisce — l'API dice che per alcuni tipi di memoria può — si
     * butta tutto e si ricomincia, che è lento ma sempre corretto. Il contrario
     * (tenere una KV di cui non ci si fida) darebbe una risposta sbagliata
     * senza dirlo a nessuno.
     */
    llama_memory_t memoria = llama_get_memory(session->ctx);
    size_t riusati = reusePrefix ? talos_prefisso_comune(session->cached, tokens) : 0;
    if (reusePrefix) {
        if (riusati < session->cached.size()
            && !llama_memory_seq_rm(memoria, 0, (llama_pos) riusati, -1)) {
            TALOS_LOGI("taglio parziale rifiutato: si riparte da zero");
            llama_memory_clear(memoria, true);
            riusati = 0;
        }
        session->cached.resize(riusati);
    }
    const long long tempo_prefisso = talos_da(avvio);

    for (size_t fed = riusati; fed < (size_t) wanted; ) {
        const int chunk = std::min((size_t) slice, (size_t) wanted - fed);
        llama_batch head = llama_batch_get_one(tokens.data() + fed, (int32_t) chunk);
        const int32_t esito = llama_decode(session->ctx, head);
        if (esito == 0) {
            fed += chunk;
            session->cached.insert(session->cached.end(),
                                   tokens.begin() + (long) (fed - chunk),
                                   tokens.begin() + (long) fed);
            continue;
        }
        /**
         * ⛔ 2 = interrotta. E qui sta la parte che è facile sbagliare: gli
         * `ubatch` già elaborati **restano nella KV**. Andarsene senza pulire
         * lascerebbe il contesto convinto di aver letto mezza domanda, e il
         * turno successivo risponderebbe a una frase troncata.
         *
         * `session->cached` è la nostra verità su cosa c'è dentro; la KV va
         * riportata esattamente lì. Se il taglio non riesce, si azzera: perdere
         * il prefisso costa secondi, tenerne uno falso costa la risposta.
         */
        if (esito == 2) {
            if (!llama_memory_seq_rm(memoria, 0, (llama_pos) session->cached.size(), -1)) {
                llama_memory_clear(memoria, true);
                session->cached.clear();
            }
            TALOS_LOGI("prefill interrotto a %zu/%d token", fed, wanted);
            // Anche un lavoro interrotto lascia la sua traccia: «quanto ci ha
            // messo a fermarsi» è una domanda legittima, e un blocco di tempi
            // vuoto la renderebbe senza risposta.
            {
                std::lock_guard<std::mutex> guard(session->tempi_lock);
                session->tempi = {
                    tempo_tokenizzazione, tempo_prefisso, talos_da(avvio), -1,
                    talos_da(avvio), wanted, (int) riusati, (int) (fed - riusati), 0,
                    reusePrefix == JNI_TRUE,
                };
            }
            return env->NewStringUTF("");
        }
        TALOS_LOGE("decode del prompt fallito a %zu/%d token (esito %d)", fed, wanted, esito);
        llama_memory_clear(memoria, true);
        session->cached.clear();
        return nullptr;
    }
    const long long tempo_prefill = talos_da(avvio);
    TALOS_LOGI("prompt: %d token, %zu riusati, %zu nuovi (pezzi da %d, contesto %d)",
               wanted, riusati, (size_t) wanted - riusati, slice, budget);

    std::string answer;
    char piece[256];
    // La batch successiva punta a QUESTA variabile, non a una locale del giro:
    // llama_batch_get_one conserva il puntatore e lo legge alla decodifica
    // seguente, quindi ciò che punta deve sopravvivere all'iterazione.
    llama_token sampled = 0;
    long long   tempo_primo_token = -1;

    for (int produced = 0; produced < limit; ) {
        if (session->cancelled.load(std::memory_order_relaxed)) break;

        sampled = common_sampler_sample(session->sampler, session->ctx, -1);
        if (tempo_primo_token < 0) tempo_primo_token = talos_da(avvio);
        // Il token va DICHIARATO al campionatore, non solo campionato: le
        // penalità di ripetizione e la grammatica tengono uno stato, e senza
        // questa riga non vedono mai ciò che è stato prodotto — cioè sono
        // presenti nella catena e inerti.
        common_sampler_accept(session->sampler, sampled, true);
        // Durante una MISURA la fine-generazione non ferma niente, e non è una
        // scorciatoia: un modello piccolo decide di tacere dopo un secondo, e un
        // benchmark che finisce quando il modello ha finito misura la sua
        // loquacità invece della velocità del telefono. È quello che fa
        // llama-bench a monte. In chat, invece, EOG è sacro.
        if (stopAtEndOfGeneration && llama_vocab_is_eog(session->vocab, sampled)) break;

        const int written = llama_token_to_piece(session->vocab, sampled, piece, sizeof(piece), 0, true);
        if (written < 0) {
            TALOS_LOGE("token non convertibile in testo");
            return nullptr;
        }
        answer.append(piece, (size_t) written);
        {
            std::lock_guard<std::mutex> guard(session->text_lock);
            session->text.append(piece, (size_t) written);
        }

        produced += 1;
        // Pubblicato DOPO che il testo è nell'accumulatore: chi interroga il
        // contatore non deve mai vedere un token che non esiste ancora.
        session->produced.store(produced, std::memory_order_relaxed);

        // Il contesto è un tetto duro: superarlo non è un degrado, è un errore.
        // Controllato PRIMA di dare in pasto il token appena campionato, perché
        // è quella decodifica a occupare la casella successiva.
        if (wanted + produced + 1 > budget) break;

        llama_batch next = llama_batch_get_one(&sampled, 1);
        const int32_t esito = llama_decode(session->ctx, next);
        if (esito != 0) {
            // Interrotta o guasta, la KV va riportata su ciò che `cached` dice.
            if (!llama_memory_seq_rm(memoria, 0, (llama_pos) session->cached.size(), -1)) {
                llama_memory_clear(memoria, true);
                session->cached.clear();
            }
            if (esito == 2) break;
            TALOS_LOGE("decode fallito dopo %d token", produced);
            return nullptr;
        }
        // Anche il token appena generato ORA sta nella KV: se non lo si
        // registra, il turno dopo calcolerebbe il prefisso comune su una
        // fotografia più corta della realtà e taglierebbe nel posto sbagliato.
        session->cached.push_back(sampled);
    }

    {
        std::lock_guard<std::mutex> guard(session->tempi_lock);
        session->tempi = {
            tempo_tokenizzazione,
            tempo_prefisso,
            tempo_prefill,
            tempo_primo_token,
            talos_da(avvio),
            wanted,
            (int) riusati,
            wanted - (int) riusati,
            session->produced.load(std::memory_order_relaxed),
            reusePrefix == JNI_TRUE,
        };
    }

    return env->NewStringUTF(answer.c_str());
}

/**
 * ⭐ QUANTI THREAD, chiesto al telefono invece che deciso a tavolino.
 *
 * ## Perché non basta una regola
 *
 * Il numero giusto di thread non è una proprietà del chip: è una proprietà del
 * **chip più questo modello più questa quantizzazione più la temperatura di
 * adesso**. Una costante «ragionevole» è una previsione sul futuro, e sarà
 * sbagliata per qualcuno — di solito per chi ha l'hardware che non avevamo in
 * mano. Quindi si misura.
 *
 * ## Perché si può misurare gratis
 *
 * `llama_set_n_threads` cambia i due valori **su un contesto già aperto**.
 * Senza quella funzione ogni combinazione costerebbe una riapertura del
 * modello — secondi, e la KV buttata — e una taratura del genere non si
 * potrebbe fare mentre qualcuno aspetta. Con quella, un giro completo costa
 * qualche decina di prefill brevi.
 *
 * ## Le due misure sono separate perché i due carichi sono opposti
 *
 * Il **prefill** macina matrici: più core, più veloce, finché la memoria o il
 * calore non dicono basta. La **generazione** fa un token per volta ed è legata
 * alla banda: i thread in più si contendono la stessa memoria e non producono
 * niente. Misurarle insieme e prendere un numero solo è il modo di perdere due
 * volte.
 *
 * ⛔ Distrugge la conversazione in memoria — è un banco di prova, e come ogni
 * banco di prova parte da zero. Chi lo chiama deve saperlo: si tara **prima**
 * di parlare, non in mezzo a una chat.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeTuneThreads(JNIEnv * env, jclass, jlong handle,
                                                 jintArray candidates, jint probeTokens) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr) return nullptr;

    const jsize quanti = env->GetArrayLength(candidates);
    if (quanti <= 0) return nullptr;
    std::vector<jint> valori((size_t) quanti);
    env->GetIntArrayRegion(candidates, 0, quanti, valori.data());

    // Un token qualunque, ripetuto: qui si misura il MOTORE, non il modello.
    // Il testo non conta, conta quanti token attraversano quanti core.
    const int lunghezza = probeTokens > 0 ? probeTokens : 256;
    const llama_token campione = llama_vocab_bos(session->vocab) >= 0
        ? llama_vocab_bos(session->vocab)
        : 0;
    std::vector<llama_token> prova((size_t) lunghezza, campione);

    llama_memory_t memoria = llama_get_memory(session->ctx);
    const int32_t threads_prima = llama_n_threads(session->ctx);
    const int32_t batch_prima   = llama_n_threads_batch(session->ctx);

    std::string righe;
    int   miglior_prefill = threads_prima;
    int   miglior_decode  = threads_prima;
    double top_prefill = 0.0;
    double top_decode  = 0.0;

    for (jint n : valori) {
        if (n <= 0) continue;
        // Ogni candidato parte dalla stessa condizione, o si misurerebbe
        // l'ordine in cui li abbiamo provati.
        llama_memory_clear(memoria, true);
        llama_set_n_threads(session->ctx, n, n);

        const auto inizio_pp = std::chrono::steady_clock::now();
        const int passo = (int) llama_n_batch(session->ctx);
        bool intero = true;
        for (int fed = 0; fed < lunghezza && intero; ) {
            const int pezzo = std::min(passo, lunghezza - fed);
            llama_batch b = llama_batch_get_one(prova.data() + fed, (int32_t) pezzo);
            if (llama_decode(session->ctx, b) != 0) intero = false;
            fed += pezzo;
        }
        const double pp_ms = (double) talos_da(inizio_pp);
        if (!intero || pp_ms <= 0.0) continue;
        const double pp = (double) lunghezza * 1000.0 / pp_ms;

        // Otto token generati bastano a separare i candidati e non fanno
        // aspettare: qui si cerca un ordine, non un numero da pubblicare.
        llama_token uno = campione;
        const auto inizio_tg = std::chrono::steady_clock::now();
        int generati = 0;
        for (; generati < 8; generati++) {
            llama_batch b = llama_batch_get_one(&uno, 1);
            if (llama_decode(session->ctx, b) != 0) break;
        }
        const double tg_ms = (double) talos_da(inizio_tg);
        const double tg = (generati > 0 && tg_ms > 0.0) ? (double) generati * 1000.0 / tg_ms : 0.0;

        if (pp > top_prefill) { top_prefill = pp; miglior_prefill = n; }
        if (tg > top_decode)  { top_decode  = tg; miglior_decode  = n; }

        char riga[128];
        snprintf(riga, sizeof(riga), "%s{\"threads\":%d,\"prefill\":%.1f,\"decode\":%.2f}",
                 righe.empty() ? "" : ",", (int) n, pp, tg);
        righe += riga;
    }

    // Il contesto torna com'era trovato, tranne la memoria: quella è persa per
    // costruzione, e chi ha chiamato lo sa.
    llama_memory_clear(memoria, true);
    session->cached.clear();
    llama_set_n_threads(session->ctx, threads_prima, batch_prima);

    char json[1024];
    snprintf(json, sizeof(json),
             "{\"threads\":%d,\"threadsBatch\":%d,\"prefillPerSecond\":%.1f,"
             "\"decodePerSecond\":%.2f,\"grid\":[%s]}",
             miglior_decode, miglior_prefill, top_prefill, top_decode,
             righe.c_str());
    return env->NewStringUTF(json);
}

/**
 * La cronometria dell'ultima generazione, in JSON.
 *
 * Serve a rispondere a una domanda sola, che finora non aveva risposta: quando
 * il primo token tarda nove secondi, **quale** dei cinque stadi li ha presi.
 * Prefisso alto e prefill basso vuol dire che si sta ricalcolando ciò che era
 * già in memoria; prefill alto con prefisso a zero vuol dire che il prompt è
 * grande davvero; primo token lontano dal prefill vuol dire scheduler o pesi
 * ancora freddi. Sono tre malattie con tre cure diverse, e senza questi numeri
 * si tirava a indovinare.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeLastTimings(JNIEnv * env, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return nullptr;
    talos_session::talos_cronometro tempi;
    {
        std::lock_guard<std::mutex> guard(session->tempi_lock);
        tempi = session->tempi;
    }
    char json[512];
    snprintf(json, sizeof(json),
             "{\"tokenizeMs\":%lld,\"prefixMs\":%lld,\"prefillMs\":%lld,"
             "\"firstTokenMs\":%lld,\"totalMs\":%lld,\"promptTokens\":%d,"
             "\"reusedTokens\":%d,\"newTokens\":%d,\"producedTokens\":%d,"
             "\"reusedContext\":%s}",
             tempi.tokenizzazione_ms, tempi.prefisso_ms, tempi.prefill_ms,
             tempi.primo_token_ms, tempi.totale_ms, tempi.token_prompt,
             tempi.token_riusati, tempi.token_nuovi, tempi.token_prodotti,
             tempi.contesto_riusato ? "true" : "false");
    return env->NewStringUTF(json);
}

/**
 * ⭐ IL PREFISSO CONGELATO — si scrive la cache su disco, coi suoi token.
 *
 * MISURATO il 2026-08-07 sul Pad: «ciao» costa **8.410 token di prompt**, di
 * cui ~8.250 sono i trentotto schemi dei tool. Calcolarli costa **150
 * secondi**, l'88% dell'attesa, e sono **identici in ogni conversazione**.
 *
 * Si calcolano una volta e si rileggono. Non e' una potatura: al modello
 * arrivano tutti e trentotto gli strumenti come prima — cambia solo quante
 * volte li paghiamo.
 *
 * ⭐ Si salvano anche i TOKEN, e non e' un dettaglio: `session->cached` e' cio'
 * su cui 8A calcola il prefisso comune. Tenendoli nello stesso file di
 * llama.cpp non esiste un secondo file da mantenere in sincronia — e due file
 * che possono divergere sono un difetto in attesa di succedere.
 */
JNIEXPORT jlong JNICALL
Java_ai_talos_TalosLlamaNative_nativeSaveState(JNIEnv * env, jclass, jlong handle,
                                               jstring pathJ) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->ctx == nullptr) return 0;
    // Una cache vuota si salverebbe benissimo e non servirebbe a nulla: il giro
    // dopo si rileggerebbe zero token credendo di aver risparmiato.
    if (session->cached.empty()) {
        TALOS_LOGI("prefisso congelato: niente da salvare, la cache e' vuota");
        return 0;
    }
    const std::string path = jstring_to_utf8(env, pathJ);
    if (path.empty()) return 0;

    const size_t scritti = llama_state_seq_save_file(
            session->ctx, path.c_str(), /* seq_id */ 0,
            session->cached.data(), session->cached.size());
    if (scritti == 0) {
        TALOS_LOGE("prefisso congelato: scrittura fallita su %s", path.c_str());
        return 0;
    }
    TALOS_LOGI("prefisso congelato: %zu token, %zu byte su %s",
               session->cached.size(), scritti, path.c_str());
    return (jlong) scritti;
}

/**
 * ⭐⭐ POTA E CONGELA: tiene i primi `quanti` token e salva SOLO quelli.
 *
 * ## Perche' esiste, invece di un riscaldamento a parte
 *
 * Il prefisso da congelare — prompt di sistema piu' i trentotto schemi — e' un
 * PREFISSO di cio' che la cache contiene gia' dopo il primo messaggio. Un
 * riscaldamento dedicato lo ricalcolerebbe da zero: altri 150 secondi, un altro
 * gigabyte riletto dal disco, e due modelli in memoria insieme.
 *
 * Qui invece si potano i token della conversazione e si salva cio' che resta.
 * **Costo aggiuntivo: zero.** Il calcolo e' gia' stato fatto per rispondere.
 *
 * ## Il prezzo, che va detto
 *
 * ⛔ Dopo la potatura la cache non contiene piu' i turni della conversazione:
 * il messaggio SUCCESSIVO di questa stessa chat li riprocessa. Sono qualche
 * centinaio di token contro gli ottomila che si risparmiano a ogni chat nuova
 * — un baratto che conviene, ma e' un baratto, non un pasto gratis.
 *
 * Per questo si chiama a risposta CONSEGNATA, mai prima: chi sta leggendo ha
 * gia' tutto, e la potatura non gli toglie niente che stia aspettando.
 *
 * ## ⛔ Perche' prende il PROMPT e non un numero di token
 *
 * La prima versione prendeva `quanti`, calcolato da chi chiama. Sbagliato, e il
 * motivo si vede solo guardando il template: `add_generation_prompt` e' **true**
 * ovunque, quindi il rendering del solo sistema finisce con il marcatore
 * dell'assistente — `<|im_start|>assistant` — mentre quello completo, in quel
 * punto, ha il turno dell'utente.
 *
 * ⇒ Il rendering del solo sistema **non e' un prefisso** di quello completo, e
 * un numero ricavato da li' avrebbe tagliato DENTRO il turno dell'utente: nel
 * file sarebbe finita una briciola di conversazione, e ogni chat nuova
 * l'avrebbe ereditata come se l'avesse scritta lei.
 *
 * Un difetto silenzioso: nessun errore, nessun crash, solo un modello che
 * ricorda una frase che nessuno gli ha detto.
 *
 * Qui il confine lo trova il tokenizzatore, con la stessa `talos_prefisso_comune`
 * che 8A usa fra un turno e l'altro. Una macchina sola per una domanda sola.
 */
JNIEXPORT jlong JNICALL
Java_ai_talos_TalosLlamaNative_nativeTrimAndSaveState(JNIEnv * env, jclass, jlong handle,
                                                      jstring pathJ, jstring prefissoJ) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->ctx == nullptr) return 0;
    const std::string prefisso = jstring_to_utf8(env, prefissoJ);
    if (prefisso.empty() || session->cached.empty()) return 0;

    // Il prefisso, tokenizzato con lo stesso vocabolario della conversazione.
    const int voluti = -llama_tokenize(session->vocab, prefisso.c_str(),
                                       (int32_t) prefisso.size(),
                                       nullptr, 0, /*add_special*/ true,
                                       /*parse_special*/ true);
    if (voluti <= 0) return 0;
    std::vector<llama_token> token_prefisso(voluti);
    if (llama_tokenize(session->vocab, prefisso.c_str(), (int32_t) prefisso.size(),
                       token_prefisso.data(), voluti, true, true) < 0) {
        return 0;
    }

    const size_t quanti = talos_prefisso_comune(session->cached, token_prefisso);
    if (quanti == 0 || quanti > session->cached.size()) {
        TALOS_LOGI("pota e congela: nessun prefisso comune fra la cache (%zu) e il "
                   "testo dato (%d)", session->cached.size(), voluti);
        return 0;
    }
    const std::string path = jstring_to_utf8(env, pathJ);
    if (path.empty()) return 0;

    // ⛔ Prima la cache, poi l'elenco. Se la potatura fallisce si esce senza
    // aver toccato `cached`: un elenco piu' corto della KV vera farebbe
    // calcolare il prefisso comune su token che il contesto ha ancora, e il
    // turno dopo risponderebbe a partire da uno stato che nessuno ha chiesto.
    llama_memory_t memoria = llama_get_memory(session->ctx);
    if (!llama_memory_seq_rm(memoria, 0, (llama_pos) quanti, -1)) {
        // Non tutti i tipi di cache sanno potare a meta'. Si azzera: perdere il
        // riuso e' un rallentamento, tenere una KV incoerente e' una risposta
        // sbagliata.
        TALOS_LOGE("pota e congela: potatura rifiutata, azzero");
        llama_memory_clear(memoria, true);
        session->cached.clear();
        return 0;
    }
    session->cached.resize((size_t) quanti);

    const size_t scritti = llama_state_seq_save_file(
            session->ctx, path.c_str(), /* seq_id */ 0,
            session->cached.data(), session->cached.size());
    if (scritti == 0) {
        TALOS_LOGE("pota e congela: scrittura fallita su %s", path.c_str());
        return 0;
    }
    TALOS_LOGI("pota e congela: %zu token su %d del testo dato, %zu byte su %s",
               quanti, voluti, scritti, path.c_str());
    return (jlong) scritti;
}

/**
 * Rilegge un prefisso congelato nel contesto aperto.
 *
 * ⛔ Chi chiama DEVE aver gia' verificato che il file appartenga a questo
 * modello e a questi parametri. Qui non e' verificabile: il formato di
 * llama.cpp non porta l'impronta del nostro prompt, e uno stato caricato sul
 * modello sbagliato **non da' errore** — da' risposte sbagliate, che e' il modo
 * peggiore di fallire, perche' nessuno va a cercare la causa nella cache.
 *
 * La capienza e' il contesto: un file piu' grande di cosi' non ci starebbe
 * comunque, e chiederlo a llama.cpp con una capienza onesta e' meglio che
 * scoprirlo con una scrittura fuori dai limiti.
 */
JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeLoadState(JNIEnv * env, jclass, jlong handle,
                                               jstring pathJ) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr || session->ctx == nullptr) return 0;
    const std::string path = jstring_to_utf8(env, pathJ);
    if (path.empty()) return 0;

    const size_t capienza = (size_t) llama_n_ctx(session->ctx);
    std::vector<llama_token> token(capienza);
    size_t quanti = 0;
    const size_t letti = llama_state_seq_load_file(
            session->ctx, path.c_str(), /* dest_seq_id */ 0,
            token.data(), capienza, &quanti);
    if (letti == 0 || quanti == 0) {
        // Non e' un guasto: un file che non c'e' o che non combacia col
        // contesto e' la condizione normale la prima volta, e dopo ogni
        // cambio. Si torna a calcolare, che e' cio' che si faceva prima.
        TALOS_LOGI("prefisso congelato: %s non utilizzabile, si ricalcola", path.c_str());
        // ⛔ Un caricamento fallito puo' aver lasciato la sequenza a meta'.
        // Ripartire da una cache mezza scritta darebbe un prefisso comune
        // calcolato su token che il contesto non ha davvero.
        llama_memory_clear(llama_get_memory(session->ctx), true);
        session->cached.clear();
        return 0;
    }
    token.resize(quanti);
    session->cached = std::move(token);
    TALOS_LOGI("prefisso congelato: %zu token ripristinati da %s (%zu byte)",
               quanti, path.c_str(), letti);
    return (jint) quanti;
}

JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeClose(JNIEnv *, jclass, jlong handle) {
    std::lock_guard<std::mutex> serratura(g_motore);
    talos_session * session = as_session(handle);
    if (session == nullptr) return;
    if (session->sampler != nullptr) common_sampler_free(session->sampler);
    if (session->ctx != nullptr) llama_free(session->ctx);
    if (session->model != nullptr) llama_model_free(session->model);
    delete session;
}

} // extern "C"
