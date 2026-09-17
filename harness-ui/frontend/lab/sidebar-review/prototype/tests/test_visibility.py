"""Serve the fixture and actual CSS over loopback, without rewriting the stylesheet."""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import argparse
import hashlib
import json
import os
import shutil

ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--inline', action='store_true', help='Embed unchanged CSS when browser administration blocks loopback/file URLs')
args=parser.parse_args()
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
thread = Thread(target=server.serve_forever, daemon=True)
thread.start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
        page = browser.new_page()
        css=(ROOT/'src/inspector-tab-visibility.css').read_text(encoding='utf-8')
        if args.inline:
            fixture=(ROOT/'tests/visibility-regression.html').read_text(encoding='utf-8')
            page.set_content(fixture.replace('<link rel="stylesheet" href="../src/inspector-tab-visibility.css">','<style>'+css+'</style>'))
        else:
            page.goto(f'http://127.0.0.1:{server.server_port}/tests/visibility-regression.html')
        page.wait_for_function('window.visibilityResults !== undefined')
        results = page.evaluate('window.visibilityResults')
        assert all(r['passed'] for r in results), results
        (ROOT / 'artifacts/visibility-current.json').write_text(json.dumps({'passed':len(results),'checks':results,'transport':'set_content; unchanged CSS embedded' if args.inline else 'loopback HTTP','css_sha256':hashlib.sha256(css.encode()).hexdigest()},indent=2))
        print(f'PASS: {len(results)} visibility conditions; inline={args.inline}')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
    thread.join()
