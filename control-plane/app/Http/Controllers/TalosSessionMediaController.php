<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSession;
use App\Models\User;
use App\Services\Library\TalosLibraryQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosSessionMediaController extends Controller
{
    public function __construct(private readonly TalosLibraryQuery $library) {}

    public function __invoke(Request $request, TalosSession $session): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $session->user_id === (int) $user->id, 404);
        $validated = $request->validate([
            'kind' => ['nullable', 'string', Rule::in(['image', 'file', 'link'])],
        ]);

        return response()->json($this->library->sessionMedia(
            (int) $user->id,
            $session,
            is_string($validated['kind'] ?? null) ? $validated['kind'] : null,
        ));
    }
}
