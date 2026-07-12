<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosWorkspaceSetting;
use App\Services\TalosFirstRunService;
use App\Support\TalosThemeContrast;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

final class TalosWorkspaceController extends Controller
{
    public function __invoke(TalosFirstRunService $firstRun): Response|RedirectResponse
    {
        return $this->renderSurface($firstRun, 'workspace');
    }

    public function browse(TalosFirstRunService $firstRun): Response|RedirectResponse
    {
        return $this->renderSurface($firstRun, 'browse');
    }

    private function renderSurface(TalosFirstRunService $firstRun, string $surface): Response|RedirectResponse
    {
        $this->removeStaleLocalViteHotFile();

        if ($firstRun->setupRequired()) {
            return redirect('/setup');
        }

        if (! Auth::check()) {
            return redirect()->guest('/login');
        }

        $setting = TalosWorkspaceSetting::query()
            ->where('user_id', (int) Auth::id())
            ->first();
        $preferences = TalosWorkspaceSetting::sanitizePreferences($setting?->preferences ?? []);

        return response()->view('workspace', [
            'surface' => $surface,
            'bootAccent' => TalosThemeContrast::resolveAccent($preferences),
        ])->withHeaders([
            'Cache-Control' => 'private, no-store, max-age=0, must-revalidate',
            'Pragma' => 'no-cache',
        ]);
    }

    private function removeStaleLocalViteHotFile(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        $hotFile = public_path('hot');

        if (! is_file($hotFile)) {
            return;
        }

        $hotUrl = trim((string) file_get_contents($hotFile));
        $host = parse_url($hotUrl, PHP_URL_HOST);
        $port = parse_url($hotUrl, PHP_URL_PORT);

        if (! is_string($host) || ! is_int($port) || ! in_array($host, ['127.0.0.1', 'localhost'], true)) {
            return;
        }

        $connection = @fsockopen($host, $port, $errno, $errstr, 0.15);

        if (is_resource($connection)) {
            fclose($connection);

            return;
        }

        @unlink($hotFile);
    }
}
