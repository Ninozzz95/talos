#include <jni.h>

#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <samplerate.h>
#include <sentencepiece_processor.h>

namespace {

struct TokenizerHandle {
    sentencepiece::SentencePieceProcessor processor;
    std::mutex mutex;
};

void throw_java(JNIEnv* env, const char* class_name, const std::string& message) {
    jclass exception_class = env->FindClass(class_name);
    if (exception_class != nullptr) {
        env->ThrowNew(exception_class, message.c_str());
        env->DeleteLocalRef(exception_class);
    }
}

class UtfChars final {
  public:
    UtfChars(JNIEnv* env, jstring value) : env_(env), value_(value) {
        chars_ = value == nullptr ? nullptr : env->GetStringUTFChars(value, nullptr);
    }
    ~UtfChars() {
        if (chars_ != nullptr) env_->ReleaseStringUTFChars(value_, chars_);
    }
    const char* get() const { return chars_; }

  private:
    JNIEnv* env_;
    jstring value_;
    const char* chars_ = nullptr;
};

TokenizerHandle* require_handle(JNIEnv* env, jlong raw) {
    if (raw == 0) {
        throw_java(env, "java/lang/IllegalStateException", "SentencePiece handle is closed");
        return nullptr;
    }
    return reinterpret_cast<TokenizerHandle*>(static_cast<intptr_t>(raw));
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_ai_talos_voice_pocket_TalosPocketTokenizerJni_create(
    JNIEnv* env,
    jobject,
    jstring model_path) {
    UtfChars path(env, model_path);
    if (path.get() == nullptr) {
        if (!env->ExceptionCheck()) {
            throw_java(env, "java/lang/IllegalArgumentException", "SentencePiece model path is null");
        }
        return 0;
    }
    auto handle = std::make_unique<TokenizerHandle>();
    const auto status = handle->processor.Load(path.get());
    if (!status.ok()) {
        throw_java(
            env,
            "java/lang/IllegalArgumentException",
            std::string("SentencePiece model rejected: ") + status.ToString());
        return 0;
    }
    return static_cast<jlong>(reinterpret_cast<intptr_t>(handle.release()));
}

extern "C" JNIEXPORT jintArray JNICALL
Java_ai_talos_voice_pocket_TalosPocketTokenizerJni_encode(
    JNIEnv* env,
    jobject,
    jlong raw_handle,
    jstring source) {
    TokenizerHandle* handle = require_handle(env, raw_handle);
    if (handle == nullptr) return nullptr;
    UtfChars text(env, source);
    if (text.get() == nullptr) {
        if (!env->ExceptionCheck()) {
            throw_java(env, "java/lang/IllegalArgumentException", "SentencePiece source is null");
        }
        return nullptr;
    }
    std::vector<int> ids;
    {
        std::lock_guard<std::mutex> lock(handle->mutex);
        const auto status = handle->processor.Encode(text.get(), &ids);
        if (!status.ok()) {
            throw_java(env, "java/lang/IllegalArgumentException", status.ToString());
            return nullptr;
        }
    }
    jintArray result = env->NewIntArray(static_cast<jsize>(ids.size()));
    if (result == nullptr) return nullptr;
    if (!ids.empty()) {
        env->SetIntArrayRegion(
            result,
            0,
            static_cast<jsize>(ids.size()),
            reinterpret_cast<const jint*>(ids.data()));
    }
    return result;
}

extern "C" JNIEXPORT jstring JNICALL
Java_ai_talos_voice_pocket_TalosPocketTokenizerJni_decode(
    JNIEnv* env,
    jobject,
    jlong raw_handle,
    jintArray source_ids) {
    TokenizerHandle* handle = require_handle(env, raw_handle);
    if (handle == nullptr) return nullptr;
    if (source_ids == nullptr) {
        throw_java(env, "java/lang/IllegalArgumentException", "SentencePiece ids are null");
        return nullptr;
    }
    const jsize count = env->GetArrayLength(source_ids);
    std::vector<int> ids(static_cast<size_t>(count));
    if (count > 0) {
        env->GetIntArrayRegion(
            source_ids,
            0,
            count,
            reinterpret_cast<jint*>(ids.data()));
        if (env->ExceptionCheck()) return nullptr;
    }
    std::string decoded;
    {
        std::lock_guard<std::mutex> lock(handle->mutex);
        const auto status = handle->processor.Decode(absl::MakeConstSpan(ids), &decoded);
        if (!status.ok()) {
            throw_java(env, "java/lang/IllegalArgumentException", status.ToString());
            return nullptr;
        }
    }
    return env->NewStringUTF(decoded.c_str());
}

extern "C" JNIEXPORT jint JNICALL
Java_ai_talos_voice_pocket_TalosPocketTokenizerJni_vocabSize(
    JNIEnv* env,
    jobject,
    jlong raw_handle) {
    TokenizerHandle* handle = require_handle(env, raw_handle);
    if (handle == nullptr) return 0;
    std::lock_guard<std::mutex> lock(handle->mutex);
    return static_cast<jint>(handle->processor.GetPieceSize());
}

extern "C" JNIEXPORT void JNICALL
Java_ai_talos_voice_pocket_TalosPocketTokenizerJni_close(
    JNIEnv*,
    jobject,
    jlong raw_handle) {
    delete reinterpret_cast<TokenizerHandle*>(static_cast<intptr_t>(raw_handle));
}

extern "C" JNIEXPORT jfloatArray JNICALL
Java_ai_talos_voice_pocket_TalosPocketResamplerJni_resampleMono(
    JNIEnv* env,
    jobject,
    jfloatArray source,
    jint input_rate,
    jint output_rate) {
    constexpr jint kMinSampleRate = 8000;
    constexpr jint kMaxSampleRate = 192000;
    constexpr jint kMaxReferenceSeconds = 20;
    if (source == nullptr) {
        throw_java(env, "java/lang/IllegalArgumentException", "Pocket reference PCM is null");
        return nullptr;
    }
    if (input_rate < kMinSampleRate || input_rate > kMaxSampleRate ||
        output_rate < kMinSampleRate || output_rate > kMaxSampleRate) {
        throw_java(env, "java/lang/IllegalArgumentException", "Pocket sample rate is out of range");
        return nullptr;
    }

    const jsize input_frames = env->GetArrayLength(source);
    if (input_frames <= 0 || input_frames > input_rate * kMaxReferenceSeconds) {
        throw_java(env, "java/lang/IllegalArgumentException", "Pocket reference duration is invalid");
        return nullptr;
    }
    std::vector<float> input(static_cast<size_t>(input_frames));
    env->GetFloatArrayRegion(source, 0, input_frames, input.data());
    if (env->ExceptionCheck()) return nullptr;
    for (const float sample : input) {
        if (!std::isfinite(sample)) {
            throw_java(env, "java/lang/IllegalArgumentException", "Pocket reference PCM is non-finite");
            return nullptr;
        }
    }

    const double ratio = static_cast<double>(output_rate) / static_cast<double>(input_rate);
    if (src_is_valid_ratio(ratio) == 0) {
        throw_java(env, "java/lang/IllegalArgumentException", "libsamplerate rejected the conversion ratio");
        return nullptr;
    }
    const double estimated_frames = std::ceil(static_cast<double>(input_frames) * ratio) + 512.0;
    if (estimated_frames > static_cast<double>(std::numeric_limits<jsize>::max())) {
        throw_java(env, "java/lang/IllegalArgumentException", "Resampled PCM is too large");
        return nullptr;
    }
    std::vector<float> output(static_cast<size_t>(estimated_frames));
    SRC_DATA data{};
    data.data_in = input.data();
    data.data_out = output.data();
    data.input_frames = input_frames;
    data.output_frames = static_cast<long>(output.size());
    data.src_ratio = ratio;
    data.end_of_input = 1;

    const int result = src_simple(&data, SRC_SINC_BEST_QUALITY, 1);
    if (result != 0) {
        throw_java(
            env,
            "java/lang/IllegalStateException",
            std::string("libsamplerate failed: ") + src_strerror(result));
        return nullptr;
    }
    if (data.input_frames_used != input_frames || data.output_frames_gen <= 0 ||
        data.output_frames_gen > data.output_frames) {
        throw_java(env, "java/lang/IllegalStateException", "libsamplerate returned an incomplete conversion");
        return nullptr;
    }

    const jsize generated_frames = static_cast<jsize>(data.output_frames_gen);
    jfloatArray converted = env->NewFloatArray(generated_frames);
    if (converted == nullptr) return nullptr;
    env->SetFloatArrayRegion(converted, 0, generated_frames, output.data());
    if (env->ExceptionCheck()) return nullptr;
    return converted;
}
