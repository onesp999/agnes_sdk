import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  markInterruptedMessages,
  renameConversation,
  sortConversations,
} from "./model.js";
import { createConversationStore, type ConversationStore } from "../../storage/conversations.js";
import type { Conversation } from "../../types/conversation.js";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [storageKind, setStorageKind] = useState<ConversationStore["kind"]>("indexeddb");
  const conversationsRef = useRef<Conversation[]>([]);
  const storeRef = useRef<ConversationStore>();

  const commit = useCallback((next: Conversation[]) => {
    const sorted = sortConversations(next);
    conversationsRef.current = sorted;
    setConversations(sorted);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let openedStore: ConversationStore | undefined;

    void (async () => {
      const store = await createConversationStore();
      openedStore = store;
      const stored = await store.list();
      const restored = stored.map((conversation) => markInterruptedMessages(conversation));
      await Promise.all(restored.flatMap((conversation, index) =>
        conversation === stored[index] ? [] : [store.put(conversation)]));
      const restoredCurrentId = await store.getCurrentId();
      if (cancelled) {
        store.close();
        return;
      }

      storeRef.current = store;
      setStorageKind(store.kind);
      let next = restored;
      if (next.length === 0) {
        const empty = createConversation();
        next = [empty];
        await store.put(empty);
      }
      const selectedId = restoredCurrentId && next.some((item) => item.id === restoredCurrentId)
        ? restoredCurrentId
        : next[0]!.id;
      await store.setCurrentId(selectedId);
      if (cancelled) return;
      commit(next);
      setActiveId(selectedId);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      openedStore?.close();
      if (storeRef.current === openedStore) storeRef.current = undefined;
    };
  }, [commit]);

  const createNew = useCallback(() => {
    const conversation = createConversation();
    commit([conversation, ...conversationsRef.current]);
    setActiveId(conversation.id);
    void storeRef.current?.put(conversation);
    void storeRef.current?.setCurrentId(conversation.id);
    return conversation;
  }, [commit]);

  const select = useCallback((id: string) => {
    if (!conversationsRef.current.some((conversation) => conversation.id === id)) return;
    setActiveId(id);
    void storeRef.current?.setCurrentId(id);
  }, []);

  const update = useCallback((
    id: string,
    updater: (conversation: Conversation) => Conversation,
  ): Conversation | undefined => {
    const current = conversationsRef.current.find((conversation) => conversation.id === id);
    if (!current) return undefined;
    const updated = updater(current);
    commit(conversationsRef.current.map((conversation) => conversation.id === id ? updated : conversation));
    void storeRef.current?.put(updated);
    return updated;
  }, [commit]);

  const rename = useCallback((id: string, title: string) => {
    update(id, (conversation) => renameConversation(conversation, title));
  }, [update]);

  const remove = useCallback((id: string) => {
    const remaining = conversationsRef.current.filter((conversation) => conversation.id !== id);
    if (remaining.length === conversationsRef.current.length) return;
    let next = remaining;
    if (next.length === 0) {
      const empty = createConversation();
      next = [empty];
      void storeRef.current?.put(empty);
    }
    commit(next);
    void storeRef.current?.delete(id);

    const selectedId = activeId === id || !next.some((conversation) => conversation.id === activeId)
      ? next[0]!.id
      : activeId;
    setActiveId(selectedId);
    void storeRef.current?.setCurrentId(selectedId);
  }, [activeId, commit]);

  return {
    conversations,
    activeConversation: conversations.find((conversation) => conversation.id === activeId),
    activeId,
    ready,
    storageKind,
    createNew,
    select,
    update,
    rename,
    remove,
  };
}
