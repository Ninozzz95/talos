#!/usr/bin/env python3

import argparse
import hashlib
import importlib.util
import json
import os
import time
from pathlib import Path

import numpy as np


PINNED_WRAPPER_REVISION = "58a6d00cf13d239b6748cb0769f35c580a8f606c"
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


def execute_oracle(engine, fixture_id, source, public_voice_path, seed, max_frames):
    if not isinstance(source, str) or not source.strip():
        raise ValueError("source must be non-empty")
    if not isinstance(max_frames, int) or not 1 <= max_frames <= MAX_ORACLE_FRAMES:
        raise ValueError(f"maxFrames must be in [1, {MAX_ORACLE_FRAMES}]")
    if not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer")

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


def load_upstream_engine(source_root):
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
        temperature=0.7,
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


def parse_arguments():
    parser = argparse.ArgumentParser(description="Run the exact pinned public Pocket ONNX oracle.")
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--fixtures", required=True, type=Path)
    parser.add_argument("--case", required=True)
    parser.add_argument("--seed", type=int, default=19)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--arrays-output", required=True, type=Path)
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    fixture_document = json.loads(arguments.fixtures.read_text(encoding="utf-8"))
    selected = select_fixture(fixture_document, arguments.case)
    engine, verified_sources = load_upstream_engine(arguments.source_root)
    result, arrays = execute_oracle(
        engine=engine,
        fixture_id=selected["id"],
        source=selected["text"],
        public_voice_path=arguments.source_root / "reference_sample.wav",
        seed=arguments.seed,
        max_frames=selected["maxFrames"],
    )
    result["upstream"] = {
        "repository": "KevinAHM/pocket-tts-onnx",
        "revision": PINNED_WRAPPER_REVISION,
        "wrapperSha256": verified_sources["pocket_tts_onnx.py"],
        "publicFixtureSha256": verified_sources["reference_sample.wav"],
    }
    write_arrays_atomic(arguments.arrays_output, arrays)
    result["arraysSha256"] = sha256_file(arguments.arrays_output)
    write_json_atomic(arguments.output, result)
    print(arguments.output)


if __name__ == "__main__":
    main()
