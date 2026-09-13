"""Optional real Chromium test of an independent probe fixture, NOT TALOS.
Requires Python 3 + Playwright and an existing CHROMIUM_PATH. No browser download.
"""
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone
from tempfile import TemporaryDirectory

def main():
    result = {"schema_version": 1, "test_scope": "independent_browser_fixture_not_talos",
              "observed_at_utc": datetime.now(timezone.utc).isoformat(), "passed": False}
    try:
        from playwright.sync_api import sync_playwright
        executable = os.environ.get("CHROMIUM_PATH")
        if not executable or not Path(executable).is_file():
            raise RuntimeError("Set CHROMIUM_PATH to an existing Chromium executable")
        # This opt-out is ONLY for a trusted, isolated root CI fixture. Never use it on TALOS.
        root_fixture = hasattr(os, "geteuid") and os.geteuid() == 0
        result["fixture_only_no_sandbox"] = root_fixture
        args = ["--disable-dev-shm-usage", "--no-zygote"]
        if root_fixture:
            args.append("--no-sandbox")
        script = Path(__file__).resolve().parents[1] / "probes" / "renderer-probe.js"
        with TemporaryDirectory(prefix="browser-probe-fixture-") as temp:
            fixture = Path(temp) / "fixture.html"
            fixture.write_text("<!doctype html><title>Independent renderer fixture</title>", encoding="utf-8")
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=executable, headless=True, args=args, timeout=10000)
                try:
                    result["chromium_version"] = browser.version
                    page = browser.new_page()
                    page.goto("about:blank")
                    page.set_content("<!doctype html><title>Independent renderer fixture</title>")
                    page.add_script_tag(path=str(script))
                    page.evaluate("""() => {
                      const api=TalosDesktopAudit; api.start({capacity:16});
                      api.mark('task_submitted');
                      api.mark('provider_request_started',{request_id:'fixture-request'});
                      api.mark('provider_first_token',{request_id:'fixture-request'});
                      api.mark('renderer_first_token',{request_id:'fixture-request'});
                      api.mark('task_verified',{verifier_exit_code:0});
                    }""")
                    page.wait_for_timeout(150)
                    value = page.evaluate("TalosDesktopAudit.stop()")
                    assert value["scope"] == "renderer_observer_not_whole_desktop"
                    assert len(value["marks"]) == 5
                    assert all(mark["origin"] == "manual" for mark in value["marks"])
                    assert value["raf_callback_gaps_ms"]["n"] > 0
                    assert "fps" not in value
                    result.update(passed=True, observation=value,
                                  disclaimer="Fixture timings are NOT TALOS, model or desktop product measurements.")
                finally:
                    browser.close()
    except Exception as error:
        result["error_type"] = type(error).__name__
        result["error"] = str(error)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if result["passed"] else 1

if __name__ == "__main__":
    sys.exit(main())
