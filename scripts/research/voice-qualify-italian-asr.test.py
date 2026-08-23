#!/usr/bin/env python3
"""Unit gates for the deterministic part of the Italian ASR qualifier."""

from __future__ import annotations

import importlib.util
import hashlib
from pathlib import Path
import tempfile
import unittest

import numpy as np


MODULE_PATH = Path(__file__).with_name("voice-qualify-italian-asr.py")
SPEC = importlib.util.spec_from_file_location("voice_qualify_italian_asr", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load ASR qualifier from {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ItalianAsrQualifierTest(unittest.TestCase):
    @staticmethod
    def _ranked_case(
        candidate_id: str,
        expected: str,
        actual: str,
        temperature: float,
    ) -> dict[str, object]:
        return {
            "candidateId": candidate_id,
            "configuration": {"temperature": temperature, "regularDecodeFrames": 2},
            **MODULE.evaluate_transcript(expected, actual),
        }

    def test_normalization_preserves_italian_words_while_removing_punctuation(self) -> None:
        self.assertEqual(
            "perche l acqua e gia li numero 21",
            MODULE.normalize_italian_transcript("Perché l’acqua è già lì: numero 21!"),
        )

    def test_word_edit_operations_name_a_missing_final_word(self) -> None:
        operations = MODULE.word_edit_operations(
            "la frase finisce davvero".split(),
            "la frase finisce".split(),
        )

        self.assertEqual(
            [{"operation": "delete", "expected": "davvero", "actual": None, "expectedIndex": 3, "actualIndex": 3}],
            [operation for operation in operations if operation["operation"] != "equal"],
        )

    def test_exact_transcript_is_semantic_green(self) -> None:
        result = MODULE.evaluate_transcript(
            expected="La seconda frase è completa.",
            actual="la seconda frase e completa",
        )

        self.assertEqual(0.0, result["wer"])
        self.assertEqual([], result["missingWords"])
        self.assertEqual([], result["insertedWords"])
        self.assertEqual([], result["substitutions"])
        self.assertEqual([], result["trailingOmission"])
        self.assertTrue(result["semanticGreen"])

    def test_24_khz_pcm_is_resampled_to_the_exact_whisper_input_length(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcm_path = root / "case.f32le"
            pcm = np.linspace(-0.5, 0.5, 240, dtype="<f4")
            pcm.tofile(pcm_path)
            observed_lengths: list[int] = []

            def recognize(audio: np.ndarray) -> dict[str, str]:
                observed_lengths.append(len(audio))
                return {"text": "frase completa"}

            result = MODULE.transcribe_pcm_case(
                case={
                    "id": "resample",
                    "expectedText": "frase completa",
                    "pcmFile": pcm_path.name,
                    "pcmSha256": hashlib.sha256(pcm_path.read_bytes()).hexdigest(),
                    "pcmSamples": len(pcm),
                },
                manifest_directory=root,
                sample_rate=24_000,
                recognizer=recognize,
            )

        self.assertEqual([160], observed_lengths)
        self.assertEqual(0.01, result["durationSeconds"])
        self.assertTrue(result["semanticGreen"])

    def test_oracle_leading_context_changes_recognizer_input_but_not_source_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcm_path = root / "case.f32le"
            pcm = np.ones(240, dtype="<f4") * 0.1
            pcm.tofile(pcm_path)
            observed: list[np.ndarray] = []

            result = MODULE.transcribe_pcm_case(
                case={
                    "id": "leading-context",
                    "expectedText": "frase completa",
                    "pcmFile": pcm_path.name,
                    "pcmSha256": hashlib.sha256(pcm_path.read_bytes()).hexdigest(),
                    "pcmSamples": len(pcm),
                },
                manifest_directory=root,
                sample_rate=24_000,
                recognizer=lambda audio: observed.append(audio.copy()) or {"text": "frase completa"},
                oracle_leading_silence_ms=160,
            )

        self.assertEqual(2_720, len(observed[0]))
        self.assertTrue(np.all(observed[0][:2_560] == 0.0))
        self.assertEqual(240, result["pcmSamples"])
        self.assertEqual(0.01, result["durationSeconds"])
        self.assertEqual(160, result["oracleLeadingSilenceMs"])

    def test_asr_case_preserves_the_measured_candidate_configuration(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pcm_path = root / "case.f32le"
            pcm = np.ones(240, dtype="<f4") * 0.1
            pcm.tofile(pcm_path)
            configuration = {
                "temperature": 0.3,
                "lsdSteps": 1,
                "firstDecodeFrames": 2,
                "regularDecodeFrames": 2,
            }

            result = MODULE.transcribe_pcm_case(
                case={
                    "id": "temp-0p3-0",
                    "candidateId": "temp-0p3",
                    "configuration": configuration,
                    "expectedText": "frase completa",
                    "pcmFile": pcm_path.name,
                    "pcmSha256": hashlib.sha256(pcm_path.read_bytes()).hexdigest(),
                    "pcmSamples": len(pcm),
                },
                manifest_directory=root,
                sample_rate=24_000,
                recognizer=lambda _audio: {"text": "frase completa"},
            )

        self.assertEqual("temp-0p3", result["candidateId"])
        self.assertEqual(configuration, result["configuration"])

    def test_configuration_ranking_uses_all_three_repetitions_rather_than_the_last_one(self) -> None:
        expected = "uno due tre quattro"
        results = [
            self._ranked_case("steady", expected, expected, 0.3),
            self._ranked_case("steady", expected, expected, 0.3),
            self._ranked_case("steady", expected, "uno due tre", 0.3),
            self._ranked_case("last-only", expected, "uno due tre", 0.7),
            self._ranked_case("last-only", expected, "uno due quattro", 0.7),
            self._ranked_case("last-only", expected, expected, 0.7),
        ]

        ranking = MODULE.summarize_configurations(results)

        self.assertEqual(["steady", "last-only"], [row["candidateId"] for row in ranking])
        self.assertEqual([1, 2], [row["totalWordErrors"] for row in ranking])
        self.assertEqual([3, 3], [row["caseCount"] for row in ranking])

    def test_configuration_ranking_breaks_equal_error_by_trailing_omissions(self) -> None:
        expected = "uno due tre quattro"
        results = [
            self._ranked_case("internal", expected, "uno tre quattro", 0.3),
            self._ranked_case("internal", expected, "uno due quattro", 0.3),
            self._ranked_case("internal", expected, expected, 0.3),
            self._ranked_case("trailing", expected, "uno due tre", 0.5),
            self._ranked_case("trailing", expected, "uno due quattro", 0.5),
            self._ranked_case("trailing", expected, expected, 0.5),
        ]

        ranking = MODULE.summarize_configurations(results)

        self.assertEqual(["internal", "trailing"], [row["candidateId"] for row in ranking])
        self.assertEqual([0, 1], [row["trailingOmissionCount"] for row in ranking])


if __name__ == "__main__":
    unittest.main()
