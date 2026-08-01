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

#include <atomic>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

#include "llama.h"
#include "ggml-backend.h"

#define TALOS_TAG "TalosLlama"
#define TALOS_LOGI(...) __android_log_print(ANDROID_LOG_INFO, TALOS_TAG, __VA_ARGS__)
#define TALOS_LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TALOS_TAG, __VA_ARGS__)

namespace {

struct talos_session {
    llama_model *       model   = nullptr;
    llama_context *     ctx     = nullptr;
    llama_sampler *     sampler = nullptr;
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
                                          jint threads, jint contextTokens, jint gpuLayers) {
    const std::string path = jstring_to_utf8(env, modelPath);
    if (path.empty()) {
        TALOS_LOGE("percorso del modello vuoto");
        return 0;
    }

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = gpuLayers;

    llama_model * model = llama_model_load_from_file(path.c_str(), model_params);
    if (model == nullptr) {
        TALOS_LOGE("modello non caricato: %s", path.c_str());
        return 0;
    }

    llama_context_params ctx_params = llama_context_default_params();
    // 0 significa "quello con cui il modello è stato addestrato": la scelta
    // giusta quando il chiamante non ha motivo di imporne un'altra.
    ctx_params.n_ctx           = contextTokens > 0 ? (uint32_t) contextTokens : 0;
    ctx_params.n_batch         = 512;
    ctx_params.n_threads       = threads > 0 ? threads : 4;
    ctx_params.n_threads_batch = ctx_params.n_threads;
    ctx_params.no_perf         = true;

    llama_context * ctx = llama_init_from_model(model, ctx_params);
    if (ctx == nullptr) {
        TALOS_LOGE("contesto non creato");
        llama_model_free(model);
        return 0;
    }

    // Campionamento greedy, e non è una semplificazione: la prova di un backend
    // è che produca LO STESSO testo della CPU. Con un campionamento casuale due
    // esecuzioni corrette divergerebbero e il confronto non direbbe nulla.
    llama_sampler_chain_params sampler_params = llama_sampler_chain_default_params();
    sampler_params.no_perf = true;
    llama_sampler * sampler = llama_sampler_chain_init(sampler_params);
    llama_sampler_chain_add(sampler, llama_sampler_init_greedy());

    auto * session = new talos_session();
    session->model   = model;
    session->ctx     = ctx;
    session->sampler = sampler;
    session->vocab   = llama_model_get_vocab(model);

    TALOS_LOGI("modello aperto: %s (contesto %u, thread %d)",
               path.c_str(), llama_n_ctx(ctx), ctx_params.n_threads);
    return reinterpret_cast<jlong>(session);
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
                                                       jobjectArray roles, jobjectArray contents) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return env->NewStringUTF("");

    const char * tmpl = llama_model_chat_template(session->model, nullptr);
    if (tmpl == nullptr) {
        TALOS_LOGE("il GGUF non porta un template di chat");
        return env->NewStringUTF("");
    }

    const jsize count = env->GetArrayLength(roles);
    if (count != env->GetArrayLength(contents) || count <= 0) return env->NewStringUTF("");

    // Le stringhe restano vive finché llama_chat_apply_template legge i loro
    // puntatori: liberarle prima sarebbe memoria già restituita.
    std::vector<std::string> held;
    std::vector<llama_chat_message> messages;
    held.reserve((size_t) count * 2);
    messages.reserve((size_t) count);
    for (jsize index = 0; index < count; index += 1) {
        auto role = (jstring) env->GetObjectArrayElement(roles, index);
        auto content = (jstring) env->GetObjectArrayElement(contents, index);
        held.push_back(jstring_to_utf8(env, role));
        held.push_back(jstring_to_utf8(env, content));
        messages.push_back({ held[held.size() - 2].c_str(), held[held.size() - 1].c_str() });
        env->DeleteLocalRef(role);
        env->DeleteLocalRef(content);
    }

    // La documentazione consiglia il doppio dei caratteri totali; se non basta
    // la funzione dice quanto serve, e si rialloca invece di troncare.
    size_t wanted = 0;
    for (const std::string & piece : held) wanted += piece.size();
    std::vector<char> buffer(wanted * 2 + 512);
    int32_t written = llama_chat_apply_template(
            tmpl, messages.data(), messages.size(), true, buffer.data(), (int32_t) buffer.size());
    if (written > (int32_t) buffer.size()) {
        buffer.resize((size_t) written + 1);
        written = llama_chat_apply_template(
                tmpl, messages.data(), messages.size(), true, buffer.data(), (int32_t) buffer.size());
    }
    if (written < 0) {
        TALOS_LOGE("template di chat non applicabile");
        return env->NewStringUTF("");
    }
    return env->NewStringUTF(std::string(buffer.data(), (size_t) written).c_str());
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
        TALOS_LOGE("prompt di %d token oltre il contesto di %d", wanted, budget);
        return nullptr;
    }
    const int limit = maxTokens > 0 ? maxTokens : 64;

    llama_batch batch = llama_batch_get_one(tokens.data(), (int32_t) tokens.size());
    std::string answer;
    char piece[256];
    // La batch successiva punta a QUESTA variabile, non a una locale del giro:
    // llama_batch_get_one conserva il puntatore e lo legge alla decodifica
    // seguente, quindi ciò che punta deve sopravvivere all'iterazione.
    llama_token sampled = 0;

    for (int produced = 0; produced < limit; ) {
        if (session->cancelled.load(std::memory_order_relaxed)) break;
        // Il contesto è un tetto duro: superarlo non è un degrado, è un errore.
        if (wanted + produced + batch.n_tokens > budget) break;

        if (llama_decode(session->ctx, batch) != 0) {
            TALOS_LOGE("decode fallito dopo %d token", produced);
            return nullptr;
        }

        sampled = llama_sampler_sample(session->sampler, session->ctx, -1);
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

        batch = llama_batch_get_one(&sampled, 1);
    }

    return env->NewStringUTF(answer.c_str());
}

JNIEXPORT void JNICALL
Java_ai_talos_TalosLlamaNative_nativeClose(JNIEnv *, jclass, jlong handle) {
    talos_session * session = as_session(handle);
    if (session == nullptr) return;
    if (session->sampler != nullptr) llama_sampler_free(session->sampler);
    if (session->ctx != nullptr) llama_free(session->ctx);
    if (session->model != nullptr) llama_model_free(session->model);
    delete session;
}

} // extern "C"
