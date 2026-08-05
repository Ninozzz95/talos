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

#include <algorithm>
#include <cstdio>
#include <atomic>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

#include "llama.h"
#include "ggml-backend.h"
#include "sampling.h"
#include "chat.h"
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
        for (const std::string & piece : session->chat.preserved_tokens) {
            const std::vector<llama_token> ids =
                    common_tokenize(session->vocab, piece, /*add_special*/ false, /*parse_special*/ true);
            if (ids.size() == 1) sampling.preserved_tokens.insert(ids[0]);
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
        TALOS_LOGE("grammatica non applicabile (%s), riprovo senza vincolo", failure.what());
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
                                          jboolean deterministic) {
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
    ctx_params.n_threads       = threads > 0 ? threads : 4;
    ctx_params.n_threads_batch = ctx_params.n_threads;
    ctx_params.no_perf         = true;

    llama_context * ctx = llama_init_from_model(model, ctx_params);
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

    // Costruito una volta, all'apertura: compilare un template Jinja a ogni
    // messaggio sarebbe lavoro rifatto identico per tutta la conversazione.
    // Un modello senza template non è un errore fatale — la formattazione lo
    // dirà al chiamante — ma è un fatto da registrare qui, dove si vede.
    try {
        session->templates = common_chat_templates_init(model, "");
    } catch (const std::exception & failure) {
        TALOS_LOGE("template non inizializzabile: %s", failure.what());
    }

    TALOS_LOGI("modello aperto: %s (contesto %u, thread %d)",
               path.c_str(), llama_n_ctx(ctx), ctx_params.n_threads);
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
                                                       jobjectArray roles, jobjectArray contents,
                                                       jstring toolsJson) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");

    if (session->templates == nullptr) {
        TALOS_LOGE("il GGUF non porta un template di chat");
        return env->NewStringUTF("");
    }

    const jsize count = env->GetArrayLength(roles);
    if (count != env->GetArrayLength(contents) || count <= 0) return env->NewStringUTF("");

    common_chat_templates_inputs inputs;
    inputs.add_generation_prompt = true;
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
    inputs.messages.reserve((size_t) count);
    for (jsize index = 0; index < count; index += 1) {
        auto role = (jstring) env->GetObjectArrayElement(roles, index);
        auto content = (jstring) env->GetObjectArrayElement(contents, index);
        common_chat_msg message;
        message.role = jstring_to_utf8(env, role);
        message.content = jstring_to_utf8(env, content);
        inputs.messages.push_back(std::move(message));
        env->DeleteLocalRef(role);
        env->DeleteLocalRef(content);
    }

    try {
        session->chat = common_chat_templates_apply(session->templates.get(), inputs);
        session->chat_ready = true;
    } catch (const std::exception & failure) {
        // Un template Jinja è codice, e codice può rompersi su un modello che
        // non abbiamo mai visto. Detto per nome invece che come prompt vuoto:
        // «questo modello non si formatta» è un'informazione, un prompt vuoto è
        // un mistero.
        TALOS_LOGE("template di chat non applicabile: %s", failure.what());
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
        const common_chat_msg parsed = common_chat_parse(text, false, parsing);
        out["content"] = parsed.content;
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
 * Il testo prodotto finora. Interrogabile mentre la generazione è in corso: è
 * così che la chat mostra le parole mentre arrivano.
 */
JNIEXPORT jstring JNICALL
Java_ai_talos_TalosLlamaNative_nativeTextSoFar(JNIEnv * env, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");
    std::lock_guard<std::mutex> guard(session->text_lock);
    return env->NewStringUTF(session->text.c_str());
}

JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeCancel(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session != nullptr) session->cancelled.store(true, std::memory_order_relaxed);
}

JNIEXPORT jint JNICALL
Java_ai_talos_TalosLlamaNative_nativeContextTokens(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    return session == nullptr ? 0 : (jint) llama_n_ctx(session->ctx);
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
                                              jboolean stopAtEndOfGeneration) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return nullptr;

    const std::string prompt = jstring_to_utf8(env, promptText);

    session->produced.store(0, std::memory_order_relaxed);
    session->cancelled.store(false, std::memory_order_relaxed);
    {
        // Azzerato QUI e non a fine generazione: chi guarda deve vedere la
        // risposta nuova crescere da zero, non la coda di quella prima.
        std::lock_guard<std::mutex> guard(session->text_lock);
        session->text.clear();
    }
    // Ogni prova parte da zero: un contesto che si porta dietro la precedente
    // misurerebbe una cosa diversa a ogni giro.
    llama_memory_clear(llama_get_memory(session->ctx), true);

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
    for (int fed = 0; fed < wanted; ) {
        if (session->cancelled.load(std::memory_order_relaxed)) {
            return env->NewStringUTF("");
        }
        const int chunk = std::min(slice, wanted - fed);
        llama_batch head = llama_batch_get_one(tokens.data() + fed, (int32_t) chunk);
        if (llama_decode(session->ctx, head) != 0) {
            TALOS_LOGE("decode del prompt fallito a %d/%d token", fed, wanted);
            return nullptr;
        }
        fed += chunk;
    }
    TALOS_LOGI("prompt: %d token in pezzi da %d, contesto %d", wanted, slice, budget);

    std::string answer;
    char piece[256];
    // La batch successiva punta a QUESTA variabile, non a una locale del giro:
    // llama_batch_get_one conserva il puntatore e lo legge alla decodifica
    // seguente, quindi ciò che punta deve sopravvivere all'iterazione.
    llama_token sampled = 0;

    for (int produced = 0; produced < limit; ) {
        if (session->cancelled.load(std::memory_order_relaxed)) break;

        sampled = common_sampler_sample(session->sampler, session->ctx, -1);
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
        if (llama_decode(session->ctx, next) != 0) {
            TALOS_LOGE("decode fallito dopo %d token", produced);
            return nullptr;
        }
    }

    return env->NewStringUTF(answer.c_str());
}

JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeClose(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return;
    if (session->sampler != nullptr) common_sampler_free(session->sampler);
    if (session->ctx != nullptr) llama_free(session->ctx);
    if (session->model != nullptr) llama_model_free(session->model);
    delete session;
}

} // extern "C"
