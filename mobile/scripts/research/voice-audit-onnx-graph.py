#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
from collections import defaultdict, deque
from pathlib import Path


PINNED_ONNX_VERSION = "1.22.0"


def audit_graph(model, metadata, model_path, model_sha256, onnx_version):
    decode_inputs = metadata["onnx"]["decode_input_names"]
    decode_outputs = metadata["onnx"]["decode_output_names"]
    past_inputs = decode_inputs[2:]
    present_outputs = decode_outputs[1:]
    if len(past_inputs) != len(present_outputs):
        raise ValueError(
            f"decode cache arity differs: {len(past_inputs)} past inputs, "
            f"{len(present_outputs)} present outputs"
        )

    nodes = list(model.graph.node)
    node_names = {
        id(node): node.name or f"{node.op_type}#{index}"
        for index, node in enumerate(nodes)
    }
    node_types = {id(node): node.op_type for node in nodes}
    consumers = defaultdict(list)
    producers = {}
    for node in nodes:
        for input_name in node.input:
            consumers[input_name].append(node)
        for output_name in node.output:
            producers[output_name] = node

    concat_nodes = [
        {
            "name": node_names[id(node)],
            "axis": attribute_integer(node, "axis"),
            "inputs": list(node.input),
            "outputs": list(node.output),
        }
        for node in nodes
        if node.op_type == "Concat"
    ]
    cache_mappings = []
    unmapped = []
    for past_input, present_output in zip(past_inputs, present_outputs, strict=True):
        concat_names = concat_nodes_on_path(
            past_input=past_input,
            present_output=present_output,
            consumers=consumers,
            producers=producers,
            node_names=node_names,
            node_types=node_types,
        )
        mapping = {
            "pastInput": past_input,
            "presentOutput": present_output,
            "concatNodeNames": concat_names,
        }
        cache_mappings.append(mapping)
        if not concat_names:
            unmapped.append({"pastInput": past_input, "presentOutput": present_output})

    return {
        "schemaVersion": 1,
        "onnxVersion": onnx_version,
        "modelSha256": model_sha256,
        "modelPath": str(Path(model_path).resolve()),
        "cacheMappings": cache_mappings,
        "concatNodes": concat_nodes,
        "conclusion": {
            "installedDecodeStepConcatenatesPastCache": any(
                mapping["concatNodeNames"] for mapping in cache_mappings
            ),
            "mappedCachePairCount": len(cache_mappings) - len(unmapped),
            "totalCachePairCount": len(cache_mappings),
            "unmappedCachePairs": unmapped,
        },
    }


def concat_nodes_on_path(
    past_input,
    present_output,
    consumers,
    producers,
    node_names,
    node_types,
):
    forward_node_ids = _forward_reachable_node_ids(past_input, consumers)
    reverse_node_ids = _reverse_reachable_node_ids(present_output, producers)
    return sorted(
        node_names[node_id]
        for node_id in forward_node_ids & reverse_node_ids
        if node_types[node_id] == "Concat"
    )


def _forward_reachable_node_ids(start_value, consumers):
    queue = deque([start_value])
    visited_values = set()
    reachable_node_ids = set()
    while queue:
        value_name = queue.popleft()
        if value_name in visited_values:
            continue
        visited_values.add(value_name)
        for node in consumers.get(value_name, []):
            node_id = id(node)
            if node_id in reachable_node_ids:
                continue
            reachable_node_ids.add(node_id)
            queue.extend(node.output)
    return reachable_node_ids


def _reverse_reachable_node_ids(start_value, producers):
    queue = deque([start_value])
    visited_values = set()
    reachable_node_ids = set()
    while queue:
        value_name = queue.popleft()
        if value_name in visited_values:
            continue
        visited_values.add(value_name)
        node = producers.get(value_name)
        if node is None:
            continue
        node_id = id(node)
        if node_id in reachable_node_ids:
            continue
        reachable_node_ids.add(node_id)
        queue.extend(node.input)
    return reachable_node_ids


def attribute_integer(node, name):
    for attribute in node.attribute:
        if attribute.name == name:
            return int(attribute.i)
    return None


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def parse_arguments():
    parser = argparse.ArgumentParser(
        description="Audit the exact installed TALOS decode-step ONNX graph."
    )
    parser.add_argument("--model", required=True, type=Path)
    parser.add_argument("--meta", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main():
    arguments = parse_arguments()
    try:
        import onnx
    except ModuleNotFoundError as error:
        raise SystemExit(
            "onnx is missing; use the B0 temporary environment pinned to onnx==1.22.0"
        ) from error
    if onnx.__version__ != PINNED_ONNX_VERSION:
        raise SystemExit(
            f"expected onnx=={PINNED_ONNX_VERSION}, found {onnx.__version__}"
        )
    if not arguments.model.is_file():
        raise SystemExit(f"model does not exist: {arguments.model}")
    if not arguments.meta.is_file():
        raise SystemExit(f"metadata does not exist: {arguments.meta}")

    metadata = json.loads(arguments.meta.read_text(encoding="utf-8"))
    model = onnx.load(str(arguments.model), load_external_data=False)
    result = audit_graph(
        model=model,
        metadata=metadata,
        model_path=arguments.model,
        model_sha256=sha256_file(arguments.model),
        onnx_version=onnx.__version__,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = arguments.output.with_name(f".{arguments.output.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, arguments.output)
    finally:
        temporary.unlink(missing_ok=True)
    print(arguments.output)


if __name__ == "__main__":
    main()
