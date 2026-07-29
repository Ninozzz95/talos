<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Library\TalosLibraryQuery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TalosLibraryController extends Controller
{
    public function __construct(private readonly TalosLibraryQuery $library) {}

    public function index(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);
        $validated = $request->validate([
            'kind' => ['nullable', 'string', Rule::in(['image', 'file', 'link'])],
            'origin' => ['nullable', 'string', Rule::in(['uploaded', 'generated', 'browser', 'search'])],
            'search' => ['nullable', 'string', 'max:200'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'cursor' => ['nullable', 'string', 'max:4096'],
        ]);

        return response()->json($this->library->page($userId, $validated));
    }

    public function destroyMany(Request $request): JsonResponse
    {
        $userId = $this->currentUserId($request);
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:100'],
            'ids.*' => ['required', 'string', 'distinct:strict', 'max:64'],
        ]);

        return response()->json([
            'data' => [
                'removed_count' => $this->library->removeFromLibrary($userId, $validated['ids']),
            ],
        ]);
    }

    private function currentUserId(Request $request): int
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return (int) $user->id;
    }
}
