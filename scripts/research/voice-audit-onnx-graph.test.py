import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).with_name("voice-audit-onnx-graph.py")


class CountingNode:
    output_reads = 0
    maximum_output_reads = 500

    def __init__(self, *, name, op_type, inputs, outputs, attribute=None):
        self.name = name
        self.op_type = op_type
        self.input = inputs
        self._output = outputs
        self.attribute = attribute or []

    @property
    def output(self):
        type(self).output_reads += 1
        if type(self).output_reads > type(self).maximum_output_reads:
            raise RuntimeError("graph traversal exceeded its linear expansion bound")
        return self._output


def load_auditor():
    spec = importlib.util.spec_from_file_location("talos_voice_graph_auditor", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class VoiceGraphAuditTest(unittest.TestCase):
    def test_maps_manifest_past_through_concat_to_present(self):
        auditor = load_auditor()
        concat = SimpleNamespace(
            name="/layers.0/attention/Concat",
            op_type="Concat",
            input=["past_key_values.0.key", "new_key"],
            output=["present.0.key"],
            attribute=[SimpleNamespace(name="axis", i=2)],
        )
        identity = SimpleNamespace(
            name="/Identity",
            op_type="Identity",
            input=["unrelated"],
            output=["other"],
            attribute=[],
        )
        model = SimpleNamespace(graph=SimpleNamespace(node=[concat, identity]))
        metadata = {
            "onnx": {
                "decode_input_names": ["input_ids", "past_valid_lengths", "past_key_values.0.key"],
                "decode_output_names": ["global_hidden", "present.0.key"],
            }
        }

        audit = auditor.audit_graph(
            model=model,
            metadata=metadata,
            model_path=Path("decode_step.onnx"),
            model_sha256="a" * 64,
            onnx_version="1.22.0",
        )

        self.assertEqual(1, len(audit["concatNodes"]))
        self.assertEqual(2, audit["concatNodes"][0]["axis"])
        self.assertEqual("past_key_values.0.key", audit["cacheMappings"][0]["pastInput"])
        self.assertEqual("present.0.key", audit["cacheMappings"][0]["presentOutput"])
        self.assertEqual(["/layers.0/attention/Concat"], audit["cacheMappings"][0]["concatNodeNames"])
        self.assertTrue(audit["conclusion"]["installedDecodeStepConcatenatesPastCache"])
        self.assertEqual([], audit["conclusion"]["unmappedCachePairs"])

    def test_fan_out_fan_in_mapping_is_bounded_by_graph_size(self):
        auditor = load_auditor()
        CountingNode.output_reads = 0
        nodes = []
        previous = "past"
        expected_concat_names = []
        for stage in range(12):
            branch_outputs = []
            for branch in ("left", "right"):
                name = f"/diamond.{stage}/{branch}/Concat"
                output = f"diamond.{stage}.{branch}"
                expected_concat_names.append(name)
                branch_outputs.append(output)
                nodes.append(
                    CountingNode(
                        name=name,
                        op_type="Concat",
                        inputs=[previous, f"fresh.{stage}.{branch}"],
                        outputs=[output],
                        attribute=[SimpleNamespace(name="axis", i=2)],
                    )
                )
            following = "present" if stage == 11 else f"diamond.{stage}.joined"
            nodes.append(
                CountingNode(
                    name=f"/diamond.{stage}/Join",
                    op_type="Identity",
                    inputs=branch_outputs,
                    outputs=[following],
                )
            )
            previous = following

        model = SimpleNamespace(graph=SimpleNamespace(node=nodes))
        metadata = {
            "onnx": {
                "decode_input_names": ["input_ids", "past_valid_lengths", "past"],
                "decode_output_names": ["global_hidden", "present"],
            }
        }

        audit = auditor.audit_graph(
            model=model,
            metadata=metadata,
            model_path=Path("decode_step.onnx"),
            model_sha256="b" * 64,
            onnx_version="1.22.0",
        )

        self.assertEqual(
            sorted(expected_concat_names),
            audit["cacheMappings"][0]["concatNodeNames"],
        )
        self.assertLessEqual(
            CountingNode.output_reads,
            CountingNode.maximum_output_reads,
        )


if __name__ == "__main__":
    unittest.main()
