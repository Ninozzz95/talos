const secret = process.env.DEEPSEEK_API_KEY ?? 'sk-child-json-secret'

console.log(JSON.stringify({
  argv_has_api_key: process.argv.includes(secret),
  env_has_api_key: process.env.DEEPSEEK_API_KEY === 'sk-benchmark-secret-123',
  nested: {
    api_key: secret,
    token: 'nested-benchmark-token',
    safe: 'visible',
  },
  items: [{ secret: 'array-benchmark-secret' }],
  argv: process.argv.slice(2),
}))
