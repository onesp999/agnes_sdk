import { defaultSettings, type RequestSettings } from "../types/settings.js";

export const PREFERENCES_KEY = "agnes-studio:preferences:v1";

export interface StudioPreferences {
  developerMode: boolean;
  settings: RequestSettings;
}

export function loadPreferences(storage: Storage | undefined = safeLocalStorage()): StudioPreferences {
  if (!storage) return defaults();
  try {
    const parsed = JSON.parse(storage.getItem(PREFERENCES_KEY) ?? "null") as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.settings)) return defaults();
    const settings = parsed.settings;
    return {
      developerMode: parsed.developerMode === true,
      settings: {
        model: stringValue(settings.model, defaultSettings.model, 200),
        systemPrompt: stringValue(settings.systemPrompt, "", 8_000),
        temperature: stringValue(settings.temperature, "", 20),
        topP: stringValue(settings.topP, "", 20),
        maxTokens: stringValue(settings.maxTokens, "", 20),
        imageSize: stringValue(settings.imageSize, defaultSettings.imageSize, 30),
        imageResponseFormat: settings.imageResponseFormat === "b64_json" ? "b64_json" : "url",
        imageReference: stringValue(settings.imageReference, "", 8_000),
        videoAspectRatio: settings.videoAspectRatio === "9:16" || settings.videoAspectRatio === "1:1"
          ? settings.videoAspectRatio
          : "16:9",
        videoDurationSeconds: settings.videoDurationSeconds === "3" ? "3" : "5",
        advanced: "{}",
      },
    };
  } catch {
    return defaults();
  }
}

export function savePreferences(
  preferences: StudioPreferences,
  storage: Storage | undefined = safeLocalStorage(),
): void {
  if (!storage) return;
  const { settings } = preferences;
  const safe: StudioPreferences = {
    developerMode: preferences.developerMode,
    settings: {
      model: settings.model.slice(0, 200),
      systemPrompt: settings.systemPrompt.slice(0, 8_000),
      temperature: settings.temperature.slice(0, 20),
      topP: settings.topP.slice(0, 20),
      maxTokens: settings.maxTokens.slice(0, 20),
      imageSize: settings.imageSize.slice(0, 30),
      imageResponseFormat: settings.imageResponseFormat,
      imageReference: settings.imageReference.slice(0, 8_000),
      videoAspectRatio: settings.videoAspectRatio,
      videoDurationSeconds: settings.videoDurationSeconds,
      advanced: "{}",
    },
  };
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(safe));
  } catch {
    // Preferences must not block the product flow.
  }
}

function defaults(): StudioPreferences {
  return { developerMode: false, settings: { ...defaultSettings } };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown, fallback: string, maximumLength: number): string {
  return typeof value === "string" ? value.slice(0, maximumLength) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
