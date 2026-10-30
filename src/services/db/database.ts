import { Document, Chunk } from '@/types/document';
import { Note } from '@/types/note';
import { Collection, Bookmark } from '@/types/collection';
import { GraphNode, GraphEdge } from '@/types/graph';
import { AppSettings } from '@/types/settings';
import { IndexedFile, IndexedFolder } from '@/types/file';
import { DEFAULT_SETTINGS } from '../settings/defaultSettings';

const DB_NAME = 'foundry_local_db';
const DB_VERSION = 7;

export type CommitmentType =
  | 'TASK'
  | 'DEADLINE'
  | 'PROMISE'
  | 'FOLLOW_UP'
  | 'WAITING_FOR'
  | 'REQUEST'
  | 'MEETING'
  | 'REMINDER';

export type CommitmentStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'DISMISSED'
  | 'WAITING'
  | 'CANCELLED';

export interface CommitmentSourceRef {
  provider: string; // 'OUTLOOK' | 'TEAMS' | 'GMAIL' | 'SLACK' | 'WHATSAPP' | 'LOCAL' | etc.
  messageId?: string;
  conversationId?: string;
  subject?: string;
  senderName?: string;
  timestamp?: string;
}

export interface StoredPerson {
  id?: string;
  name: string;
  email?: string;
  role?: string;
}

export interface StoredCommitment {
  id: string;
  type: CommitmentType;
  title: string;
  description?: string;
  status: CommitmentStatus;
  dueAt?: string; // ISO string
  createdAt: string;
  updatedAt: string;
  source: CommitmentSourceRef;
  sources?: CommitmentSourceRef[];
  person?: StoredPerson;
  confidence: number; // 0.0 to 1.0
  evidence?: string;
  reminderState?: {
    scheduledAt?: string;
    notified?: boolean;
  };
  isTentative?: boolean; // When confidence is low or needs user confirmation
}

export interface StoredConnectorConfig {
  id: string; // e.g. 'microsoft', 'google', 'slack', 'whatsapp'
  name: string;
  provider: string;
  connected: boolean;
  accountEmail?: string;
  accountName?: string;
  grantedCapabilities: string[]; // e.g. ['READ_MESSAGES', 'READ_CALENDAR', ...]
  actionPermissions: Record<string, boolean>; // e.g. { 'SEND_EMAIL': false, 'SEND_MESSAGE': false }
  lastSyncAt?: string;
  syncStatus?: 'idle' | 'syncing' | 'error' | 'success';
  syncErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredConnectorToken {
  connectorId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number; // epoch ms
  tokenType?: string;
  scope?: string;
  updatedAt: string;
}

export interface StoredCommunicationItem {
  id: string;
  source: string;
  conversationId?: string;
  sender?: StoredPerson;
  recipients?: StoredPerson[];
  subject?: string;
  content: string;
  timestamp: string;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    sizeBytes: number;
  }>;
  metadata?: Record<string, unknown>;
}

export type MemoryType = 'short_term' | 'long_term' | 'preference' | 'project' | 'episodic';

export interface MemoryItem {
  id: string;
  type: MemoryType;
  key: string;
  value: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductivityTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export type FollowUpType =
  | 'task'
  | 'promise'
  | 'deadline'
  | 'waiting_for'
  | 'pending_approval'
  | 'pending_document';

export interface FollowUpItem {
  id: string;
  title: string;
  type: FollowUpType;
  targetPerson?: string;
  dueDate?: string;
  notes?: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
}

export interface GoalItem {
  id: string;
  title: string;
  category: string;
  progress: number; // 0 - 100
  status: 'active' | 'completed' | 'paused';
  targetDate?: string;
  nextAction?: string;
  blockedBy?: string;
  steps: GoalMilestone[];
  createdAt: string;
  updatedAt: string;
}

export interface CleanupProposalItem {
  sourcePath: string;
  targetPath?: string;
  fileName: string;
  sizeBytes: number;
  category: string;
  action: 'move' | 'archive' | 'delete';
}

export interface CleanupProposal {
  id: string;
  type: 'downloads_organization' | 'duplicate_cleanup' | 'large_files_cleanup';
  title: string;
  description: string;
  items: CleanupProposalItem[];
  totalBytes: number;
  status: 'proposed' | 'approved' | 'rejected' | 'completed';
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  title: string;
  description?: string;
  scheduleType: 'recurring' | 'once';
  scheduleTime?: string;
  dayOfWeek?: number;
  actionType: 'reminder' | 'briefing' | 'summary' | 'custom';
  actionPayload?: string;
  enabled: boolean;
  lastRunAt?: string;
  createdAt: string;
}

export interface TelemetryRecord {
  id: string;
  timestamp: string;
  cpuUsagePercent: number;
  memoryUsedBytes: number;
  memoryTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  activeAppCount: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: any[];
  toolResults?: any[];
  files?: any[];
  folders?: any[];
  systemInfo?: any;
  networkInfo?: any;
  diskInfo?: any;
  runningApps?: any[];
  pendingConfirmation?: any;
}

export interface StoredConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
}

export interface DatabaseStats {
  totalDocuments: number;
  totalNotes: number;
  totalChunks: number;
  totalConcepts: number;
  totalRelationships: number;
  totalCollections: number;
  totalBookmarks: number;
  totalIndexedFiles: number;
  totalIndexedFolders: number;
  storageUsageBytes: number;
}

export class LocalDatabase {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Computer Indexed Files store
        if (!db.objectStoreNames.contains('indexed_files')) {
          const fileStore = db.createObjectStore('indexed_files', { keyPath: 'id' });
          fileStore.createIndex('path', 'path', { unique: true });
          fileStore.createIndex('extension', 'extension', { unique: false });
          fileStore.createIndex('fileType', 'fileType', { unique: false });
          fileStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
          fileStore.createIndex('name', 'name', { unique: false });
        }

        // Computer Indexed Folders store
        if (!db.objectStoreNames.contains('indexed_folders')) {
          const folderStore = db.createObjectStore('indexed_folders', { keyPath: 'id' });
          folderStore.createIndex('path', 'path', { unique: true });
          folderStore.createIndex('name', 'name', { unique: false });
          folderStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
          folderStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('hash', 'hash', { unique: true });
          docStore.createIndex('status', 'status', { unique: false });
          docStore.createIndex('fileType', 'fileType', { unique: false });
          docStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Chunks store
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunkStore.createIndex('documentId', 'documentId', { unique: false });
          chunkStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
        }

        // Notes store
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Collections store
        if (!db.objectStoreNames.contains('collections')) {
          db.createObjectStore('collections', { keyPath: 'id' });
        }

        // Bookmarks store
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bookmarkStore = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bookmarkStore.createIndex('collectionId', 'collectionId', { unique: false });
        }

        // Graph nodes store
        if (!db.objectStoreNames.contains('graph_nodes')) {
          const nodeStore = db.createObjectStore('graph_nodes', { keyPath: 'id' });
          nodeStore.createIndex('type', 'type', { unique: false });
          nodeStore.createIndex('entityId', 'entityId', { unique: false });
        }

        // Graph edges store
        if (!db.objectStoreNames.contains('graph_edges')) {
          const edgeStore = db.createObjectStore('graph_edges', { keyPath: 'id' });
          edgeStore.createIndex('source', 'source', { unique: false });
          edgeStore.createIndex('target', 'target', { unique: false });
          edgeStore.createIndex('relationship', 'relationship', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          convStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Memory Items store
        if (!db.objectStoreNames.contains('memory_items')) {
          const memStore = db.createObjectStore('memory_items', { keyPath: 'id' });
          memStore.createIndex('type', 'type', { unique: false });
          memStore.createIndex('key', 'key', { unique: false });
          memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Tasks store
        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('status', 'status', { unique: false });
          taskStore.createIndex('priority', 'priority', { unique: false });
          taskStore.createIndex('dueDate', 'dueDate', { unique: false });
        }

        // Automations store
        if (!db.objectStoreNames.contains('automations')) {
          const autoStore = db.createObjectStore('automations', { keyPath: 'id' });
          autoStore.createIndex('enabled', 'enabled', { unique: false });
          autoStore.createIndex('scheduleType', 'scheduleType', { unique: false });
        }

        // Telemetry Records store
        if (!db.objectStoreNames.contains('telemetry_records')) {
          const telemStore = db.createObjectStore('telemetry_records', { keyPath: 'id' });
          telemStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Follow-Up Items store
        if (!db.objectStoreNames.contains('followup_items')) {
          const followStore = db.createObjectStore('followup_items', { keyPath: 'id' });
          followStore.createIndex('status', 'status', { unique: false });
          followStore.createIndex('type', 'type', { unique: false });
          followStore.createIndex('dueDate', 'dueDate', { unique: false });
        }

        // Goal Items store
        if (!db.objectStoreNames.contains('goal_items')) {
          const goalStore = db.createObjectStore('goal_items', { keyPath: 'id' });
          goalStore.createIndex('status', 'status', { unique: false });
          goalStore.createIndex('category', 'category', { unique: false });
        }

        // Cleanup Proposals store
        if (!db.objectStoreNames.contains('cleanup_proposals')) {
          const cleanStore = db.createObjectStore('cleanup_proposals', { keyPath: 'id' });
          cleanStore.createIndex('status', 'status', { unique: false });
          cleanStore.createIndex('type', 'type', { unique: false });
        }

        // Commitments store
        if (!db.objectStoreNames.contains('commitments')) {
          const comStore = db.createObjectStore('commitments', { keyPath: 'id' });
          comStore.createIndex('status', 'status', { unique: false });
          comStore.createIndex('type', 'type', { unique: false });
          comStore.createIndex('dueAt', 'dueAt', { unique: false });
          comStore.createIndex('confidence', 'confidence', { unique: false });
          comStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Connector Configs store
        if (!db.objectStoreNames.contains('connector_configs')) {
          const cfgStore = db.createObjectStore('connector_configs', { keyPath: 'id' });
          cfgStore.createIndex('connected', 'connected', { unique: false });
          cfgStore.createIndex('provider', 'provider', { unique: false });
        }

        // Connector Tokens store
        if (!db.objectStoreNames.contains('connector_tokens')) {
          db.createObjectStore('connector_tokens', { keyPath: 'connectorId' });
        }

        // Communication Items store
        if (!db.objectStoreNames.contains('communication_items')) {
          const commStore = db.createObjectStore('communication_items', { keyPath: 'id' });
          commStore.createIndex('source', 'source', { unique: false });
          commStore.createIndex('timestamp', 'timestamp', { unique: false });
          commStore.createIndex('conversationId', 'conversationId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to open local Foundry database.'));
      };
    });

    return this.initPromise;
  }

  private async getStore(
    storeName: string,
    mode: IDBTransactionMode = 'readonly'
  ): Promise<IDBObjectStore> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  // --- Documents ---
  async getDocuments(): Promise<Document[]> {
    const store = await this.getStore('documents');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getDocumentById(id: string): Promise<Document | null> {
    const store = await this.getStore('documents');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async getDocumentByHash(hash: string): Promise<Document | null> {
    const store = await this.getStore('documents');
    const index = store.index('hash');
    return new Promise((resolve, reject) => {
      const request = index.get(hash);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveDocument(doc: Document): Promise<void> {
    const store = await this.getStore('documents', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(doc);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(id: string): Promise<void> {
    const doc = await this.getDocumentById(id);
    if (!doc) return;

    // Delete chunks associated with document
    await this.deleteChunksByDocumentId(id);

    // Delete document
    const store = await this.getStore('documents', 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Delete graph nodes & edges
    await this.deleteGraphNode(`doc_${id}`);
  }

  // --- Chunks ---
  async getChunksByDocumentId(documentId: string): Promise<Chunk[]> {
    const store = await this.getStore('chunks');
    const index = store.index('documentId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(documentId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllChunks(): Promise<Chunk[]> {
    const store = await this.getStore('chunks');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    for (const chunk of chunks) {
      store.put(chunk);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    const chunks = await this.getChunksByDocumentId(documentId);
    if (chunks.length === 0) return;
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    for (const chunk of chunks) {
      store.delete(chunk.id);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Notes ---
  async getNotes(): Promise<Note[]> {
    const store = await this.getStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getNoteById(id: string): Promise<Note | null> {
    const store = await this.getStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveNote(note: Note): Promise<void> {
    const store = await this.getStore('notes', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(note);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNote(id: string): Promise<void> {
    const store = await this.getStore('notes', 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    await this.deleteGraphNode(`note_${id}`);
  }

  // --- Collections ---
  async getCollections(): Promise<Collection[]> {
    const store = await this.getStore('collections');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveCollection(col: Collection): Promise<void> {
    const store = await this.getStore('collections', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(col);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCollection(id: string): Promise<void> {
    const store = await this.getStore('collections', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Bookmarks ---
  async getBookmarks(): Promise<Bookmark[]> {
    const store = await this.getStore('bookmarks');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveBookmark(bm: Bookmark): Promise<void> {
    const store = await this.getStore('bookmarks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(bm);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBookmark(id: string): Promise<void> {
    const store = await this.getStore('bookmarks', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Graph ---
  async getGraphData(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const [nodesStore, edgesStore] = await Promise.all([
      this.getStore('graph_nodes'),
      this.getStore('graph_edges'),
    ]);

    const [nodes, edges] = await Promise.all([
      new Promise<GraphNode[]>((resolve, reject) => {
        const req = nodesStore.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
      new Promise<GraphEdge[]>((resolve, reject) => {
        const req = edgesStore.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      }),
    ]);

    return { nodes, edges };
  }

  async saveGraphNode(node: GraphNode): Promise<void> {
    const store = await this.getStore('graph_nodes', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(node);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async saveGraphEdge(edge: GraphEdge): Promise<void> {
    const store = await this.getStore('graph_edges', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(edge);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteGraphNode(id: string): Promise<void> {
    await this.init();
    if (!this.db) return;
    const tx = this.db.transaction(['graph_nodes', 'graph_edges'], 'readwrite');
    const nodeStore = tx.objectStore('graph_nodes');
    const edgeStore = tx.objectStore('graph_edges');

    nodeStore.delete(id);

    // Also remove connected edges
    const edgesReq = edgeStore.getAll();
    edgesReq.onsuccess = () => {
      const edges: GraphEdge[] = edgesReq.result || [];
      for (const edge of edges) {
        if (edge.source === id || edge.target === id) {
          edgeStore.delete(edge.id);
        }
      }
    };
  }

  // --- Settings ---
  async getSettings(): Promise<AppSettings> {
    try {
      const store = await this.getStore('settings');
      return new Promise((resolve) => {
        const request = store.get('app_config');
        request.onsuccess = () => {
          if (request.result && request.result.value) {
            resolve({ ...DEFAULT_SETTINGS, ...request.result.value });
          } else {
            resolve(DEFAULT_SETTINGS);
          }
        };
        request.onerror = () => resolve(DEFAULT_SETTINGS);
      });
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'app_config', value: settings });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Computer Indexed Files ---
  async getAllIndexedFiles(): Promise<IndexedFile[]> {
    const store = await this.getStore('indexed_files');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertIndexedFiles(files: IndexedFile[]): Promise<void> {
    if (files.length === 0) return;
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction('indexed_files', 'readwrite');
    const store = tx.objectStore('indexed_files');
    for (const file of files) {
      store.put(file);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteIndexedFileByPath(path: string): Promise<void> {
    const store = await this.getStore('indexed_files', 'readwrite');
    const index = store.index('path');
    const req = index.getKey(path);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        if (req.result) {
          const delReq = store.delete(req.result);
          delReq.onsuccess = () => resolve();
          delReq.onerror = () => reject(delReq.error);
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getIsConnected(): Promise<boolean> {
    try {
      const store = await this.getStore('settings');
      return new Promise((resolve) => {
        const req = store.get('computer_connected');
        req.onsuccess = () => resolve(!!req.result?.value);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  async setIsConnected(connected: boolean): Promise<void> {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put({ key: 'computer_connected', value: connected });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // --- Computer Indexed Folders ---
  async getAllIndexedFolders(): Promise<IndexedFolder[]> {
    const store = await this.getStore('indexed_folders');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async upsertIndexedFolders(folders: IndexedFolder[]): Promise<void> {
    if (folders.length === 0) return;
    await this.init();
    if (!this.db) throw new Error('Database not initialized');
    const tx = this.db.transaction('indexed_folders', 'readwrite');
    const store = tx.objectStore('indexed_folders');
    for (const folder of folders) {
      store.put(folder);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Statistics ---
  async getStats(): Promise<DatabaseStats> {
    const [docs, notes, chunks, collections, bookmarks, graph, indexedFiles, indexedFolders] = await Promise.all([
      this.getDocuments(),
      this.getNotes(),
      this.getAllChunks(),
      this.getCollections(),
      this.getBookmarks(),
      this.getGraphData(),
      this.getAllIndexedFiles(),
      this.getAllIndexedFolders(),
    ]);

    const concepts = graph.nodes.filter((n) => n.type === 'Concept').length;

    // Estimate storage bytes (IndexedDB quota or data size)
    let totalBytes = 0;
    for (const d of docs) {
      totalBytes += d.fileSize || 0;
    }
    for (const f of indexedFiles) {
      totalBytes += f.size || 0;
    }

    return {
      totalDocuments: docs.length,
      totalNotes: notes.length,
      totalChunks: chunks.length,
      totalConcepts: concepts,
      totalRelationships: graph.edges.length,
      totalCollections: collections.length,
      totalBookmarks: bookmarks.length,
      totalIndexedFiles: indexedFiles.length,
      totalIndexedFolders: indexedFolders.length,
      storageUsageBytes: totalBytes,
    };
  }

  // --- Conversations Persistence ---
  async getConversations(): Promise<StoredConversation[]> {
    await this.init();
    if (!this.db) return [];
    if (!this.db.objectStoreNames.contains('conversations')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const req = store.getAll();
        req.onsuccess = () => {
          const convs = (req.result as StoredConversation[]) || [];
          convs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          resolve(convs);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getConversation(id: string): Promise<StoredConversation | null> {
    await this.init();
    if (!this.db) return null;
    if (!this.db.objectStoreNames.contains('conversations')) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('conversations', 'readonly');
        const store = tx.objectStore('conversations');
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as StoredConversation) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async saveConversation(conv: StoredConversation): Promise<void> {
    await this.init();
    if (!this.db) return;
    if (!this.db.objectStoreNames.contains('conversations')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const req = store.put(conv);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.init();
    if (!this.db) return;
    if (!this.db.objectStoreNames.contains('conversations')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearAllConversations(): Promise<void> {
    await this.init();
    if (!this.db) return;
    if (!this.db.objectStoreNames.contains('conversations')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('conversations', 'readwrite');
        const store = tx.objectStore('conversations');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── MEMORY ITEMS ──────

  async upsertMemoryItem(item: MemoryItem): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('memory_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('memory_items', 'readwrite');
        const store = tx.objectStore('memory_items');
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getMemoryItems(type?: MemoryType): Promise<MemoryItem[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('memory_items')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('memory_items', 'readonly');
        const store = tx.objectStore('memory_items');
        const req = type ? store.index('type').getAll(type) : store.getAll();
        req.onsuccess = () => resolve((req.result as MemoryItem[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async deleteMemoryItem(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('memory_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('memory_items', 'readwrite');
        const store = tx.objectStore('memory_items');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async clearAllMemories(): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('memory_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('memory_items', 'readwrite');
        const store = tx.objectStore('memory_items');
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── TASKS ──────

  async upsertTask(task: ProductivityTask): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('tasks')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.put(task);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getTasks(status?: 'todo' | 'in_progress' | 'done'): Promise<ProductivityTask[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('tasks')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('tasks', 'readonly');
        const store = tx.objectStore('tasks');
        const req = status ? store.index('status').getAll(status) : store.getAll();
        req.onsuccess = () => resolve((req.result as ProductivityTask[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async deleteTask(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('tasks')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('tasks', 'readwrite');
        const store = tx.objectStore('tasks');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── AUTOMATIONS ──────

  async upsertAutomation(rule: AutomationRule): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('automations')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('automations', 'readwrite');
        const store = tx.objectStore('automations');
        const req = store.put(rule);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getAutomations(): Promise<AutomationRule[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('automations')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('automations', 'readonly');
        const store = tx.objectStore('automations');
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as AutomationRule[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async deleteAutomation(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('automations')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('automations', 'readwrite');
        const store = tx.objectStore('automations');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── TELEMETRY RECORDS ──────

  async saveTelemetryRecord(record: TelemetryRecord): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('telemetry_records')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('telemetry_records', 'readwrite');
        const store = tx.objectStore('telemetry_records');
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getRecentTelemetryRecords(limit: number = 60): Promise<TelemetryRecord[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('telemetry_records')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('telemetry_records', 'readonly');
        const store = tx.objectStore('telemetry_records');
        const req = store.getAll();
        req.onsuccess = () => {
          const results = (req.result as TelemetryRecord[]) || [];
          results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          resolve(results.slice(-limit));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  // ────── FOLLOW-UP ITEMS ──────

  async upsertFollowUp(item: FollowUpItem): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('followup_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('followup_items', 'readwrite');
        const store = tx.objectStore('followup_items');
        const req = store.put(item);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getFollowUps(status?: 'pending' | 'resolved' | 'all'): Promise<FollowUpItem[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('followup_items')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('followup_items', 'readonly');
        const store = tx.objectStore('followup_items');
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as FollowUpItem[]) || [];
          if (!status || status === 'all') {
            resolve(all);
          } else {
            resolve(all.filter((f) => f.status === status));
          }
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async deleteFollowUp(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('followup_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('followup_items', 'readwrite');
        const store = tx.objectStore('followup_items');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── GOAL ITEMS ──────

  async upsertGoal(goal: GoalItem): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('goal_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('goal_items', 'readwrite');
        const store = tx.objectStore('goal_items');
        const req = store.put(goal);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getGoals(status?: 'active' | 'completed' | 'paused' | 'all'): Promise<GoalItem[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('goal_items')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('goal_items', 'readonly');
        const store = tx.objectStore('goal_items');
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as GoalItem[]) || [];
          if (!status || status === 'all') {
            resolve(all);
          } else {
            resolve(all.filter((g) => g.status === status));
          }
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getGoalById(id: string): Promise<GoalItem | null> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('goal_items')) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('goal_items', 'readonly');
        const store = tx.objectStore('goal_items');
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as GoalItem) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async deleteGoal(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('goal_items')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('goal_items', 'readwrite');
        const store = tx.objectStore('goal_items');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── CLEANUP PROPOSALS ──────

  async saveCleanupProposal(proposal: CleanupProposal): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('cleanup_proposals')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('cleanup_proposals', 'readwrite');
        const store = tx.objectStore('cleanup_proposals');
        const req = store.put(proposal);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getCleanupProposals(): Promise<CleanupProposal[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('cleanup_proposals')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('cleanup_proposals', 'readonly');
        const store = tx.objectStore('cleanup_proposals');
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as CleanupProposal[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  // ────── COMMITMENTS ──────

  async saveCommitment(commitment: StoredCommitment): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('commitments')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('commitments', 'readwrite');
        const store = tx.objectStore('commitments');
        const req = store.put(commitment);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async saveCommitments(commitments: StoredCommitment[]): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('commitments') || commitments.length === 0) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('commitments', 'readwrite');
        const store = tx.objectStore('commitments');
        for (const item of commitments) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getCommitment(id: string): Promise<StoredCommitment | null> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('commitments')) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('commitments', 'readonly');
        const store = tx.objectStore('commitments');
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as StoredCommitment) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async getCommitments(status?: CommitmentStatus): Promise<StoredCommitment[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('commitments')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('commitments', 'readonly');
        const store = tx.objectStore('commitments');
        const req = status ? store.index('status').getAll(status) : store.getAll();
        req.onsuccess = () => {
          const items = (req.result as StoredCommitment[]) || [];
          items.sort((a, b) => new Date(a.dueAt || a.createdAt).getTime() - new Date(b.dueAt || b.createdAt).getTime());
          resolve(items);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async updateCommitmentStatus(id: string, status: CommitmentStatus): Promise<void> {
    const existing = await this.getCommitment(id);
    if (!existing) return;
    existing.status = status;
    existing.updatedAt = new Date().toISOString();
    await this.saveCommitment(existing);
  }

  async deleteCommitment(id: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('commitments')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('commitments', 'readwrite');
        const store = tx.objectStore('commitments');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── CONNECTOR CONFIGS ──────

  async saveConnectorConfig(config: StoredConnectorConfig): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_configs')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('connector_configs', 'readwrite');
        const store = tx.objectStore('connector_configs');
        const req = store.put(config);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getConnectorConfig(id: string): Promise<StoredConnectorConfig | null> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_configs')) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('connector_configs', 'readonly');
        const store = tx.objectStore('connector_configs');
        const req = store.get(id);
        req.onsuccess = () => resolve((req.result as StoredConnectorConfig) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async getConnectorConfigs(): Promise<StoredConnectorConfig[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_configs')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('connector_configs', 'readonly');
        const store = tx.objectStore('connector_configs');
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as StoredConnectorConfig[]) || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  // ────── CONNECTOR TOKENS ──────

  async saveConnectorToken(token: StoredConnectorToken): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_tokens')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('connector_tokens', 'readwrite');
        const store = tx.objectStore('connector_tokens');
        const req = store.put(token);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getConnectorToken(connectorId: string): Promise<StoredConnectorToken | null> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_tokens')) return null;
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('connector_tokens', 'readonly');
        const store = tx.objectStore('connector_tokens');
        const req = store.get(connectorId);
        req.onsuccess = () => resolve((req.result as StoredConnectorToken) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async deleteConnectorToken(connectorId: string): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('connector_tokens')) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('connector_tokens', 'readwrite');
        const store = tx.objectStore('connector_tokens');
        const req = store.delete(connectorId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  // ────── COMMUNICATION ITEMS ──────

  async saveCommunicationItems(items: StoredCommunicationItem[]): Promise<void> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('communication_items') || items.length === 0) return;
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db!.transaction('communication_items', 'readwrite');
        const store = tx.objectStore('communication_items');
        for (const item of items) {
          store.put(item);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }

  async getCommunicationItems(options?: { source?: string; limit?: number }): Promise<StoredCommunicationItem[]> {
    await this.init();
    if (!this.db || !this.db.objectStoreNames.contains('communication_items')) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction('communication_items', 'readonly');
        const store = tx.objectStore('communication_items');
        const req = options?.source
          ? store.index('source').getAll(options.source)
          : store.getAll();
        req.onsuccess = () => {
          let list = (req.result as StoredCommunicationItem[]) || [];
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          if (options?.limit && options.limit > 0) {
            list = list.slice(0, options.limit);
          }
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async searchCommunicationItems(query: string, limit: number = 20): Promise<StoredCommunicationItem[]> {
    const all = await this.getCommunicationItems();
    const qLower = query.toLowerCase().trim();
    if (!qLower) return all.slice(0, limit);

    return all
      .filter((item) => {
        const contentMatch = item.content.toLowerCase().includes(qLower);
        const subjectMatch = item.subject?.toLowerCase().includes(qLower);
        const senderMatch = item.sender?.name.toLowerCase().includes(qLower);
        return contentMatch || subjectMatch || senderMatch;
      })
      .slice(0, limit);
  }
}

export const db = new LocalDatabase();
