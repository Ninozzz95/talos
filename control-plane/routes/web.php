<?php

use App\Http\Controllers\TalosAuthController;
use App\Http\Controllers\TalosGoogleOAuthController;
use App\Http\Controllers\TalosReadinessController;
use App\Http\Controllers\TalosResearchReportPageController;
use App\Http\Controllers\TalosSetupController;
use App\Http\Controllers\TalosWorkspaceController;
use Illuminate\Support\Facades\Route;

Route::get('/', TalosWorkspaceController::class);
Route::get('/readyz', TalosReadinessController::class);

Route::get('/setup', [TalosSetupController::class, 'show'])->name('setup');
Route::post('/setup', [TalosSetupController::class, 'store']);

Route::middleware('guest')->group(function (): void {
    Route::get('/login', [TalosAuthController::class, 'show'])->name('login');
    Route::post('/login', [TalosAuthController::class, 'store']);
});

Route::post('/logout', [TalosAuthController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

Route::middleware('auth')->group(function (): void {
    Route::get('/integrations/google/redirect', [TalosGoogleOAuthController::class, 'redirect']);
    Route::get('/integrations/google/callback', [TalosGoogleOAuthController::class, 'callback']);
    Route::get('/research/reports/{researchReport}', TalosResearchReportPageController::class);
});

Route::redirect('/chat', '/');
Route::redirect('/dashboard', '/');
