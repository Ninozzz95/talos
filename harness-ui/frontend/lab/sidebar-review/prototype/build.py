"""Build a single offline HTML from reviewable sources (Python standard library)."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parent
APP_FILES = ['lab-data.js', 'explorer-view.js', 'agent-views.js', 'workspace-views.js', 'controller.js', 'actions.js', 'events.js']


def source(name: str) -> str:
    return (ROOT / 'src' / name).read_text(encoding='utf-8')


def build() -> str:
    html = source('shell.html')
    css = '\n'.join(source(name) for name in ['talos-tokens.css', 'prototype.css', 'calm-files.css'])
    state = '\n'.join(re.sub(r'^export ', '', source(name), flags=re.MULTILINE)
                      for name in ['inspector-state.mjs', 'explorer-model.mjs'])
    app = '\n'.join(f'\n// Source: {name}\n{source(name)}' for name in APP_FILES)
    marker = '/*VISIBILITY_FIXTURE*/'
    if app.count(marker) != 1:
        raise ValueError('Expected exactly one visibility fixture marker')
    app = app.replace(marker, 'bodies["inspector-tab-visibility.css"] = ' +
                      json.dumps(source('inspector-tab-visibility.css'), ensure_ascii=False) + ';')
    for marker, text in [('/*STYLES*/', css), ('/*STATE*/', state), ('/*APP*/', app)]:
        if html.count(marker) != 1:
            raise ValueError(f'Expected exactly one {marker}')
        html = html.replace(marker, text)
    return html


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the generated HTML is stale')
    args = parser.parse_args()
    destination = ROOT / 'talos-sidebar-interattiva.html'
    result = build()
    if args.check:
        if not destination.exists() or destination.read_text(encoding='utf-8') != result:
            raise SystemExit('Generated HTML is missing or stale: run python build.py')
        print('PASS: generated HTML matches sources')
    else:
        destination.write_text(result, encoding='utf-8')
        print(f'{len(result.encode("utf-8"))} bytes, single offline HTML')
