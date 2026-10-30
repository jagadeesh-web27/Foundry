/**
 * Foundry Google OAuth 2.0 PKCE Provider
 * Handles official browser sign-in and consent flow for Google Workspace & Gmail accounts.
 * Users authenticate in their default browser with no manual API key entry.
 */

import { BaseOAuthProvider, OAuthCallbackData, OAuthResult } from '../core/oAuthProvider';
import { tokenStore } from '../core/tokenStore';
import { OAUTH_CONFIG } from '@/config/oauthConfig';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { googleAuth } from './googleAuth';
import { connectorRegistry } from '../core/connectorRegistry';

/**
 * Validates Google OAuth authorization URL parameters before opening browser.
 * Ensures client_id, response_type=code, redirect_uri, scope, state, and PKCE S256 parameters exist.
 */
export function validateGoogleAuthorizationUrl(url: URL): void {
  const required = [
    'client_id',
    'response_type',
    'redirect_uri',
    'scope',
    'state',
    'code_challenge',
    'code_challenge_method',
  ];

  for (const parameter of required) {
    const value = url.searchParams.get(parameter);
    if (!value || value.trim() === '') {
      throw new Error(`Google OAuth configuration error: missing ${parameter}`);
    }
  }

  const clientId = url.searchParams.get('client_id');
  if (clientId?.includes('foundry-desktop-client')) {
    throw new Error(
      'Google OAuth Client ID is not configured (placeholder detected). Please set VITE_GOOGLE_CLIENT_ID in your .env file with a valid Client ID from Google Cloud Console.'
    );
  }

  if (url.searchParams.get('response_type') !== 'code') {
    throw new Error('Google OAuth must use authorization code flow');
  }

  if (url.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('Google OAuth must use S256 PKCE');
  }
}

export class GoogleOAuthProvider extends BaseOAuthProvider {
  public readonly id = 'google';
  public readonly name = 'Google';

  public async authorize(): Promise<OAuthResult> {
    const { verifier, challenge } = await this.generatePKCE();
    const state = this.generateState();

    this.pendingSessions.set(state, {
      verifier,
      state,
      createdAt: Date.now(),
    });

    const config = OAUTH_CONFIG.GOOGLE;
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `${config.authorizationEndpoint}?${params.toString()}`;

    try {
      // Validate all required OAuth PKCE parameters and check for placeholder Client ID
      validateGoogleAuthorizationUrl(new URL(authUrl));

      // 1. Launch system browser to official Google login
      await this.openInSystemBrowser(authUrl);

      // 2. Await redirect callback on local loopback server
      const code = await this.awaitLoopbackCallback(config.loopbackPort, state, 120);

      // 3. Exchange code for access & refresh tokens
      return await this.handleCallback({ code, state });
    } catch (err: any) {
      console.error('[GoogleOAuth] Authorization flow error:', err);
      return {
        success: false,
        error: err?.message || 'Google browser authorization failed.',
      };
    } finally {
      this.pendingSessions.delete(state);
    }
  }

  public async handleCallback(callbackData: OAuthCallbackData): Promise<OAuthResult> {
    const session = this.pendingSessions.get(callbackData.state);
    const verifier = session?.verifier || '';

    const config = OAUTH_CONFIG.GOOGLE;
    const body = new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code: callbackData.code,
      redirect_uri: config.redirectUri,
    });

    if (verifier) {
      body.append('code_verifier', verifier);
    }

    try {
      const resp = await proxyFetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!resp.ok) {
        let errDesc = resp.statusText;
        try {
          const errJson = await resp.json();
          if (errJson?.error_description || errJson?.error) {
            errDesc = errJson.error_description || errJson.error;
          }
        } catch {}
        return {
          success: false,
          error: `Google token exchange failed (${resp.status}): ${errDesc}`,
        };
      }

      const tokenData = await resp.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      // Save tokens securely in DPAPI credential storage for all Google sub-connectors
      const childConnectors = [
        'google',
        'google_gmail',
        'google_calendar',
        'google_chat',
        'google_drive',
      ];

      for (const id of childConnectors) {
        await tokenStore.save(id, {
          accessToken,
          refreshToken,
          expiresAt: Date.now() + expiresIn * 1000,
          tokenType: tokenData.token_type || 'Bearer',
          scope: tokenData.scope,
          issuedAt: Date.now(),
        });
      }

      // Live verification of account identity against Google API
      const verification = await googleAuth.verifyToken(
        accessToken,
        'https://gmail.googleapis.com/gmail/v1/users/me/profile'
      );

      if (!verification.verified) {
        return {
          success: false,
          error: verification.error || 'Connected to Google but identity verification failed.',
        };
      }

      // Update connector configs in registry
      for (const id of childConnectors) {
        const connector = connectorRegistry.getConnector(id);
        if (connector) {
          await connector.updateConfig({
            connected: true,
            accountEmail: verification.accountEmail,
            accountName: verification.accountName || 'Google Account',
          });
        }
      }

      return {
        success: true,
        accountEmail: verification.accountEmail,
        accountName: verification.accountName,
        tokens: {
          accessToken,
          refreshToken,
          expiresAt: Date.now() + expiresIn * 1000,
          tokenType: 'Bearer',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Google callback processing error: ${err?.message || String(err)}`,
      };
    }
  }

  public async refreshToken(): Promise<boolean> {
    const existing = await tokenStore.get('google_gmail');
    if (!existing?.refreshToken) return false;

    const config = OAUTH_CONFIG.GOOGLE;
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
      });

      const resp = await proxyFetch(config.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!resp.ok) return false;
      const data = await resp.json();

      const childConnectors = [
        'google',
        'google_gmail',
        'google_calendar',
        'google_chat',
        'google_drive',
      ];

      for (const id of childConnectors) {
        await tokenStore.save(id, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || existing.refreshToken,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
          tokenType: 'Bearer',
          issuedAt: Date.now(),
        });
      }

      return true;
    } catch {
      return false;
    }
  }

  public async revoke(): Promise<void> {
    const childConnectors = [
      'google',
      'google_gmail',
      'google_calendar',
      'google_chat',
      'google_drive',
    ];

    for (const id of childConnectors) {
      await tokenStore.delete(id);
      const connector = connectorRegistry.getConnector(id);
      if (connector) {
        await connector.updateConfig({
          connected: false,
          accountEmail: undefined,
          accountName: undefined,
        });
      }
    }
  }
}

export const googleOAuthProvider = new GoogleOAuthProvider();
