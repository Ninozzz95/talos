<?php

namespace App\Providers;

use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(BrowserSessionClient::class, function (): BrowserSessionClient {
            if ($this->app->environment('testing')) return new FakeBrowserSessionClient();
            return new HttpBrowserSessionClient((string) config('services.talos.browser.worker_url', ''), (string) config('services.talos.browser.worker_token', ''));
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
