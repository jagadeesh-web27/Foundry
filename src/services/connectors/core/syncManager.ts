/**
 * Foundry SyncManager - Incremental Synchronization & Delta Coordinator
 * Orchestrates cursor-based and periodic background sync across connected services.
 */

import { Connector } from './connector';
import { commitmentEngine } from '@/services/commitments/commitmentEngine';
import { db } from '@/services/db/database';

export class SyncManager {
  private activeSyncs: Set<string> = new Set();

  /**
   * Performs an incremental sync of a specific connector.
   */
  public async syncConnector(connector: Connector, incremental: boolean = true): Promise<{
    success: boolean;
    itemsCount: number;
    error?: string;
  }> {
    if (this.activeSyncs.has(connector.id)) {
      return { success: false, itemsCount: 0, error: 'Sync already in progress' };
    }

    this.activeSyncs.add(connector.id);
    await connector.updateConfig({ syncStatus: 'syncing', syncErrorMessage: undefined });

    try {
      const items = await connector.sync(incremental);

      // Persist raw normalized communication items
      if (items.length > 0) {
        await db.saveCommunicationItems(
          items.map((i) => ({
            id: i.id,
            source: i.source,
            conversationId: i.conversationId,
            sender: i.sender,
            recipients: i.recipients,
            subject: i.subject,
            content: i.content,
            timestamp: i.timestamp.toISOString(),
            attachments: i.attachments?.map((a) => ({
              id: a.id,
              name: a.name,
              contentType: a.contentType,
              sizeBytes: a.sizeBytes,
            })),
            metadata: i.metadata,
          }))
        );

        // Feed directly into CommitmentEngine for automatic obligation extraction
        await commitmentEngine.processBatch(items);
      }

      await connector.updateConfig({
        syncStatus: 'success',
        lastSyncAt: new Date().toISOString(),
      });

      return { success: true, itemsCount: items.length };
    } catch (err: any) {
      console.error(`[SyncManager] Sync failed for ${connector.id}:`, err);
      const msg = err?.message || String(err);
      await connector.updateConfig({
        syncStatus: 'error',
        syncErrorMessage: msg,
      });
      return { success: false, itemsCount: 0, error: msg };
    } finally {
      this.activeSyncs.delete(connector.id);
    }
  }

  /**
   * Syncs all connected services sequentially or in parallel.
   */
  public async syncAll(connectors: Connector[]): Promise<Record<string, { success: boolean; itemsCount: number }>> {
    const results: Record<string, { success: boolean; itemsCount: number }> = {};
    for (const connector of connectors) {
      const isConnected = await connector.isConnected();
      if (isConnected) {
        const res = await this.syncConnector(connector, true);
        results[connector.id] = { success: res.success, itemsCount: res.itemsCount };
      }
    }
    return results;
  }
}

export const syncManager = new SyncManager();
