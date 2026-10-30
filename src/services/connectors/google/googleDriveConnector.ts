/**
 * Foundry Google Drive Connector
 * Integrates Google Drive file discovery via Google REST APIs.
 * Uses narrow scope: https://www.googleapis.com/auth/drive.readonly
 * Conforms to the Universal Communication Connector Architecture.
 */

import {
  Connector,
  ActionRequest,
  ActionResult,
  VerificationResult,
  CommunicationProvider,
} from '../core/connector';
import { ConnectorCapability } from '../core/connectorCapabilities';
import { CommunicationItem } from '@/services/commitments/communicationItem';
import { tokenStore } from '../core/tokenStore';
import { proxyFetch } from '@/services/ai/proxyFetch';
import { googleAuth } from './googleAuth';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

export interface GoogleDriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

export class GoogleDriveConnector extends Connector {
  public readonly id = 'google_drive';
  public readonly name = 'Google Drive';
  public readonly provider: CommunicationProvider = 'google';
  public readonly capabilities: ConnectorCapability[] = ['READ_FILES'];

  public async connect(token?: string): Promise<boolean> {
    if (token) {
      await tokenStore.saveToken(this.id, {
        accessToken: token,
        expiresInSeconds: 3600,
        tokenType: 'Bearer',
      });
    }

    const isValid = await tokenStore.isTokenValid(this.id);
    if (isValid) {
      const storedToken = await tokenStore.getToken(this.id);
      if (storedToken?.accessToken) {
        const v = await this.verifyConnection();
        if (v.verified) {
          await this.updateConfig({
            connected: true,
            accountEmail: v.accountEmail,
            accountName: v.accountName || 'Google Drive Account',
          });
          return true;
        }
      }
    }
    return false;
  }

  public async verifyConnection(): Promise<VerificationResult> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) {
      return {
        verified: false,
        provider: 'google',
        error: 'No access token stored for Google Drive.',
      };
    }
    return googleAuth.verifyToken(token.accessToken, `${DRIVE_BASE}/about?fields=user`);
  }

  public async sync(): Promise<CommunicationItem[]> {
    return [];
  }

  public async searchFiles(query: string): Promise<GoogleDriveFileItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return [];

    try {
      const q = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;
      const url = `${DRIVE_BASE}/files?q=${encodeURIComponent(q)}&pageSize=15&fields=files(id,name,mimeType,webViewLink)`;

      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        return (data.files || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: f.webViewLink,
        }));
      }
    } catch (e) {
      console.warn('[GoogleDriveConnector] Search error:', e);
    }

    return [];
  }

  public async executeAction(_request: ActionRequest): Promise<ActionResult> {
    return { success: false, message: 'Google Drive is read-only and does not support modifying actions.' };
  }
}

export const googleDriveConnector = new GoogleDriveConnector();
