<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Services\TalosFirstRunService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\View\View;

final class TalosWorkspaceController extends Controller
{
    public function __invoke(TalosFirstRunService $firstRun): View|RedirectResponse
    {
        $this->removeStaleLocalViteHotFile();

        if ($firstRun->setupRequired()) {
            return redirect('/setup');
        }

        if (! Auth::check()) {
            return redirect()->guest('/login');
        }

        return view('workspace', ['surface' => 'workspace']);
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
