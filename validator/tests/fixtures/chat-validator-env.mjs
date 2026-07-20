console.log(JSON.stringify({
  validator_url: process.env.KADMOS_VALIDATOR_URL ?? '',
  validator_health_url: process.env.KADMOS_VALIDATOR_HEALTH_URL ?? '',
}))
