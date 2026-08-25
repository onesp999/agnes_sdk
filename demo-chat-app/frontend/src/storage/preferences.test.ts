import { describe, expect, it } from "vitest";
import { defaultSettings } from "../types/settings.js";
import { loadPreferences, PREFERENCES_KEY, savePreferences } from "./preferences.js";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("Studio preferences", () => {
  it("round-trips whitelisted product preferences", () => {
    const storage = memoryStorage();
    savePreferences({
      developerMode: true,
      settings: {
        ...defaultSettings,
        model: "agnes-image-2.1-flash",
        systemPrompt: " concise ",
        imageSize: "1024x768",
        videoAspectRatio: "1:1",
        videoDurationSeconds: "3",
        advanced: JSON.stringify({ seed: 7 }),
      },
    }, storage);

    expect(loadPreferences(storage)).toEqual({
      developerMode: true,
      settings: {
        ...defaultSettings,
        model: "agnes-image-2.1-flash",
        systemPrompt: " concise ",
        imageSize: "1024x768",
        videoAspectRatio: "1:1",
        videoDurationSeconds: "3",
      },
    });
  });

  it("does not persist advanced JSON or unknown secret fields", () => {
    const storage = memoryStorage();
    savePreferences({
      developerMode: true,
      settings: { ...defaultSettings, advanced: JSON.stringify({ apiKey: "never-store" }) },
    }, storage);
    const raw = storage.getItem(PREFERENCES_KEY) ?? "";

    expect(raw).not.toContain("never-store");
    expect(loadPreferences(storage).settings.advanced).toBe("{}");
  });

  it("falls back safely for corrupt data", () => {
    const storage = memoryStorage();
    storage.setItem(PREFERENCES_KEY, "not-json");
    expect(loadPreferences(storage)).toEqual({ developerMode: false, settings: defaultSettings });
  });
});
