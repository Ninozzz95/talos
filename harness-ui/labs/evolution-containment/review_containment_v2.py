"""Versioned lab contract, not a production verifier or an evidence signature.

V1 observations and exit codes stay immutable. V2 requires a correlated OS block
AND every other native gate; neither a timeout nor a saved PASS is sufficient.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import time
import review_network_correlation as network

CONTRACT_ID = "talos.containment-lab.server2022-ipv4-loopback.v2"
SPEC = {
    "contract_id": CONTRACT_ID,
    "network_rule": "os-tcp-owner-and-wfp-block-correlation-required",
    "legacy_contract": "native-wsaeacces-v1-preserved",
    "max_preselection_age_ms": 600000,
    "job_counts": [2, 5, 4],
    "scope": "synthetic Windows Server 2022 x64 IPv4 TCP loopback laboratory",
    "production_authority_changed": False,
    "full_containment_verified": False,
    "release_ready": False,
}
SPEC_NAME = "CONTAINMENT-CONTRACT-V2.json"
ROOT_FILES = ("Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "run.ps1",
              "review_network_correlation.py", "test_network_correlation.py",
              "review_containment_v2.py", "test_containment_v2.py", "run-v2.ps1", SPEC_NAME)
PREFIX_CHECKS = ["parent_scratch_positive_control", "unrestricted_positive_control",
                 "positive_control_prerequisite", "private_and_immutable_files_denied",
                 "environment_excluded_and_scratch_effect_observed",
                 "job_close_terminates_observed_tree", "contained_filesystem_environment_and_tree_case",
                 "loopback_explicit_denial"]
SUFFIX_CHECKS = ["uncontained_peer_rejected", "foreign_container_rejected", "malformed_frame_rejected",
                 "process_limit_enforced", "no_additional_loopback_connection_observed",
                 "fixture_cleanup", "foreign_profile_cleanup", "profile_cleanup"]
NATIVE_ERROR = "Probe exited 1; no success inferred from a failed launch"
HEX64 = re.compile(r"[0-9a-f]{64}")
require = network.require


def exact(actual: object, expected: object, label: str) -> None:
    # bool/int equality is not a schema check: true must never stand in for 1.
    require(json.dumps(actual, sort_keys=True, allow_nan=False) ==
            json.dumps(expected, sort_keys=True, allow_nan=False), label)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def bounded(path: Path, maximum: int = network.MAX_LOG_BYTES) -> bytes:
    require(not path.is_symlink(), "symbolic evidence/source file forbidden")
    with path.open("rb") as stream:
        data = stream.read(maximum + 1)
    require(len(data) <= maximum, "input exceeds size limit")
    return data


def strict_json(data: bytes) -> object:
    def invalid(value):
        raise network.EvidenceError("non-finite JSON number: " + value)
    return json.loads(data.decode("utf-8-sig", errors="strict"),
                      object_pairs_hook=network.no_duplicates, parse_constant=invalid)


def source_inventory(root: Path) -> dict[str, str]:
    paths = [root / name for name in ROOT_FILES] + sorted((root / "src").rglob("*.rs"))
    require(any(path.suffix == ".rs" for path in paths), "native sources missing")
    return {path.relative_to(root).as_posix(): digest(bounded(path)) for path in paths}


def validate_selection(selection: dict, manifest: dict, spec_bytes: bytes) -> None:
    exact(strict_json(spec_bytes), SPEC, "unknown or modified v2 contract")
    require(selection.get("schema") == "talos.lab-preselection.v2", "missing v2 preselection")
    require(selection.get("contract_id") == CONTRACT_ID, "wrong selected contract")
    require(selection.get("contract_sha256") == digest(spec_bytes), "contract digest mismatch")
    checkout = selection.get("checkout")
    require(type(checkout) is str and re.fullmatch(r"[0-9a-f]{40}", checkout) is not None, "invalid checkout")
    require(checkout == manifest.get("checkout"), "checkout changed after selection")
    sources = selection.get("source_sha256")
    require(type(sources) is dict and set(ROOT_FILES) <= set(sources), "incomplete source selection")
    require(sources[SPEC_NAME] == digest(spec_bytes), "selected spec input mismatch")
    normalized = set()
    for name, sha in sources.items():
        require(type(name) is str and "\\" not in name and ":" not in name
                and all(part not in ("", ".", "..") for part in name.split("/")), "unsafe source path")
        require(name.casefold() not in normalized, "case-colliding source paths")
        normalized.add(name.casefold())
        require(type(sha) is str and HEX64.fullmatch(sha) is not None, "invalid source digest")
    inputs = manifest.get("inputs")
    require(type(inputs) is list and 0 < len(inputs) < 128, "native input manifest missing")
    measured = {}
    for entry in inputs:
        require(type(entry) is dict and type(entry.get("path")) is str, "invalid native input")
        name = entry["path"].replace("\\", "/")
        require(name not in measured, "duplicate native input")
        require(name in sources and entry.get("sha256") == sources[name], "native source changed")
        measured[name] = entry["sha256"]
    expected = {name for name in sources if name.startswith("src/")} | set(ROOT_FILES[:6])
    require(set(measured) == expected, "native input inventory differs")
    require(type(manifest.get("binarySha256")) is str
            and HEX64.fullmatch(manifest["binarySha256"]) is not None, "binary digest missing")


def validate_records(records: list[dict], manifest: dict, selection: dict) -> dict:
    require(type(records) is list and 0 < len(records) <= 512
            and all(type(r) is dict for r in records), "invalid record list")
    _, header = network.unique(records, "schema", "talos.containment-spike.v1")
    require(records[0] is header and header.get("windows_x64") is True, "wrong native platform/header")
    require(type(header.get("launcher_elevated")) is bool, "missing launcher elevation")
    require(manifest.get("schema") == "talos.containment-spike.run.v1"
            and manifest.get("architecture") == "X64" and manifest.get("toolchain") == "1.90.0",
            "unsupported native manifest")
    require(type(manifest.get("os")) is str and
            re.fullmatch(r"Microsoft Windows NT 10\.0\.20348\.\d+", manifest["os"]) is not None,
            "v2 profile is not a Windows client or other server version")
    probes = [r for r in records if "probe" in r]
    require(len(probes) == 1, "missing or ambiguous contained probe")
    probe = probes[0]
    name = probe["probe"]
    require(type(name) is str and re.fullmatch(r"TALOS\.Spike\.\d+\.\d+\.contained", name) is not None,
            "invalid run identity")
    run_name = name.removesuffix(".contained")
    for key in ("read_error", "write_error", "immutable_error"):
        exact(probe.get(key), 5, "protected file was not explicitly denied")
    code = network.integer(probe.get("network_error"), "native network result", 0, 2**32-1)
    require(code in (10013, 2**32-1), "unsupported transport observation")
    legacy_pass = code == 10013
    expected_checks = PREFIX_CHECKS + [run_name+".uncontained-peer", SUFFIX_CHECKS[0],
        run_name+".foreign-sid", SUFFIX_CHECKS[1], run_name+".bad-frame", SUFFIX_CHECKS[2],
        "active_process_cap", "active_process_cap"] + SUFFIX_CHECKS[3:]
    if legacy_pass:
        expected_checks += ["temporary_profiles_and_fixtures_removed"]
    checks = [r for r in records if "check" in r]
    exact([r["check"] for r in checks], expected_checks, "missing, duplicate, unknown or reordered native gate")
    for entry in checks:
        passed = legacy_pass if entry["check"] == "loopback_explicit_denial" else True
        require(entry.get("passed") is passed, "native failure outside versioned network criterion")
        if not passed:
            exact(entry.get("error"), f"loopback denial was not WSAEACCES (observed {code}); timeout/refusal is not evidence",
                  "unexpected legacy network error")
        else:
            require("error" not in entry, "success record also contains an error")
    _, summary = network.unique(records, "summary", "independent_checks")
    exact(summary, {"summary": "independent_checks", "attempted": 10, "failed": int(not legacy_pass)},
          "native summary mismatch")
    results = [r for r in records if "result" in r]
    if legacy_pass:
        exact(results, [{"result": "PASS", "scope": "synthetic-containment-probes-only",
                         "standard_user_verified": not header["launcher_elevated"]}], "legacy final record mismatch")
        require(records[-1] == results[0], "records after native result")
    else:
        require(not results and records[-1] is summary, "legacy FAIL was overwritten or trailing records exist")
    exact(manifest.get("probeExitCode"), 0 if legacy_pass else 1, "native exit contradicts observations")
    exact(manifest.get("correlationExitCode"), 0, "companion correlator did not complete")
    exact(manifest.get("status"), "PASS" if legacy_pass else "FAIL", "native result changed")
    exact(manifest.get("error"), None if legacy_pass else NATIVE_ERROR, "unrelated runner failure")
    groups = [(i, r) for i, r in enumerate(records) if r.get("diagnostic") == "job_accounting"]
    require(len(groups) == 3, "missing Job accounting")
    for (index, group), count in zip(groups, SPEC["job_counts"]):
        for key, expected in {"returned_bytes":48, "total":count, "active":count, "terminated":0,
                              "pid_list_status":0, "assigned":count, "listed":count}.items():
            exact(group.get(key), expected, "Job accounting differs; no helper exclusions")
        pids = group.get("pid_list")
        require(type(pids) is list and len(pids) == count and
                all(type(pid) is int and 0 < pid < 2**32 for pid in pids) and len(set(pids)) == count,
                "invalid Job PID set")
        members = records[index+1:index+1+count]
        exact([r.get("pid") for r in members], pids, "missing or reordered Job members")
        for member in members:
            require(member.get("diagnostic") == "job_member" and member.get("appcontainer") is True,
                    "member not contained")
            exact(member.get("image_error"), 0, "member image unobserved")
            exact(member.get("wait_status"), 258, "member not alive before Job close")
            require(member.get("image_basename") == "probe.exe", "unexpected helper, not subtracted")
    require(sum(r.get("diagnostic") == "job_member" for r in records) == 11, "extra Job members")
    check_pos = {r["check"]: i for i, r in enumerate(records) if "check" in r}
    cap_pos = [i for i, r in enumerate(records) if r.get("check") == "active_process_cap"]
    require(check_pos["environment_excluded_and_scratch_effect_observed"] < groups[0][0]
            < groups[0][0] + 2 < check_pos["job_close_terminates_observed_tree"], "tree evidence out of order")
    require(check_pos["malformed_frame_rejected"] < groups[1][0] < groups[1][0] + 5 < cap_pos[0]
            < groups[2][0] < groups[2][0] + 4 < cap_pos[1] < check_pos["process_limit_enforced"],
            "quota evidence out of order")
    cap_checks = [r for r in checks if r["check"] == "active_process_cap"]
    for entry, cap in zip(cap_checks, (5, 4)):
        exact(entry, {"check":"active_process_cap", "limit":cap, "observed_active":cap,
                      "fifth_launch_denied":cap == 4, "passed":True}, "process cap not measured")
    # Recompute correlation from the broker observations, never trust its saved JSON verdict.
    correlation = network.correlate(records)
    require(correlation["status"] == "VERIFIED_FILTER_BLOCK", "no independently correlated OS block")
    _, obs = network.unique(records, "diagnostic", "broker_tcp_subjects")
    require(obs["subjects"][0]["pid"] in groups[0][1]["pid_list"], "network subject is not in observed tree")
    require(run_name.split(".")[2] == str(obs["listener_pid"]), "run/listener identity differs")
    selected = network.integer(selection.get("selected_at_ms"), "preselection time", 1)
    require(0 <= obs["started_ms"] - selected <= SPEC["max_preselection_age_ms"], "contract selected after probe or too early")
    tokens = [r for r in records if r.get("diagnostic") == "process_token"]
    roles = ["parent", "control-child", "contained-child", "control-child"] + ["contained-child"]*11
    exact([r.get("role") for r in tokens], roles, "process identity observations missing")
    require(tokens[0].get("elevated") is header["launcher_elevated"], "launcher elevation contradicts token")
    for token in tokens:
        require(type(token.get("elevated")) is bool, "missing token elevation")
        require(token.get("user_matches_owner") is True, "unexpected token owner")
        require(token.get("appcontainer") is (token["role"] == "contained-child"), "token role mismatch")
        if token["role"] == "contained-child":
            require(token.get("integrity_sid") == "S-1-16-4096", "contained process not Low integrity")
    return {"network": correlation, "legacy_status": manifest["status"], "native_exit_code": manifest["probeExitCode"],
            "launcher_elevated": header["launcher_elevated"]}


def evaluate(records, manifest, selection, spec_bytes: bytes) -> dict:
    result = {"schema": "talos.lab-result.v2", "contract_id": CONTRACT_ID, "status": "REJECT",
              "scope": SPEC["scope"], "legacy_evidence_rewritten": False, "producer_authenticated": False,
              "full_containment_verified": False, "release_ready": False, "windows_client_verified": False}
    try:
        require(type(manifest) is dict and type(selection) is dict, "missing manifest/selection")
        validate_selection(selection, manifest, spec_bytes)
        details = validate_records(records, manifest, selection)
        return {**result, **details, "status": "SCOPED_PASS", "contract_sha256": digest(spec_bytes)}
    except (ValueError, TypeError, KeyError, OverflowError, AttributeError, RecursionError, network.ET.ParseError) as error:
        return {**result, "reason": str(error)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("begin", "fresh", "replay"))
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    root = args.source_root.resolve()
    try:
        spec = bounded(root / SPEC_NAME)
        exact(strict_json(spec), SPEC, "unrecognized v2 contract")
        if args.mode == "begin":
            # Exclusive directory creation prevents silently requalifying old artifacts.
            args.evidence.mkdir(parents=False, exist_ok=False)
            checkout = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, check=True,
                                      capture_output=True, text=True, timeout=10).stdout.strip()
            selection = {"schema":"talos.lab-preselection.v2", "contract_id":CONTRACT_ID,
                         "contract_sha256":digest(spec), "checkout":checkout,
                         "selected_at_ms":time.time_ns()//1_000_000, "source_sha256":source_inventory(root)}
            with (args.evidence / "v2-selection.json").open("x", encoding="utf-8") as out:
                json.dump(selection, out, indent=2)
            print("V2 contract selected before native execution")
            return 0
        raw = bounded(args.evidence / "probes.jsonl")
        records = [strict_json(line) for line in raw.splitlines() if line.strip()]
        run_bytes = bounded(args.evidence / "run.json")
        selection_bytes = bounded(args.evidence / "v2-selection.json")
        manifest, selection = strict_json(run_bytes), strict_json(selection_bytes)
        result = evaluate(records, manifest, selection, spec)
        if args.mode == "fresh":
            now = time.time_ns()//1_000_000
            selected = network.integer(selection.get("selected_at_ms"), "selection time", 1)
            require(0 <= now - selected <= SPEC["max_preselection_age_ms"], "old run requires explicit replay mode")
            exact(selection["source_sha256"], source_inventory(root), "sources changed since preselection")
            exact(manifest["binarySha256"], digest(bounded(root / "target/release/talos-containment-spike.exe", 32*1024*1024)),
                  "executed binary digest mismatch")
        result.update(evaluation_mode=args.mode, new_execution_claimed=args.mode == "fresh",
                      input_sha256={"probes.jsonl":digest(raw), "run.json":digest(run_bytes),
                                    "v2-selection.json":digest(selection_bytes)})
        text = json.dumps(result, indent=2) + "\n"
        if args.mode == "fresh":
            with (args.evidence / "v2-result.json").open("x", encoding="utf-8") as out:
                out.write(text)
        print(text, end="")
        return 0 if result["status"] == "SCOPED_PASS" else 1
    except (OSError, ValueError, TypeError, KeyError, RecursionError, subprocess.SubprocessError) as error:
        print(json.dumps({"schema":"talos.lab-result.v2", "status":"REJECT", "reason":str(error),
                          "release_ready":False, "full_containment_verified":False}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
