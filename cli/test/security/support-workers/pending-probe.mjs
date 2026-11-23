/* Test fixture: a process that starts a support probe whose worker never answers and then just reaches the end of its script. If the thread kept the process alive it would never exit. */
const {createWorkerSupportProbe}=await import(process.argv[2]);
const probe=createWorkerSupportProbe({workerFile:process.argv[3],inProcess:()=>Promise.reject(new Error('the in-process way must not run'))});
probe().catch(()=>{});
