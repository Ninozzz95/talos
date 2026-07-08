<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\Admin\TalosAdminGate;
use App\Services\Admin\TalosBackupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class TalosAdminBackupController extends Controller
{
    public function manifest(Request $request, TalosAdminGate $gate, TalosBackupService $backup): JsonResponse
    {
        $gate->require($request, 'talos.backup.read');

        return response()->json($backup->manifest());
    }

    public function validateRestore(Request $request, TalosAdminGate $gate, TalosBackupService $backup): JsonResponse
    {
        $gate->require($request, 'talos.backup.restore');

        $validated = $request->validate([
            'schema_version' => ['required', 'string'],
            'dry_run' => ['required', 'boolean'],
            'domains' => ['present', 'array'],
        ]);

        return response()->json(['data' => $backup->validateRestore($validated)]);
    }
}
