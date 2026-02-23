import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { WorkspaceContext } from '../cli-shared.js';
import { requireWorkspace } from '../cli-shared.js';
import { setConnectorState } from '../../connector/state.js';
import { normalizePrivateKey } from '../../connector/github/app-auth.js';

export function registerConnectCommand(program: Command): void {
  const connect = program
    .command('connect')
    .description('Connect a service or install a connector');

  connect
    .command('github')
    .description('Connect GitHub (OAuth bootstrap + GitHub App installation)')
    .option('--dry-run', 'Show steps without executing', false)
    .option('--client-id <id>', 'GitHub App client ID (override env)')
    .option('--complete-install', 'Mark GitHub App installation complete (requires installation ID)', false)
    .option('--installation-id <id>', 'GitHub App installation ID from GitHub dashboard')
    .option('--installation-target <slug>', 'Org or user where the App was installed')
    .option('--app-id <id>', 'GitHub App ID (stored in vault for installation token signing)')
    .option('--private-key-path <path>', 'Path to GitHub App private key PEM (stored in vault)')
    .action(async (opts) => {
      if (opts.completeInstall) {
        await handleGitHubInstallCompletion(opts);
        return;
      }
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

      let workspace: WorkspaceContext | undefined;
      workspace = requireWorkspace();

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
        if (!workspace) {
          console.error('Workspace not initialized. Run: cloned init');
          process.exit(1);
        }

        const { getVaultProvider } = await import('../../vault/index.js');
        const vault = getVaultProvider({
          provider: workspace.config.vault_provider,
          filePath: `${workspace.paths.root}/vault.dev.json`,
        });
        await vault.setSecret('github.oauth.access_token', tokens.access_token);
        console.log('Access token stored in vault (reference only in state)');

        setConnectorState(
          workspace.db,
          workspace.config.workspace_id,
          'connector.github.app',
          'UserAuthed',
          {
            user_login: user.login,
            user_id: user.id,
            scope: tokens.scope,
          },
        );
        console.log('Connector state updated: UserAuthed (stored in SQLite)');

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

      let workspace: WorkspaceContext | undefined;
      workspace = requireWorkspace();

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

        if (!workspace) {
          console.error('Workspace not initialized. Run: cloned init');
          process.exit(1);
        }

        const { getVaultProvider } = await import('../../vault/index.js');
        const vault = getVaultProvider({
          provider: workspace.config.vault_provider,
          filePath: `${workspace.paths.root}/vault.dev.json`,
        });
        await vault.setSecret('youtube.oauth.access_token', tokens.access_token);
        if (tokens.refresh_token) {
          await vault.setSecret('youtube.oauth.refresh_token', tokens.refresh_token);
        }

        console.log('\nYouTube connected! Tokens stored in vault.');
        console.log('Connector running in assist mode (package only, no uploads).');
        console.log('To enable uploads, run: cloned run pipeline.creator.youtube');

        setConnectorState(
          workspace.db,
          workspace.config.workspace_id,
          'connector.youtube.app',
          'UserAuthed',
          {
            scopes: tokens.scope,
            mode: 'assist',
          },
        );
        console.log('Connector state updated: YouTube assist mode recorded.');
      } catch (err) {
        console.error(`YouTube connect failed: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

async function handleGitHubInstallCompletion(opts: {
  installationId?: string;
  installationTarget?: string;
  appId?: string;
  privateKeyPath?: string;
} & Record<string, unknown>): Promise<void> {
  const workspace = requireWorkspace();
  const installationIdRaw = opts.installationId;
  if (!installationIdRaw) {
    console.error('Installation ID required. Provide via --installation-id <id>.');
    process.exit(1);
  }
  const installationId = Number(installationIdRaw);
  if (!Number.isInteger(installationId) || installationId <= 0) {
    console.error(`Invalid installation ID: ${installationIdRaw}`);
    process.exit(1);
  }

  const { getVaultProvider } = await import('../../vault/index.js');
  const vault = getVaultProvider({
    provider: workspace.config.vault_provider,
    filePath: `${workspace.paths.root}/vault.dev.json`,
  });

  const providedAppId = opts.appId ?? process.env['GITHUB_APP_ID'] ?? undefined;
  const providedKeyPath = opts.privateKeyPath as string | undefined;
  let privateKey: string | null = null;
  if (providedKeyPath) {
    try {
      privateKey = readFileSync(providedKeyPath, 'utf8');
    } catch (err) {
      console.error(`Failed to read private key from ${providedKeyPath}: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  if (!privateKey && process.env['GITHUB_APP_PRIVATE_KEY']) {
    privateKey = process.env['GITHUB_APP_PRIVATE_KEY'];
  }
  if (!privateKey) {
    privateKey = await vault.getSecret('github.app.private_key');
  }

  let appId = providedAppId;
  if (!appId) {
    appId = (await vault.getSecret('github.app.id')) ?? undefined;
  }

  if (!appId || !privateKey) {
    console.error(
      'GitHub App ID and private key required. Provide --app-id and --private-key-path, or set GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY.',
    );
    process.exit(1);
  }

  const normalizedKey = normalizePrivateKey(privateKey);
  await vault.setSecret('github.app.id', appId.trim());
  await vault.setSecret('github.app.private_key', normalizedKey);

  setConnectorState(
    workspace.db,
    workspace.config.workspace_id,
    'connector.github.app',
    'AppInstalled',
    {
      installation_id: installationId,
      installation_target: opts.installationTarget ?? 'unknown',
    },
  );
  console.log(`Recorded GitHub App installation ${installationId}. State: AppInstalled.`);

  try {
    const { fetchInstallationAccessToken } = await import('../../connector/github/app-auth.js');
    const tokenInfo = await fetchInstallationAccessToken({
      vault,
      installationId,
      overrides: { appId: appId.trim(), privateKey: normalizedKey },
    });
    setConnectorState(
      workspace.db,
      workspace.config.workspace_id,
      'connector.github.app',
      'AppActive',
      {
        installation_id: installationId,
        last_token_check: new Date().toISOString(),
        last_token_expires_at: tokenInfo.expires_at,
      },
    );
    console.log('Verified installation via GitHub App access token. State: AppActive.');
  } catch (err) {
    console.warn(
      `Warning: could not verify installation via GitHub API (${(err as Error).message}). ` +
        'You may need to install the app or check credentials.',
    );
  }
}
