import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np


SCRIPT = Path(__file__).with_name("voice-pocket-reference.py")


def load_reference():
    spec = importlib.util.spec_from_file_location("talos_voice_pocket_reference", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakePocketEngine:
    sample_rate = 24_000
    frame_rate = 12.5

    def generate_latents(self, text, voice, max_frames):
        del text, voice
        return np.random.normal(size=(1, max_frames, 32)).astype(np.float32)

    def decode_latents(self, latents, chunk_size=15):
        del chunk_size
        return latents.reshape(-1).astype(np.float32)

    def encode_voice(self, public_voice_path):
        del public_voice_path
        return np.arange(2 * 1024, dtype=np.float32).reshape(1, 2, 1024)


class VoicePocketReferenceTest(unittest.TestCase):
    def setUp(self):
        self.reference = load_reference()

    def test_upstream_wrapper_and_public_voice_are_hash_pinned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wrapper = b"wrapper"
            voice = b"public-voice"
            (root / "pocket_tts_onnx.py").write_bytes(wrapper)
            (root / "reference_sample.wav").write_bytes(voice)
            expected = {
                "pocket_tts_onnx.py": hashlib.sha256(wrapper).hexdigest(),
                "reference_sample.wav": hashlib.sha256(voice).hexdigest(),
            }
            self.reference.verify_upstream_sources(root, expected)

            (root / "reference_sample.wav").write_bytes(b"public-voicf")
            with self.assertRaisesRegex(ValueError, "reference_sample.wav.*sha256"):
                self.reference.verify_upstream_sources(root, expected)

    def test_oracle_is_seeded_and_emits_only_digests_and_metrics(self):
        first, first_arrays = self.reference.execute_oracle(
            engine=FakePocketEngine(),
            fixture_id="fixture-a",
            source="a sentence kept outside the artifact",
            public_voice_path=Path("public.wav"),
            seed=19,
            max_frames=4,
            temperature=0.0,
        )
        second, second_arrays = self.reference.execute_oracle(
            engine=FakePocketEngine(),
            fixture_id="fixture-a",
            source="a sentence kept outside the artifact",
            public_voice_path=Path("public.wav"),
            seed=19,
            max_frames=4,
            temperature=0.0,
        )

        self.assertEqual(first["latentSha256"], second["latentSha256"])
        self.assertEqual(first["pcmSha256"], second["pcmSha256"])
        np.testing.assert_array_equal(first_arrays["latents"], second_arrays["latents"])
        np.testing.assert_array_equal(first_arrays["pcm"], second_arrays["pcm"])
        self.assertEqual(4, first["frameCount"])
        self.assertEqual(24_000, first["sampleRate"])
        self.assertEqual(0.0, first["temperature"])

        encoded = json.dumps(first).lower()
        self.assertNotIn("a sentence kept", encoded)
        for forbidden in ('"text"', '"audio"', '"voice"', '"conditioning"', '"profile"'):
            self.assertNotIn(forbidden, encoded)

    def test_fixture_selection_is_fail_closed(self):
        fixture = {
            "schemaVersion": 1,
            "locale": "it-IT",
            "cases": [{"id": "one", "text": "Ciao.", "maxFrames": 5}],
        }
        selected = self.reference.select_fixture(fixture, "one")
        self.assertEqual("Ciao.", selected["text"])
        with self.assertRaisesRegex(ValueError, "missing"):
            self.reference.select_fixture(fixture, "missing")

        duplicate = dict(fixture)
        duplicate["cases"] = fixture["cases"] * 2
        with self.assertRaisesRegex(ValueError, "unique"):
            self.reference.select_fixture(duplicate, "one")

    def test_public_conditioning_export_is_shape_and_digest_bound_without_json_values(self):
        conditioning, contract = self.reference.export_public_conditioning(
            FakePocketEngine(), Path("public.wav")
        )

        self.assertEqual((1, 2, 1024), conditioning.shape)
        self.assertEqual([1, 2, 1024], contract["shape"])
        self.assertEqual(conditioning.nbytes, contract["byteLength"])
        self.assertEqual(hashlib.sha256(conditioning.tobytes(order="C")).hexdigest(), contract["sha256"])
        encoded = json.dumps(contract).lower()
        self.assertNotIn("values", encoded)
        self.assertNotIn("public.wav", encoded)

    def test_float32_export_is_exact_little_endian_and_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "oracle.f32le"
            values = np.array([1.0, -0.5, 0.25], dtype=np.float32)

            self.reference.write_float32_atomic(output, values)

            self.assertEqual(values.astype("<f4").tobytes(order="C"), output.read_bytes())
            self.assertEqual([], list(output.parent.glob(".oracle.f32le.*.tmp")))

    def test_invalid_frame_bound_never_reaches_the_runtime(self):
        for invalid in (0, -1, 721):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "maxFrames"):
                self.reference.execute_oracle(
                    engine=FakePocketEngine(),
                    fixture_id="fixture-a",
                    source="Ciao.",
                    public_voice_path=Path("public.wav"),
                    seed=19,
                    max_frames=invalid,
                    temperature=0.0,
                )

    def test_invalid_temperature_never_reaches_the_runtime(self):
        for invalid in (-0.1, float("nan"), float("inf"), 2.01):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "temperature"):
                self.reference.execute_oracle(
                    engine=FakePocketEngine(),
                    fixture_id="fixture-a",
                    source="Ciao.",
                    public_voice_path=Path("public.wav"),
                    seed=19,
                    max_frames=4,
                    temperature=invalid,
                )


if __name__ == "__main__":
    unittest.main()
