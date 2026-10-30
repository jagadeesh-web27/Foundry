/**
 * Foundry SecureTokenStore - OS Credential Storage via Windows DPAPI
 * Implements hardware/OS-level encryption for OAuth tokens.
 * Plaintext tokens are NEVER persisted to localStorage, sessionStorage, or plaintext SQLite/JSON.
 */

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  issuedAt?: number;
}

export interface StoredConnectorToken extends OAuthTokens {
  connectorId: string;
  updatedAt: string;
}

export interface SecureTokenStore {
  save(provider: string, tokens: OAuthTokens): Promise<void>;
  get(provider: string): Promise<OAuthTokens | null>;
  delete(provider: string): Promise<void>;
}

export class TokenStore implements SecureTokenStore {
  // Ephemeral memory cache: never serialized or sent to UI components
  private memoryTokens: Map<string, StoredConnectorToken> = new Map();

  /**
   * Securely saves OAuth tokens using Windows DPAPI via Tauri backend.
   */
  public async save(provider: string, tokens: OAuthTokens): Promise<void> {
    const stored: StoredConnectorToken = {
      ...tokens,
      connectorId: provider,
      tokenType: tokens.tokenType || 'Bearer',
      updatedAt: new Date().toISOString(),
    };

    this.memoryTokens.set(provider, stored);

    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('secure_save_token', {
          provider,
          tokensJson: JSON.stringify(stored),
        });
      } catch (err) {
        console.error(`[TokenStore] Native DPAPI secure_save_token failed for ${provider}:`, err);
      }
    }
  }

  /**
   * Securely retrieves and decrypts OAuth tokens from OS credential storage.
   */
  public async get(provider: string): Promise<OAuthTokens | null> {
    if (this.memoryTokens.has(provider)) {
      return this.memoryTokens.get(provider)!;
    }

    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const decryptedJson = await invoke<string | null>('secure_get_token', { provider });
        if (decryptedJson) {
          const parsed = JSON.parse(decryptedJson) as StoredConnectorToken;
          this.memoryTokens.set(provider, parsed);
          return parsed;
        }
      } catch (err) {
        console.error(`[TokenStore] Native DPAPI secure_get_token failed for ${provider}:`, err);
      }
    }

    return null;
  }

  /**
   * Securely deletes credentials from memory and OS encrypted storage.
   */
  public async delete(provider: string): Promise<void> {
    this.memoryTokens.delete(provider);

    const isTauri =
      typeof window !== 'undefined' &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);

    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('secure_delete_token', { provider });
      } catch (err) {
        console.error(`[TokenStore] Native DPAPI secure_delete_token failed for ${provider}:`, err);
      }
    }
  }

  // Backward compatibility methods for existing connector signatures
  public async saveToken(
    connectorId: string,
    tokenData: {
      accessToken: string;
      refreshToken?: string;
      expiresInSeconds?: number;
      expiresAt?: number;
      tokenType?: string;
      scope?: string;
    }
  ): Promise<void> {
    const expiresAt = tokenData.expiresAt
      ? tokenData.expiresAt
      : tokenData.expiresInSeconds
      ? Date.now() + tokenData.expiresInSeconds * 1000
      : undefined;

    await this.save(connectorId, {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt,
      tokenType: tokenData.tokenType,
      scope: tokenData.scope,
      issuedAt: Date.now(),
    });
  }

  public async getToken(connectorId: string): Promise<StoredConnectorToken | null> {
    const tokens = await this.get(connectorId);
    if (!tokens) return null;
    return {
      ...tokens,
      connectorId,
      updatedAt: new Date().toISOString(),
    };
  }

  public async isTokenValid(connectorId: string): Promise<boolean> {
    const token = await this.get(connectorId);
    if (!token || !token.accessToken) return false;
    if (token.expiresAt && Date.now() > token.expiresAt - 60000) {
      return false; // Expired or expiring within 60s
    }
    return true;
  }

  public async deleteToken(connectorId: string): Promise<void> {
    await this.delete(connectorId);
  }
}

export const tokenStore = new TokenStore();
