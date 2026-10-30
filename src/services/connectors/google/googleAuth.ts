/**
 * Foundry Google Authentication & OAuth PKCE Helper
 * Implements official Google OAuth 2.0 PKCE flow with narrow, privacy-first scopes.
 */

import { OAuthConfig } from '../core/oAuthManager';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { VerificationResult } from '../core/connector';
import { OAUTH_CONFIG } from '@/config/oauthConfig';

export const GOOGLE_DEFAULT_SCOPES = {
  GMAIL_READONLY: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
  ],
  GMAIL_FULL: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
  ],
  CALENDAR_READONLY: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
  ],
  CHAT_READONLY: [
    'https://www.googleapis.com/auth/chat.spaces.readonly',
    'https://www.googleapis.com/auth/chat.messages.readonly',
    'openid',
  ],
  DRIVE_READONLY: [
    'https://www.googleapis.com/auth/drive.readonly',
    'openid',
  ],
};

export class GoogleAuth {
  private readonly defaultClientId = OAUTH_CONFIG.GOOGLE.clientId;
  private readonly authEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
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
   * Verifies an active Google OAuth token against userinfo or specific Google API.
   */
  public async verifyToken(token: string, requiredEndpoint?: string): Promise<VerificationResult> {
    const testedEndpoints: { endpoint: string; success: boolean; error?: string }[] = [];

    try {
      // 1. Verify user profile and token validity
      const userinfoResp = await proxyFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!userinfoResp.ok) {
        let errMsg = userinfoResp.statusText;
        try {
          const errData = await userinfoResp.json();
          if (errData?.error_description || errData?.error) {
            errMsg = errData.error_description || errData.error;
          }
        } catch {}

        testedEndpoints.push({
          endpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
          success: false,
          error: errMsg,
        });

        return {
          verified: false,
          provider: 'google',
          error: `Google identity verification failed (${userinfoResp.status}): ${errMsg}`,
          testedEndpoints,
        };
      }

      const userInfo = await userinfoResp.json();
      testedEndpoints.push({
        endpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
        success: true,
      });

      // 2. If an additional endpoint was requested (e.g. Gmail profile or Calendar list), test it
      if (requiredEndpoint) {
        const epResp = await proxyFetch(requiredEndpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!epResp.ok) {
          let epErr = epResp.statusText;
          try {
            const epData = await epResp.json();
            if (epData?.error?.message) epErr = epData.error.message;
          } catch {}

          testedEndpoints.push({
            endpoint: requiredEndpoint,
            success: false,
            error: epErr,
          });

          return {
            verified: false,
            provider: 'google',
            accountEmail: userInfo.email,
            accountName: userInfo.name,
            error: `API permission verification failed for ${requiredEndpoint} (${epResp.status}): ${epErr}`,
            testedEndpoints,
          };
        }

        testedEndpoints.push({
          endpoint: requiredEndpoint,
          success: true,
        });
      }

      return {
        verified: true,
        provider: 'google',
        accountEmail: userInfo.email,
        accountName: userInfo.name,
        testedEndpoints,
      };
    } catch (err: any) {
      return {
        verified: false,
        provider: 'google',
        error: `Google verification network exception: ${err?.message || String(err)}`,
        testedEndpoints,
      };
    }
  }
}

export const googleAuth = new GoogleAuth();
