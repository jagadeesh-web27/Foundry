/**
 * Foundry Microsoft Authentication & OAuth PKCE Helper
 * Implements official Microsoft Entra ID (Azure AD) OAuth 2.0 PKCE flow.
 */

import { OAuthConfig } from '../core/oAuthManager';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { VerificationResult } from '../core/connector';

export const MICROSOFT_GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

export const MICROSOFT_DEFAULT_SCOPES = {
  OUTLOOK_READ: ['User.Read', 'Mail.Read', 'offline_access'],
  OUTLOOK_FULL: ['User.Read', 'Mail.Read', 'Mail.Send', 'offline_access'],
  TEAMS_READ: ['User.Read', 'Chat.Read', 'ChatMessage.Read', 'offline_access'],
  CALENDAR_READ: ['User.Read', 'Calendars.Read', 'offline_access'],
  ONEDRIVE_READ: ['User.Read', 'Files.Read', 'offline_access'],
};

export class MicrosoftAuth {
  private readonly defaultClientId = 'a68ef3be-dc9c-4c40-8438-e6d24f74d008'; // Microsoft common public desktop client ID or Foundry App ID
  private readonly authEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  private readonly tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  private readonly redirectUri = 'http://localhost:1420/oauth/callback';

  public getOAuthConfig(scopes: string[], customClientId?: string): OAuthConfig {
    return {
      clientId: customClientId || this.defaultClientId,
      authorizationEndpoint: this.authEndpoint,
      tokenEndpoint: this.tokenEndpoint,
      redirectUri: this.redirectUri,
      scopes,
    };
  }

  /**
   * Verifies an active Microsoft Graph access token against /me and returns identity metadata.
   */
  public async verifyToken(token: string, requiredEndpoint: string = '/me'): Promise<VerificationResult> {
    const testedEndpoints: { endpoint: string; success: boolean; error?: string }[] = [];

    try {
      const meResp = await proxyFetch(`${MICROSOFT_GRAPH_BASE}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!meResp.ok) {
        let errMsg = meResp.statusText;
        try {
          const errData = await meResp.json();
          if (errData?.error?.message) errMsg = errData.error.message;
        } catch {}

        testedEndpoints.push({
          endpoint: `${MICROSOFT_GRAPH_BASE}/me`,
          success: false,
          error: errMsg,
        });

        return {
          verified: false,
          provider: 'microsoft',
          error: `Microsoft identity verification failed (${meResp.status}): ${errMsg}`,
          testedEndpoints,
        };
      }

      const meData = await meResp.json();
      testedEndpoints.push({
        endpoint: `${MICROSOFT_GRAPH_BASE}/me`,
        success: true,
      });

      // Verify specific endpoint if different from /me
      if (requiredEndpoint !== '/me') {
        const targetResp = await proxyFetch(`${MICROSOFT_GRAPH_BASE}${requiredEndpoint}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!targetResp.ok) {
          let errDetail = targetResp.statusText;
          try {
            const errObj = await targetResp.json();
            if (errObj?.error?.message) errDetail = errObj.error.message;
          } catch {}

          testedEndpoints.push({
            endpoint: `${MICROSOFT_GRAPH_BASE}${requiredEndpoint}`,
            success: false,
            error: errDetail,
          });

          return {
            verified: false,
            provider: 'microsoft',
            accountEmail: meData.mail || meData.userPrincipalName,
            accountName: meData.displayName,
            error: `Permission error on ${requiredEndpoint} (${targetResp.status}): ${errDetail}`,
            testedEndpoints,
          };
        }

        testedEndpoints.push({
          endpoint: `${MICROSOFT_GRAPH_BASE}${requiredEndpoint}`,
          success: true,
        });
      }

      return {
        verified: true,
        provider: 'microsoft',
        accountEmail: meData.mail || meData.userPrincipalName,
        accountName: meData.displayName,
        testedEndpoints,
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'microsoft',
        error: `Network or verification exception: ${err?.message || String(err)}`,
        testedEndpoints,
      };
    }
  }
}

export const microsoftAuth = new MicrosoftAuth();
