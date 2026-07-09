<?php

declare(strict_types=1);

namespace App\Services\Google;

use App\Models\TalosExternalAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

final class GoogleOAuthService
{
    public const SESSION_STATE_KEY = 'talos_google_oauth_state';

    public function isConfigured(): bool
    {
        return filled(config('services.google.client_id'))
            && filled(config('services.google.client_secret'))
            && filled($this->redirectUri());
    }

    /**
     * @return array{code: string, message: string}
     */
    public function missingConfigurationPayload(): array
    {
        return [
            'code' => 'GOOGLE_OAUTH_NOT_CONFIGURED',
            'message' => 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
        ];
    }

    public function redirectUrl(Request $request): string
    {
        $state = Str::random(64);
        $request->session()->put(self::SESSION_STATE_KEY, $state);

        $query = [
            'client_id' => (string) config('services.google.client_id'),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'scope' => implode(' ', $this->scopes()),
            'state' => $state,
            'access_type' => 'offline',
            'include_granted_scopes' => 'true',
            'prompt' => 'consent',
        ];

        return (string) config('services.google.auth_uri') . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    public function hasValidState(Request $request): bool
    {
        $expected = $request->session()->pull(self::SESSION_STATE_KEY);
        $actual = $request->query('state');

        if (! is_string($expected) || ! is_string($actual)) {
            return false;
        }

        return hash_equals($expected, $actual);
    }

    public function connectFromCallback(Request $request): TalosExternalAccount
    {
        $code = $request->query('code');
        if (! is_string($code) || trim($code) === '') {
            throw new RuntimeException('Missing Google OAuth authorization code.');
        }

        $tokenResponse = Http::asForm()->post((string) config('services.google.token_uri'), [
            'client_id' => (string) config('services.google.client_id'),
            'client_secret' => (string) config('services.google.client_secret'),
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $this->redirectUri(),
        ]);

        if (! $tokenResponse->successful()) {
            throw new RuntimeException('Google OAuth token exchange failed.');
        }

        /** @var array<string, mixed> $tokenPayload */
        $tokenPayload = $tokenResponse->json();
        $accessToken = $tokenPayload['access_token'] ?? null;
        if (! is_string($accessToken) || $accessToken === '') {
            throw new RuntimeException('Google OAuth token response did not include an access token.');
        }

        $profileResponse = Http::withToken($accessToken)->get((string) config('services.google.userinfo_uri'));
        if (! $profileResponse->successful()) {
            throw new RuntimeException('Google OAuth profile lookup failed.');
        }

        /** @var array<string, mixed> $profile */
        $profile = $profileResponse->json();
        $providerAccountId = $profile['sub'] ?? $profile['id'] ?? null;
        $email = $profile['email'] ?? null;

        if (! is_string($providerAccountId) || $providerAccountId === '') {
            if (! is_string($email) || $email === '') {
                throw new RuntimeException('Google profile did not include an account id or email.');
            }

            $providerAccountId = $email;
        }

        $account = TalosExternalAccount::query()
            ->where('provider', 'google')
            ->where('provider_account_id', $providerAccountId)
            ->first();

        $refreshToken = $tokenPayload['refresh_token'] ?? null;
        $expiresIn = $tokenPayload['expires_in'] ?? null;

        $payload = [
            'provider' => 'google',
            'provider_account_id' => $providerAccountId,
            'email' => is_string($email) ? $email : null,
            'display_name' => is_string($profile['name'] ?? null) ? $profile['name'] : null,
            'encrypted_access_token' => Crypt::encryptString($accessToken),
            'scopes' => $this->grantedScopes($tokenPayload),
            'status' => 'connected',
            'token_expires_at' => is_numeric($expiresIn) ? Carbon::now()->addSeconds((int) $expiresIn) : null,
            'connected_at' => $account?->connected_at ?? Carbon::now(),
            'last_error' => null,
            'metadata' => [
                'picture' => is_string($profile['picture'] ?? null) ? $profile['picture'] : null,
            ],
        ];

        if (is_string($refreshToken) && $refreshToken !== '') {
            $payload['encrypted_refresh_token'] = Crypt::encryptString($refreshToken);
        } elseif ($account instanceof TalosExternalAccount) {
            $payload['encrypted_refresh_token'] = $account->encrypted_refresh_token;
        }

        $account = TalosExternalAccount::query()->updateOrCreate([
            'provider' => 'google',
            'provider_account_id' => $providerAccountId,
        ], $payload);

        assert($account instanceof TalosExternalAccount);

        return $account;
    }

    /**
     * @return list<string>
     */
    private function grantedScopes(array $tokenPayload): array
    {
        $scope = $tokenPayload['scope'] ?? null;
        if (is_string($scope) && trim($scope) !== '') {
            return array_values(array_filter(array_map('trim', explode(' ', $scope))));
        }

        return $this->scopes();
    }

    /**
     * @return list<string>
     */
    private function scopes(): array
    {
        $scopes = config('services.google.scopes', []);
        if (is_string($scopes)) {
            $scopes = explode(',', $scopes);
        }

        if (! is_array($scopes)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $scope): string => trim((string) $scope),
            $scopes,
        )));
    }

    private function redirectUri(): string
    {
        $redirect = config('services.google.redirect');

        return is_string($redirect) ? $redirect : '';
    }
}
