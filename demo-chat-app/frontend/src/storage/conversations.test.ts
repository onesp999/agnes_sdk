import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createConversation, createMessage } from "../features/conversations/model.js";
import { createConversationStore } from "./conversations.js";

describe("conversation IndexedDB store", () => {
  it("persists, restores, and sorts conversations", async () => {
    const factory = new IDBFactory();
    const store = await createConversationStore(factory);
    const older = {
      ...createConversation(new Date("2026-08-25T08:00:00.000Z"), "older"),
      messages: [createMessage("user", "Old", { id: "m1" })],
    };
    const newer = createConversation(new Date("2026-08-25T09:00:00.000Z"), "newer");

    await store.put(older);
    await store.put(newer);
    await store.setCurrentId("older");

    expect(store.kind).toBe("indexeddb");
    expect((await store.list()).map((item) => item.id)).toEqual(["newer", "older"]);
    expect(await store.get("older")).toEqual(older);
    expect(await store.getCurrentId()).toBe("older");
    store.close();
  });

  it("persists optional reasoning and rejects non-string reasoning records", async () => {
    const factory = new IDBFactory();
    const store = await createConversationStore(factory);
    const withReasoning = {
      ...createConversation(new Date("2026-08-25T08:00:00.000Z"), "reasoning"),
      messages: [{
        ...createMessage("assistant", "Answer", { id: "a1" }),
        reasoningContent: "Reasoning",
      }],
    };
    const invalid = {
      ...createConversation(new Date("2026-08-25T09:00:00.000Z"), "invalid"),
      messages: [{
        ...createMessage("assistant", "Answer", { id: "a2" }),
        reasoningContent: 42,
      }],
    };

    await store.put(withReasoning);
    await putRaw(factory, invalid);

    expect(await store.get("reasoning")).toEqual(withReasoning);
    expect(await store.get("invalid")).toBeUndefined();
    store.close();
  });

  it("deletes only the requested conversation", async () => {
    const store = await createConversationStore(new IDBFactory());
    await store.put(createConversation(new Date("2026-08-25T08:00:00.000Z"), "keep"));
    await store.put(createConversation(new Date("2026-08-25T09:00:00.000Z"), "delete"));

    await store.delete("delete");

    expect((await store.list()).map((item) => item.id)).toEqual(["keep"]);
    store.close();
  });

  it("ignores corrupted records", async () => {
    const factory = new IDBFactory();
    const store = await createConversationStore(factory);
    await store.put(createConversation(new Date("2026-08-25T08:00:00.000Z"), "valid"));
    await putRaw(factory, { id: "broken", title: "Broken", messages: "not-an-array" });

    expect((await store.list()).map((item) => item.id)).toEqual(["valid"]);
    expect(await store.get("broken")).toBeUndefined();
    store.close();
  });

  it("falls back to an in-memory store when IndexedDB is unavailable", async () => {
    const store = await createConversationStore(null);
    const conversation = createConversation(new Date("2026-08-25T08:00:00.000Z"), "memory");

    await store.put(conversation);
    await store.setCurrentId(conversation.id);

    expect(store.kind).toBe("memory");
    expect(await store.get("memory")).toEqual(conversation);
    expect(await store.getCurrentId()).toBe("memory");
  });
});

function putRaw(factory: IDBFactory, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open("agnes-studio", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("conversations", "readwrite");
      transaction.objectStore("conversations").put(value);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}
