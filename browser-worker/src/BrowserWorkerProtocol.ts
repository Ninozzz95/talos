export const TALOS_BROWSER_HMI_RUNTIME_PROTOCOL = "talos_browser_hmi_runtime_v2.1.0";
export const TALOS_BROWSER_SESSION_BOOTSTRAP_PATH = `/protocols/${TALOS_BROWSER_HMI_RUNTIME_PROTOCOL}/sessions`;

export function browserWorkerProtocols() {
  return { hmi: TALOS_BROWSER_HMI_RUNTIME_PROTOCOL } as const;
}
