#!/usr/bin/env python3

import argparse
import hashlib
import importlib.util
import json
import math
import os
import platform
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import scipy
import sentencepiece as spm


PINNED_WRAPPER_REVISION = "58a6d00cf13d239b6748cb0769f35c580a8f606c"
PINNED_ONNX_RUNTIME_VERSION = "1.29.0"
PINNED_UPSTREAM_SOURCES = {
    "pocket_tts_onnx.py": "4381a4396ba08b2626a25a87001e3c51dbacd136e1022d2d40a8cefb14b44be0",
    "reference_sample.wav": "88fbb0d31ec26674e97e531a71758cabe4e0e4e5b5a18dafa783021a7f5c9366",
}
MAX_ORACLE_FRAMES = 720


def sha256_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def runtime_provenance():
    return {
        "python": platform.python_version(),
        "implementation": platform.python_implementation(),
        "system": platform.system(),
        "machine": platform.machine(),
        "onnxRuntime": ort.__version__,
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "sentencePiece": spm.__version__,
    }


def require_pinned_runtime(provenance):
    actual = provenance.get("onnxRuntime")
    if actual != PINNED_ONNX_RUNTIME_VERSION:
        raise ValueError(
            "host ONNX Runtime must be "
            f"{PINNED_ONNX_RUNTIME_VERSION}, found {actual or '<missing>'}"
        )
    return provenance


def float32_contract(values):
    contiguous = np.ascontiguousarray(values, dtype=np.dtype("<f4"))
    payload = contiguous.tobytes(order="C")
    return {
        "shape": [int(value) for value in contiguous.shape],
        "byteLength": len(payload),
        "sha256": sha256_bytes(payload),
    }


def canonical_array_bytes(values, dtype, shape):
    dtype_map = {
        "float32": np.dtype("<f4"),
        "float16": np.dtype("<f2"),
        "int64": np.dtype("<i8"),
        "bool": np.dtype("?"),
    }
    if dtype not in dtype_map:
        raise ValueError(f"unsupported state dtype: {dtype}")
    expected_shape = tuple(int(dimension) for dimension in shape)
    source = np.asarray(values)
    if source.shape != expected_shape:
        raise ValueError(
            f"state shape differs: expected {expected_shape}, found {source.shape}"
        )
    expected_dtype = dtype_map[dtype]
    if source.dtype.kind != expected_dtype.kind or source.dtype.itemsize != expected_dtype.itemsize:
        raise ValueError(
            f"state dtype differs: expected {dtype}, found {source.dtype}"
        )
    canonical = np.ascontiguousarray(source, dtype=expected_dtype)
    return canonical.tobytes(order="C")


def state_sha256(state, manifest):
    expected_names = [entry["input_name"] for entry in manifest]
    if len(expected_names) != len(set(expected_names)):
        raise ValueError("state manifest input names are duplicated")
    if set(state) != set(expected_names):
        raise ValueError("state keys differ from the state manifest")
    digest = hashlib.sha256()
    for entry in manifest:
        shape = [int(dimension) for dimension in entry["shape"]]
        header = (
            f'{entry["input_name"]}\0{entry["output_name"]}\0'
            f'{entry["dtype"]}\0{",".join(str(value) for value in shape)}\0'
        ).encode("utf-8")
        digest.update(header)
        digest.update(
            canonical_array_bytes(
                state[entry["input_name"]],
                entry["dtype"],
                shape,
            )
        )
    return digest.hexdigest()


def collect_flow_boundary_trace(engine, source, conditioning, max_frames):
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source must be non-empty")
    if not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_ORACLE_FRAMES:
        raise ValueError(f"maxFrames must be in [1, {MAX_ORACLE_FRAMES}]")
    if float(engine.temperature) != 0.0:
        raise ValueError("flow boundary trace requires temperature zero")
    if int(engine.lsd_steps) != 1:
        raise ValueError("flow boundary trace requires one LSD step")

    chunks = engine._split_into_best_sentences(source)
    if len(chunks) != 1:
        raise ValueError("flow boundary trace requires exactly one text chunk")
    chunk = chunks[0]
    text_ids = np.ascontiguousarray(engine._tokenize(chunk), dtype=np.dtype("<i8"))
    if text_ids.ndim != 2 or text_ids.shape[0] != 1 or text_ids.shape[1] < 1:
        raise ValueError(f"unexpected token id shape: {text_ids.shape}")
    voice_embeddings = np.ascontiguousarray(
        engine._prepare_voice_embeddings(conditioning),
        dtype=np.dtype("<f4"),
    )
    state = engine._init_state(engine.flow_state_manifest)
    empty_sequence = np.zeros((1, 0, engine.latent_dim), dtype=np.float32)
    empty_text = np.zeros((1, 0, engine.conditioning_dim), dtype=np.float32)

    voice_started_at = time.perf_counter_ns()
    result = engine.flow_lm_main.run(
        None,
        {
            "sequence": empty_sequence,
            "text_embeddings": voice_embeddings,
            **state,
        },
    )
    voice_duration_ns = time.perf_counter_ns() - voice_started_at
    engine._update_state_from_outputs(
        state,
        result,
        engine.flow_state_manifest,
        output_offset=2,
    )
    voice_state_sha256 = state_sha256(state, engine.flow_state_manifest)

    text_started_at = time.perf_counter_ns()
    text_embeddings = np.ascontiguousarray(
        engine.text_conditioner.run(None, {"token_ids": text_ids})[0],
        dtype=np.dtype("<f4"),
    )
    text_duration_ns = time.perf_counter_ns() - text_started_at
    if text_embeddings.ndim == 2:
        text_embeddings = text_embeddings[None]
    expected_text_shape = (1, int(text_ids.shape[1]), int(engine.conditioning_dim))
    if text_embeddings.shape != expected_text_shape:
        raise ValueError(
            f"unexpected text embedding shape: expected {expected_text_shape}, "
            f"found {text_embeddings.shape}"
        )

    text_prefill_started_at = time.perf_counter_ns()
    result = engine.flow_lm_main.run(
        None,
        {
            "sequence": empty_sequence,
            "text_embeddings": text_embeddings,
            **state,
        },
    )
    text_prefill_duration_ns = time.perf_counter_ns() - text_prefill_started_at
    engine._update_state_from_outputs(
        state,
        result,
        engine.flow_state_manifest,
        output_offset=2,
    )
    text_state_sha256 = state_sha256(state, engine.flow_state_manifest)

    prepared = engine._prepare_text_prompt(chunk)
    frames_after_eos = (
        engine.model_recommended_frames_after_eos
        if getattr(engine, "model_recommended_frames_after_eos", None) is not None
        else prepared[1] + 2
    )
    current = np.full((1, 1, engine.latent_dim), np.nan, dtype=np.float32)
    eos_step = None
    frames = []
    latents = []
    for frame_index in range(max_frames):
        main_started_at = time.perf_counter_ns()
        result = engine.flow_lm_main.run(
            None,
            {
                "sequence": current,
                "text_embeddings": empty_text,
                **state,
            },
        )
        main_duration_ns = time.perf_counter_ns() - main_started_at
        conditioning_output = np.ascontiguousarray(result[0], dtype=np.dtype("<f4"))
        eos_output = np.ascontiguousarray(result[1], dtype=np.dtype("<f4"))
        engine._update_state_from_outputs(
            state,
            result,
            engine.flow_state_manifest,
            output_offset=2,
        )
        if conditioning_output.shape != (1, engine.conditioning_dim):
            raise ValueError(f"unexpected Flow conditioning shape: {conditioning_output.shape}")
        if eos_output.size != 1:
            raise ValueError(f"unexpected Flow EOS shape: {eos_output.shape}")
        eos_logit = float(eos_output.reshape(-1)[0])
        if eos_logit > -4.0 and eos_step is None:
            eos_step = frame_index
        if eos_step is not None and frame_index >= eos_step + frames_after_eos:
            break

        x = np.zeros((1, engine.latent_dim), dtype=np.float32)
        flow_direction = None
        flow_duration_ns = 0
        for s_array, t_array in engine._st_buffers:
            flow_started_at = time.perf_counter_ns()
            flow_direction = np.ascontiguousarray(
                engine.flow_lm_flow.run(
                    None,
                    {
                        "c": conditioning_output,
                        "s": s_array,
                        "t": t_array,
                        "x": x,
                    },
                )[0],
                dtype=np.dtype("<f4"),
            )
            flow_duration_ns += time.perf_counter_ns() - flow_started_at
            x = np.ascontiguousarray(x + flow_direction, dtype=np.dtype("<f4"))
        if flow_direction is None or x.shape != (1, engine.latent_dim):
            raise ValueError("unexpected Flow direction output")
        latent = x.reshape(1, 1, engine.latent_dim)
        frame = {
            "frameIndex": frame_index,
            "eosLogit": eos_logit,
            "conditioningSha256": float32_contract(conditioning_output)["sha256"],
            "flowDirectionSha256": float32_contract(flow_direction)["sha256"],
            "latentSha256": float32_contract(latent)["sha256"],
            "flowMainDurationNs": main_duration_ns,
            "flowStepDurationNs": flow_duration_ns,
        }
        if frame_index < 2:
            frame["arStateSha256"] = state_sha256(state, engine.flow_state_manifest)
        frames.append(frame)
        latents.append(latent)
        current = latent

    latent_values = (
        np.concatenate(latents, axis=1)
        if latents
        else np.zeros((1, 0, engine.latent_dim), dtype=np.float32)
    )
    return {
        "schemaVersion": 1,
        "tokenCount": int(text_ids.shape[1]),
        "tokenIdsSha256": sha256_bytes(canonical_array_bytes(text_ids, "int64", text_ids.shape)),
        "preparedVoiceEmbeddings": float32_contract(voice_embeddings),
        "voicePrefillDurationNs": voice_duration_ns,
        "voicePrefillStateSha256": voice_state_sha256,
        "textConditionerDurationNs": text_duration_ns,
        "textEmbeddings": float32_contract(text_embeddings),
        "textPrefillDurationNs": text_prefill_duration_ns,
        "textPrefillStateSha256": text_state_sha256,
        "frameCount": len(frames),
        "latentSha256": float32_contract(latent_values)["sha256"],
        "frames": frames,
    }


def verify_upstream_sources(root, expected=PINNED_UPSTREAM_SOURCES):
    base = Path(root).resolve()
    verified = {}
    for relative_path, expected_sha in sorted(expected.items()):
        relative = Path(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"unsafe upstream path: {relative_path}")
        source = (base / relative).resolve()
        try:
            source.relative_to(base)
        except ValueError as error:
            raise ValueError(f"unsafe upstream path: {relative_path}") from error
        if not source.is_file():
            raise ValueError(f"missing upstream source: {relative_path}")
        actual_sha = sha256_file(source)
        if actual_sha != expected_sha:
            raise ValueError(
                f"{relative_path} sha256 mismatch: expected {expected_sha}, found {actual_sha}"
            )
        verified[relative_path] = actual_sha
    return verified


def select_fixture(document, fixture_id):
    if document.get("schemaVersion") != 1:
        raise ValueError("fixture schemaVersion must be 1")
    if document.get("locale") != "it-IT":
        raise ValueError("fixture locale must be it-IT")
    cases = document.get("cases")
    if not isinstance(cases, list):
        raise ValueError("fixture cases must be a list")
    matches = [case for case in cases if case.get("id") == fixture_id]
    if not matches:
        raise ValueError(f"fixture id is missing: {fixture_id}")
    if len(matches) != 1:
        raise ValueError(f"fixture id must be unique: {fixture_id}")
    selected = matches[0]
    if not isinstance(selected.get("text"), str) or not selected["text"].strip():
        raise ValueError(f"fixture source is empty: {fixture_id}")
    max_frames = selected.get("maxFrames")
    if not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_ORACLE_FRAMES:
        raise ValueError(f"fixture maxFrames is invalid: {fixture_id}")
    return selected


def execute_oracle(
    engine,
    fixture_id,
    source,
    public_voice_path,
    seed,
    max_frames,
    temperature,
):
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source must be non-empty")
    if not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_ORACLE_FRAMES:
        raise ValueError(f"maxFrames must be in [1, {MAX_ORACLE_FRAMES}]")
    if not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer")
    if (
        not isinstance(temperature, (int, float))
        or not math.isfinite(temperature)
        or not 0.0 <= temperature <= 2.0
    ):
        raise ValueError("temperature must be finite and in [0, 2]")

    np.random.seed(seed)
    started = time.perf_counter_ns()
    latents = np.ascontiguousarray(
        engine.generate_latents(source, public_voice_path, max_frames=max_frames),
        dtype=np.float32,
    )
    generated = time.perf_counter_ns()
    pcm = np.ascontiguousarray(engine.decode_latents(latents, chunk_size=15), dtype=np.float32)
    finished = time.perf_counter_ns()

    if latents.ndim != 3 or latents.shape[0] != 1 or latents.shape[2] != 32:
        raise ValueError(f"unexpected latent shape: {latents.shape}")
    if pcm.ndim != 1:
        raise ValueError(f"unexpected PCM rank: {pcm.shape}")
    if not np.isfinite(latents).all() or not np.isfinite(pcm).all():
        raise ValueError("oracle output contains non-finite values")

    frame_count = int(latents.shape[1])
    sample_count = int(pcm.shape[0])
    sample_rate = int(engine.sample_rate)
    duration_ms = sample_count * 1000.0 / sample_rate if sample_rate > 0 else 0.0
    elapsed_ms = (finished - started) / 1_000_000.0
    result = {
        "schemaVersion": 1,
        "fixtureId": fixture_id,
        "seed": seed,
        "temperature": float(temperature),
        "maxFrames": max_frames,
        "frameCount": frame_count,
        "sampleCount": sample_count,
        "sampleRate": sample_rate,
        "frameRate": float(engine.frame_rate),
        "durationMs": duration_ms,
        "generationMs": (generated - started) / 1_000_000.0,
        "decodeMs": (finished - generated) / 1_000_000.0,
        "wallMs": elapsed_ms,
        "rtf": elapsed_ms / duration_ms if duration_ms > 0 else None,
        "latentSha256": sha256_bytes(latents.tobytes(order="C")),
        "pcmSha256": sha256_bytes(pcm.tobytes(order="C")),
    }
    return result, {"latents": latents, "pcm": pcm}


def export_public_conditioning(engine, public_voice_path):
    conditioning = np.ascontiguousarray(
        engine.encode_voice(public_voice_path),
        dtype=np.dtype("<f4"),
    )
    if (
        conditioning.ndim != 3
        or conditioning.shape[0] != 1
        or not 1 <= conditioning.shape[1] <= 256
        or conditioning.shape[2] != 1024
    ):
        raise ValueError(f"unexpected conditioning shape: {conditioning.shape}")
    if not np.isfinite(conditioning).all():
        raise ValueError("conditioning contains non-finite values")
    return conditioning, float32_contract(conditioning)


def load_upstream_engine(source_root, temperature):
    if not math.isfinite(temperature) or not 0.0 <= temperature <= 2.0:
        raise ValueError("temperature must be finite and in [0, 2]")
    root = Path(source_root)
    verified = verify_upstream_sources(root)
    script = root / "pocket_tts_onnx.py"
    spec = importlib.util.spec_from_file_location("talos_pinned_pocket_tts_onnx", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    engine = module.PocketTTSOnnx(
        models_dir=str(root / "onnx"),
        language="italian",
        precision="int8",
        device="cpu",
        temperature=temperature,
        lsd_steps=1,
    )
    return engine, verified


def write_json_atomic(path, value):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def write_arrays_atomic(path, arrays):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("wb") as target:
            np.savez(target, **arrays)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def write_float32_atomic(path, values):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        payload = np.ascontiguousarray(values, dtype=np.dtype("<f4")).tobytes(order="C")
        with temporary.open("wb") as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def parse_arguments():
    parser = argparse.ArgumentParser(description="Run the exact pinned public Pocket ONNX oracle.")
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--case", required=True)
    parser.add_argument("--seed", type=int, default=19)
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--arrays-output", required=True, type=Path)
    parser.add_argument("--conditioning-output", type=Path)
    parser.add_argument("--latents-output", type=Path)
    parser.add_argument("--pcm-output", type=Path)
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    fixture_document = json.loads(arguments.fixtures.read_text(encoding="utf-8"))
    selected = select_fixture(fixture_document, arguments.case)
    engine, verified_sources = load_upstream_engine(arguments.source_root, arguments.temperature)
    result, arrays = execute_oracle(
        engine=engine,
        fixture_id=selected["id"],
        source=selected["text"],
        public_voice_path=arguments.source_root / "reference_sample.wav",
        seed=arguments.seed,
        max_frames=selected["maxFrames"],
        temperature=arguments.temperature,
    )
    result["runtime"] = require_pinned_runtime(runtime_provenance())
    result["upstream"] = {
        "repository": "KevinAHM/pocket-tts-onnx",
        "revision": PINNED_WRAPPER_REVISION,
        "wrapperSha256": verified_sources["pocket_tts_onnx.py"],
        "publicFixtureSha256": verified_sources["reference_sample.wav"],
    }
    conditioning, conditioning_contract = export_public_conditioning(
        engine,
        arguments.source_root / "reference_sample.wav",
    )
    flow_boundaries = collect_flow_boundary_trace(
        engine=engine,
        source=selected["text"],
        conditioning=conditioning,
        max_frames=selected["maxFrames"],
    )
    if flow_boundaries["latentSha256"] != result["latentSha256"]:
        raise ValueError("flow boundary trace does not reproduce the oracle latent output")
    result["flowBoundaries"] = flow_boundaries
    if arguments.conditioning_output is not None:
        write_float32_atomic(arguments.conditioning_output, conditioning)
        if sha256_file(arguments.conditioning_output) != conditioning_contract["sha256"]:
            raise ValueError("conditioning output changed while writing")
        result["conditioning"] = conditioning_contract
    write_arrays_atomic(arguments.arrays_output, arrays)
    result["arraysSha256"] = sha256_file(arguments.arrays_output)
    if arguments.latents_output is not None:
        contract = float32_contract(arrays["latents"])
        write_float32_atomic(arguments.latents_output, arrays["latents"])
        if sha256_file(arguments.latents_output) != contract["sha256"]:
            raise ValueError("latent output changed while writing")
        result["latents"] = contract
    if arguments.pcm_output is not None:
        write_float32_atomic(arguments.pcm_output, arrays["pcm"])
        if sha256_file(arguments.pcm_output) != result["pcmSha256"]:
            raise ValueError("PCM output changed while writing")
    write_json_atomic(arguments.output, result)
    print(arguments.output)


if __name__ == "__main__":
    main()
