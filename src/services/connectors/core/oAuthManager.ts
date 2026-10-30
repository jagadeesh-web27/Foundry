/**
 * Foundry OAuthManager - Standards-Compliant PKCE OAuth 2.0 Flow Manager
 */

import { tokenStore } from './tokenStore';
import { proxyFetch } from '@/services/ai/proxyFetch';

export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
}

export class OAuthManager {
  /**
   * Generates a PKCE code verifier and code challenge pair.
   */
  public async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < 32; i++) array[i] = Math.floor(Math.random() * 256);
    }
    const verifier = this.base64UrlEncode(array);

    let challenge = verifier;
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        challenge = this.base64UrlEncode(new Uint8Array(digest));
      } catch {}
    }

    return { verifier, challenge };
  }

  /**
   * Builds the full authorization URL to launch in the browser or WebView.
   */
  public buildAuthUrl(config: OAuthConfig, challenge: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    return `${config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for an access token via proxyFetch (CORS-free).
   */
  public async exchangeCodeForToken(
    connectorId: string,
    code: string,
    verifier: string,
    config: OAuthConfig
  ): Promise<boolean> {
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        code_verifier: verifier,
      });

      const resp = await proxyFetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!resp.ok) {
        console.error(`[OAuthManager] Token exchange failed for ${connectorId}:`, resp.statusText);
        return false;
      }

      const data = await resp.json();
      await tokenStore.saveToken(connectorId, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresInSeconds: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      });

      return true;
    } catch (err) {
      console.error(`[OAuthManager] Token exchange exception for ${connectorId}:`, err);
      return false;
    }
  }

  /**
   * Refreshes an expired token using its refresh token.
   */
  public async refreshToken(connectorId: string, config: OAuthConfig): Promise<boolean> {
    const existing = await tokenStore.getToken(connectorId);
    if (!existing || !existing.refreshToken) return false;

    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        grant_type: 'refresh_token',
        refresh_token: existing.refreshToken,
      });

      const resp = await proxyFetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!resp.ok) return false;

      const data = await resp.json();
      await tokenStore.saveToken(connectorId, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || existing.refreshToken,
        expiresInSeconds: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      });

      return true;
    } catch {
      return false;
    }
  }

  private base64UrlEncode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const b64 = typeof btoa !== 'undefined'
      ? btoa(binary)
      : (globalThis as any).Buffer?.from(binary, 'binary').toString('base64') || '';
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

export const oAuthManager = new OAuthManager();
