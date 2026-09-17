#!/usr/bin/env python3
"""Build a reproducible source hand-off from immutable Git objects and the verified frontend build."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
from urllib.parse import quote
import zipfile

BASE = "13f65c15cdeaf8986b882993a0773cdeafb867d2"
FONTS = {".woff", ".woff2", ".ttf", ".otf", ".ttc", ".eot"}
ROOT = Path(__file__).resolve().parents[2]

def git(*args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(ROOT), *args])

def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

def safe(name: str) -> None:
    if name.startswith("/") or "\\" in name or ":" in name or "\0" in name or any(p in {"", ".", ".."} for p in name.split("/")):
        raise ValueError("Unsafe source archive path: " + name)

def build(output: Path, source: str = "HEAD") -> dict:
    head = git("rev-parse", source).decode().strip()
    if len(head) != 40:
        raise ValueError("An immutable source commit is required")
    output.mkdir(parents=True, exist_ok=True)
    data: dict[str, tuple[bytes, str, str | None]] = {}
    assets: list[dict] = []
    links: list[dict] = []
    inventory: list[dict] = []
    proc = subprocess.Popen(["git", "-C", str(ROOT), "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    assert proc.stdin and proc.stdout
    try:
        for raw in git("ls-tree", "-rz", head).split(b"\0"):
            if not raw:
                continue
            meta, raw_name = raw.split(b"\t", 1)
            mode, kind, blob = meta.decode().split()
            name = raw_name.decode("utf-8"); safe(name)
            if kind == "commit":
                links.append({"path": name, "commit": blob, "status": "external-gitlink", "neededForDesktop": False})
                continue
            proc.stdin.write((blob + "\n").encode("ascii")); proc.stdin.flush()
            returned, typ, length = proc.stdout.readline().split()
            body = proc.stdout.read(int(length))
            if returned.decode() != blob or typ != b"blob" or proc.stdout.read(1) != b"\n" or hashlib.sha1(b"blob " + str(len(body)).encode() + b"\0" + body).hexdigest() != blob:
                raise RuntimeError("Invalid Git object for " + name)
            sha = hashlib.sha256(body).hexdigest()
            inventory.append({"path": name, "mode": mode, "gitBlob": blob, "sha256": sha, "bytes": len(body)})
            if PurePosixPath(name).suffix.lower() in FONTS:
                assets.append({"path": name, "bytes": len(body), "sha256": sha, "url": "https://raw.githubusercontent.com/Ninozzz95/talos/" + head + "/" + quote(name, safe="/")})
                continue
            if PurePosixPath(name).suffix.lower() in {".gguf", ".ggml", ".jks", ".keystore"} or PurePosixPath(name).name in {".env", ".env.local", ".workspace-launch-token"}:
                raise RuntimeError("Private or model data must not be published: " + name)
            if mode == "120000" and name.startswith(("harness-ui/", "context-engine/", "tools/delivery/")):
                raise RuntimeError("Desktop source contains a link requiring explicit support: " + name)
            data[name] = (body, mode, blob)
    finally:
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("Git object export failed")

    dist = ROOT / "harness-ui/frontend/dist"
    manifest = json.loads((dist / "build-manifest.json").read_text("utf-8"))
    generated: list[dict] = []
    for item in manifest["files"]:
        safe(item["path"])
        body = (dist / item["path"]).read_bytes()
        if hashlib.sha256(body).hexdigest() != item["sha256"] or len(body) != item["bytes"]:
            raise RuntimeError("Compiled asset differs from its build manifest: " + item["path"])
        name = "harness-ui/public/" + item["path"]
        if PurePosixPath(name).suffix.lower() in FONTS:
            continue
        data[name] = (body, "100644", None)
        generated.append({"path": name, "sha256": item["sha256"], "bytes": item["bytes"]})
    data["harness-ui/public/build-manifest.json"] = ((dist / "build-manifest.json").read_bytes(), "100644", None)
    data["DELIVERY-ASSETS.json"] = (json_bytes({"schema": 1, "sourceCommit": head, "assets": assets,
        "note": "Asset binaries are restored by the launcher from this immutable repository commit and verified by SHA-256. Model weights and credentials are never downloaded."}), "100644", None)
    data["SOURCE_COMMIT.txt"] = ((head + "\n").encode(), "100644", None)
    data["EXTERNAL-GITLINKS.json"] = (json_bytes({"sourceCommit": head, "gitlinks": links, "scope": "Native Android third-party submodules are not used by the Desktop launcher. Their exact commits are preserved for a separate Android checkout."}), "100644", None)
    file_manifest = [{"path": name, "mode": mode, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "gitBlob": blob, "kind": "tracked" if blob else "delivery-or-generated"} for name, (body, mode, blob) in sorted(data.items())]
    data["SOURCE-MANIFEST.json"] = (json_bytes({"schema": 1, "sourceCommit": head, "baseline": BASE, "files": file_manifest, "generatedFrontend": generated,
        "integrityNote": "The manifest covers every archive entry except itself. A SHA256SUMS sidecar covers the complete ZIP."}), "100644", None)

    destination = output / ("TALOS-Sorgenti-OneClick-" + head[:7] + ".zip")
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, (body, mode, _blob) in sorted(data.items()):
            if PurePosixPath(name).suffix.lower() in FONTS:
                raise AssertionError("Font binary unexpectedly reached the archive")
            info = zipfile.ZipInfo("TALOS/" + name, date_time=(2026, 9, 17, 0, 0, 0))
            info.create_system = 3; info.external_attr = int(mode, 8) << 16; info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body)
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None or set(archive.namelist()) != {"TALOS/" + name for name in data}:
            raise RuntimeError("Delivery archive integrity or inventory is inconsistent")
    result = {"sourceCommit": head, "baseline": BASE, "zip": destination.name,
              "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "bytes": destination.stat().st_size,
              "archiveEntries": len(data), "restoredAssets": len(assets), "externalGitlinks": links,
              "compiledAppSha256": hashlib.sha256((dist / "app.js").read_bytes()).hexdigest()}
    (output / "delivery.json").write_bytes(json_bytes(result))
    (output / "source-inventory.json").write_bytes(json_bytes(inventory))
    (output / "all-changes.patch").write_bytes(git("diff", "--no-ext-diff", "--no-renames", BASE, head))
    (output / "commits.tsv").write_bytes(git("log", "--reverse", "--format=%H%x09%aI%x09%s", BASE + ".." + head))
    (output / "SOURCE-SHA256SUMS.txt").write_text(result["sha256"] + "  " + destination.name + "\n", encoding="ascii")
    print(json.dumps(result, indent=2))
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".delivery-output")
    parser.add_argument("--source", default="HEAD")
    args = parser.parse_args()
    build(args.output.resolve(), args.source)
