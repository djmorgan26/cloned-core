/**
 * GitHub Auth Strategy: OAuth bootstrap + GitHub App installation tokens.
 *
 * State machine:
 *   Unauthed -> UserAuthed (OAuth device flow) -> AppInstalled -> AppActive
 *
 * After AppActive, routine operations use short-lived GitHub App installation tokens.
 * User OAuth session is only used for initial setup.
 */
import { logger } from '../../shared/logger.js';

export type GitHubAuthState = 'Unauthed' | 'UserAuthed' | 'AppInstalled' | 'AppActive';

export interface GitHubAuthStatus {
  state: GitHubAuthState;
  user_login?: string;
  app_installation_id?: number;
  token_expires_at?: string;
}

export interface DeviceFlowResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface OAuthTokenResult {
  access_token: string;
  token_type: string;
  scope: string;
}

const GITHUB_API = 'https://api.github.com';

/**
 * Start the GitHub OAuth device flow.
 * Returns user_code and verification_uri to display to the user.
 */
export async function startDeviceFlow(clientId: string): Promise<DeviceFlowResult> {
  const resp = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, scope: 'read:user' }),
  });

  if (!resp.ok) {
    throw new Error(`GitHub device flow failed: ${resp.status}`);
  }

  return resp.json() as Promise<DeviceFlowResult>;
}

/**
 * Poll for the OAuth access token after user completes device flow.
 */
export async function pollDeviceFlow(
  clientId: string,
  deviceCode: string,
  intervalSeconds: number,
): Promise<OAuthTokenResult> {
  const maxAttempts = 60; // 5 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));

    const resp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const data = await resp.json() as { error?: string; access_token?: string; token_type?: string; scope?: string };

    if (data.access_token) {
      return {
        access_token: data.access_token,
        token_type: data.token_type ?? 'bearer',
        scope: data.scope ?? '',
      };
    }

    if (data.error === 'access_denied') {
      throw new Error('User denied GitHub OAuth access');
    }

    if (data.error === 'expired_token') {
      throw new Error('Device flow expired – please restart');
    }

    logger.debug('Waiting for GitHub OAuth...', { attempt: i + 1 });
  }

  throw new Error('GitHub OAuth polling timed out');
}

/**
 * Get a GitHub App installation token (short-lived, ~1 hour).
 * Requires a signed JWT for the GitHub App.
 */
export async function getInstallationToken(
  appJwt: string,
  installationId: number,
): Promise<{ token: string; expires_at: string }> {
  const resp = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!resp.ok) {
    throw new Error(`Failed to get GitHub App installation token: ${resp.status}`);
  }

  const data = await resp.json() as { token: string; expires_at: string };
  return { token: data.token, expires_at: data.expires_at };
}

/**
 * Get authenticated user info.
 */
export async function getAuthenticatedUser(
  accessToken: string,
): Promise<{ login: string; id: number; name?: string }> {
  const resp = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!resp.ok) {
    throw new Error(`GitHub user API failed: ${resp.status}`);
  }

  return resp.json() as Promise<{ login: string; id: number; name?: string }>;
}
