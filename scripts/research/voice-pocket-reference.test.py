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


class FakeBoundarySession:
    def __init__(self, kind):
        self.kind = kind

    def run(self, _outputs, feeds):
        if self.kind == "text":
            count = feeds["token_ids"].shape[1]
            return [np.arange(count * 4, dtype=np.float32).reshape(1, count, 4)]
        if self.kind == "main":
            state = feeds["state_0"]
            sequence = feeds["sequence"]
            conditioning = np.full((1, 4), state.item(), dtype=np.float32)
            eos = np.array([[-10.0]], dtype=np.float32)
            return [conditioning, eos, state + np.float32(1.0 + sequence.shape[1])]
        if self.kind == "flow":
            return [(feeds["c"][:, :2] + feeds["x"]).astype(np.float32)]
        raise AssertionError(f"unexpected fake session: {self.kind}")


class FakeBoundaryEngine:
    latent_dim = 2
    conditioning_dim = 4
    temperature = 0.0
    lsd_steps = 1
    model_recommended_frames_after_eos = 1
    flow_state_manifest = [
        {
            "index": 0,
            "input_name": "state_0",
            "output_name": "out_state_0",
            "dtype": "float32",
            "shape": [1],
            "fill": "zeros",
        }
    ]
    text_conditioner = FakeBoundarySession("text")
    flow_lm_main = FakeBoundarySession("main")
    flow_lm_flow = FakeBoundarySession("flow")
    _st_buffers = [
        (np.array([[0.0]], dtype=np.float32), np.array([[1.0]], dtype=np.float32))
    ]

    def _split_into_best_sentences(self, source):
        return [source]

    def _tokenize(self, _source):
        return np.array([[3, 4]], dtype=np.int64)

    def _prepare_text_prompt(self, source):
        return source, 1

    def _prepare_voice_embeddings(self, conditioning):
        return np.asarray(conditioning, dtype=np.float32)

    def _init_state(self, _manifest):
        return {"state_0": np.zeros((1,), dtype=np.float32)}

    def _update_state_from_outputs(self, state, result, manifest, output_offset):
        for entry in manifest:
            state[entry["input_name"]] = result[output_offset + entry["index"]]


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

    def test_runtime_provenance_fails_closed_away_from_the_pinned_onnx_runtime(self):
        observed = self.reference.runtime_provenance()
        for required in (
            "python",
            "implementation",
            "system",
            "machine",
            "onnxRuntime",
            "numpy",
            "scipy",
            "sentencePiece",
        ):
            self.assertIsInstance(observed[required], str)
            self.assertTrue(observed[required])

        wrong = dict(observed, onnxRuntime="0.0.0")
        with self.assertRaisesRegex(ValueError, "ONNX Runtime.*1.29.0.*0.0.0"):
            self.reference.require_pinned_runtime(wrong)

        pinned = dict(observed, onnxRuntime=self.reference.PINNED_ONNX_RUNTIME_VERSION)
        self.assertIs(pinned, self.reference.require_pinned_runtime(pinned))

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

    def test_raw_latent_export_preserves_exact_little_endian_bytes_shape_and_digest(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "latents.f32le"
            values = np.array(
                [[[-1.25, 0.0], [3.5, 7.25]]],
                dtype=np.float32,
            )
            contract = self.reference.float32_contract(values)

            self.reference.write_float32_atomic(output, values)

            expected = values.astype("<f4").tobytes(order="C")
            self.assertEqual(expected, output.read_bytes())
            self.assertEqual([1, 2, 2], contract["shape"])
            self.assertEqual(len(expected), contract["byteLength"])
            self.assertEqual(hashlib.sha256(expected).hexdigest(), contract["sha256"])

    def test_state_digest_is_name_order_dtype_shape_and_bytes_bound(self):
        manifest = [
            {
                "input_name": "float_state",
                "output_name": "out_float_state",
                "dtype": "float32",
                "shape": [2],
            },
            {
                "input_name": "step_state",
                "output_name": "out_step_state",
                "dtype": "int64",
                "shape": [1],
            },
        ]
        state = {
            "float_state": np.array([1.25, -0.5], dtype=np.float32),
            "step_state": np.array([7], dtype=np.int64),
        }
        baseline = self.reference.state_sha256(state, manifest)

        mutated_value = dict(state, float_state=np.array([1.25, -0.25], dtype=np.float32))
        renamed = [dict(manifest[0], output_name="other"), manifest[1]]
        reshaped = [dict(manifest[0], shape=[1, 2]), manifest[1]]

        self.assertNotEqual(baseline, self.reference.state_sha256(mutated_value, manifest))
        self.assertNotEqual(baseline, self.reference.state_sha256(state, list(reversed(manifest))))
        self.assertNotEqual(baseline, self.reference.state_sha256(state, renamed))
        reshaped_state = dict(state, float_state=state["float_state"].reshape(1, 2))
        self.assertNotEqual(baseline, self.reference.state_sha256(reshaped_state, reshaped))
        with self.assertRaisesRegex(ValueError, "dtype"):
            self.reference.canonical_array_bytes(state["float_state"], "int64", [2])

    def test_flow_boundary_trace_names_the_recurrent_boundary_without_raw_values(self):
        trace = self.reference.collect_flow_boundary_trace(
            engine=FakeBoundaryEngine(),
            source="Owner-visible fixture text must stay outside evidence.",
            conditioning=np.zeros((1, 2, 4), dtype=np.float32),
            max_frames=2,
        )

        self.assertEqual(1, trace["schemaVersion"])
        self.assertEqual(2, trace["frameCount"])
        self.assertIn("sha256", trace["textEmbeddings"])
        self.assertIn("voicePrefillStateSha256", trace)
        self.assertIn("textPrefillStateSha256", trace)
        self.assertEqual([0, 1], [frame["frameIndex"] for frame in trace["frames"]])
        self.assertTrue(all("arStateSha256" in frame for frame in trace["frames"]))
        self.assertTrue(all("conditioningSha256" in frame for frame in trace["frames"]))
        self.assertTrue(all("flowDirectionSha256" in frame for frame in trace["frames"]))

        encoded = json.dumps(trace).lower()
        self.assertNotIn("owner-visible fixture", encoded)
        self.assertNotIn("values", encoded)

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
