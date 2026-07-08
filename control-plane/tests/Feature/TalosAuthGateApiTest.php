<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Http\Middleware\EnsureTalosApiAuthenticated;
use App\Models\User;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class TalosAuthGateApiTest extends TestCase
{
    use RefreshDatabase;

    #[DataProvider('guestProtectedApiRoutes')]
    public function test_guest_api_requests_return_controlled_json_401(string $method, string $uri, array $payload = []): void
    {
        User::factory()->create();

        $response = $this->json($method, $uri, $payload);

        $response
            ->assertStatus(401)
            ->assertExactJson([
                'code' => 'TALOS_AUTH_REQUIRED',
                'message' => 'Authentication required.',
            ]);
    }

    public function test_authenticated_user_can_reach_talos_api_routes(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/talos/sessions')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_all_registered_api_routes_include_talos_session_gate(): void
    {
        $ungated = [];

        foreach (Route::getRoutes() as $route) {
            if (! str_starts_with($route->uri(), 'api/')) {
                continue;
            }

            $middleware = $route->gatherMiddleware();

            if (! in_array(EnsureTalosApiAuthenticated::class, $middleware, true)) {
                $ungated[] = implode('|', $route->methods()).' '.$route->uri();
            }
        }

        $this->assertSame([], $ungated);
    }

    public function test_api_options_preflight_is_not_blocked_by_session_gate(): void
    {
        User::factory()->create();

        $this->optionsJson('/api/talos/sessions')
            ->assertOk();
    }

    public function test_guest_api_csrf_mismatch_renders_controlled_auth_json(): void
    {
        User::factory()->create();

        $request = Request::create('/api/talos/sessions', 'POST', server: [
            'HTTP_ACCEPT' => 'application/json',
        ]);
        $response = app(ExceptionHandler::class)->render($request, new TokenMismatchException('CSRF token mismatch.'));

        $this->assertSame(401, $response->getStatusCode());
        $this->assertSame([
            'code' => 'TALOS_AUTH_REQUIRED',
            'message' => 'Authentication required.',
        ], json_decode((string) $response->getContent(), true));
    }

    public function test_authenticated_api_csrf_mismatch_renders_session_expired_json(): void
    {
        $this->actingAs(User::factory()->create());

        $request = Request::create('/api/talos/sessions', 'POST', server: [
            'HTTP_ACCEPT' => 'application/json',
        ]);
        $response = app(ExceptionHandler::class)->render($request, new TokenMismatchException('CSRF token mismatch.'));

        $this->assertSame(419, $response->getStatusCode());
        $this->assertSame([
            'code' => 'TALOS_SESSION_EXPIRED',
            'message' => 'Session expired or CSRF token mismatch. Sign in again.',
        ], json_decode((string) $response->getContent(), true));
    }

    /**
     * @return iterable<string, array{string, string, 2?: array<string, mixed>}>
     */
    public static function guestProtectedApiRoutes(): iterable
    {
        yield 'talos sessions' => ['GET', '/api/talos/sessions'];
        yield 'talos chat' => ['POST', '/api/talos/chat', [
            'prompt' => 'Hello',
            'session_id' => 'session-test',
            'model_profile_id' => 'profile-test',
        ]];
        yield 'file ingest' => ['POST', '/api/files/ingest'];
        yield 'benchmark compare' => ['POST', '/api/benchmarks/compare'];
        yield 'trace replay' => ['POST', '/api/traces/replay'];
    }
}
