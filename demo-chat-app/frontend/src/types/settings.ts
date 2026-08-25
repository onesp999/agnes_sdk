export type RequestSettings = {
  model: string;
  systemPrompt: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  imageSize: string;
  imageResponseFormat: "url" | "b64_json";
  imageReference: string;
  videoAspectRatio: "16:9" | "9:16" | "1:1";
  videoDurationSeconds: "3" | "5";
  advanced: string;
};

export const defaultSettings: RequestSettings = {
  model: "agnes-2.0-flash",
  systemPrompt: "",
  temperature: "",
  topP: "",
  maxTokens: "",
  imageSize: "1024x1024",
  imageResponseFormat: "url",
  imageReference: "",
  videoAspectRatio: "16:9",
  videoDurationSeconds: "5",
  advanced: "{}",
};
