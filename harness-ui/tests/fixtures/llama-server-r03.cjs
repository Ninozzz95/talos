// R-03: processo locale di prova, nessun GGUF né rete esterna.
const { createServer } = require('node:http');
const [scenario, ...args] = process.argv.slice(2);
const righe = {
  driver: 'ggml_vulkan: No devices found.\nwhat(): vk::createInstance: ErrorIncompatibleDriver\n',
  perso: "terminate called after throwing an instance of 'vk::DeviceLostError'\nwhat(): vk::Device::waitForFences: ErrorDeviceLost\n",
  memoria: 'ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory\n',
  generico: 'ggml_vulkan: Found 1 Vulkan devices:\nerror loading model: invalid GGUF magic\n',
  cpuGuasta: 'CPU: impossibile allocare il modello\n',
};
if (righe[scenario]) {
  const testo = righe[scenario];
  process.stderr.write(testo.slice(0, 17));
  setTimeout(() => process.stderr.write(testo.slice(17), () => process.exit(1)), 10);
} else {
  if (scenario === 'avvisoMemoria') process.stderr.write(righe.memoria);
  const port = Number(args[args.indexOf('--port') + 1]);
  if (!port || port === 4174) throw Error('Porta fixture vietata');
  // 12/11/2026 (judge v1605), as b11669: with LLAMA_API_KEY set, every route but /health and /v1/health wants the key
  const chiave = process.env.LLAMA_API_KEY;
  const server = createServer((req, res) => {
    if (chiave && !['/health', '/v1/health'].includes(req.url) && req.headers.authorization !== `Bearer ${chiave}`) {
      res.writeHead(401, {'content-type':'application/json'}); res.end(JSON.stringify({error:{code:401,message:'Invalid API Key',type:'authentication_error'}})); return;
    }
    res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({status:'ok'}));
  });
  server.listen(port, '127.0.0.1');
}
