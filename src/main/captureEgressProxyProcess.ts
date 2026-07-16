import { captureEgressProxyConfigFromEnv, createCaptureEgressProxy } from "./captureEgressProxy";

async function main(): Promise<void> {
  const config = captureEgressProxyConfigFromEnv(process.env);
  const proxy = createCaptureEgressProxy(config);
  await new Promise<void>((resolve, reject) => {
    proxy.server.once("error", reject);
    proxy.server.listen(config.listenPort, config.listenHost, () => resolve());
  });
  process.stdout.write(JSON.stringify({ event: "capture_egress_ready", policyVersion: "capture-network-v1", listenPort: config.listenPort }) + "\n");
  const stop = async () => { await proxy.close().catch(() => undefined); process.exit(0); };
  process.once("SIGTERM", () => { void stop(); });
  process.once("SIGINT", () => { void stop(); });
}

void main().catch(() => {
  process.stderr.write("Capture egress proxy failed to start.\n");
  process.exit(1);
});
