/**
 * YouTube OAuth connector.
 * Uses OAuth installed-app flow (device flow or redirect).
 * All publish actions require explicit approval.
 */
import { logger } from '../../shared/logger.js';

export interface YouTubeAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

const YOUTUBE_TOKEN_URI = 'https://oauth2.googleapis.com/token';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
];

export interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

/**
 * Start YouTube device OAuth flow.
 */
export async function startYouTubeDeviceFlow(clientId: string): Promise<DeviceAuthResponse> {
  const resp = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope: YOUTUBE_SCOPES.join(' '),
    }).toString(),
  });

  if (!resp.ok) {
    throw new Error(`YouTube device flow failed: ${resp.status}`);
  }

  return resp.json() as Promise<DeviceAuthResponse>;
}

/**
 * Poll for YouTube OAuth token after user completes device flow.
 */
export async function pollYouTubeDeviceFlow(
  clientId: string,
  clientSecret: string,
  deviceCode: string,
  intervalSeconds: number,
): Promise<YouTubeAuthTokens> {
  const maxAttempts = 60;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));

    const resp = await fetch(YOUTUBE_TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }).toString(),
    });

    const data = await resp.json() as YouTubeAuthTokens & { error?: string };

    if (data.access_token) {
      return data;
    }

    if (data.error === 'access_denied') {
      throw new Error('User denied YouTube OAuth access');
    }

    if (data.error === 'expired_token') {
      throw new Error('YouTube device flow expired');
    }

    logger.debug('Waiting for YouTube OAuth...', { attempt: i + 1 });
  }

  throw new Error('YouTube OAuth polling timed out');
}

/**
 * Refresh a YouTube access token using the refresh token.
 */
export async function refreshYouTubeToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<YouTubeAuthTokens> {
  const resp = await fetch(YOUTUBE_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!resp.ok) {
    throw new Error(`YouTube token refresh failed: ${resp.status}`);
  }

  return resp.json() as Promise<YouTubeAuthTokens>;
}
