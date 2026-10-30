/**
 * Foundry OneDrive Connector
 * Integrates OneDrive and SharePoint cloud document discovery via Microsoft Graph API.
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
import { microsoftAuth, MICROSOFT_GRAPH_BASE } from './microsoftAuth';

export interface OneDriveFileItem {
  id: string;
  name: string;
  webUrl: string;
  sizeBytes: number;
  lastModifiedDateTime: string;
}

export class OneDriveConnector extends Connector {
  public readonly id = 'microsoft_onedrive';
  public readonly name = 'Microsoft OneDrive';
  public readonly provider: CommunicationProvider = 'microsoft';
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
            accountName: v.accountName || 'OneDrive Storage',
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
        provider: 'microsoft',
        error: 'No access token stored for Microsoft OneDrive.',
      };
    }
    return microsoftAuth.verifyToken(token.accessToken, '/me/drive');
  }

  public async sync(): Promise<CommunicationItem[]> {
    // OneDrive files are cloud storage documents discovered via searchFiles
    return [];
  }

  /**
   * Search authorized documents in OneDrive matching a query.
   */
  public async searchFiles(query: string): Promise<OneDriveFileItem[]> {
    const token = await tokenStore.getToken(this.id);
    if (!token?.accessToken) return [];

    try {
      const url = `${MICROSOFT_GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(query)}')?$top=15&$select=id,name,webUrl,size,lastModifiedDateTime`;
      const resp = await proxyFetch(url, {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (resp.ok) {
        const data = await resp.json();
        return (data.value || []).map((f: any) => ({
          id: f.id,
          name: f.name,
          webUrl: f.webUrl,
          sizeBytes: f.size || 0,
          lastModifiedDateTime: f.lastModifiedDateTime,
        }));
      }
    } catch (e) {
      console.warn('[OneDriveConnector] Document search error:', e);
    }
    return [];
  }

  public async executeAction(_request: ActionRequest): Promise<ActionResult> {
    return { success: false, message: 'OneDrive connector is read-only and does not support modifying actions.' };
  }
}

export const oneDriveConnector = new OneDriveConnector();
