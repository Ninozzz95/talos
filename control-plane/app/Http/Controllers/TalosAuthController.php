<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\TalosFirstRunService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

final class TalosAuthController extends Controller
{
    public function show(Request $request, TalosFirstRunService $firstRun): View|RedirectResponse
    {
        if ($firstRun->setupRequired()) {
            return redirect('/setup');
        }

        return view('login', [
            'redirect' => $this->safeRedirectPath($request->query('redirect')),
        ]);
    }

    public function store(Request $request, TalosFirstRunService $firstRun): RedirectResponse
    {
        if ($firstRun->setupRequired()) {
            return redirect('/setup');
        }

        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'redirect' => ['nullable', 'string', 'max:2048'],
        ]);
        $redirect = $this->safeRedirectPath($credentials['redirect'] ?? null);
        unset($credentials['redirect']);

        if (! Auth::attempt($credentials, $request->boolean('remember'))) {
            throw ValidationException::withMessages([
                'email' => 'These credentials do not match a TALOS operator.',
            ]);
        }

        $request->session()->regenerate();

        return redirect()->intended($redirect);
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/login');
    }

    private function safeRedirectPath(mixed $redirect): string
    {
        if (! is_string($redirect)) {
            return '/';
        }

        $trimmed = trim($redirect);

        if ($trimmed === '' || ! str_starts_with($trimmed, '/') || str_starts_with($trimmed, '//')) {
            return '/';
        }

        if (preg_match('/[\x00-\x1F\x7F]/', $trimmed) === 1) {
            return '/';
        }

        return $trimmed;
    }
}
