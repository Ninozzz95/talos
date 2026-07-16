<?php

use App\Services\Talos\Browser\TalosBrowserLegacyWritesDisabled;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

require_once __DIR__.'/core.php';

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        //
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (TalosBrowserLegacyWritesDisabled $exception, Request $request): ?JsonResponse {
            if (! $request->is('api/*')) {
                return null;
            }

            return new JsonResponse([
                'code' => 'TALOS_BROWSER_LEGACY_WRITES_DISABLED',
                'message' => 'Legacy Browser writes are disabled while TALOS uses the canonical Browser v1 contract.',
                'details' => ['operation' => $exception->operation],
            ], 409);
        });

        $exceptions->render(function (HttpExceptionInterface $exception, Request $request): ?JsonResponse {
            if ($exception->getStatusCode() !== 419 || ! $request->is('api/*')) {
                return null;
            }

            if (! Auth::check()) {
                return new JsonResponse([
                    'code' => 'TALOS_AUTH_REQUIRED',
                    'message' => 'Authentication required.',
                ], 401);
            }

            return new JsonResponse([
                'code' => 'TALOS_SESSION_EXPIRED',
                'message' => 'Session expired or CSRF token mismatch. Sign in again.',
            ], 419);
        });

        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
