from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PIN = "58e5e1ace69302e6982d27014569c03e0ffccdd2"
PROMPT_PATH = ROOT / "upstream" / "tau2" / "user_simulator" / "simulation_guidelines.md"
PROMPT_SHA256 = "740a29dfa64d7bc08eea3bf7493575b914a63f744acbaf7f199ee07eddaf72d3"


def test_vendored_tau2_prompt_matches_the_frozen_manifest_exactly() -> None:
    manifest = json.loads((ROOT / "upstream" / "tau2" / "manifest.json").read_text(encoding="utf-8"))
    payload = PROMPT_PATH.read_bytes()

    assert manifest == {
        "contract": "talos.upstream.tau2.v1",
        "schema_version": 1,
        "project": "sierra-research/tau2-bench",
        "commit": PIN,
        "license": "MIT",
        "files": [{
            "path": "data/tau2/user_simulator/simulation_guidelines.md",
            "vendored_path": "upstream/tau2/user_simulator/simulation_guidelines.md",
            "bytes": 1449,
            "sha256": PROMPT_SHA256,
        }],
    }
    assert len(payload) == 1449
    assert hashlib.sha256(payload).hexdigest() == PROMPT_SHA256
    assert payload.endswith(b"\n")
    assert b"\r\n" not in payload


def test_installed_tau2_version_pin_and_public_signatures_are_frozen() -> None:
    lock = tomllib.loads((ROOT / "uv.lock").read_text(encoding="utf-8"))
    tau2_packages = [package for package in lock["package"] if package["name"] == "tau2"]

    assert importlib.metadata.version("tau2") == "1.0.0"
    assert len(tau2_packages) == 1
    assert tau2_packages[0]["version"] == "1.0.0"
    assert tau2_packages[0]["source"]["git"].endswith(f"?rev={PIN}#{PIN}")

    probe = """
import inspect
import json
from tau2.data_model.persona import PersonaConfig
from tau2.data_model.tasks import StructuredUserInstructions, UserScenario
from tau2.user.user_simulator import UserSimulator

print(json.dumps({
    "constructor": list(inspect.signature(UserSimulator).parameters),
    "generate_next_message": list(inspect.signature(UserSimulator.generate_next_message).parameters),
    "persona": list(PersonaConfig.model_fields),
    "instructions": list(StructuredUserInstructions.model_fields),
    "scenario": list(UserScenario.model_fields),
}, separators=(",", ":")))
"""
    environment = os.environ.copy()
    environment["TAU2_DATA_DIR"] = str(ROOT / "upstream" / "tau2")
    completed = subprocess.run(
        [sys.executable, "-c", probe],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=environment,
        timeout=30,
    )
    signature = json.loads(completed.stdout.strip().splitlines()[-1])
    assert signature == {
        "constructor": ["llm", "instructions", "tools", "llm_args", "persona_config"],
        "generate_next_message": ["self", "message", "state"],
        "persona": ["verbosity", "interrupt_tendency"],
        "instructions": ["domain", "reason_for_call", "known_info", "unknown_info", "task_instructions"],
        "scenario": ["persona", "instructions"],
    }


def test_notice_names_the_exact_tau2_boundary_without_overclaiming() -> None:
    notice = (ROOT / "NOTICE.md").read_text(encoding="utf-8")

    assert "sierra-research/tau2-bench" in notice
    assert PIN in notice
    assert "MIT" in notice
    assert "simulation_guidelines.md" in notice
    assert "UserSimulator.generate_next_message" in notice


def test_container_source_contract_is_pinned_locked_non_root_and_secret_clean() -> None:
    dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
    dockerignore = (ROOT / ".dockerignore").read_text(encoding="utf-8")

    image = "python:3.12.13-slim-bookworm@sha256:d50fb7611f86d04a3b0471b46d7557818d88983fc3136726336b2a4c657aa30b"
    assert dockerfile.count(image) == 2
    assert "uv==0.11.29" in dockerfile
    assert "uv sync --locked --no-dev --no-editable" in dockerfile
    assert "USER talos" in dockerfile
    assert "--factory" in dockerfile
    assert "talos_human_journey.api:create_runtime_app" in dockerfile
    assert '"--host", "127.0.0.1"' in dockerfile
    assert "latest" not in dockerfile.lower()
    assert "API_KEY=" not in dockerfile
    for excluded in (".venv", ".env", "*.key", "*.token", "reports", "__pycache__"):
        assert excluded in dockerignore
