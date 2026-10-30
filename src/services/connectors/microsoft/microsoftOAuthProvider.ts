/**
 * Foundry Microsoft OAuth 2.0 PKCE Provider
 * Handles official browser sign-in and consent flow for Microsoft 365 accounts.
 * Users authenticate in their default browser with no manual API key entry.
 */

import { BaseOAuthProvider, OAuthCallbackData, OAuthResult } from '../core/oAuthProvider';
import { tokenStore } from '../core/tokenStore';
import { OAUTH_CONFIG } from '@/config/oauthConfig';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { microsoftAuth } from './microsoftAuth';
import { connectorRegistry } from '../core/connectorRegistry';

/**
 * Validates the Microsoft OAuth authorization URL before opening the browser.
 * Ensures client_id, response_type=code, redirect_uri, scope, state, and PKCE S256 parameters exist.
 */
export function validateMicrosoftAuthorizationUrl(url: URL): void {
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
      throw new Error(`Microsoft OAuth configuration error: missing ${parameter}`);
    }
  }

  if (url.searchParams.get('response_type') !== 'code') {
    throw new Error('Microsoft OAuth must use authorization code flow');
  }

  if (url.searchParams.get('code_challenge_method') !== 'S256') {
    throw new Error('Microsoft OAuth must use S256 PKCE');
  }
}

export class MicrosoftOAuthProvider extends BaseOAuthProvider {
  public readonly id = 'microsoft';
  public readonly name = 'Microsoft 365';

  public async authorize(): Promise<OAuthResult> {
    const { verifier, challenge } = await this.generatePKCE();
    const state = this.generateState();
    const config = OAUTH_CONFIG.MICROSOFT;

    // Minimal scope set for initial working version (conforms to Section 3 & 10)
    const scopesList = [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Mail.Read',
    ];
    const scopeStr = scopesList.join(' ');

    this.pendingSessions.set(state, {
      verifier,
      state,
      createdAt: Date.now(),
      scope: scopeStr,
    });

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      response_mode: 'query',
      scope: scopeStr,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    const authUrl = `${config.authorizationEndpoint}?${params.toString()}`;
    const parsedUrl = new URL(authUrl);

    // Validate the authorization URL before opening browser (Section 5)
    try {
      validateMicrosoftAuthorizationUrl(parsedUrl);
    } catch (validationError: any) {
      console.error('[MicrosoftOAuth] URL validation failed:', validationError);
      return {
        success: false,
        error: validationError.message || 'Microsoft OAuth configuration validation failed.',
      };
    }

    // Safe diagnostic log (Section 4 - NEVER logs tokens, secrets, or codes)
    console.log(
      `Microsoft OAuth authorization request\n\n` +
      `client_id: ${parsedUrl.searchParams.get('client_id') ? 'configured' : 'missing'}\n` +
      `redirect_uri: ${parsedUrl.searchParams.get('redirect_uri') ? 'configured' : 'missing'}\n` +
      `response_type: ${parsedUrl.searchParams.get('response_type')}\n` +
      `scope: ${parsedUrl.searchParams.get('scope')}\n` +
      `PKCE: enabled\n` +
      `state: generated`
    );

    try {
      // 1. Launch system browser to official Microsoft login
      await this.openInSystemBrowser(authUrl);

      // 2. Await redirect callback on local loopback server
      const code = await this.awaitLoopbackCallback(config.loopbackPort, state, 120);

      // 3. Exchange code for access & refresh tokens
      return await this.handleCallback({ code, state });
    } catch (err: any) {
      console.error('[MicrosoftOAuth] Authorization flow error:', err);
      return {
        success: false,
        error: err?.message || 'Microsoft browser authorization failed.',
      };
    } finally {
      this.pendingSessions.delete(state);
    }
  }

  public async handleCallback(callbackData: OAuthCallbackData): Promise<OAuthResult> {
    const session = this.pendingSessions.get(callbackData.state);
    const verifier = session?.verifier || '';
    const config = OAUTH_CONFIG.MICROSOFT;

    // Exchange authorization code for tokens (Section 7: no client_secret for native apps)
    const body = new URLSearchParams({
      client_id: config.clientId,
      grant_type: 'authorization_code',
      code: callbackData.code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    });

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
          error: `Microsoft token exchange failed (${resp.status}): ${errDesc}`,
        };
      }

      const tokenData = await resp.json();
      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in || 3600;

      // Save tokens securely in DPAPI credential storage
      const activeConnectors = [
        'microsoft',
        'microsoft_outlook',
        'microsoft_calendar',
      ];

      for (const id of activeConnectors) {
        await tokenStore.save(id, {
          accessToken,
          refreshToken,
          expiresAt: Date.now() + expiresIn * 1000,
          tokenType: tokenData.token_type || 'Bearer',
          scope: tokenData.scope,
          issuedAt: Date.now(),
        });
      }

      // Live verification of account identity and Mail.Read (Section 9)
      const verification = await microsoftAuth.verifyToken(accessToken, '/me/messages?$top=1');
      if (!verification.verified) {
        return {
          success: false,
          error: verification.error || 'Connected to Microsoft but Graph mailbox verification failed.',
        };
      }

      // Update connector configs in registry with verified account identity
      for (const id of activeConnectors) {
        const connector = connectorRegistry.getConnector(id);
        if (connector) {
          await connector.updateConfig({
            connected: true,
            accountEmail: verification.accountEmail,
            accountName: verification.accountName || 'Microsoft Account',
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
        error: `Microsoft callback processing error: ${err?.message || String(err)}`,
      };
    }
  }

  public async refreshToken(): Promise<boolean> {
    const existing = await tokenStore.get('microsoft_outlook');
    if (!existing?.refreshToken) return false;

    const config = OAUTH_CONFIG.MICROSOFT;
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

      const activeConnectors = [
        'microsoft',
        'microsoft_outlook',
        'microsoft_calendar',
      ];

      for (const id of activeConnectors) {
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
    const activeConnectors = [
      'microsoft',
      'microsoft_outlook',
      'microsoft_calendar',
    ];

    for (const id of activeConnectors) {
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

export const microsoftOAuthProvider = new MicrosoftOAuthProvider();
