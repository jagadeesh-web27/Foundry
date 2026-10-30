/**
 * Foundry Universal OAuth Provider Abstraction
 * Defines provider-independent interface for browser-based OAuth 2.0 PKCE authentication.
 */

import { OAuthTokens } from './tokenStore';

export interface OAuthCallbackData {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
}

export interface OAuthResult {
  success: boolean;
  accountEmail?: string;
  accountName?: string;
  accountId?: string;
  error?: string;
  tokens?: OAuthTokens;
}

export interface OAuthProvider {
  id: string;
  name: string;

  /**
   * Initiates browser OAuth flow:
   * Generates PKCE, spawns loopback listener, opens system browser,
   * awaits callback, exchanges code for tokens, and performs initial verification.
   */
  authorize(): Promise<OAuthResult>;

  /**
   * Exchanges authorization code for tokens and saves them in SecureTokenStore.
   */
  handleCallback(callbackData: OAuthCallbackData): Promise<OAuthResult>;

  /**
   * Refreshes expired credentials using stored refresh token.
   */
  refreshToken(): Promise<boolean>;

  /**
   * Revokes access and purges secure credentials.
   */
  revoke(): Promise<void>;
}

export abstract class BaseOAuthProvider implements OAuthProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  // Track pending OAuth sessions for CSRF protection and PKCE exchange
  protected pendingSessions: Map<
    string,
    { verifier: string; state: string; createdAt: number; scope?: string }
  > = new Map();

  abstract authorize(): Promise<OAuthResult>;
  abstract handleCallback(callbackData: OAuthCallbackData): Promise<OAuthResult>;
  abstract refreshToken(): Promise<boolean>;
  abstract revoke(): Promise<void>;

  /**
   * Generates cryptographically secure PKCE code verifier and S256 challenge.
   */
  public async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(32);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
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
   * Generates a cryptographically random state parameter for CSRF prevention.
   */
  public generateState(): string {
    const array = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(array);
    } else {
      for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Opens the authorization URL in the user's default system browser via Tauri.
   */
  protected async openInSystemBrowser(url: string): Promise<void> {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_browser_url', { url });
    } else if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  /**
   * Awaits OAuth redirect code via native loopback listener in Tauri.
   */
  protected async awaitLoopbackCallback(
    port: number,
    state: string,
    timeoutSeconds: number = 120
  ): Promise<string> {
    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      const code = await invoke<string>('wait_for_oauth_callback', {
        port,
        expectedState: state,
        timeoutSeconds,
      });
      return code;
    }

    throw new Error(
      'OAuth loopback listener requires the native desktop environment. Please run Foundry in desktop mode.'
    );
  }

  private base64UrlEncode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const b64 =
      typeof btoa !== 'undefined'
        ? btoa(binary)
        : (globalThis as any).Buffer?.from(binary, 'binary').toString('base64') || '';
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
