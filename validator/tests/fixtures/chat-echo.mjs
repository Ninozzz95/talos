import { createInterface } from 'node:readline'

const reader = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

reader.on('line', (line) => {
  const payload = JSON.parse(line)
  console.log(JSON.stringify({
    text: 'echo',
    received_tool_context: payload.tool_context ?? null,
  }))
})
