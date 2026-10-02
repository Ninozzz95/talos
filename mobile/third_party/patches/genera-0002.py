"""Rigenera la patch 0002 (vedi README.md, «Redoing a patch»): va lanciato sul pin CON la 0001 già applicata.

Gruppi MoE / Qwen3-Next / SSM compilati al primo uso, sul checkout del submodule. Ogni ancora deve comparire UNA
volta (regola dell'ancora unica); i fine riga del file (CRLF su Windows) restano.
"""
import os
import re
import sys

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'llama.cpp', 'ggml', 'src', 'ggml-opencl',
                 'ggml-opencl.cpp')
raw = open(P, 'rb').read().decode('utf-8')
NL = '\r\n' if '\r\n' in raw else '\n'
s = raw.replace('\r\n', '\n')


def una(testo, ancora):
    n = testo.count(ancora)
    assert n == 1, (n, ancora[:80])
    return testo.index(ancora)


# 1) i flag nel contesto
a = '    // rest of the kernels are currently always loaded in alloc_buffer.\n    bool kernels_loaded = false;\n'
i = una(s, a)
s = s[:i + len(a)] + (
    '    // TALOS 0002: kernels that only some architectures use (MoE, Qwen3-Next\n'
    '    // gated delta net, Mamba SSM) are compiled on first use, like argsort.\n'
    '    bool kernels_loaded_moe = false;\n'
    '    bool kernels_loaded_gdn = false;\n'
    '    bool kernels_loaded_ssm = false;\n'
) + s[i + len(a):]

# 2) i blocchi, tagliati dentro load_cl_kernels
inizio_load = una(s, 'static void load_cl_kernels(ggml_backend_opencl_context *backend_ctx) {\n')
fine_load = s.index('\n}\n', inizio_load) + 3


def taglia(da, a_prima_di):
    global s
    i = una(s, da)
    j = s.index(a_prima_di, i)
    assert inizio_load < i < j < fine_load, (da, a_prima_di)
    blocco = s[i:j]
    s = s[:i] + s[j:]
    return blocco


moe_a = taglia('    // add_id\n    {', '    // tri\n')
ssm = taglia('    // ssm_conv\n', '    // gated_delta_net:')
gdn = taglia('    // gated_delta_net:', '    // moe_combine (fused router-weight mul + cross-expert sum)\n')
moe_b = taglia('    // moe_combine (fused router-weight mul + cross-expert sum)\n', '    // Adreno kernels\n')
# ⛔ La dichiarazione di CL_moe_compile_opts RESTA in load_cl_kernels: la usano anche i blocchi q6_K che vengono
# dopo la zona MoE (scoperto alla prima compilazione, 01/10/2026). La funzione MoE se ne fa una copia sua.
DICHIARAZIONE_MOE = (
    '    std::string CL_moe_compile_opts = std::string("-cl-std=") + opencl_c_std +\n'
    '            " -cl-mad-enable "\n'
    '            " -cl-fast-relaxed-math";\n'
)
una(s, DICHIARAZIONE_MOE)
moe_c = taglia('    // gemv_moe_q4_1_f32_ns\n', '    // gemv_noshuffle_q6_k_f32\n')
for nome, b in [('moe_a', moe_a), ('ssm', ssm), ('gdn', gdn), ('moe_b', moe_b), ('moe_c', moe_c)]:
    print(nome, b.count('build_program_from_source'), 'programmi,', len(b.splitlines()), 'righe')

fine_load = s.index('\n}\n', una(s, 'static void load_cl_kernels(ggml_backend_opencl_context *backend_ctx) {\n')) + 3

PROLOGO = (
    '    cl_int err;\n'
    '    const std::string compile_opts = backend_ctx->kernel_compile_opts;\n'
    '    auto opencl_c_std =\n'
    '        std::string("CL") + std::to_string(backend_ctx->opencl_c_version.major) + "." + std::to_string(backend_ctx->opencl_c_version.minor);\n'
    '    GGML_UNUSED(opencl_c_std);\n'
)


def funzione(nome, flag, corpo):
    return (
        f'\nstatic void {nome}(ggml_backend_opencl_context *backend_ctx) {{\n'
        f'    if (backend_ctx->{flag}) {{\n        return;\n    }}\n'
        + PROLOGO + corpo +
        f'    backend_ctx->{flag} = true;\n'
        '}\n'
    )


nuove = (
    '\n// TALOS 0002 (01/10/2026): load_cl_kernels compiled every program at the first\n'
    '// buffer allocation, ~53% of them for architectures the model may not have\n'
    '// (measured on Adreno 830 with a dense Q4_K_M model). These groups are\n'
    '// compiled on first use instead, following load_cl_kernels_argsort.\n'
    + funzione('load_cl_kernels_moe', 'kernels_loaded_moe',
               moe_a + moe_b + '#ifdef GGML_OPENCL_USE_ADRENO_KERNELS\n' + DICHIARAZIONE_MOE + '\n' + moe_c
               + '#endif // GGML_OPENCL_USE_ADRENO_KERNELS\n')
    + funzione('load_cl_kernels_gdn', 'kernels_loaded_gdn', gdn)
    + funzione('load_cl_kernels_ssm', 'kernels_loaded_ssm', ssm)
)
s = s[:fine_load] + nuove + s[fine_load:]

# 3) le chiamate, all'inizio delle operazioni che usano i gruppi
def all_inizio(firma, chiamata):
    global s
    definizioni = []
    for m0 in re.finditer(re.escape(firma), s):
        dopo = s[m0.start():]
        graffa, punto_virgola = dopo.find('{'), dopo.find(';')
        if graffa != -1 and (punto_virgola == -1 or graffa < punto_virgola):
            definizioni.append(m0.start())
    assert len(definizioni) == 1, (len(definizioni), firma)
    i = definizioni[0]
    fine_funzione = s.index('\n}\n', i)
    m = re.compile(r'ggml_backend_opencl_context\s*\*\s*backend_ctx\s*=[^\n]*\n').search(s, i, fine_funzione)
    assert m, firma
    fine_riga = m.end()
    s = s[:fine_riga] + f'    {chiamata}(backend_ctx); // TALOS 0002\n' + s[fine_riga:]


for firma, chiamata in [
    ('static void ggml_cl_moe_bias_combine_fused(', 'load_cl_kernels_moe'),
    ('static void ggml_cl_moe_combine_fused(', 'load_cl_kernels_moe'),
    ('static void ggml_cl_add_id(', 'load_cl_kernels_moe'),
    ('static void moe_router_reoerder(', 'load_cl_kernels_moe'),
    ('static void ggml_cl_mul_mat_id(', 'load_cl_kernels_moe'),
    ('static void ggml_cl_ssm_scan(', 'load_cl_kernels_ssm'),
    ('static void ggml_cl_ssm_conv(', 'load_cl_kernels_ssm'),
    ('static void ggml_cl_gated_delta_net(', 'load_cl_kernels_gdn'),
]:
    all_inizio(firma, chiamata)

# set_tensor: subito prima di ogni uso dei kernel MoE
st = una(s, 'static void ggml_backend_opencl_buffer_set_tensor(')
st_fine = s.index('\n}\n', st)
corpo = s[st:st_fine]
usi = [m.start() for m in re.finditer(r'\n([ \t]*)[^\n]*backend_ctx->kernel_moe_', corpo)]
print('usi MoE in set_tensor:', len(usi))
for pos in reversed(usi):
    rientro = re.match(r'\n([ \t]*)', corpo[pos:]).group(1)
    corpo = corpo[:pos] + f'\n{rientro}load_cl_kernels_moe(backend_ctx); // TALOS 0002' + corpo[pos:]
s = s[:st] + corpo + s[st_fine:]

open(P, 'wb').write(s.replace('\n', NL).encode('utf-8'))
print('fatto, fine riga', repr(NL))
