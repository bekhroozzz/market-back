// PM2 cluster configuration used by the production container entrypoint.
// Workers share the same port via Node's cluster module; Traefik/Dokploy see
// a single container. Cross-worker Socket.IO broadcast is handled by the Redis
// adapter (see src/config/redis-io.adapter.ts).
module.exports = {
  apps: [
    {
      name: 'market-api',
      script: 'dist/src/main.js',
      exec_mode: 'cluster',
      // RAM-bound on an 8 GB host: default to 2 workers. Override with
      // PM2_INSTANCES only if the container memory limit is raised accordingly.
      instances: process.env.PM2_INSTANCES
        ? Number(process.env.PM2_INSTANCES)
        : 2,
      // Per-worker V8 heap cap. 2 workers * 512 MB stays under the 1.5g limit.
      node_args: '--max-old-space-size=512',
      // Restart a worker before it can OOM-kill the whole container.
      max_memory_restart: '640M',
      // Give in-flight requests / shutdown hooks time to finish.
      kill_timeout: 8000,
      env: {
        // Entrypoint already ran migrations once; workers must not race to run.
        RUN_MIGRATIONS_ON_BOOT: 'false',
      },
    },
  ],
};
