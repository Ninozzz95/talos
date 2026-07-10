<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', rtrim((string) env('APP_URL', 'http://localhost'), '/') . '/integrations/google/callback'),
        'auth_uri' => env('GOOGLE_AUTH_URI', 'https://accounts.google.com/o/oauth2/v2/auth'),
        'token_uri' => env('GOOGLE_TOKEN_URI', 'https://oauth2.googleapis.com/token'),
        'userinfo_uri' => env('GOOGLE_USERINFO_URI', 'https://www.googleapis.com/oauth2/v3/userinfo'),
        'scopes' => array_values(array_filter(array_map(
            'trim',
            explode(',', env('GOOGLE_OAUTH_SCOPES', 'https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/calendar.events.readonly')),
        ))),
    ],

    'talos' => [
        'browser' => [
            'worker_url' => env('TALOS_BROWSER_WORKER_URL'),
            'worker_token' => env('TALOS_BROWSER_WORKER_TOKEN'),
        ],
        'registry_write_token' => env('TALOS_REGISTRY_WRITE_TOKEN'),
        'validator_health_url' => env('TALOS_VALIDATOR_HEALTH_URL'),
        'model_provider_allowed_hosts' => array_values(array_filter(array_map(
            'trim',
            explode(',', env('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS', 'api.openai.com,api.deepseek.com,api.anthropic.com,generativelanguage.googleapis.com,openrouter.ai')),
        ))),
    ],

];
