#!/usr/bin/env python3
"""Transcribe exact diagnostic PCM and report word-level Italian deviations."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import tempfile
import unicodedata
from typing import Any, Callable, Sequence


DEFAULT_MODEL = "openai/whisper-large-v3-turbo"
DEFAULT_MODEL_REVISION = "cf7667b3865845227378e06c611d63789cbcdcce"
WHISPER_SAMPLE_RATE = 16_000
CANDIDATE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,110}$")


def normalize_italian_transcript(value: str) -> str:
    """Normalize ASR text without inventing or joining Italian words."""

    decomposed = unicodedata.normalize("NFKD", value.casefold())
    characters: list[str] = []
    for character in decomposed:
        category = unicodedata.category(character)
        if category == "Mn":
            continue
        if category[0] in {"L", "N"}:
            characters.append(character)
        else:
            characters.append(" ")
    return " ".join("".join(characters).split())


def word_edit_operations(expected: Sequence[str], actual: Sequence[str]) -> list[dict[str, Any]]:
    """Return a deterministic Levenshtein alignment with explicit word indices."""

    rows = len(expected) + 1
    columns = len(actual) + 1
    distance = [[0] * columns for _ in range(rows)]
    for expected_index in range(rows):
        distance[expected_index][0] = expected_index
    for actual_index in range(columns):
        distance[0][actual_index] = actual_index

    for expected_index in range(1, rows):
        for actual_index in range(1, columns):
            substitution_cost = 0 if expected[expected_index - 1] == actual[actual_index - 1] else 1
            distance[expected_index][actual_index] = min(
                distance[expected_index - 1][actual_index] + 1,
                distance[expected_index][actual_index - 1] + 1,
                distance[expected_index - 1][actual_index - 1] + substitution_cost,
            )

    reversed_operations: list[dict[str, Any]] = []
    expected_index = len(expected)
    actual_index = len(actual)
    while expected_index > 0 or actual_index > 0:
        if (
            expected_index > 0
            and actual_index > 0
            and expected[expected_index - 1] == actual[actual_index - 1]
            and distance[expected_index][actual_index] == distance[expected_index - 1][actual_index - 1]
        ):
            reversed_operations.append(
                {
                    "operation": "equal",
                    "expected": expected[expected_index - 1],
                    "actual": actual[actual_index - 1],
                    "expectedIndex": expected_index - 1,
                    "actualIndex": actual_index - 1,
                }
            )
            expected_index -= 1
            actual_index -= 1
        elif (
            expected_index > 0
            and actual_index > 0
            and distance[expected_index][actual_index] == distance[expected_index - 1][actual_index - 1] + 1
        ):
            reversed_operations.append(
                {
                    "operation": "substitute",
                    "expected": expected[expected_index - 1],
                    "actual": actual[actual_index - 1],
                    "expectedIndex": expected_index - 1,
                    "actualIndex": actual_index - 1,
                }
            )
            expected_index -= 1
            actual_index -= 1
        elif (
            expected_index > 0
            and distance[expected_index][actual_index] == distance[expected_index - 1][actual_index] + 1
        ):
            reversed_operations.append(
                {
                    "operation": "delete",
                    "expected": expected[expected_index - 1],
                    "actual": None,
                    "expectedIndex": expected_index - 1,
                    "actualIndex": actual_index,
                }
            )
            expected_index -= 1
        else:
            if actual_index <= 0:
                raise AssertionError("invalid Levenshtein backtrace")
            reversed_operations.append(
                {
                    "operation": "insert",
                    "expected": None,
                    "actual": actual[actual_index - 1],
                    "expectedIndex": expected_index,
                    "actualIndex": actual_index - 1,
                }
            )
            actual_index -= 1

    return list(reversed(reversed_operations))


def evaluate_transcript(expected: str, actual: str) -> dict[str, Any]:
    expected_normalized = normalize_italian_transcript(expected)
    actual_normalized = normalize_italian_transcript(actual)
    expected_words = expected_normalized.split()
    actual_words = actual_normalized.split()
    operations = word_edit_operations(expected_words, actual_words)
    errors = [operation for operation in operations if operation["operation"] != "equal"]
    trailing_omission: list[str] = []
    for operation in reversed(operations):
        if operation["operation"] != "delete":
            break
        trailing_omission.append(operation["expected"])
    trailing_omission.reverse()
    substitutions = [
        {"expected": operation["expected"], "actual": operation["actual"]}
        for operation in operations
        if operation["operation"] == "substitute"
    ]
    return {
        "expectedNormalized": expected_normalized,
        "actualNormalized": actual_normalized,
        "expectedWordCount": len(expected_words),
        "actualWordCount": len(actual_words),
        "wer": len(errors) / max(1, len(expected_words)),
        "operations": operations,
        "missingWords": [
            operation["expected"] for operation in operations if operation["operation"] == "delete"
        ],
        "insertedWords": [
            operation["actual"] for operation in operations if operation["operation"] == "insert"
        ],
        "substitutions": substitutions,
        "trailingOmission": trailing_omission,
        "semanticGreen": not errors,
    }


def _candidate_metadata(case: dict[str, Any]) -> dict[str, Any]:
    candidate_id = case.get("candidateId")
    configuration = case.get("configuration")
    if candidate_id is None and configuration is None:
        return {}
    if not isinstance(candidate_id, str) or CANDIDATE_ID_PATTERN.fullmatch(candidate_id) is None:
        raise ValueError("candidateId is invalid")
    if not isinstance(configuration, dict) or not configuration:
        raise ValueError(f"configuration is invalid for {candidate_id}")
    try:
        normalized_configuration = json.loads(json.dumps(configuration, allow_nan=False))
    except (TypeError, ValueError) as error:
        raise ValueError(f"configuration is not finite JSON for {candidate_id}") from error
    return {
        "candidateId": candidate_id,
        "configuration": normalized_configuration,
    }


def summarize_configurations(results: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Aggregate every ASR case for each measured configuration and rank it."""

    grouped: dict[str, dict[str, Any]] = {}
    for result in results:
        candidate_id = result.get("candidateId")
        if candidate_id is None:
            continue
        metadata = _candidate_metadata(result)
        row = grouped.setdefault(
            candidate_id,
            {
                **metadata,
                "caseCount": 0,
                "semanticGreenCount": 0,
                "totalWordErrors": 0,
                "totalExpectedWords": 0,
                "worstCaseWer": 0.0,
                "trailingOmissionCount": 0,
            },
        )
        if row["configuration"] != metadata["configuration"]:
            raise ValueError(f"candidate {candidate_id} changes configuration between cases")
        operations = result.get("operations")
        if not isinstance(operations, list):
            raise ValueError(f"candidate {candidate_id} has no word operations")
        word_errors = sum(operation.get("operation") != "equal" for operation in operations)
        expected_words = int(result["expectedWordCount"])
        wer = float(result["wer"])
        trailing = result.get("trailingOmission")
        if expected_words < 0 or not math.isfinite(wer) or not isinstance(trailing, list):
            raise ValueError(f"candidate {candidate_id} contains invalid ASR evidence")
        row["caseCount"] += 1
        row["semanticGreenCount"] += int(bool(result.get("semanticGreen")))
        row["totalWordErrors"] += word_errors
        row["totalExpectedWords"] += expected_words
        row["worstCaseWer"] = max(row["worstCaseWer"], wer)
        row["trailingOmissionCount"] += len(trailing)

    ranking = list(grouped.values())
    for row in ranking:
        row["aggregateWer"] = row["totalWordErrors"] / max(1, row["totalExpectedWords"])
        row["allSemanticGreen"] = row["semanticGreenCount"] == row["caseCount"]
    ranking.sort(
        key=lambda row: (
            row["aggregateWer"],
            row["worstCaseWer"],
            row["trailingOmissionCount"],
            row["candidateId"],
        )
    )
    for rank, row in enumerate(ranking, start=1):
        row["rank"] = rank
    return ranking


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def transcribe_pcm_case(
    case: dict[str, Any],
    manifest_directory: Path,
    sample_rate: int,
    recognizer: Callable[[Any], dict[str, Any]],
    oracle_leading_silence_ms: int = 0,
) -> dict[str, Any]:
    import numpy as np
    from scipy.signal import resample_poly

    pcm_path = (manifest_directory / case["pcmFile"]).resolve()
    if pcm_path.parent != manifest_directory.resolve():
        raise ValueError(f"PCM path escapes manifest directory: {case['pcmFile']}")
    if not pcm_path.is_file():
        raise FileNotFoundError(pcm_path)
    actual_sha256 = _sha256(pcm_path)
    if actual_sha256 != case["pcmSha256"]:
        raise ValueError(f"PCM SHA-256 differs for {case['id']}")
    pcm = np.fromfile(pcm_path, dtype="<f4")
    if pcm.size != int(case["pcmSamples"]):
        raise ValueError(f"PCM sample count differs for {case['id']}")
    if not np.isfinite(pcm).all():
        raise ValueError(f"PCM contains non-finite samples for {case['id']}")
    common_divisor = math.gcd(sample_rate, WHISPER_SAMPLE_RATE)
    whisper_pcm = resample_poly(
        pcm,
        up=WHISPER_SAMPLE_RATE // common_divisor,
        down=sample_rate // common_divisor,
    ).astype(np.float32, copy=False)
    expected_whisper_samples = round(pcm.size * WHISPER_SAMPLE_RATE / sample_rate)
    if whisper_pcm.size != expected_whisper_samples:
        raise ValueError(
            f"resampled PCM length differs for {case['id']}: "
            f"expected={expected_whisper_samples} actual={whisper_pcm.size}"
        )
    if oracle_leading_silence_ms < 0:
        raise ValueError("oracle_leading_silence_ms must not be negative")
    leading_samples = round(WHISPER_SAMPLE_RATE * oracle_leading_silence_ms / 1_000)
    if leading_samples > 0:
        whisper_pcm = np.pad(whisper_pcm, (leading_samples, 0))
    transcript = recognizer(whisper_pcm)
    actual = str(transcript.get("text", "")).strip()
    return {
        "id": case["id"],
        **_candidate_metadata(case),
        "pcmFile": case["pcmFile"],
        "pcmSha256": actual_sha256,
        "pcmSamples": int(pcm.size),
        "durationSeconds": pcm.size / sample_rate,
        "oracleLeadingSilenceMs": oracle_leading_silence_ms,
        "expectedText": case["expectedText"],
        "transcript": actual,
        **evaluate_transcript(case["expectedText"], actual),
    }


def _build_recognizer(model: str, revision: str, device: str) -> Callable[[Any], dict[str, Any]]:
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

    if device == "auto":
        use_cuda = torch.cuda.is_available()
    elif device == "cuda":
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is unavailable")
        use_cuda = True
    else:
        use_cuda = False
    dtype = torch.float16 if use_cuda else torch.float32
    model_instance = AutoModelForSpeechSeq2Seq.from_pretrained(
        model,
        revision=revision,
        dtype=dtype,
        low_cpu_mem_usage=True,
        use_safetensors=True,
    )
    processor = AutoProcessor.from_pretrained(model, revision=revision)
    recognizer = pipeline(
        "automatic-speech-recognition",
        model=model_instance,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        dtype=dtype,
        device=0 if use_cuda else -1,
    )

    def transcribe(audio: Any) -> dict[str, Any]:
        return recognizer(
            audio,
            generate_kwargs={"language": "italian", "task": "transcribe"},
            return_timestamps=False,
        )

    return transcribe


def _write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        json.dump(value, temporary, ensure_ascii=False, indent=2, allow_nan=False)
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--revision", default=DEFAULT_MODEL_REVISION)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--oracle-leading-silence-ms", type=int, default=0)
    arguments = parser.parse_args(argv)

    manifest_path = arguments.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != 1:
        raise ValueError("unsupported ASR manifest schema")
    if manifest.get("encoding") != "float32le" or manifest.get("channels") != 1:
        raise ValueError("ASR qualifier accepts mono float32le PCM only")
    if manifest.get("locale") != "it-IT":
        raise ValueError("ASR qualifier requires the explicit it-IT fixture locale")
    if manifest.get("model") != arguments.model or manifest.get("modelRevision") != arguments.revision:
        raise ValueError("ASR model pin differs from the device manifest")
    sample_rate = int(manifest["sampleRate"])
    if sample_rate <= 0:
        raise ValueError("sampleRate must be positive")

    recognizer = _build_recognizer(arguments.model, arguments.revision, arguments.device)
    results = [
        transcribe_pcm_case(
            case,
            manifest_path.parent,
            sample_rate,
            recognizer,
            oracle_leading_silence_ms=arguments.oracle_leading_silence_ms,
        )
        for case in manifest["cases"]
    ]
    report = {
        "schemaVersion": 1,
        "runId": manifest["runId"],
        "manifest": manifest_path.name,
        "manifestSha256": _sha256(manifest_path),
        "model": arguments.model,
        "modelRevision": arguments.revision,
        "locale": manifest["locale"],
        "oracleLeadingSilenceMs": arguments.oracle_leading_silence_ms,
        "allSemanticGreen": all(result["semanticGreen"] for result in results),
        "configurationRanking": summarize_configurations(results),
        "cases": results,
    }
    output_path = arguments.output or manifest_path.with_name(f"{manifest_path.stem}-asr-report.json")
    _write_json_atomic(output_path.resolve(), report)
    print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False))
    return 0 if report["allSemanticGreen"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
