import { spawn } from 'node:child_process';

const children = [];

function start(name, args, extraEnv = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });

  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal) {
      return;
    }
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
      shutdown(code);
    }
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('llm-proxy', ['--experimental-strip-types', 'server/index.ts']);
start('vite', ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], {
  AIVILIZATION_DISABLE_PROXY_AUTOSTART: '1',
});
