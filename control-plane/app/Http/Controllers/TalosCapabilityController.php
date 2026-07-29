<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\TalosProductCapabilityManifest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosCapabilityController extends Controller
{
    public function __invoke(
        Request $request,
        TalosProductCapabilityManifest $manifest,
    ): JsonResponse {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json([
            'data' => $manifest->forUser($user),
        ]);
    }
}
