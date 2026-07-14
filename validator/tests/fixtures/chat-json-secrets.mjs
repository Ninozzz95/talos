import { createInterface } from 'node:readline'

const reader = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

reader.on('line', (line) => {
  const payload = JSON.parse(line)
  console.log(JSON.stringify({
    api_key: payload.api_key,
    nested: {
      token: 'nested-chat-token',
      password: 'nested-password-value',
      safe: 'visible',
    },
    items: [{ access_token: 'array-chat-token' }],
    credentials: { value: 'opaque-credential-value' },
    private_key: 'opaque-private-key-value',
    API_KEY: 'uppercase-api-key-value',
    TOKEN: 'uppercase-token-value',
    PRIVATE_KEY: 'uppercase-private-key-value',
    auth_token: 'prefixed-auth-token-value',
    sessionToken: 'prefixed-session-token-value',
    requestAuthorization: 'prefixed-authorization-value',
    session_cookie: 'prefixed-cookie-value',
    max_tokens: 4096,
    long_text: 'x'.repeat(1200),
    text: `embedded ${payload.api_key} sk-inline-secret`,
  }))
})
