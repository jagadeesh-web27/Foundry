/**
 * Foundry Slack OAuth 2.0 Provider
 * Handles official browser sign-in and workspace authorization for Slack.
 * Users authenticate in their default browser with no manual API key entry.
 */

import { BaseOAuthProvider, OAuthCallbackData, OAuthResult } from '../core/oAuthProvider';
import { tokenStore } from '../core/tokenStore';
import { OAUTH_CONFIG } from '@/config/oauthConfig';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { connectorRegistry } from '../core/connectorRegistry';

export class SlackOAuthProvider extends BaseOAuthProvider {
  public readonly id = 'slack';
  public readonly name = 'Slack';

  public async authorize(): Promise<OAuthResult> {
    const { verifier } = await this.generatePKCE();
    const state = this.generateState();

    this.pendingSessions.set(state, {
      verifier,
      state,
      createdAt: Date.now(),
    });

    const config = OAUTH_CONFIG.SLACK;
    const params = new URLSearchParams({
      client_id: config.clientId,
      user_scope: config.scopes.join(','),
      redirect_uri: config.redirectUri,
      state,
    });

    const authUrl = `${config.authorizationEndpoint}?${params.toString()}`;

    try {
      // 1. Launch system browser to official Slack workspace authorization
      await this.openInSystemBrowser(authUrl);

      // 2. Await redirect callback on local loopback server
      const code = await this.awaitLoopbackCallback(config.loopbackPort, state, 120);

      // 3. Exchange code for user access token
      return await this.handleCallback({ code, state });
    } catch (err: any) {
      console.error('[SlackOAuth] Authorization flow error:', err);
      return {
        success: false,
        error: err?.message || 'Slack browser authorization failed.',
      };
    } finally {
      this.pendingSessions.delete(state);
    }
  }

  public async handleCallback(callbackData: OAuthCallbackData): Promise<OAuthResult> {
    const config = OAUTH_CONFIG.SLACK;
    const body = new URLSearchParams({
      client_id: config.clientId,
      code: callbackData.code,
      redirect_uri: config.redirectUri,
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
        return {
          success: false,
          error: `Slack token exchange HTTP error: ${resp.statusText}`,
        };
      }

      const data = await resp.json();
      if (!data.ok) {
        return {
          success: false,
          error: `Slack token exchange error: ${data.error || 'Failed to exchange authorization code'}`,
        };
      }

      // In user_scope flow, authed_user contains access_token
      const accessToken = data.authed_user?.access_token || data.access_token;
      const refreshToken = data.authed_user?.refresh_token || data.refresh_token;
      const expiresIn = data.authed_user?.expires_in || data.expires_in;

      if (!accessToken) {
        return {
          success: false,
          error: 'No user access token returned by Slack.',
        };
      }

      // Save tokens securely in DPAPI credential storage
      await tokenStore.save('slack_workspace', {
        accessToken,
        refreshToken,
        expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined,
        tokenType: 'Bearer',
        scope: data.authed_user?.scope || data.scope,
        issuedAt: Date.now(),
      });

      // Live verification of account & workspace identity against auth.test
      const testResp = await proxyFetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!testResp.ok) {
        return {
          success: false,
          error: `Slack verification failed: ${testResp.statusText}`,
        };
      }

      const testData = await testResp.json();
      if (!testData.ok) {
        return {
          success: false,
          error: `Slack verification rejected: ${testData.error || 'Invalid token'}`,
        };
      }

      const workspaceName = testData.team || 'Slack Workspace';
      const userName = testData.user || 'Authorized User';

      const connector = connectorRegistry.getConnector('slack_workspace');
      if (connector) {
        await connector.updateConfig({
          connected: true,
          accountName: `${userName} (${workspaceName})`,
          accountEmail: testData.user_id ? `${testData.user_id}@${testData.team_id || 'slack'}` : undefined,
        });
      }

      return {
        success: true,
        accountName: `${userName} (${workspaceName})`,
        tokens: {
          accessToken,
          tokenType: 'Bearer',
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Slack callback processing error: ${err?.message || String(err)}`,
      };
    }
  }

  public async refreshToken(): Promise<boolean> {
    return false; // Slack user tokens are long-lived unless rotation is explicitly configured
  }

  public async revoke(): Promise<void> {
    await tokenStore.delete('slack_workspace');
    const connector = connectorRegistry.getConnector('slack_workspace');
    if (connector) {
      await connector.updateConfig({
        connected: false,
        accountEmail: undefined,
        accountName: undefined,
      });
    }
  }
}

export const slackOAuthProvider = new SlackOAuthProvider();
