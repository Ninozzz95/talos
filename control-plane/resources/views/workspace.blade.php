<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Talos Workspace</title>
    <link rel="icon" type="image/svg+xml" href="/talos/brand/logo-short.svg">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <div
        id="talos-workspace-root"
        data-talos-surface="{{ $surface ?? 'workspace' }}"
        data-authenticated="{{ auth()->check() ? 'true' : 'false' }}"
        data-auth-user-name="{{ auth()->user()?->name ?? '' }}"
        data-login-url="{{ route('login') }}"
        data-logout-url="{{ route('logout') }}"
        data-csrf-token="{{ csrf_token() }}"
    ></div>
</body>
</html>
