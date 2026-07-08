<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Admin\TalosAdminGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosAdminPolicyController extends Controller
{
    public function __invoke(Request $request, TalosAdminGate $gate): JsonResponse
    {
        $token = $gate->require($request, 'talos.policy.read');

        return response()->json([
            'data' => [
                'default_decision' => 'deny',
                'capabilities' => TalosAdminGate::capabilities(),
                'token' => $token->toApiArray(),
            ],
        ]);
    }
}
