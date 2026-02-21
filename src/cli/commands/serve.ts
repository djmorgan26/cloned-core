import type { Command } from 'commander';
import { startServer } from '../../api/server.js';

export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the Cloned local API server and Command Center UI')
    .option('--host <host>', 'Bind host (default: 127.0.0.1)', '127.0.0.1')
    .option('--port <port>', 'Port (default: 7800)', '7800')
    .action(async (opts) => {
      const port = parseInt(opts.port as string, 10);

      console.log(`Starting Cloned Command Center...`);
      console.log(`  Host: ${opts.host}:${port}`);
      console.log(`  API: http://${opts.host}:${port}/v1`);
      console.log(`  UI:  http://${opts.host}:${port}`);
      console.log('\nPress Ctrl+C to stop\n');

      await startServer({ host: opts.host as string, port });
    });
}
