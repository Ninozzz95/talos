<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>TALOS Setup</title>
    <link rel="icon" type="image/svg+xml" href="/talos/brand/logo-short.svg">
    <style>
        :root {
            color-scheme: dark;
            --accent: #c98b32;
            --bg: #080b11;
            --border: #27313e;
            --card: #0f151e;
            --muted: #98a5b6;
            --panel: #10161f;
            --text: #edf2f7;
        }

        * {
            box-sizing: border-box;
        }

        body {
            min-height: 100vh;
            margin: 0;
            display: grid;
            place-items: center;
            padding: 24px;
            background:
                linear-gradient(180deg, rgba(201, 139, 50, 0.08), transparent 280px),
                var(--bg);
            color: var(--text);
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        main {
            width: min(100%, 460px);
            border: 1px solid var(--border);
            border-radius: 8px;
            background: color-mix(in srgb, var(--card) 94%, transparent);
            padding: 24px;
            box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34);
        }

        h1 {
            margin: 0;
            font-size: 22px;
            line-height: 1.2;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .brand-logo {
            width: 42px;
            height: 42px;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--panel);
            color: var(--accent);
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .brand-logo::before {
            content: "";
            display: block;
            width: 74%;
            height: 74%;
            background: currentColor;
            mask: url('/talos/brand/logo-short.svg') center / contain no-repeat;
            -webkit-mask: url('/talos/brand/logo-short.svg') center / contain no-repeat;
        }

        .brand-title {
            font-family: Orbitron, Inter, ui-sans-serif, system-ui, sans-serif;
            letter-spacing: 0;
        }

        p {
            margin: 8px 0 0;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.5;
        }

        form {
            margin-top: 24px;
            display: grid;
            gap: 14px;
        }

        label {
            display: grid;
            gap: 6px;
            color: var(--muted);
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        input {
            width: 100%;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: var(--panel);
            color: var(--text);
            padding: 10px 12px;
            font: inherit;
            outline: none;
        }

        input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(201, 139, 50, 0.16);
        }

        button {
            border: 1px solid #a87224;
            border-radius: 6px;
            background: var(--accent);
            color: #171006;
            padding: 10px 14px;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
        }

        .error {
            border: 1px solid #6f3035;
            border-radius: 6px;
            background: #2b1418;
            color: #ef8589;
            padding: 10px 12px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <main aria-labelledby="talos-setup-title">
        <div class="brand">
            <span class="brand-logo" aria-hidden="true"></span>
            <div>
                <div style="color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;">AVM</div>
                <h1 id="talos-setup-title" class="brand-title">TALOS</h1>
            </div>
        </div>
        <div>
            <p>Create the first operator account. After this, setup closes and TALOS requires login.</p>
        </div>

        @if ($errors->any())
            <div class="error" role="alert">
                {{ $errors->first() }}
            </div>
        @endif

        <form id="talos-setup-form" method="POST" action="{{ url('/setup') }}">
            @csrf

            <label for="name">
                Name
                <input id="name" name="name" type="text" autocomplete="name" value="{{ old('name') }}" required autofocus>
            </label>

            <label for="email">
                Email
                <input id="email" name="email" type="email" autocomplete="email" value="{{ old('email') }}" required>
            </label>

            <label for="password">
                Password
                <input id="password" name="password" type="password" autocomplete="new-password" required>
            </label>

            <label for="password_confirmation">
                Confirm password
                <input id="password_confirmation" name="password_confirmation" type="password" autocomplete="new-password" required>
            </label>

            <button type="submit">Create first admin</button>
        </form>
    </main>
</body>
</html>
