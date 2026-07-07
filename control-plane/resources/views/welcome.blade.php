<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Kadmos Control Plane</title>
    <style>
        :root {
            --bg: #080b11;
            --panel: #14171d;
            --border: #2a303a;
            --text: #ececec;
            --muted: #9e9e9e;
            --accent: #d29922;
            --green: #3fb950;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: var(--bg);
            color: var(--text);
            font: 14px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        main {
            width: min(720px, calc(100vw - 40px));
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--panel);
            padding: 22px;
        }
        .kicker {
            color: var(--accent);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
        }
        h1 { margin: 0 0 8px; font-size: 22px; font-weight: 650; }
        p { color: var(--muted); margin: 0 0 18px; }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--border);
            border-radius: 999px;
            padding: 6px 10px;
            color: var(--muted);
            font-size: 12px;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: var(--green);
        }
        code {
            display: block;
            margin-top: 16px;
            padding: 12px;
            border-radius: 8px;
            background: #0d0d0d;
            color: #7ee787;
            border: 1px solid var(--border);
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <main>
        <div class="kicker">Kadmos AVM control-plane</div>
        <h1>API service online</h1>
        <p>The user-facing benchmark and file-ingestion workflow is integrated in the Talos dashboard. This service owns API routing, storage, and benchmark execution.</p>
        <div class="status"><span class="dot"></span>Ready</div>
        <code>POST /api/files/ingest
POST /api/benchmarks/compare</code>
    </main>
</body>
</html>
