<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosCalendarDraft;
use App\Models\TalosExternalAccount;
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
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
        ]);

        $account = $this->connectedGoogleAccount((string) $validated['account_id']);
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
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
            'calendar_id' => ['sometimes', 'nullable', 'string', 'max:256'],
        ]);

        $account = $this->connectedGoogleAccount((string) $validated['account_id']);
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
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
            'confirmed' => ['required', 'boolean'],
            'calendar_id' => ['sometimes', 'nullable', 'string', 'max:256'],
        ]);

        $account = $this->connectedGoogleAccount((string) $validated['account_id']);
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

    private function connectedGoogleAccount(string $accountId): TalosExternalAccount
    {
        $account = TalosExternalAccount::query()
            ->whereKey($accountId)
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
