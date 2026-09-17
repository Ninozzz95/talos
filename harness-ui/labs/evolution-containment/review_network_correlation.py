"""Offline correlation of parent TCP observations and read-only Windows WFP XML.

This does not attest a producer or override the native laboratory's FAIL result.
Only the specific measured loopback flow can receive VERIFIED_FILTER_BLOCK.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

MAX_LOG_BYTES = 2 * 1024 * 1024
MAX_XML_CHARS = 262144

class EvidenceError(ValueError):
    pass

def require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)

def integer(value: object, name: str, minimum: int = 0, maximum: int = 2**53 - 1) -> int:
    require(type(value) is int and minimum <= value <= maximum, f"invalid integer: {name}")
    return value

def unique(records: list[dict], key: str, value: str) -> tuple[int, dict]:
    found = [(i, r) for i, r in enumerate(records) if r.get(key) == value]
    require(len(found) == 1, f"expected exactly one {value}")
    return found[0]

def scalar(node: ET.Element, path: str) -> str:
    found = node.findall(path)
    require(len(found) == 1 and len(found[0]) == 0, f"missing/duplicate/non-scalar XML field: {path}")
    return (found[0].text or "").strip()

def xml_events(text: object) -> list[ET.Element]:
    require(type(text) is str and 0 < len(text) <= MAX_XML_CHARS, "invalid WFP XML size")
    # Reject declarations before parsing: no DTD, internal/external entities or XInclude.
    require("<!DOCTYPE" not in text.upper() and "<!ENTITY" not in text.upper(), "XML declarations forbidden")
    root = ET.fromstring(text)
    require(root.tag == "netEvents" and all(n.tag == "item" for n in root), "unexpected WFP XML root")
    require(len(root) <= 128, "too many WFP events")
    require(all(not n.tag.startswith("{") for n in root.iter()), "XML namespaces unsupported")
    return list(root)

def nt_image(text: str) -> str:
    require(isinstance(text, str) and text.startswith("\\") and "\x00" not in text, "invalid native image identity")
    return text.replace("/", "\\").casefold()

def app_image(event: ET.Element) -> str:
    raw = bytes.fromhex(scalar(event, "header/appId/data"))
    require(0 < len(raw) <= 65536 and len(raw) % 2 == 0, "invalid app ID size")
    decoded = raw.decode("utf-16le", errors="strict")
    require(decoded.endswith("\0"), "app ID is not terminated")
    return nt_image(decoded[:-1])

def timestamp_ms(text: str) -> int:
    require(text.endswith("Z"), "WFP timestamp is not UTC")
    instant = dt.datetime.fromisoformat(text[:-1] + "+00:00")
    return int((instant - dt.datetime(1970, 1, 1, tzinfo=dt.timezone.utc)) // dt.timedelta(milliseconds=1))

def correlate(records: list[dict]) -> dict:
    require(isinstance(records, list) and 0 < len(records) <= 512 and all(isinstance(r, dict) for r in records), "invalid records")
    pos_i, positive = unique(records, "check", "positive_control_prerequisite")
    require(positive.get("passed") is True, "positive control did not pass")
    obs_i, obs = unique(records, "diagnostic", "broker_tcp_subjects")
    wfp_i, wfp = unique(records, "diagnostic", "broker_wfp_localport_events")
    no_i, no_extra = unique(records, "check", "no_additional_loopback_connection_observed")
    require(pos_i < obs_i < wfp_i < no_i, "observations out of order")
    require(no_extra.get("passed") is True, "extra connections or failed listener observation")
    require(obs.get("schema") == "talos.tcp-ownership.v1" and obs.get("used_for_verdict") is False, "unsupported TCP observation")
    require(wfp.get("used_for_verdict") is False and wfp.get("collection_modified") is False, "WFP collection policy changed")
    require(obs.get("address") == "127.0.0.1", "unexpected broker address")
    listener = integer(obs.get("listener_pid"), "listener PID", 1, 2**32 - 1)
    target = integer(obs.get("listener_port"), "listener port", 1, 65535)
    started = integer(obs.get("started_ms"), "start time", 1)
    finished = integer(obs.get("finished_ms"), "end time", started + 1, started + 60000)
    image = nt_image(obs.get("listener_image_nt"))
    owner = obs.get("owner_sid")
    require(isinstance(owner, str) and owner.startswith("S-1-5-"), "missing owner identity")
    package = obs.get("package_sid")
    require(isinstance(package, str) and package.startswith("S-1-15-2-"), "missing expected package")
    _, binding = unique(records, "diagnostic", "broker_listener_binding")
    require(binding.get("address") == "127.0.0.1" and type(binding.get("port")) is int and binding["port"] == target, "listener bindings disagree")
    subjects = obs.get("subjects")
    require(isinstance(subjects, list) and len(subjects) == 1, "a unique independently observed TCP subject is required")
    subject = subjects[0]
    require(isinstance(subject, dict), "invalid TCP subject")
    pid = integer(subject.get("pid"), "subject PID", 1, 2**32 - 1)
    source = integer(subject.get("source_port"), "source port", 1, 65535)
    require(pid != listener and source != target, "subject aliases listener")
    require(type(subject.get("target_port")) is int and subject["target_port"] == target, "TCP target mismatch")
    require(type(subject.get("tcp_state")) is int and subject["tcp_state"] == 3, "subject was not observed SYN_SENT")
    for key in ("image_match", "package_match", "owner_match"):
        require(subject.get(key) is True, f"subject identity not verified: {key}")
    created = integer(subject.get("created_ms"), "process creation", started, finished)
    first = integer(subject.get("first_ms"), "first observation", created, finished)
    last = integer(subject.get("last_ms"), "last observation", first, finished)
    # 10 ms sampling is not an event subscription. Permit at most 100 ms of
    # sampling jitter, still strictly inside the parent-owned observation window.
    earliest, latest = max(started, first - 100), min(finished, last + 100)
    matching = []
    for event in xml_events(wfp.get("text")):
        same_flow = (
            scalar(event, "header/localAddrV4") == "127.0.0.1"
            and scalar(event, "header/remoteAddrV4") == "127.0.0.1"
            and scalar(event, "header/ipProtocol") == "6"
            and scalar(event, "header/localPort") == str(target)
            and scalar(event, "header/remotePort") == str(source)
        )
        if not same_flow:
            continue
        when = timestamp_ms(scalar(event, "header/timeStamp"))
        if not earliest <= when <= latest:
            continue
        if app_image(event) != image or scalar(event, "header/userId") != owner:
            continue
        # This observed event belongs to the UNCONTAINED listener, not the
        # candidate. Candidate identity comes separately from the OS TCP table.
        if scalar(event, "header/packageSid") != "S-1-0-0":
            continue
        if (scalar(event, "type") != "FWPM_NET_EVENT_TYPE_PUBLIC_CLASSIFY_DROP"
            or scalar(event, "classifyDrop/isLoopback") != "true"
            or scalar(event, "classifyDrop/msFwpDirection") != "MS_FWP_DIRECTION_OUT"
            or scalar(event, "internalFields/filterOrigin") != "AppContainer Loopback"):
            continue
        filter_id = scalar(event, "classifyDrop/filterId")
        require(filter_id.isdecimal() and int(filter_id) > 0, "invalid blocking filter ID")
        terminal = [entry for entry in event.findall("internalFields/terminatingFiltersInfo/item")
                    if scalar(entry, "filterId") == filter_id]
        if len(terminal) != 1:
            continue
        if (scalar(terminal[0], "actionType") != "FWP_ACTION_BLOCK"
            or scalar(terminal[0], "subLayer") != "FWPP_SUBLAYER_INTERNAL_FIREWALL_APP_ISOLATION"):
            continue
        matching.append({"timestamp_ms": when, "filter_id": int(filter_id), "listener_port": target,
                         "source_port": source, "subject_pid": pid})
    return {"status": "VERIFIED_FILTER_BLOCK" if matching else "NO_CORRELATED_BLOCK", "matches": matching}

def review(records: list[dict]) -> dict:
    envelope = {"schema": "talos.loopback-correlation.v1", "legacy_gate_changed": False,
                "full_containment_verified": False, "release_ready": False,
                "scope": "observed IPv4 TCP loopback flow; not arbitrary network egress"}
    try:
        return {**envelope, **correlate(records)}
    except (EvidenceError, ET.ParseError, ValueError, TypeError, KeyError, OverflowError) as error:
        return {**envelope, "status": "INVALID_EVIDENCE", "reason": str(error), "matches": []}

def no_duplicates(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key: {key}")
        result[key] = value
    return result

def read_records(path: Path) -> list[dict]:
    with path.open("rb") as stream:
        raw = stream.read(MAX_LOG_BYTES + 1)
    require(len(raw) <= MAX_LOG_BYTES, "log exceeds size limit")
    return [json.loads(line, object_pairs_hook=no_duplicates)
            for line in raw.decode("utf-8-sig", errors="strict").splitlines() if line.strip()]

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result = review(read_records(args.input))
    except (OSError, ValueError, UnicodeError) as error:
        result = {"schema": "talos.loopback-correlation.v1", "status": "INVALID_EVIDENCE", "reason": str(error),
                  "legacy_gate_changed": False, "full_containment_verified": False, "release_ready": False}
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if result["status"] == "VERIFIED_FILTER_BLOCK" else 1

if __name__ == "__main__":
    sys.exit(main())
