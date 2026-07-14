<?php

namespace App\Providers;

use App\Services\Talos\Agent\TalosLaravelToolExecutionBackend;
use App\Services\Talos\Agent\TalosToolExecutionBackend;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerConfiguration;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Web\UnavailableWebSearchProvider;
use App\Services\Talos\Web\WebSearchProvider;
use App\Services\Talos\Web\WebSearchProviderFactory;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Foundation\Vite;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(TalosToolExecutionBackend::class, TalosLaravelToolExecutionBackend::class);

        $this->app->singleton(BrowserWorkerConfiguration::class, static function (): BrowserWorkerConfiguration {
            return new BrowserWorkerConfiguration(
                (string) config('services.talos.browser.worker_url', ''),
                (string) config('services.talos.browser.worker_token', ''),
                (bool) filter_var(config('services.talos.browser.allow_insecure_internal_transport', false), FILTER_VALIDATE_BOOL),
            );
        });

        $this->app->bind(BrowserSessionClient::class, function (Application $app): BrowserSessionClient {
            if ($this->app->environment('testing')) {
                return new FakeBrowserSessionClient;
            }

            $configuration = $app->make(BrowserWorkerConfiguration::class);

            return new HttpBrowserSessionClient($configuration->url(), $configuration->token());
        });
        $this->app->singleton(WebSearchProviderFactory::class, function (Application $app): WebSearchProviderFactory {
            $configuration = config('services.talos.web.search', []);

            return new WebSearchProviderFactory(
                $app->make(BrowserSessionClient::class),
                is_array($configuration) ? $configuration : [],
            );
        });
        $this->app->bind(WebSearchProvider::class, static fn (): WebSearchProvider => (
            new UnavailableWebSearchProvider('owner_context_required')
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(Vite $vite, BrowserWorkerConfiguration $browserWorker): void
    {
        $browserWorker->assertReadyFor($this->app->environment());

        $hotFile = config('app.vite_hot_file');
        if (is_string($hotFile) && trim($hotFile) !== '') {
            $vite->useHotFile($hotFile);
        }
    }
}
