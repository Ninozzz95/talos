<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\TalosAuditEvent;
use App\Models\TalosCalendarDraft;
use App\Models\TalosExternalAccount;
use App\Models\TalosExternalSyncState;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Throwable;

final class GoogleCalendarService
{
    private const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

    private const EVENTS_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars';

    private const READ_SCOPES = [
        'https://www.googleapis.com/auth/calendar.events.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar',
    ];

    private const WRITE_SCOPES = [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar',
    ];

    /**
     * @return array{calendars: list<array<string, mixed>>}
     */
    public function listCalendars(TalosExternalAccount $account): array
    {
        $this->requireConnectedAccount($account);
        $this->requireReadScope($account);

        $response = Http::withToken($this->accessToken($account))
            ->acceptJson()
            ->get(self::CALENDAR_LIST_URL, [
                'fields' => 'items(id,summary,description,primary,accessRole,timeZone,selected)',
            ]);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Calendar listing failed.');

            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_LIST_FAILED',
                'Google Calendar listing failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $this->markAccountUsed($account);

        return [
            'calendars' => array_values(array_map(
                fn (array $calendar): array => $this->calendarSummary($calendar),
                $items,
            )),
        ];
    }

    /**
     * @return array{calendar_id: string, synced_count: int, next_sync_token: string|null, events: list<array<string, mixed>>}
     */
    public function syncEvents(TalosExternalAccount $account, string $calendarId = 'primary'): array
    {
        $this->requireConnectedAccount($account);
        $this->requireReadScope($account);

        $syncState = $this->syncState($account, $calendarId);

        $query = [
            'fields' => 'nextSyncToken,items(id,summary,description,start,end,attendees(email),htmlLink,updated,status)',
            'maxResults' => 100,
            'showDeleted' => 'false',
            'singleEvents' => 'true',
        ];

        if (is_string($syncState->sync_cursor) && $syncState->sync_cursor !== '') {
            $query['syncToken'] = $syncState->sync_cursor;
        }

        $response = Http::withToken($this->accessToken($account))
            ->acceptJson()
            ->get($this->eventsUrl($calendarId), $query);

        if (! $response->successful()) {
            $syncState->forceFill([
                'status' => 'failed',
                'metadata' => [
                    ...($syncState->metadata ?? []),
                    'last_error' => 'Google Calendar event sync failed.',
                ],
            ])->save();
            $this->markAccountError($account, 'Google Calendar event sync failed.');

            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_SYNC_FAILED',
                'Google Calendar event sync failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $items = is_array($payload['items'] ?? null) ? $payload['items'] : [];

        $drafts = [];
        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $draft = $this->persistSyncedEvent($account, $calendarId, $item);
            if ($draft instanceof TalosCalendarDraft) {
                $drafts[] = $draft->toApiArray();
            }
        }

        $nextSyncToken = is_string($payload['nextSyncToken'] ?? null) && $payload['nextSyncToken'] !== ''
            ? $payload['nextSyncToken']
            : null;

        $syncState->forceFill([
            'sync_cursor' => $nextSyncToken ?? $syncState->sync_cursor,
            'status' => 'idle',
            'last_synced_at' => Carbon::now(),
            'metadata' => [
                ...($syncState->metadata ?? []),
                'calendar_id' => $calendarId,
                'synced_count' => count($drafts),
            ],
        ])->save();

        $this->markAccountUsed($account);

        return [
            'calendar_id' => $calendarId,
            'synced_count' => count($drafts),
            'next_sync_token' => $nextSyncToken,
            'events' => $drafts,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function publishDraft(
        TalosExternalAccount $account,
        TalosCalendarDraft $draft,
        bool $confirmed,
        string $calendarId = 'primary',
    ): array {
        $this->requireConnectedAccount($account);
        $this->requireWriteScope($account);

        if ($confirmed !== true) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_CONFIRMATION_REQUIRED',
                'Google Calendar publish requires confirmed=true.',
                422,
            );
        }

        if (! $draft->isValidCalendarEventDraft()) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_DRAFT_INVALID',
                'Calendar draft is invalid for Google Calendar publish.',
                422,
            );
        }

        if ($draft->isLinkedToExternalEvent()) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_DRAFT_ALREADY_PUBLISHED',
                'Calendar draft is already linked to an external event.',
                422,
            );
        }

        $response = Http::withToken($this->accessToken($account))
            ->acceptJson()
            ->asJson()
            ->post($this->eventsUrl($calendarId), $this->eventPayload($draft));

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Calendar event publish failed.');

            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_PUBLISH_FAILED',
                'Google Calendar event publish failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $eventId = $payload['id'] ?? null;
        if (! is_string($eventId) || $eventId === '') {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_PUBLISH_INVALID_RESPONSE',
                'Google Calendar event publish did not return an event id.',
                502,
            );
        }

        $metadata = [
            ...($draft->metadata ?? []),
            'external_provider' => 'google_calendar',
            'external_account_id' => $account->id,
            'external_calendar_id' => $calendarId,
            'external_event_id' => $eventId,
            'external_event_link' => is_string($payload['htmlLink'] ?? null) ? $payload['htmlLink'] : null,
            'trust_level' => 'trusted_write',
            'published_at' => Carbon::now()->toJSON(),
        ];

        $draft->forceFill([
            'status' => 'published',
            'confirmation_required' => false,
            'confirmed_at' => $draft->confirmed_at ?? Carbon::now(),
            'metadata' => $metadata,
        ])->save();

        $this->markAccountUsed($account);

        TalosAuditEvent::record('google.calendar.event_published', 'calendar_draft', (string) $draft->id, [
            'account_id' => $account->id,
            'calendar_id' => $calendarId,
            'draft_id' => $draft->id,
            'event_id' => $eventId,
            'title' => $draft->title,
            'starts_at' => $draft->starts_at?->toJSON(),
            'ends_at' => $draft->ends_at?->toJSON(),
            'attendees_count' => count($draft->attendees ?? []),
        ]);

        return $draft->refresh()->toApiArray();
    }

    private function requireConnectedAccount(TalosExternalAccount $account): void
    {
        if ($account->provider !== 'google' || $account->status !== 'connected') {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_ACCOUNT_NOT_CONNECTED',
                'Connected Google account not found.',
                422,
            );
        }
    }

    private function requireReadScope(TalosExternalAccount $account): void
    {
        if (! $this->hasAnyScope($account, self::READ_SCOPES)) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_READ_SCOPE_REQUIRED',
                'Google Calendar read scope is not granted.',
                403,
            );
        }
    }

    private function requireWriteScope(TalosExternalAccount $account): void
    {
        if (! $this->hasAnyScope($account, self::WRITE_SCOPES)) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_WRITE_SCOPE_REQUIRED',
                'Google Calendar write scope is not granted.',
                403,
            );
        }
    }

    /**
     * @param list<string> $requiredScopes
     */
    private function hasAnyScope(TalosExternalAccount $account, array $requiredScopes): bool
    {
        $scopes = is_array($account->scopes) ? $account->scopes : [];

        foreach ($scopes as $scope) {
            if (is_string($scope) && in_array($scope, $requiredScopes, true)) {
                return true;
            }
        }

        return false;
    }

    private function accessToken(TalosExternalAccount $account): string
    {
        if (filled($account->encrypted_access_token)
            && (! $account->token_expires_at instanceof Carbon || $account->token_expires_at->isFuture())
        ) {
            return $this->decryptToken((string) $account->encrypted_access_token);
        }

        if (filled($account->encrypted_refresh_token)) {
            return $this->refreshAccessToken($account);
        }

        throw new GoogleCalendarException(
            'GOOGLE_CALENDAR_ACCOUNT_REAUTH_REQUIRED',
            'Google account must be reconnected before Calendar can be used.',
            422,
        );
    }

    private function refreshAccessToken(TalosExternalAccount $account): string
    {
        $clientId = config('services.google.client_id');
        $clientSecret = config('services.google.client_secret');
        $tokenUri = config('services.google.token_uri');

        if (! is_string($clientId) || $clientId === ''
            || ! is_string($clientSecret) || $clientSecret === ''
            || ! is_string($tokenUri) || $tokenUri === ''
        ) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_OAUTH_NOT_CONFIGURED',
                'Google OAuth is not configured for Calendar token refresh.',
                503,
            );
        }

        $response = Http::asForm()->post($tokenUri, [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'grant_type' => 'refresh_token',
            'refresh_token' => $this->decryptToken((string) $account->encrypted_refresh_token),
        ]);

        if (! $response->successful()) {
            $this->markAccountError($account, 'Google Calendar token refresh failed.');

            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_TOKEN_REFRESH_FAILED',
                'Google Calendar token refresh failed.',
                502,
            );
        }

        /** @var array<string, mixed> $payload */
        $payload = $response->json();
        $accessToken = $payload['access_token'] ?? null;
        if (! is_string($accessToken) || $accessToken === '') {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_TOKEN_REFRESH_INVALID',
                'Google Calendar token refresh did not return an access token.',
                502,
            );
        }

        $expiresIn = $payload['expires_in'] ?? null;
        $account->forceFill([
            'encrypted_access_token' => Crypt::encryptString($accessToken),
            'token_expires_at' => is_numeric($expiresIn) ? Carbon::now()->addSeconds((int) $expiresIn) : null,
            'last_error' => null,
        ])->save();

        return $accessToken;
    }

    private function decryptToken(string $encryptedToken): string
    {
        try {
            return Crypt::decryptString($encryptedToken);
        } catch (DecryptException $exception) {
            throw new GoogleCalendarException(
                'GOOGLE_CALENDAR_TOKEN_INVALID',
                'Stored Google Calendar token could not be decrypted.',
                422,
                $exception,
            );
        }
    }

    private function syncState(TalosExternalAccount $account, string $calendarId): TalosExternalSyncState
    {
        $state = TalosExternalSyncState::query()->firstOrCreate([
            'external_account_id' => $account->id,
            'provider' => 'google',
            'resource_type' => 'calendar_events',
            'resource_id' => $calendarId,
        ], [
            'status' => 'idle',
            'metadata' => [
                'calendar_id' => $calendarId,
            ],
        ]);

        assert($state instanceof TalosExternalSyncState);

        return $state;
    }

    /**
     * @param array<string, mixed> $event
     */
    private function persistSyncedEvent(
        TalosExternalAccount $account,
        string $calendarId,
        array $event,
    ): ?TalosCalendarDraft {
        $eventId = $event['id'] ?? null;
        if (! is_string($eventId) || $eventId === '') {
            return null;
        }

        $start = $this->eventBoundary($event, 'start');
        $end = $this->eventBoundary($event, 'end');
        if ($start === null || $end === null || ! $end['at']->greaterThan($start['at'])) {
            return null;
        }

        $metadata = [
            'external_provider' => 'google_calendar',
            'external_account_id' => $account->id,
            'external_calendar_id' => $calendarId,
            'external_event_id' => $eventId,
            'external_event_link' => is_string($event['htmlLink'] ?? null) ? $event['htmlLink'] : null,
            'external_updated_at' => is_string($event['updated'] ?? null) ? $event['updated'] : null,
            'trust_level' => 'untrusted',
            'synced_at' => Carbon::now()->toJSON(),
        ];

        $draft = TalosCalendarDraft::query()
            ->where('metadata->external_provider', 'google_calendar')
            ->where('metadata->external_account_id', $account->id)
            ->where('metadata->external_event_id', $eventId)
            ->first();

        $attributes = [
            'title' => $this->eventTitle($event),
            'description' => is_string($event['description'] ?? null) ? $event['description'] : null,
            'starts_at' => $start['at'],
            'ends_at' => $end['at'],
            'timezone' => $start['timezone'],
            'attendees' => $this->attendees($event),
            'status' => 'synced',
            'confirmation_required' => false,
            'metadata' => $metadata,
        ];

        if ($draft instanceof TalosCalendarDraft) {
            $draft->forceFill($attributes)->save();

            return $draft->refresh();
        }

        $draft = TalosCalendarDraft::query()->create($attributes);
        assert($draft instanceof TalosCalendarDraft);

        return $draft;
    }

    /**
     * @param array<string, mixed> $event
     * @return array{at: Carbon, timezone: string}|null
     */
    private function eventBoundary(array $event, string $key): ?array
    {
        $boundary = $event[$key] ?? null;
        if (! is_array($boundary)) {
            return null;
        }

        $timezone = is_string($boundary['timeZone'] ?? null) && $boundary['timeZone'] !== ''
            ? $boundary['timeZone']
            : 'UTC';

        $dateTime = $boundary['dateTime'] ?? null;
        if (is_string($dateTime) && $dateTime !== '') {
            try {
                return [
                    'at' => Carbon::parse($dateTime),
                    'timezone' => $timezone,
                ];
            } catch (Throwable) {
                return null;
            }
        }

        $date = $boundary['date'] ?? null;
        if (is_string($date) && $date !== '') {
            try {
                return [
                    'at' => Carbon::parse($date, $timezone),
                    'timezone' => $timezone,
                ];
            } catch (Throwable) {
                return null;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $event
     */
    private function eventTitle(array $event): string
    {
        $summary = $event['summary'] ?? null;
        if (is_string($summary) && trim($summary) !== '') {
            return trim($summary);
        }

        return 'Untitled Google Calendar event';
    }

    /**
     * @param array<string, mixed> $event
     * @return list<string>
     */
    private function attendees(array $event): array
    {
        $attendees = is_array($event['attendees'] ?? null) ? $event['attendees'] : [];
        $emails = [];

        foreach ($attendees as $attendee) {
            if (! is_array($attendee)) {
                continue;
            }

            $email = $attendee['email'] ?? null;
            if (is_string($email) && trim($email) !== '') {
                $emails[] = trim($email);
            }
        }

        return array_values(array_unique($emails));
    }

    /**
     * @return array<string, mixed>
     */
    private function eventPayload(TalosCalendarDraft $draft): array
    {
        return [
            'summary' => $draft->title,
            'description' => $draft->description,
            'start' => [
                'dateTime' => $draft->starts_at?->toRfc3339String(),
                'timeZone' => $draft->timezone ?: 'UTC',
            ],
            'end' => [
                'dateTime' => $draft->ends_at?->toRfc3339String(),
                'timeZone' => $draft->timezone ?: 'UTC',
            ],
            'attendees' => array_values(array_map(
                fn (string $email): array => ['email' => $email],
                array_filter($draft->attendees ?? [], static fn (mixed $email): bool => is_string($email) && trim($email) !== ''),
            )),
        ];
    }

    /**
     * @param array<string, mixed> $calendar
     * @return array<string, mixed>
     */
    private function calendarSummary(array $calendar): array
    {
        return [
            'id' => is_string($calendar['id'] ?? null) ? $calendar['id'] : '',
            'summary' => is_string($calendar['summary'] ?? null) ? $calendar['summary'] : 'Untitled calendar',
            'description' => is_string($calendar['description'] ?? null) ? $calendar['description'] : null,
            'primary' => ($calendar['primary'] ?? false) === true,
            'selected' => ($calendar['selected'] ?? false) === true,
            'access_role' => is_string($calendar['accessRole'] ?? null) ? $calendar['accessRole'] : null,
            'timezone' => is_string($calendar['timeZone'] ?? null) ? $calendar['timeZone'] : null,
        ];
    }

    private function eventsUrl(string $calendarId): string
    {
        return self::EVENTS_BASE_URL . '/' . rawurlencode($calendarId) . '/events';
    }

    private function markAccountUsed(TalosExternalAccount $account): void
    {
        $account->forceFill([
            'last_used_at' => Carbon::now(),
            'last_error' => null,
        ])->save();
    }

    private function markAccountError(TalosExternalAccount $account, string $message): void
    {
        $account->forceFill(['last_error' => $message])->save();
    }
}
