import type { Command } from 'commander';

export function registerConnectCommand(program: Command): void {
  const connect = program
    .command('connect')
    .description('Connect a service or install a connector');

  connect
    .command('github')
    .description('Connect GitHub (OAuth bootstrap + GitHub App installation)')
    .option('--dry-run', 'Show steps without executing', false)
    .option('--client-id <id>', 'GitHub App client ID (override env)')
    .action(async (opts) => {
      const clientId = opts.clientId ?? process.env['GITHUB_CLIENT_ID'];

      if (!clientId) {
        console.error(
          'GitHub client ID required. Set GITHUB_CLIENT_ID env var or use --client-id',
        );
        process.exit(1);
      }

      if (opts.dryRun) {
        console.log('[DRY RUN] GitHub connect flow:');
        console.log('  1. Start OAuth device flow with GitHub');
        console.log('  2. Display user_code and verification_uri');
        console.log('  3. Poll for access token');
        console.log('  4. Authenticate user -> Unauthed -> UserAuthed');
        console.log('  5. Guide GitHub App installation on org/repos');
        console.log('  6. State: UserAuthed -> AppInstalled -> AppActive');
        console.log('  7. Future operations use short-lived installation tokens');
        return;
      }

      const { startDeviceFlow, pollDeviceFlow, getAuthenticatedUser } = await import(
        '../../connector/github/auth.js'
      );

      console.log('Starting GitHub OAuth device flow...');

      try {
        const deviceFlow = await startDeviceFlow(clientId);

        console.log(`\nOpen this URL: ${deviceFlow.verification_uri}`);
        console.log(`Enter code:    ${deviceFlow.user_code}\n`);
        console.log('Waiting for authorization...');

        const tokens = await pollDeviceFlow(clientId, deviceFlow.device_code, deviceFlow.interval);
        const user = await getAuthenticatedUser(tokens.access_token);

        console.log(`\nAuthenticated as: ${user.login}`);
        console.log('State: Unauthed -> UserAuthed');

        // Store token reference in vault (not raw value in state)
        const { getVaultProvider } = await import('../../vault/index.js');
        const vault = getVaultProvider();
        await vault.setSecret('github.oauth.access_token', tokens.access_token);
        console.log('Access token stored in vault (reference only in state)');

        console.log('\nNext: Install the Cloned GitHub App on your organization:');
        console.log(
          '  https://github.com/apps/cloned-app/installations/new',
        );
        console.log('\nAfter installation, run: cloned connect github --complete-install');
      } catch (err) {
        console.error(`GitHub connect failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  connect
    .command('youtube')
    .description('Connect YouTube (OAuth installed-app flow, assist-mode default)')
    .option('--dry-run', 'Show steps without executing', false)
    .option('--client-id <id>', 'Google OAuth client ID (override env)')
    .option('--client-secret <secret>', 'Google OAuth client secret (override env)')
    .action(async (opts) => {
      const clientId = opts.clientId ?? process.env['YOUTUBE_CLIENT_ID'];
      const clientSecret = opts.clientSecret ?? process.env['YOUTUBE_CLIENT_SECRET'];

      if (opts.dryRun) {
        console.log('[DRY RUN] YouTube connect flow:');
        console.log('  Required scopes: youtube.readonly, youtube.upload');
        console.log('  1. Start OAuth device flow with Google');
        console.log('  2. Display user_code and verification_uri');
        console.log('  3. Poll for access token + refresh token');
        console.log('  4. Store tokens in vault (never in state/logs)');
        console.log('  5. Default mode: assist (package without uploading)');
        console.log('  6. Publish requires explicit approval');
        return;
      }

      if (!clientId || !clientSecret) {
        console.error(
          'YouTube client ID and secret required. ' +
            'Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars.',
        );
        process.exit(1);
      }

      const { startYouTubeDeviceFlow, pollYouTubeDeviceFlow } = await import(
        '../../connector/youtube/auth.js'
      );

      console.log('Starting YouTube OAuth device flow...');

      try {
        const deviceFlow = await startYouTubeDeviceFlow(clientId);

        console.log(`\nOpen this URL: ${deviceFlow.verification_url}`);
        console.log(`Enter code:    ${deviceFlow.user_code}\n`);
        console.log('Waiting for authorization...');

        const tokens = await pollYouTubeDeviceFlow(
          clientId,
          clientSecret,
          deviceFlow.device_code,
          deviceFlow.interval,
        );

        const { getVaultProvider } = await import('../../vault/index.js');
        const vault = getVaultProvider();
        await vault.setSecret('youtube.oauth.access_token', tokens.access_token);
        if (tokens.refresh_token) {
          await vault.setSecret('youtube.oauth.refresh_token', tokens.refresh_token);
        }

        console.log('\nYouTube connected! Tokens stored in vault.');
        console.log('Connector running in assist mode (package only, no uploads).');
        console.log('To enable uploads, run: cloned run pipeline.creator.youtube');
      } catch (err) {
        console.error(`YouTube connect failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
