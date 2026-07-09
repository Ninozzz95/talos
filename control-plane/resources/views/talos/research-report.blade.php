<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $report->title }} - TALOS Research</title>
    <style>
        body {
            margin: 0;
            background: #0b0f14;
            color: #e5edf7;
            font-family: Inter, system-ui, sans-serif;
        }

        main {
            display: grid;
            grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
            gap: 32px;
            max-width: 1180px;
            margin: 0 auto;
            padding: 40px 24px;
        }

        nav {
            position: sticky;
            top: 24px;
            height: max-content;
            border: 1px solid rgba(148, 163, 184, .24);
            background: rgba(15, 23, 42, .72);
            padding: 16px;
        }

        a {
            color: #9ddcff;
        }

        .talos-report-article {
            line-height: 1.65;
        }

        .talos-report-article h1 {
            margin-top: 0;
            font-size: 36px;
        }

        .talos-report-article section {
            border-top: 1px solid rgba(148, 163, 184, .2);
            margin-top: 28px;
            padding-top: 20px;
        }

        @media (max-width: 760px) {
            main {
                display: block;
                padding: 24px 16px;
            }

            nav {
                position: static;
                margin-bottom: 24px;
            }
        }
    </style>
</head>
<body>
    <main>
        <nav aria-label="Research report sections">
            <strong>TALOS Research</strong>
            <ol>
                <li><a href="#executive-summary">Executive Summary</a></li>
                <li><a href="#findings">Findings</a></li>
                <li><a href="#source-map">Source Map</a></li>
                <li><a href="#avm-evidence">AVM Evidence</a></li>
            </ol>
            <p>Run: {{ $report->run_id ?? 'none' }}</p>
        </nav>
        {!! $reportHtml !!}
    </main>
</body>
</html>
