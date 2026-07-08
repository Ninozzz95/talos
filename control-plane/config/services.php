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

    'talos' => [
        'registry_write_token' => env('TALOS_REGISTRY_WRITE_TOKEN'),
        'validator_health_url' => env('TALOS_VALIDATOR_HEALTH_URL'),
        'model_provider_allowed_hosts' => array_values(array_filter(array_map(
            'trim',
            explode(',', env('TALOS_MODEL_PROVIDER_ALLOWED_HOSTS', 'api.openai.com,api.deepseek.com')),
        ))),
    ],

];
