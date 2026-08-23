#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path


PINNED_ONNX_VERSION = "1.22.0"
PINNED_ORT_VERSION = "1.29.0"
PINNED_SENTENCEPIECE_VERSION = "0.2.2"
PINNED_REVISION = "58a6d00cf13d239b6748cb0769f35c580a8f606c"
PINNED_FILES = {
    "bos_before_voice.npy": {
        "size": 4_224,
        "sha256": "212357ca66b450e7dc2ae6cb11f1efd08b49c59e25196a6979c37962fef6cd82",
    },
    "bundle.json": {
        "size": 24_365,
        "sha256": "c779c25fd836c9b85a3fc570474774777176757bd6bec0b5bffbbe599644a9f9",
    },
    "flow_lm_flow_int8.onnx": {
        "size": 9_962_530,
        "sha256": "21b2bec2f9ae4323fc545a0c7ffb274bdfa925a699fd304ed03aba53e4ca9129",
    },
    "flow_lm_main_int8.onnx": {
        "size": 76_341_079,
        "sha256": "f43ce4d823471095a7bd6d9dcfcceb46145ea96b0f2b85b7d668f15816965055",
    },
    "mimi_decoder_int8.onnx": {
        "size": 22_684_077,
        "sha256": "f120bc5cddca9514c511f128786f5d9e6e6893b067faae5e30f5b2bd5643aa03",
    },
    "mimi_encoder.onnx": {
        "size": 39_768_446,
        "sha256": "8936e1f95baedb898941fc7a259d7ab8c031aeaf6d3746ecac3cf7b280a9adda",
    },
    "text_conditioner.onnx": {
        "size": 16_388_344,
        "sha256": "692369f5ac340006fa44252155da77fe6c8a60a859848297777e0caea534068e",
    },
    "tokenizer.model": {
        "size": 60_078,
        "sha256": "6583b974a11b90e14d8a4c8e9c43f06c3861b9ede6e5023a4c27ab5a3a7d4c39",
    },
}

TOKENIZER_GOLDEN_CASES = (
    "Gli gnocchi agli spinaci sono già pronti.",
    "Scelgo centoventitré euro e quarantacinque centesimi.",
    "Il 23 agosto 2026, alle 18:45, TALOS legge l'URL https://example.org.",
    "L'IVA è al ventidue per cento; l'IBAN resta una sigla.",
)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_child(root, relative_path):
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe manifest path: {relative_path}")
    resolved_root = Path(root).resolve()
    resolved = (resolved_root / relative).resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as error:
        raise ValueError(f"unsafe manifest path: {relative_path}") from error
    return resolved


def verify_pinned_files(root, revision, expected_revision=PINNED_REVISION, expected_files=PINNED_FILES):
    if revision != expected_revision:
        raise ValueError(f"revision mismatch: expected {expected_revision}, found {revision}")
    verified = []
    for relative_path, expected in sorted(expected_files.items()):
        source = _safe_child(root, relative_path)
        if not source.is_file():
            raise ValueError(f"missing pinned file: {relative_path}")
        actual_size = source.stat().st_size
        if actual_size != expected["size"]:
            raise ValueError(
                f"size mismatch for {relative_path}: expected {expected['size']}, found {actual_size}"
            )
        actual_sha = sha256_file(source)
        if actual_sha != expected["sha256"]:
            raise ValueError(
                f"sha256 mismatch for {relative_path}: expected {expected['sha256']}, found {actual_sha}"
            )
        verified.append({"path": relative_path, "size": actual_size, "sha256": actual_sha})
    return verified


def validate_bundle_metadata(metadata):
    exact = {
        "schema_version": 2,
        "bundle_name": "italian",
        "sample_rate": 24_000,
        "frame_rate": 12.5,
        "samples_per_frame": 1_920,
        "latent_dim": 32,
        "conditioning_dim": 1_024,
        "max_token_per_chunk": 50,
        "insert_bos_before_voice": True,
        "tokenizer_file": "tokenizer.model",
        "bos_before_voice_file": "bos_before_voice.npy",
    }
    for key, expected in exact.items():
        actual = metadata.get(key)
        if actual != expected:
            raise ValueError(f"{key} mismatch: expected {expected!r}, found {actual!r}")
    for key in ("flow_lm_state_manifest", "mimi_state_manifest"):
        if not isinstance(metadata.get(key), list):
            raise ValueError(f"{key} must be a list")
    return {
        "schemaVersion": metadata["schema_version"],
        "language": metadata["bundle_name"],
        "sampleRate": metadata["sample_rate"],
        "frameRate": metadata["frame_rate"],
        "samplesPerFrame": metadata["samples_per_frame"],
        "frameDurationMs": metadata["samples_per_frame"] * 1000.0 / metadata["sample_rate"],
        "latentDim": metadata["latent_dim"],
        "stateCounts": {
            "flow": len(metadata["flow_lm_state_manifest"]),
            "mimi": len(metadata["mimi_state_manifest"]),
        },
        "bosRequired": metadata["insert_bos_before_voice"],
    }


def _normalize_shape(shape):
    return [dimension if isinstance(dimension, int) else None for dimension in shape]


def _require_tensor(name, expected_dtype, expected_shape, graph_side, graph_name):
    actual = graph_side.get(name)
    if actual is None:
        raise ValueError(f"{graph_name} missing tensor {name}")
    if actual.get("dtype") != expected_dtype:
        raise ValueError(
            f"{graph_name} {name} dtype mismatch: expected {expected_dtype}, found {actual.get('dtype')}"
        )
    actual_shape = _normalize_shape(actual.get("shape", []))
    expected_shape = _normalize_shape(expected_shape)
    if len(actual_shape) != len(expected_shape):
        raise ValueError(
            f"{graph_name} {name} shape rank mismatch: expected {expected_shape}, found {actual_shape}"
        )
    for expected_dimension, actual_dimension in zip(expected_shape, actual_shape, strict=True):
        if actual_dimension is not None and expected_dimension != actual_dimension:
            raise ValueError(
                f"{graph_name} {name} shape mismatch: expected {expected_shape}, found {actual_shape}"
            )


def validate_state_manifest(graph_name, manifest, graph):
    expected_indices = list(range(len(manifest)))
    indices = [entry.get("index") for entry in manifest]
    if indices != expected_indices:
        raise ValueError(f"{graph_name} state indices are not contiguous: {indices}")
    input_names = [entry.get("input_name") for entry in manifest]
    output_names = [entry.get("output_name") for entry in manifest]
    if len(set(input_names)) != len(input_names) or len(set(output_names)) != len(output_names):
        raise ValueError(f"{graph_name} state names are not unique")
    for entry in manifest:
        _require_tensor(
            entry["input_name"], entry["dtype"], entry["shape"], graph["inputs"], graph_name
        )
        _require_tensor(
            entry["output_name"], entry["dtype"], entry["shape"], graph["outputs"], graph_name
        )
        if entry.get("fill") not in {"nan", "zeros", "ones", "empty"}:
            raise ValueError(f"{graph_name} {entry['input_name']} has unsupported fill")
    contract = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "stateCount": len(manifest),
        "contractSha256": hashlib.sha256(contract).hexdigest(),
    }


def inspect_onnx_io(model):
    try:
        import onnx
    except ModuleNotFoundError as error:
        raise RuntimeError("onnx is required") from error

    dtype_names = {
        onnx.TensorProto.FLOAT: "float32",
        onnx.TensorProto.FLOAT16: "float16",
        onnx.TensorProto.INT64: "int64",
        onnx.TensorProto.BOOL: "bool",
    }

    def describe(value_info):
        tensor = value_info.type.tensor_type
        shape = []
        for dimension in tensor.shape.dim:
            if dimension.HasField("dim_value"):
                shape.append(int(dimension.dim_value))
            else:
                shape.append(None)
        dtype = dtype_names.get(tensor.elem_type)
        if dtype is None:
            raise ValueError(f"unsupported ONNX dtype {tensor.elem_type} for {value_info.name}")
        return {"dtype": dtype, "shape": shape}

    return {
        "inputs": {item.name: describe(item) for item in model.graph.input},
        "outputs": {item.name: describe(item) for item in model.graph.output},
    }


def audit_tokenizer(tokenizer_path):
    try:
        import sentencepiece as sentencepiece
    except ModuleNotFoundError as error:
        raise RuntimeError("sentencepiece is required") from error
    if sentencepiece.__version__ != PINNED_SENTENCEPIECE_VERSION:
        raise ValueError(
            f"expected sentencepiece=={PINNED_SENTENCEPIECE_VERSION}, found {sentencepiece.__version__}"
        )
    processor = sentencepiece.SentencePieceProcessor(model_file=str(tokenizer_path))
    encoded = [processor.encode(case, out_type=int) for case in TOKENIZER_GOLDEN_CASES]
    canonical = json.dumps(encoded, separators=(",", ":")).encode("ascii")
    round_trips = [processor.decode(ids) for ids in encoded]
    if round_trips != list(TOKENIZER_GOLDEN_CASES):
        raise ValueError("tokenizer golden round trip mismatch")
    return {
        "libraryVersion": sentencepiece.__version__,
        "vocabSize": processor.vocab_size(),
        "goldenCaseCount": len(encoded),
        "goldenIdsSha256": hashlib.sha256(canonical).hexdigest(),
    }


def build_artifact(revision, verified_files, bundle_contract, graph_audits, tokenizer_audit):
    return {
        "schemaVersion": 1,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "source": {
            "repository": "KevinAHM/pocket-tts-onnx",
            "revision": revision,
        },
        "runtimePins": {
            "onnx": PINNED_ONNX_VERSION,
            "onnxRuntime": PINNED_ORT_VERSION,
            "sentencePiece": PINNED_SENTENCEPIECE_VERSION,
        },
        "verifiedFiles": verified_files,
        "bundleContract": bundle_contract,
        "graphContracts": graph_audits,
        "tokenizerContract": tokenizer_audit,
        "officialPyTorchConformance": {
            "status": "BLOCKED_AUTH",
            "reason": "official_hugging_face_repository_requires_owner_authentication",
        },
    }


def write_json_atomic(path, value):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def run_audit(bundle_root, revision):
    try:
        import onnx
        import onnxruntime
    except ModuleNotFoundError as error:
        raise RuntimeError("onnx and onnxruntime are required") from error
    if onnx.__version__ != PINNED_ONNX_VERSION:
        raise ValueError(f"expected onnx=={PINNED_ONNX_VERSION}, found {onnx.__version__}")
    if onnxruntime.__version__ != PINNED_ORT_VERSION:
        raise ValueError(
            f"expected onnxruntime=={PINNED_ORT_VERSION}, found {onnxruntime.__version__}"
        )

    root = Path(bundle_root)
    verified = verify_pinned_files(root, revision)
    metadata = json.loads((root / "bundle.json").read_text(encoding="utf-8"))
    bundle_contract = validate_bundle_metadata(metadata)
    graph_audits = {}
    graph_specs = {
        "flow_lm_main_int8.onnx": ("flow_lm", metadata["flow_lm_state_manifest"]),
        "mimi_decoder_int8.onnx": ("mimi_decoder", metadata["mimi_state_manifest"]),
    }
    for filename, (graph_name, manifest) in graph_specs.items():
        model = onnx.load(str(root / filename), load_external_data=False)
        graph_audits[filename] = validate_state_manifest(
            graph_name, manifest, inspect_onnx_io(model)
        )
    for filename in (
        "flow_lm_flow_int8.onnx",
        "mimi_encoder.onnx",
        "text_conditioner.onnx",
    ):
        model = onnx.load(str(root / filename), load_external_data=False)
        graph = inspect_onnx_io(model)
        canonical = json.dumps(graph, sort_keys=True, separators=(",", ":")).encode("utf-8")
        graph_audits[filename] = {
            "inputCount": len(graph["inputs"]),
            "outputCount": len(graph["outputs"]),
            "contractSha256": hashlib.sha256(canonical).hexdigest(),
        }
    tokenizer_audit = audit_tokenizer(root / "tokenizer.model")
    return build_artifact(
        revision=revision,
        verified_files=verified,
        bundle_contract=bundle_contract,
        graph_audits=graph_audits,
        tokenizer_audit=tokenizer_audit,
    )


def parse_arguments():
    parser = argparse.ArgumentParser(description="Fail-closed audit of the pinned Italian Pocket v2 bundle.")
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--revision", default=PINNED_REVISION)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    artifact = run_audit(arguments.bundle, arguments.revision)
    write_json_atomic(arguments.output, artifact)
    print(arguments.output)


if __name__ == "__main__":
    main()
