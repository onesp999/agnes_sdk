# Contract: Agnes Studio local conversations

## Purpose

Persist local conversations and restore the current selection without adding a
cloud database or storing server credentials.

## Data model

```ts
interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  model?: string;
  createdAt: string;
  media?: { kind: "image" | "video"; url: string };
  videoId?: string;
  videoModel?: string;
  videoStatus?: string;
}
```

Dates are ISO-8601 strings. IDs are opaque strings generated locally.

## Storage

- Database: `agnes-studio`, version 1.
- `conversations` store: key path `id`, one complete `Conversation` per record,
  with an `updatedAt` index.
- `metadata` store: key/value records; `currentConversationId` stores the active
  selection.
- List results are sorted by descending `updatedAt`.
- Invalid records are ignored rather than returned or used to overwrite valid
  data.
- If IndexedDB cannot be opened, the app falls back to a process-local in-memory
  store for the current page lifetime.

## Operations

- Create an empty conversation safely.
- Put/get/list a conversation.
- Delete exactly one conversation by ID.
- Set/get the current conversation ID.
- Rename with a non-empty trimmed title.
- Append/update messages and advance `updatedAt`.

Deleting the active conversation selects the newest remaining conversation. If
none remains, the app creates a new empty conversation.

## Side effects

Allowed:

- Write conversation and selection records to local IndexedDB.
- Focus the composer after creating or switching a conversation.

Forbidden:

- Network or cloud persistence.
- Persisting API keys, `Authorization`, server secrets, or request headers.
- Deleting or rewriting unrelated conversations.

## Compatibility

This is schema version 1. Future schema changes must use an IndexedDB version
upgrade and preserve or explicitly migrate valid version-1 records.
