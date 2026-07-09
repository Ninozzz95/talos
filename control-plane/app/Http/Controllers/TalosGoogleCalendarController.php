<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosCalendarDraft;
use App\Models\TalosExternalAccount;
use App\Models\User;
use App\Services\Google\GoogleCalendarException;
use App\Services\Google\GoogleCalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

final class TalosGoogleCalendarController extends Controller
{
    public function calendars(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string'],
        ]);

        $account = $this->connectedGoogleAccount($request, (string) $validated['account_id']);
        $calendar = app(GoogleCalendarService::class);

        try {
            /** @var array<string, mixed> $calendars */
            $calendars = $calendar->listCalendars($account);
        } catch (GoogleCalendarException $exception) {
            return $this->calendarError($exception);
        }

        return response()->json(['data' => $calendars]);
    }

    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string'],
            'calendar_id' => ['sometimes', 'nullable', 'string', 'max:256'],
        ]);

        $account = $this->connectedGoogleAccount($request, (string) $validated['account_id']);
        $calendarId = $this->calendarId($validated['calendar_id'] ?? null);
        $calendar = app(GoogleCalendarService::class);

        try {
            /** @var array<string, mixed> $result */
            $result = $calendar->syncEvents($account, $calendarId);
        } catch (GoogleCalendarException $exception) {
            return $this->calendarError($exception);
        }

        return response()->json(['data' => $result]);
    }

    public function publish(Request $request, TalosCalendarDraft $calendarDraft): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string'],
            'confirmed' => ['required', 'boolean'],
            'calendar_id' => ['sometimes', 'nullable', 'string', 'max:256'],
        ]);

        $user = $request->user();
        abort_unless($user instanceof User, 401);
        abort_unless((int) $calendarDraft->user_id === (int) $user->id, 404);

        $account = $this->connectedGoogleAccount($request, (string) $validated['account_id']);
        $calendarId = $this->calendarId($validated['calendar_id'] ?? null);
        $calendar = app(GoogleCalendarService::class);

        try {
            /** @var array<string, mixed> $result */
            $result = $calendar->publishDraft(
                $account,
                $calendarDraft,
                (bool) $validated['confirmed'],
                $calendarId,
            );
        } catch (GoogleCalendarException $exception) {
            return $this->calendarError($exception);
        }

        return response()->json(['data' => $result]);
    }

    private function connectedGoogleAccount(Request $request, string $accountId): TalosExternalAccount
    {
        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $account = TalosExternalAccount::query()
            ->whereKey($accountId)
            ->where('user_id', $user->id)
            ->where('provider', 'google')
            ->where('status', 'connected')
            ->first();

        if (! $account instanceof TalosExternalAccount) {
            throw ValidationException::withMessages([
                'account_id' => 'Connected Google account not found.',
            ]);
        }

        return $account;
    }

    private function calendarId(mixed $calendarId): string
    {
        if (is_string($calendarId) && trim($calendarId) !== '') {
            return trim($calendarId);
        }

        return 'primary';
    }

    private function calendarError(GoogleCalendarException $exception): JsonResponse
    {
        return response()->json([
            'code' => $exception->codeName(),
            'message' => $exception->getMessage(),
        ], $exception->httpStatus());
    }
}
