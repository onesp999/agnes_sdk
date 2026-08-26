import { sortConversations } from "../features/conversations/model.js";
import type { Conversation, Message } from "../types/conversation.js";

const DATABASE_NAME = "agnes-studio";
const DATABASE_VERSION = 1;
const CONVERSATION_STORE = "conversations";
const METADATA_STORE = "metadata";
const CURRENT_CONVERSATION_KEY = "currentConversationId";

export interface ConversationStore {
  readonly kind: "indexeddb" | "memory";
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation | undefined>;
  put(conversation: Conversation): Promise<void>;
  delete(id: string): Promise<void>;
  getCurrentId(): Promise<string | undefined>;
  setCurrentId(id: string): Promise<void>;
  close(): void;
}

export async function createConversationStore(
  factory: IDBFactory | null | undefined = globalThis.indexedDB,
): Promise<ConversationStore> {
  if (!factory) return new MemoryConversationStore();
  try {
    return new IndexedDbConversationStore(await openDatabase(factory));
  } catch {
    return new MemoryConversationStore();
  }
}

class IndexedDbConversationStore implements ConversationStore {
  readonly kind = "indexeddb" as const;

  constructor(private readonly database: IDBDatabase) {}

  async list(): Promise<Conversation[]> {
    const values = await requestResult<unknown[]>(
      this.database.transaction(CONVERSATION_STORE).objectStore(CONVERSATION_STORE).getAll(),
    );
    return sortConversations(values.filter(isConversation));
  }

  async get(id: string): Promise<Conversation | undefined> {
    const value = await requestResult<unknown>(
      this.database.transaction(CONVERSATION_STORE).objectStore(CONVERSATION_STORE).get(id),
    );
    return isConversation(value) ? value : undefined;
  }

  async put(conversation: Conversation): Promise<void> {
    if (!isConversation(conversation)) throw new TypeError("Invalid conversation record.");
    const transaction = this.database.transaction(CONVERSATION_STORE, "readwrite");
    transaction.objectStore(CONVERSATION_STORE).put(conversation);
    await transactionDone(transaction);
  }

  async delete(id: string): Promise<void> {
    const transaction = this.database.transaction(CONVERSATION_STORE, "readwrite");
    transaction.objectStore(CONVERSATION_STORE).delete(id);
    await transactionDone(transaction);
  }

  async getCurrentId(): Promise<string | undefined> {
    const value = await requestResult<unknown>(
      this.database.transaction(METADATA_STORE).objectStore(METADATA_STORE).get(CURRENT_CONVERSATION_KEY),
    );
    return isMetadata(value) && typeof value.value === "string" ? value.value : undefined;
  }

  async setCurrentId(id: string): Promise<void> {
    const transaction = this.database.transaction(METADATA_STORE, "readwrite");
    transaction.objectStore(METADATA_STORE).put({ key: CURRENT_CONVERSATION_KEY, value: id });
    await transactionDone(transaction);
  }

  close(): void {
    this.database.close();
  }
}

class MemoryConversationStore implements ConversationStore {
  readonly kind = "memory" as const;
  private readonly conversations = new Map<string, Conversation>();
  private currentId?: string;

  async list(): Promise<Conversation[]> {
    return sortConversations([...this.conversations.values()].map(cloneConversation));
  }

  async get(id: string): Promise<Conversation | undefined> {
    const value = this.conversations.get(id);
    return value ? cloneConversation(value) : undefined;
  }

  async put(conversation: Conversation): Promise<void> {
    if (!isConversation(conversation)) throw new TypeError("Invalid conversation record.");
    this.conversations.set(conversation.id, cloneConversation(conversation));
  }

  async delete(id: string): Promise<void> {
    this.conversations.delete(id);
  }

  async getCurrentId(): Promise<string | undefined> {
    return this.currentId;
  }

  async setCurrentId(id: string): Promise<void> {
    this.currentId = id;
  }

  close(): void {}
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CONVERSATION_STORE)) {
        const store = database.createObjectStore(CONVERSATION_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function isConversation(value: unknown): value is Conversation {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.title === "string"
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt)
    && Array.isArray(value.messages)
    && value.messages.every(isMessage);
}

function isMessage(value: unknown): value is Message {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string"
    || (value.role !== "user" && value.role !== "assistant")
    || typeof value.content !== "string"
    || !["pending", "streaming", "completed", "failed", "cancelled"].includes(String(value.status))
    || !isIsoDate(value.createdAt)) {
    return false;
  }
  if (value.media !== undefined && (!isRecord(value.media)
    || (value.media.kind !== "image" && value.media.kind !== "video")
    || typeof value.media.url !== "string")) {
    return false;
  }
  return ["model", "reasoningContent", "videoId", "videoModel", "videoStatus"]
    .every((key) => value[key] === undefined || typeof value[key] === "string");
}

function isMetadata(value: unknown): value is { key: string; value: unknown } {
  return isRecord(value) && typeof value.key === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function cloneConversation(conversation: Conversation): Conversation {
  return structuredClone(conversation);
}
