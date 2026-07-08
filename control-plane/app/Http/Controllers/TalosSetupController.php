<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\TalosFirstRunService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rules\Password;
use Illuminate\View\View;

final class TalosSetupController extends Controller
{
    public function show(TalosFirstRunService $firstRun): View|RedirectResponse
    {
        if (! $firstRun->setupRequired()) {
            return redirect('/login');
        }

        return view('setup');
    }

    public function store(Request $request, TalosFirstRunService $firstRun): RedirectResponse
    {
        if (! $firstRun->setupRequired()) {
            return redirect('/login');
        }

        $attributes = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(12)],
        ]);

        if ($firstRun->hasUsers()) {
            return redirect('/login');
        }

        $user = User::query()->create($attributes);

        Auth::login($user);
        $request->session()->regenerate();

        return redirect('/');
    }
}
