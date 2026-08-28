import type { Conversation, Message, MessageStatus } from "../../types/conversation.js";

export const NEW_CONVERSATION_TITLE = "新对话";

export interface ConversationGroup {
  label: "今天" | "昨天" | "更早";
  conversations: Conversation[];
}

export function createConversation(
  now = new Date(),
  id = createLocalId(),
): Conversation {
  const timestamp = now.toISOString();
  return {
    id,
    title: NEW_CONVERSATION_TITLE,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  };
}

export function isReusableNewConversation(conversation: Conversation): boolean {
  return conversation.title === NEW_CONVERSATION_TITLE && conversation.messages.length === 0;
}

export function createMessage(
  role: Message["role"],
  content: string,
  options: {
    id?: string;
    now?: Date;
    status?: MessageStatus;
    model?: string;
  } = {},
): Message {
  return {
    id: options.id ?? createLocalId(),
    role,
    content,
    status: options.status ?? "completed",
    createdAt: (options.now ?? new Date()).toISOString(),
    ...(options.model ? { model: options.model } : {}),
  };
}

export function appendMessage(
  conversation: Conversation,
  message: Message,
  now = new Date(),
): Conversation {
  const shouldCreateTitle = conversation.title === NEW_CONVERSATION_TITLE
    && message.role === "user"
    && !conversation.messages.some((item) => item.role === "user");
  return {
    ...conversation,
    title: shouldCreateTitle ? titleFromMessage(message.content) : conversation.title,
    updatedAt: now.toISOString(),
    messages: [...conversation.messages, message],
  };
}

export function updateMessage(
  conversation: Conversation,
  messageId: string,
  update: (message: Message) => Message,
  now = new Date(),
): Conversation {
  let changed = false;
  const messages = conversation.messages.map((message) => {
    if (message.id !== messageId) return message;
    changed = true;
    return update(message);
  });
  return changed ? { ...conversation, messages, updatedAt: now.toISOString() } : conversation;
}

export function restartAssistantTurn(
  conversation: Conversation,
  assistantId: string,
  now = new Date(),
): Conversation {
  const index = conversation.messages.findIndex((message) => message.id === assistantId);
  const assistant = conversation.messages[index];
  if (!assistant || assistant.role !== "assistant") {
    throw new RangeError("Assistant message was not found.");
  }
  const reset: Message = {
    id: assistant.id,
    role: "assistant",
    content: "",
    status: "pending",
    createdAt: now.toISOString(),
    ...(assistant.model ? { model: assistant.model } : {}),
  };
  return {
    ...conversation,
    messages: [...conversation.messages.slice(0, index), reset],
    updatedAt: now.toISOString(),
  };
}

export function editUserAndCreateAssistant(
  conversation: Conversation,
  userId: string,
  content: string,
  assistant: Message,
  now = new Date(),
): Conversation {
  const index = conversation.messages.findIndex((message) => message.id === userId);
  const user = conversation.messages[index];
  const normalized = content.trim();
  if (!user || user.role !== "user") throw new RangeError("User message was not found.");
  if (!normalized) throw new RangeError("User message cannot be empty.");
  if (assistant.role !== "assistant") throw new RangeError("A pending assistant message is required.");

  const wasAutomaticTitle = conversation.title === NEW_CONVERSATION_TITLE
    || conversation.title === titleFromMessage(user.content);
  const updatedUser = { ...user, content: normalized, createdAt: now.toISOString() };
  return {
    ...conversation,
    title: wasAutomaticTitle ? titleFromMessage(normalized) : conversation.title,
    messages: [...conversation.messages.slice(0, index), updatedUser, assistant],
    updatedAt: now.toISOString(),
  };
}

export function generationContext(
  conversation: Conversation,
  assistantId: string,
): Array<{ role: "user" | "assistant"; content: string }> {
  const index = conversation.messages.findIndex((message) => message.id === assistantId);
  if (index < 0) throw new RangeError("Assistant message was not found.");
  return conversation.messages
    .slice(0, index)
    .filter((message) => message.status === "completed" && message.content.trim())
    .map(({ role, content }) => ({ role, content }));
}

export function markInterruptedMessages(conversation: Conversation, now = new Date()): Conversation {
  let changed = false;
  const messages = conversation.messages.map((message) => {
    if (message.status !== "pending" && message.status !== "streaming") return message;
    if (message.videoId && message.videoStatus !== "completed" && message.videoStatus !== "failed") {
      return message;
    }
    changed = true;
    return {
      ...message,
      status: "cancelled" as const,
      content: message.content || "生成已因页面刷新而停止。",
    };
  });
  return changed ? { ...conversation, messages, updatedAt: now.toISOString() } : conversation;
}

export function renameConversation(
  conversation: Conversation,
  title: string,
  now = new Date(),
): Conversation {
  const normalized = title.trim();
  if (!normalized) throw new RangeError("Conversation title cannot be empty.");
  return { ...conversation, title: normalized.slice(0, 80), updatedAt: now.toISOString() };
}

export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function groupConversations(
  conversations: Conversation[],
  now = new Date(),
): ConversationGroup[] {
  const todayStart = startOfDay(now).getTime();
  const yesterday = startOfDay(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = yesterday.getTime();
  const groups = new Map<ConversationGroup["label"], Conversation[]>();
  for (const conversation of sortConversations(conversations)) {
    const updated = new Date(conversation.updatedAt).getTime();
    const label = updated >= todayStart ? "今天" : updated >= yesterdayStart ? "昨天" : "更早";
    const items = groups.get(label) ?? [];
    items.push(conversation);
    groups.set(label, items);
  }
  return (["今天", "昨天", "更早"] as const)
    .filter((label) => groups.has(label))
    .map((label) => ({ label, conversations: groups.get(label)! }));
}

function titleFromMessage(content: string): string {
  const compact = content.trim().replace(/\s+/g, " ");
  return compact.length > 32 ? `${compact.slice(0, 32)}…` : compact || NEW_CONVERSATION_TITLE;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
