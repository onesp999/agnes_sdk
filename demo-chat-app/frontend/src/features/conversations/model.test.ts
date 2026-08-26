import { describe, expect, it } from "vitest";
import {
  appendMessage,
  createConversation,
  createMessage,
  editUserAndCreateAssistant,
  generationContext,
  groupConversations,
  markInterruptedMessages,
  renameConversation,
  restartAssistantTurn,
  sortConversations,
  updateMessage,
} from "./model.js";

describe("conversation model", () => {
  it("creates an empty version-one-compatible conversation", () => {
    const conversation = createConversation(new Date("2026-08-25T08:00:00.000Z"), "conversation-1");

    expect(conversation).toEqual({
      id: "conversation-1",
      title: "新对话",
      createdAt: "2026-08-25T08:00:00.000Z",
      updatedAt: "2026-08-25T08:00:00.000Z",
      messages: [],
    });
  });

  it("uses the first user message as the title and updates timestamps", () => {
    const original = createConversation(new Date("2026-08-25T08:00:00.000Z"), "conversation-1");
    const message = createMessage("user", "  A useful first question  ", {
      id: "message-1",
      now: new Date("2026-08-25T08:01:00.000Z"),
    });

    const updated = appendMessage(original, message, new Date("2026-08-25T08:02:00.000Z"));

    expect(updated.title).toBe("A useful first question");
    expect(updated.updatedAt).toBe("2026-08-25T08:02:00.000Z");
    expect(updated.messages).toEqual([message]);
    expect(original.messages).toEqual([]);
  });

  it("renames and updates only the selected message", () => {
    const first = createMessage("user", "Question", { id: "one" });
    const second = { ...createMessage("assistant", "Answer", { id: "two" }), reasoningContent: "Internal notes" };
    const conversation = { ...createConversation(), messages: [first, second] };
    const renamed = renameConversation(conversation, "  Project notes  ");
    const updated = updateMessage(renamed, "two", (message) => ({
      ...message,
      status: "failed",
    }));

    expect(updated.title).toBe("Project notes");
    expect(updated.messages[0]).toEqual(first);
    expect(updated.messages[1]?.status).toBe("failed");
  });

  it("sorts by updatedAt and groups today, yesterday, and older", () => {
    const now = new Date(2026, 7, 25, 12);
    const conversations = [
      { ...createConversation(new Date(2026, 7, 20), "old"), updatedAt: new Date(2026, 7, 20).toISOString() },
      { ...createConversation(new Date(2026, 7, 25, 9), "today"), updatedAt: new Date(2026, 7, 25, 9).toISOString() },
      { ...createConversation(new Date(2026, 7, 24, 18), "yesterday"), updatedAt: new Date(2026, 7, 24, 18).toISOString() },
    ];

    expect(sortConversations(conversations).map((item) => item.id)).toEqual(["today", "yesterday", "old"]);
    expect(groupConversations(conversations, now).map((group) => [
      group.label,
      group.conversations.map((item) => item.id),
    ])).toEqual([
      ["今天", ["today"]],
      ["昨天", ["yesterday"]],
      ["更早", ["old"]],
    ]);
  });

  it("restarts an assistant turn without duplicating the user message", () => {
    const messages = [
      createMessage("user", "First", { id: "u1" }),
      { ...createMessage("assistant", "Old answer", { id: "a1" }), reasoningContent: "Old reasoning" },
      createMessage("user", "Later branch", { id: "u2" }),
    ];
    const conversation = { ...createConversation(), messages };

    const restarted = restartAssistantTurn(conversation, "a1", new Date("2026-08-25T10:00:00.000Z"));

    expect(restarted.messages.map((message) => message.id)).toEqual(["u1", "a1"]);
    expect(restarted.messages[1]).toMatchObject({ content: "", status: "pending" });
    expect(restarted.messages[1]?.reasoningContent).toBeUndefined();
    expect(generationContext(restarted, "a1")).toEqual([{ role: "user", content: "First" }]);
  });

  it("keeps reasoning out of the next generation context", () => {
    const conversation = {
      ...createConversation(),
      messages: [
        createMessage("user", "First", { id: "u1" }),
        {
          ...createMessage("assistant", "Visible answer", { id: "a1" }),
          reasoningContent: "Private reasoning",
        },
        createMessage("user", "Follow-up", { id: "u2" }),
        createMessage("assistant", "", { id: "a2", status: "pending" }),
      ],
    };

    expect(generationContext(conversation, "a2")).toEqual([
      { role: "user", content: "First" },
      { role: "assistant", content: "Visible answer" },
      { role: "user", content: "Follow-up" },
    ]);
  });

  it("edits a user message and removes the later branch", () => {
    const user = createMessage("user", "Original question", { id: "u1" });
    const oldAssistant = createMessage("assistant", "Old answer", { id: "a1" });
    const pending = createMessage("assistant", "", { id: "a2", status: "pending" });
    const conversation = {
      ...createConversation(),
      title: "Original question",
      messages: [user, oldAssistant],
    };

    const edited = editUserAndCreateAssistant(conversation, "u1", "Edited question", pending);

    expect(edited.title).toBe("Edited question");
    expect(edited.messages.map((message) => [message.id, message.content])).toEqual([
      ["u1", "Edited question"],
      ["a2", ""],
    ]);
  });

  it("marks interrupted generations as cancelled on restore", () => {
    const conversation = {
      ...createConversation(),
      messages: [
        createMessage("user", "Question", { id: "u1" }),
        createMessage("assistant", "Partial", { id: "a1", status: "streaming" }),
        createMessage("assistant", "", { id: "a2", status: "pending" }),
      ],
    };

    const restored = markInterruptedMessages(conversation);

    expect(restored.messages[1]).toMatchObject({ content: "Partial", status: "cancelled" });
    expect(restored.messages[2]).toMatchObject({ content: "生成已因页面刷新而停止。", status: "cancelled" });
  });

  it("keeps resumable video tasks active on restore", () => {
    const video = {
      ...createMessage("assistant", "状态：queued", { id: "video", status: "streaming" }),
      videoId: "video-1",
      videoStatus: "queued",
    };
    const conversation = { ...createConversation(), messages: [video] };

    expect(markInterruptedMessages(conversation)).toBe(conversation);
  });
});
