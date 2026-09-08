"""Benchmark-only JSON-lines wrapper. All compaction algorithms are upstream.

This is a component boundary, not the complete Hermes desktop application.
The host source directory must match the pinned archive prepared by prepare.mjs.
"""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import sys
import traceback

sys.dont_write_bytecode = True
config = json.loads(sys.stdin.readline())
home = Path(config["home"]).resolve()
home.mkdir(parents=True, exist_ok=True)
os.environ["HERMES_HOME"] = str(home)
os.environ["OPENAI_BASE_URL"] = config["baseUrl"]
os.environ["OPENAI_API_KEY"] = config["token"]
os.environ["LLM_MODEL"] = config["model"]
host = Path(config["hermesPath"]).resolve()
if not (host / "agent/context_compressor.py").is_file():
    print(json.dumps({"ready": False, "error": "PINNED_HERMES_SOURCE_MISSING"}), flush=True)
    sys.exit(2)
sys.path.insert(0, str(host))

# Prevent any auxiliary route or plugin from contacting a cloud fallback.
original_connect = socket.socket.connect
def local_connect(sock, address):
    if isinstance(address, tuple) and address[0] not in ("127.0.0.1", "localhost", "::1"):
        raise PermissionError("BENCH_EXTERNAL_NETWORK_DENIED")
    return original_connect(sock, address)
socket.socket.connect = local_connect

engine = None
try:
    with contextlib.redirect_stdout(sys.stderr):
        import yaml
        (home / "config.yaml").write_text(yaml.safe_dump({
            "model": {"default": config["model"], "provider": "custom", "base_url": config["baseUrl"]},
            "auxiliary": {"compression": {"provider": "custom", "model": config["model"], "base_url": config["baseUrl"], "api_key": config["token"]}},
            "compression": {"enabled": True},
        }), encoding="utf-8")
        from agent.context_compressor import ContextCompressor
        import agent.context_compressor as compressor_module
        if not Path(compressor_module.__file__).resolve().is_relative_to(host):
            raise RuntimeError("HERMES_IMPORT_OUTSIDE_PIN")
        if config["arm"] == "hermes":
            engine = ContextCompressor(model=config["model"], provider="custom",
                api_mode="chat_completions", base_url=config["baseUrl"], api_key=config["token"],
                config_context_length=16384, max_tokens=4096, quiet_mode=True,
                abort_on_summary_failure=True)
        else:
            lcm_path = Path(config["lcmPath"]).resolve()
            spec = importlib.util.spec_from_file_location("talos_bench_lcm", lcm_path / "__init__.py", submodule_search_locations=[str(lcm_path)])
            package = importlib.util.module_from_spec(spec)
            sys.modules[spec.name] = package
            spec.loader.exec_module(package)
            from talos_bench_lcm.config import LCMConfig
            from talos_bench_lcm.engine import LCMEngine
            lcm_config = LCMConfig(database_path=str(home / "lcm.db"), summary_model=config["model"],
                summary_fallback_models=[], fresh_tail_count=6, fresh_tail_max_tokens=2048,
                leaf_chunk_tokens=4096, reserve_tokens_floor=4096)
            engine = LCMEngine(config=lcm_config, hermes_home=str(home))
            engine.on_session_start(config["sessionId"], platform="benchmark", conversation_id=config["sessionId"],
                context_length=16384, model=config["model"], provider="custom", api_mode="chat_completions",
                base_url=config["baseUrl"], api_key=config["token"])
    print(json.dumps({"ready": True, "module": str(compressor_module.__file__), "arm": config["arm"]}), flush=True)
except Exception as error:
    print(json.dumps({"ready": False, "error": str(error), "trace": traceback.format_exc()}), flush=True)
    sys.exit(2)

try:
    for line in sys.stdin:
        request = json.loads(line)
        if request.get("operation") == "close":
            break
        try:
            with contextlib.redirect_stdout(sys.stderr):
                messages = request["messages"]
                if config["arm"] == "lcm":
                    engine.ingest(messages)
                result = engine.compress(messages, current_tokens=request.get("tokens"), force=True)
            print(json.dumps({"id": request["id"], "messages": result, "compressionCount": getattr(engine, "compression_count", None)}), flush=True)
        except Exception as error:
            print(json.dumps({"id": request["id"], "error": str(error), "trace": traceback.format_exc()}), flush=True)
finally:
    with contextlib.redirect_stdout(sys.stderr):
        if engine is not None and hasattr(engine, "shutdown"):
            engine.shutdown()
