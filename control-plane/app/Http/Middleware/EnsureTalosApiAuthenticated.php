<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Services\TalosFirstRunService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

final class EnsureTalosApiAuthenticated
{
    public function __construct(
        private readonly TalosFirstRunService $firstRun,
    ) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('OPTIONS')) {
            return $next($request);
        }

        $this->firstRun->bootstrapAdminFromEnvironment();

        if (! Auth::check()) {
            return new JsonResponse([
                'code' => 'TALOS_AUTH_REQUIRED',
                'message' => 'Authentication required.',
            ], 401);
        }

        return $next($request);
    }
}
