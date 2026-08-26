export type MessageStatus = "pending" | "streaming" | "completed" | "failed" | "cancelled";

export interface MessageMedia {
  kind: "image" | "video";
  url: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningContent?: string;
  status: MessageStatus;
  model?: string;
  createdAt: string;
  media?: MessageMedia;
  videoId?: string;
  videoModel?: string;
  videoStatus?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}
