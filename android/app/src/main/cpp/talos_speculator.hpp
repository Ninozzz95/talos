#pragma once

// P2-1 blocco A — involucro RAII sottile attorno a `common_speculative_*`
// (vendored in `common/speculative.{h,cpp}`, già linkata: `talos_llama`
// porta già `llama-common`, verificato in CMakeLists.txt prima di scrivere
// questo file — CR-01-style, non si presume un link che P2-2 ha già
// dimostrato poter essere falso).
//
// ⛔⛔⛔ Costruisce e distrugge SOLO: nessuna chiamata a
// begin/process/draft/accept qui. Quelle toccano il ciclo di decodifica
// vero — il blocco B di CR-11 (semantica di accettazione, mai reinventata:
// la stessa versione upstream del submodule, end-to-end) — non questo
// blocco A, che prova solo che il lifecycle è sicuro (stesso ordine di
// lavoro di P1-1: prima la lettura pura, poi il pool RAII, poi il
// comportamento).
//
// ⛔ `COMMON_SPECULATIVE_TYPE_NGRAM_MOD` è l'unico tipo che questo
// involucro costruisce (verificato in `common/common.h`: draftless,
// self-speculativo, nessun modello di draft separato — coerente con
// "speculazione draftless ngram-mod" del piano, plan.md §14). Gli altri
// dieci tipi dell'enum (modello di draft, EAGLE3, MTP, DFlash/DSpark,
// altri ngram) restano fuori scope per costruzione, non per svista.
//
// ⛔ Header-only, di proposito: `common_speculative_init` copia dentro
// l'impl ciò che le serve da `common_params_speculative` (verificato in
// `speculative.cpp`: `common_speculative_config` lo tiene per valore), e
// il corpo di questa classe è troppo piccolo per giustificare un `.cpp` e
// una riga in più su CMakeLists — nessuna nuova unità di compilazione,
// solo un header incluso da `talos_llama_jni.cpp`, che è già nel build.

#include "speculative.h"

class TalosSpeculator {
public:
    TalosSpeculator(int32_t n_match, int32_t n_max) {
        common_params_speculative parametri;
        parametri.types = { COMMON_SPECULATIVE_TYPE_NGRAM_MOD };
        parametri.ngram_mod.n_match = n_match;
        parametri.ngram_mod.n_max   = n_max;
        spec_ = common_speculative_init(parametri, /* n_seq = */ 1);
    }

    ~TalosSpeculator() {
        if (spec_ != nullptr) {
            common_speculative_free(spec_);
        }
    }

    TalosSpeculator(const TalosSpeculator &) = delete;
    TalosSpeculator & operator=(const TalosSpeculator &) = delete;

    bool pronto() const { return spec_ != nullptr; }
    common_speculative * handle() const { return spec_; }

private:
    common_speculative * spec_ = nullptr;
};
