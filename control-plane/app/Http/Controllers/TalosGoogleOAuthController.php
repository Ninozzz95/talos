<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosAuditEvent;
use App\Models\TalosExternalAccount;
use App\Services\Google\GoogleOAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use RuntimeException;

final class TalosGoogleOAuthController extends Controller
{
    public function accounts(): JsonResponse
    {
        $accounts = TalosExternalAccount::query()
            ->where('provider', 'google')
            ->latest('updated_at')
            ->latest('created_at')
            ->get()
            ->map(fn (TalosExternalAccount $account): array => $account->toApiArray())
            ->values();

        return response()->json(['data' => $accounts]);
    }

    public function redirect(Request $request, GoogleOAuthService $oauth): JsonResponse|RedirectResponse
    {
        if (! $oauth->isConfigured()) {
            return response()->json($oauth->missingConfigurationPayload(), 503);
        }

        return redirect()->away($oauth->redirectUrl($request));
    }

    public function callback(Request $request, GoogleOAuthService $oauth): JsonResponse|RedirectResponse
    {
        if (! $oauth->hasValidState($request)) {
            abort(403, 'Invalid Google OAuth state.');
        }

        if (! $oauth->isConfigured()) {
            return response()->json($oauth->missingConfigurationPayload(), 503);
        }

        try {
            $account = $oauth->connectFromCallback($request);
        } catch (RuntimeException $exception) {
            return response()->json([
                'code' => 'GOOGLE_OAUTH_CALLBACK_FAILED',
                'message' => $exception->getMessage(),
            ], 502);
        }

        TalosAuditEvent::record('google.account.connected', 'talos_external_account', (string) $account->id, [
            'provider' => 'google',
            'email' => $account->email,
            'status' => $account->status,
            'scopes' => $account->scopes ?? [],
        ]);

        return redirect('/dashboard');
    }

    public function disconnect(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'string', 'exists:talos_external_accounts,id'],
        ]);

        $account = TalosExternalAccount::query()
            ->whereKey($validated['account_id'])
            ->where('provider', 'google')
            ->first();

        if (! $account instanceof TalosExternalAccount) {
            throw ValidationException::withMessages([
                'account_id' => 'Google account not found.',
            ]);
        }

        $account->update([
            'status' => 'revoked',
            'encrypted_access_token' => null,
            'encrypted_refresh_token' => null,
            'last_used_at' => now(),
            'last_error' => null,
        ]);

        TalosAuditEvent::record('google.account.disconnected', 'talos_external_account', (string) $account->id, [
            'provider' => 'google',
            'email' => $account->email,
            'status' => 'revoked',
        ]);

        return response()->json(['data' => $account->refresh()->toApiArray()]);
    }
}
