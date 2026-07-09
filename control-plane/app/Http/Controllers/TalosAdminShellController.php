<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Admin\TalosAdminGate;
use App\Services\Admin\TalosShellPolicyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosAdminShellController extends Controller
{
    public function preview(Request $request, TalosAdminGate $gate, TalosShellPolicyService $policy): JsonResponse
    {
        $this->rejectCrossSite($request);
        $token = $gate->require($request, 'talos.shell.preview');
        $validated = $this->validatedPayload($request);

        return response()->json(['data' => $policy->preview($validated, $token)]);
    }

    public function execute(Request $request, TalosAdminGate $gate, TalosShellPolicyService $policy): JsonResponse
    {
        $this->rejectCrossSite($request);
        $token = $gate->require($request, 'talos.shell.exec');
        $validated = $this->validatedPayload($request);

        return response()->json(['data' => $policy->execute($validated, $token)], 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedPayload(Request $request): array
    {
        return $request->validate([
            'command' => ['required', 'string', 'min:1', 'max:4000'],
            'timeout_seconds' => ['sometimes', 'integer', 'min:1', 'max:300'],
            'use_pty' => ['sometimes', 'boolean'],
            'use_tmux' => ['sometimes', 'boolean'],
            'workspace' => ['sometimes', 'nullable', 'string', 'max:2048'],
        ]);
    }

    private function rejectCrossSite(Request $request): void
    {
        if (strtolower((string) $request->header('Sec-Fetch-Site', '')) !== 'cross-site') {
            return;
        }

        abort(response()->json([
            'error' => 'TALOS_CROSS_SITE_SHELL_DENIED',
        ], 403));
    }
}
