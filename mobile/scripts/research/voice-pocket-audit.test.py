import hashlib
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("voice-pocket-audit.py")


def load_auditor():
    spec = importlib.util.spec_from_file_location("talos_voice_pocket_auditor", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VoicePocketAuditTest(unittest.TestCase):
    def setUp(self):
        self.auditor = load_auditor()

    def test_pinned_manifest_rejects_revision_size_and_sha_mutations(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            payload = b"pocket-v2"
            (root / "model.onnx").write_bytes(payload)
            expected = {
                "model.onnx": {
                    "size": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                }
            }

            verified = self.auditor.verify_pinned_files(
                root,
                revision="revision-a",
                expected_revision="revision-a",
                expected_files=expected,
            )
            self.assertEqual(expected["model.onnx"]["sha256"], verified[0]["sha256"])

            with self.assertRaisesRegex(ValueError, "revision"):
                self.auditor.verify_pinned_files(
                    root,
                    revision="revision-b",
                    expected_revision="revision-a",
                    expected_files=expected,
                )

            (root / "model.onnx").write_bytes(payload + b"x")
            with self.assertRaisesRegex(ValueError, "size"):
                self.auditor.verify_pinned_files(
                    root,
                    revision="revision-a",
                    expected_revision="revision-a",
                    expected_files=expected,
                )

            replacement = b"pocket-v3"
            self.assertEqual(len(payload), len(replacement))
            (root / "model.onnx").write_bytes(replacement)
            with self.assertRaisesRegex(ValueError, "sha256"):
                self.auditor.verify_pinned_files(
                    root,
                    revision="revision-a",
                    expected_revision="revision-a",
                    expected_files=expected,
                )

    def test_manifest_paths_cannot_escape_bundle_root(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "path"):
                self.auditor.verify_pinned_files(
                    root,
                    revision="revision-a",
                    expected_revision="revision-a",
                    expected_files={"../outside.onnx": {"size": 1, "sha256": "0" * 64}},
                )

    def test_bundle_v2_contract_is_explicit(self):
        metadata = {
            "schema_version": 2,
            "bundle_name": "italian",
            "sample_rate": 24000,
            "frame_rate": 12.5,
            "samples_per_frame": 1920,
            "latent_dim": 32,
            "conditioning_dim": 1024,
            "max_token_per_chunk": 50,
            "insert_bos_before_voice": True,
            "tokenizer_file": "tokenizer.model",
            "bos_before_voice_file": "bos_before_voice.npy",
            "flow_lm_state_manifest": [],
            "mimi_state_manifest": [],
        }
        contract = self.auditor.validate_bundle_metadata(metadata)
        self.assertEqual("italian", contract["language"])
        self.assertEqual(80.0, contract["frameDurationMs"])

        for key, mutation in (
            ("schema_version", 1),
            ("bundle_name", "english"),
            ("insert_bos_before_voice", False),
            ("samples_per_frame", 960),
        ):
            broken = dict(metadata)
            broken[key] = mutation
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, key):
                self.auditor.validate_bundle_metadata(broken)

    def test_state_manifest_must_match_graph_names_types_and_shapes(self):
        manifest = [
            {
                "index": 0,
                "input_name": "state_0",
                "output_name": "out_state_0",
                "dtype": "float32",
                "shape": [2, 1, 1000, 16, 64],
                "fill": "nan",
            },
            {
                "index": 1,
                "input_name": "state_1",
                "output_name": "out_state_1",
                "dtype": "int64",
                "shape": [1],
                "fill": "zeros",
            },
        ]
        graph = {
            "inputs": {
                "sequence": {"dtype": "float32", "shape": [1, None, 32]},
                "state_0": {"dtype": "float32", "shape": [2, 1, 1000, 16, 64]},
                "state_1": {"dtype": "int64", "shape": [1]},
            },
            "outputs": {
                "conditioning": {"dtype": "float32", "shape": [1, 1, 1024]},
                "out_state_0": {"dtype": "float32", "shape": [2, 1, 1000, 16, 64]},
                "out_state_1": {"dtype": "int64", "shape": [1]},
            },
        }
        result = self.auditor.validate_state_manifest("flow_lm", manifest, graph)
        self.assertEqual(2, result["stateCount"])

        broken = json.loads(json.dumps(graph))
        broken["inputs"]["state_0"]["shape"][-1] = 32
        with self.assertRaisesRegex(ValueError, "state_0.*shape"):
            self.auditor.validate_state_manifest("flow_lm", manifest, broken)

        broken = json.loads(json.dumps(graph))
        broken["outputs"]["out_state_1"]["dtype"] = "float32"
        with self.assertRaisesRegex(ValueError, "out_state_1.*dtype"):
            self.auditor.validate_state_manifest("flow_lm", manifest, broken)

    def test_research_artifact_is_privacy_bounded_and_names_the_blocked_official_gate(self):
        artifact = self.auditor.build_artifact(
            revision="r" * 40,
            verified_files=[{"path": "tokenizer.model", "size": 4, "sha256": "a" * 64}],
            bundle_contract={"language": "italian"},
            graph_audits={"flow_lm_main_int8.onnx": {"stateCount": 18}},
            tokenizer_audit={"vocabSize": 4000, "goldenIdsSha256": "b" * 64},
        )
        encoded = json.dumps(artifact).lower()
        self.assertEqual("BLOCKED_AUTH", artifact["officialPyTorchConformance"]["status"])
        for forbidden in ("text", "pcm", "audio", "conditioning", "profile"):
            self.assertNotIn(f'"{forbidden}"', encoded)


if __name__ == "__main__":
    unittest.main()
