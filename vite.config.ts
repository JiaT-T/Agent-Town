import { defineConfig } from 'vite';
import { spawn, type ChildProcess } from 'node:child_process';

async function isProxyRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:8787/api/llm/health');
    return response.ok;
  } catch {
    return false;
  }
}

function autoStartLlmProxy() {
  let child: ChildProcess | undefined;

  return {
    name: 'aivilization-auto-llm-proxy',
    apply: 'serve' as const,
    async configureServer() {
      if (process.env.AIVILIZATION_DISABLE_PROXY_AUTOSTART === '1' || (await isProxyRunning())) {
        return;
      }

      child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: process.env,
      });

      process.once('exit', () => child?.kill());
      process.once('SIGINT', () => child?.kill());
      process.once('SIGTERM', () => child?.kill());
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/Agent-Town/' : '/',
  plugins: [autoStartLlmProxy()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
