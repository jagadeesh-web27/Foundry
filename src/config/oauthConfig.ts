/**
 * Foundry Central OAuth Configuration
 * Maintains developer application registrations and endpoints.
 * End users never have to configure or view client secrets or API keys.
 */

export interface ProviderOAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  loopbackPort: number;
  scopes: string[];
}

export function getStoredGoogleClientId(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('foundry_google_client_id');
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID.trim();
  }
  return '';
}

export function setStoredGoogleClientId(clientId: string): void {
  if (typeof localStorage !== 'undefined') {
    if (clientId.trim()) {
      localStorage.setItem('foundry_google_client_id', clientId.trim());
    } else {
      localStorage.removeItem('foundry_google_client_id');
    }
  }
}

export function isGoogleOAuthReady(): boolean {
  const id = getStoredGoogleClientId();
  return Boolean(id && !id.includes('foundry-desktop-client') && id.includes('.apps.googleusercontent.com'));
}

export const OAUTH_CONFIG = {
  LOOPBACK_PORT: 1420,
  REDIRECT_URI: 'http://localhost:1420/oauth/callback',

  MICROSOFT: {
    clientId:
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MICROSOFT_CLIENT_ID) ||
      'a68ef3be-dc9c-4c40-8438-e6d24f74d008',
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    redirectUri: 'http://localhost:1420/oauth/callback',
    loopbackPort: 1420,
    scopes: [
      'openid',
      'profile',
      'email',
      'offline_access',
      'User.Read',
      'Mail.Read',
    ],
  } as ProviderOAuthConfig,

  GOOGLE: {
    get clientId() {
      return getStoredGoogleClientId() || '1084293817492-foundry-desktop-client.apps.googleusercontent.com';
    },
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    redirectUri: 'http://localhost:1420/oauth/callback',
    loopbackPort: 1420,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid',
    ],
  } as ProviderOAuthConfig,

  SLACK: {
    clientId:
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SLACK_CLIENT_ID) ||
      '1049283749281.foundry.client',
    authorizationEndpoint: 'https://slack.com/oauth/v2/authorize',
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
    redirectUri: 'http://localhost:1420/oauth/callback',
    loopbackPort: 1420,
    scopes: [
      'channels:history',
      'groups:history',
      'im:history',
      'mpim:history',
      'search:read',
    ],
  } as ProviderOAuthConfig,
};
