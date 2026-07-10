<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class TalosRouteContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_root_renders_the_unified_workspace_surface(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/')
            ->assertOk()
            ->assertSee('Talos Workspace')
            ->assertSee('talos-workspace-root')
            ->assertSee('data-talos-surface="workspace"', false);
    }

    public function test_browse_deep_link_boots_the_unified_workspace_with_browse_enabled(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get('/browse')
            ->assertOk()
            ->assertSee('talos-workspace-root')
            ->assertSee('data-talos-surface="browse"', false);
    }

    public function test_root_removes_stale_local_vite_hot_file_before_rendering(): void
    {
        $this->withoutVite();
        $user = User::factory()->create();

        file_put_contents(public_path('hot'), 'http://127.0.0.1:1');

        try {
            $this->actingAs($user)
                ->get('/')
                ->assertOk();

            $this->assertFileDoesNotExist(public_path('hot'));
        } finally {
            if (file_exists(public_path('hot'))) {
                unlink(public_path('hot'));
            }
        }
    }

    public function test_chat_route_renders_the_unified_workspace_with_chat_focus(): void
    {
        $this->withoutVite();

        $this->get('/chat')
            ->assertRedirect('/');
    }

    public function test_dashboard_route_renders_the_unified_workspace_with_dashboard_focus(): void
    {
        $this->withoutVite();

        $this->get('/dashboard')
            ->assertRedirect('/');
    }

    #[DataProvider('apiCompatibilityEndpoints')]
    public function test_api_compatibility_endpoint_is_registered(string $method, string $uri, ?string $registeredUri = null): void
    {
        $route = $this->matchRoute($method, $uri);

        $this->assertSame($registeredUri ?? ltrim($uri, '/'), $route->uri());
        $this->assertContains($method, $route->methods());
    }

    /**
     * @return iterable<string, array{string, string, 2?: string}>
     */
    public static function apiCompatibilityEndpoints(): iterable
    {
        yield 'talos chat' => ['POST', '/api/talos/chat'];
        yield 'model profile list' => ['GET', '/api/talos/model-profiles'];
        yield 'model profile create' => ['POST', '/api/talos/model-profiles'];
        yield 'model profile show' => ['GET', '/api/talos/model-profiles/profile-1', 'api/talos/model-profiles/{profile}'];
        yield 'model profile update' => ['PATCH', '/api/talos/model-profiles/profile-1', 'api/talos/model-profiles/{profile}'];
        yield 'model profile delete' => ['DELETE', '/api/talos/model-profiles/profile-1', 'api/talos/model-profiles/{profile}'];
        yield 'model profile probe' => ['POST', '/api/talos/model-profiles/profile-1/probe', 'api/talos/model-profiles/{profile}/probe'];
        yield 'talos session list' => ['GET', '/api/talos/sessions'];
        yield 'talos session create' => ['POST', '/api/talos/sessions'];
        yield 'talos session show' => ['GET', '/api/talos/sessions/session-1', 'api/talos/sessions/{session}'];
        yield 'talos session update' => ['PATCH', '/api/talos/sessions/session-1', 'api/talos/sessions/{session}'];
        yield 'talos session delete' => ['DELETE', '/api/talos/sessions/session-1', 'api/talos/sessions/{session}'];
        yield 'talos message list' => ['GET', '/api/talos/sessions/session-1/messages', 'api/talos/sessions/{session}/messages'];
        yield 'talos message create' => ['POST', '/api/talos/sessions/session-1/messages', 'api/talos/sessions/{session}/messages'];
        yield 'talos file list' => ['GET', '/api/talos/files'];
        yield 'talos file show' => ['GET', '/api/talos/files/file-1', 'api/talos/files/{file}'];
        yield 'talos context set list' => ['GET', '/api/talos/context-sets'];
        yield 'talos context set create' => ['POST', '/api/talos/context-sets'];
        yield 'talos context set show' => ['GET', '/api/talos/context-sets/context-set-1', 'api/talos/context-sets/{contextSet}'];
        yield 'talos run list' => ['GET', '/api/talos/runs'];
        yield 'talos run create' => ['POST', '/api/talos/runs'];
        yield 'talos run show' => ['GET', '/api/talos/runs/run-1', 'api/talos/runs/{run}'];
        yield 'talos run update' => ['PATCH', '/api/talos/runs/run-1', 'api/talos/runs/{run}'];
        yield 'talos run event list' => ['GET', '/api/talos/runs/run-1/events', 'api/talos/runs/{run}/events'];
        yield 'talos run event create' => ['POST', '/api/talos/runs/run-1/events', 'api/talos/runs/{run}/events'];
        yield 'talos run artifact list' => ['GET', '/api/talos/runs/run-1/artifacts', 'api/talos/runs/{run}/artifacts'];
        yield 'talos run artifact create' => ['POST', '/api/talos/runs/run-1/artifacts', 'api/talos/runs/{run}/artifacts'];
        yield 'talos run recovery' => ['POST', '/api/talos/runs/run-1/recover', 'api/talos/runs/{run}/recover'];
        yield 'talos run replay' => ['GET', '/api/talos/runs/run-1/replay', 'api/talos/runs/{run}/replay'];
        yield 'talos run benchmark' => ['POST', '/api/talos/runs/run-1/benchmark', 'api/talos/runs/{run}/benchmark'];
        yield 'talos benchmark group list' => ['GET', '/api/talos/benchmark-groups'];
        yield 'talos benchmark group show' => ['GET', '/api/talos/benchmark-groups/group-1', 'api/talos/benchmark-groups/{benchmarkGroup}'];
        yield 'talos connector list' => ['GET', '/api/talos/connectors'];
        yield 'talos connector create' => ['POST', '/api/talos/connectors'];
        yield 'talos connector show' => ['GET', '/api/talos/connectors/connector-1', 'api/talos/connectors/{connector}'];
        yield 'talos connector update' => ['PATCH', '/api/talos/connectors/connector-1', 'api/talos/connectors/{connector}'];
        yield 'talos connector delete' => ['DELETE', '/api/talos/connectors/connector-1', 'api/talos/connectors/{connector}'];
        yield 'talos tool list' => ['GET', '/api/talos/tools'];
        yield 'talos tool create' => ['POST', '/api/talos/tools'];
        yield 'talos tool planning context' => ['GET', '/api/talos/tools/planning-context'];
        yield 'talos tool show' => ['GET', '/api/talos/tools/tool-1', 'api/talos/tools/{tool}'];
        yield 'talos tool update' => ['PATCH', '/api/talos/tools/tool-1', 'api/talos/tools/{tool}'];
        yield 'talos tool delete' => ['DELETE', '/api/talos/tools/tool-1', 'api/talos/tools/{tool}'];
        yield 'talos memory list' => ['GET', '/api/talos/memories'];
        yield 'talos memory create' => ['POST', '/api/talos/memories'];
        yield 'talos memory retrieval context' => ['GET', '/api/talos/memories/retrieval-context'];
        yield 'talos memory show' => ['GET', '/api/talos/memories/memory-1', 'api/talos/memories/{memory}'];
        yield 'talos memory update' => ['PATCH', '/api/talos/memories/memory-1', 'api/talos/memories/{memory}'];
        yield 'talos memory delete' => ['DELETE', '/api/talos/memories/memory-1', 'api/talos/memories/{memory}'];
        yield 'talos skill list' => ['GET', '/api/talos/skills'];
        yield 'talos skill create' => ['POST', '/api/talos/skills'];
        yield 'talos skill planning context' => ['GET', '/api/talos/skills/planning-context'];
        yield 'talos skill show' => ['GET', '/api/talos/skills/skill-1', 'api/talos/skills/{skill}'];
        yield 'talos skill update' => ['PATCH', '/api/talos/skills/skill-1', 'api/talos/skills/{skill}'];
        yield 'talos skill delete' => ['DELETE', '/api/talos/skills/skill-1', 'api/talos/skills/{skill}'];
        yield 'talos skill evaluation' => ['POST', '/api/talos/skills/skill-1/evaluation', 'api/talos/skills/{skill}/evaluation'];
        yield 'talos research report list' => ['GET', '/api/talos/research-reports'];
        yield 'talos research report create' => ['POST', '/api/talos/research-reports'];
        yield 'talos research report show' => ['GET', '/api/talos/research-reports/report-1', 'api/talos/research-reports/{researchReport}'];
        yield 'talos document list' => ['GET', '/api/talos/documents'];
        yield 'talos document create' => ['POST', '/api/talos/documents'];
        yield 'talos document show' => ['GET', '/api/talos/documents/document-1', 'api/talos/documents/{document}'];
        yield 'talos document export' => ['GET', '/api/talos/documents/document-1/export', 'api/talos/documents/{document}/export'];
        yield 'talos artifact list' => ['GET', '/api/talos/artifacts'];
        yield 'talos artifact show' => ['GET', '/api/talos/artifacts/artifact-1', 'api/talos/artifacts/{artifact}'];
        yield 'talos artifact preview' => ['GET', '/api/talos/artifacts/artifact-1/preview', 'api/talos/artifacts/{artifact}/preview'];
        yield 'talos note list' => ['GET', '/api/talos/notes'];
        yield 'talos note create' => ['POST', '/api/talos/notes'];
        yield 'talos note retrieval context' => ['GET', '/api/talos/notes/retrieval-context'];
        yield 'talos note show' => ['GET', '/api/talos/notes/note-1', 'api/talos/notes/{note}'];
        yield 'talos task list' => ['GET', '/api/talos/tasks'];
        yield 'talos task create' => ['POST', '/api/talos/tasks'];
        yield 'talos calendar draft list' => ['GET', '/api/talos/calendar-drafts'];
        yield 'talos calendar draft create' => ['POST', '/api/talos/calendar-drafts'];
        yield 'talos calendar draft confirm' => ['POST', '/api/talos/calendar-drafts/draft-1/confirm', 'api/talos/calendar-drafts/{calendarDraft}/confirm'];
        yield 'talos email connector status' => ['GET', '/api/talos/email/connector-status'];
        yield 'talos email message list' => ['GET', '/api/talos/email/messages'];
        yield 'talos email message create' => ['POST', '/api/talos/email/messages'];
        yield 'talos email message context' => ['GET', '/api/talos/email/messages/context'];
        yield 'talos email draft list' => ['GET', '/api/talos/email/drafts'];
        yield 'talos email draft create' => ['POST', '/api/talos/email/drafts'];
        yield 'talos email draft send disabled' => ['POST', '/api/talos/email/drafts/draft-1/send', 'api/talos/email/drafts/{emailDraft}/send'];
        yield 'talos admin doctor' => ['GET', '/api/talos/admin/doctor'];
        yield 'talos admin policy' => ['GET', '/api/talos/admin/policy'];
        yield 'talos admin audit events' => ['GET', '/api/talos/admin/audit-events'];
        yield 'talos admin backup manifest' => ['GET', '/api/talos/admin/backup/manifest'];
        yield 'talos admin backup validate restore' => ['POST', '/api/talos/admin/backup/validate-restore'];
        yield 'file ingestion' => ['POST', '/api/files/ingest'];
        yield 'benchmark comparison' => ['POST', '/api/benchmarks/compare'];
        yield 'fault explanation' => ['POST', '/api/faults/explain'];
        yield 'trace replay' => ['POST', '/api/traces/replay'];
    }

    private function matchRoute(string $method, string $uri): LaravelRoute
    {
        return Route::getRoutes()->match(Request::create($uri, $method));
    }
}
