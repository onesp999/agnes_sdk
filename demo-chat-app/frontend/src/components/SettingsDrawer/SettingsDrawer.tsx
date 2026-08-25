import { useEffect, useRef } from "react";
import { advancedHelp, modelPresetGroups } from "../../features/settings/model.js";
import type { ModelKind } from "../../features/settings/model.js";
import { defaultSettings, type RequestSettings } from "../../types/settings.js";
import { Icon } from "../Icon/Icon.js";

type SettingsDrawerProps = {
  open: boolean;
  modelKind: ModelKind;
  selectedPreset: string;
  settings: RequestSettings;
  developerMode: boolean;
  onClose(): void;
  onToggleDeveloper(): void;
  onReset(settings: RequestSettings): void;
  onUpdate<Key extends keyof RequestSettings>(key: Key, value: RequestSettings[Key]): void;
};

export function SettingsDrawer({
  open,
  modelKind,
  selectedPreset,
  settings,
  developerMode,
  onClose,
  onToggleDeveloper,
  onReset,
  onUpdate,
}: SettingsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const advancedError = developerMode ? validateAdvancedJson(settings.advanced) : "";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return <>
    <button className="settings-scrim" type="button" aria-label="关闭设置" onClick={onClose} />
    <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header><div><span>Workspace settings</span><strong id="settings-title">设置</strong><small>调整产品偏好与当前创作默认值</small></div><button ref={closeRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭请求参数"><Icon name="x" /></button></header>
      <div className="settings-content">
        <section className="settings-section">
          <div className="settings-section-heading"><strong>创作默认值</strong><small>高频选项也可以直接在 Composer 中调整</small></div>
          <div className="settings-grid">
            <label className="wide">模型预设<select value={selectedPreset} onChange={(event) => {
              if (event.target.value !== "custom") onUpdate("model", event.target.value);
            }}>
              {modelPresetGroups.map((group) => <optgroup label={group.label} key={group.label}>
                {group.models.map((model) => <option value={model} key={model}>{model}</option>)}
              </optgroup>)}
              {developerMode && <option value="custom">自定义模型</option>}
            </select></label>
            {modelKind === "chat" ? <>
              <label>Temperature<input type="number" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => onUpdate("temperature", event.target.value)} placeholder="模型默认" /></label>
              <label>Top P<input type="number" min="0" max="1" step="0.05" value={settings.topP} onChange={(event) => onUpdate("topP", event.target.value)} placeholder="模型默认" /></label>
              <label className="wide">Max tokens<input type="number" min="1" max="1000000" step="1" value={settings.maxTokens} onChange={(event) => onUpdate("maxTokens", event.target.value)} placeholder="模型默认" /></label>
              <label className="wide">System Prompt<textarea rows={4} value={settings.systemPrompt} onChange={(event) => onUpdate("systemPrompt", event.target.value)} placeholder="可选，例如：请用简洁的中文回答。" maxLength={8000} /></label>
            </> : modelKind === "image" ? <>
              <label>图片尺寸<select value={settings.imageSize} onChange={(event) => onUpdate("imageSize", event.target.value)}>
                <option value="1024x1024">1024 × 1024</option><option value="1024x768">1024 × 768</option><option value="768x1024">768 × 1024</option>
              </select></label>
              <label>输出格式<select value={settings.imageResponseFormat} onChange={(event) => onUpdate("imageResponseFormat", event.target.value as RequestSettings["imageResponseFormat"])}>
                <option value="url">URL</option><option value="b64_json">Base64</option>
              </select></label>
              <label className="wide">参考图片 URL<input type="url" value={settings.imageReference} onChange={(event) => onUpdate("imageReference", event.target.value)} placeholder="可选，https://…" /></label>
            </> : <>
              <label>画面比例<select value={settings.videoAspectRatio} onChange={(event) => onUpdate("videoAspectRatio", event.target.value as RequestSettings["videoAspectRatio"])}>
                <option value="16:9">16:9 横屏</option><option value="9:16">9:16 竖屏</option><option value="1:1">1:1 方形</option>
              </select></label>
              <label>视频时长<select value={settings.videoDurationSeconds} onChange={(event) => onUpdate("videoDurationSeconds", event.target.value as RequestSettings["videoDurationSeconds"])}>
                <option value="3">3 秒</option><option value="5">5 秒</option>
              </select></label>
            </>}
          </div>
        </section>

        <section className="settings-section developer-section">
          <div className="developer-toggle">
            <div><span>Developer layer</span><strong>Developer Mode</strong><small>自定义模型、Advanced JSON 与 SDK diagnostics</small></div>
            <button type="button" role="switch" aria-checked={developerMode} onClick={onToggleDeveloper}>{developerMode ? "已开启" : "未开启"}</button>
          </div>
          {developerMode && <div className="developer-fields">
            <label>模型名称（可自定义）<input value={settings.model} onChange={(event) => onUpdate("model", event.target.value)} placeholder="agnes-2.0-flash" maxLength={200} /></label>
            <label>Advanced JSON<textarea className="advanced-json" rows={8} spellCheck={false} value={settings.advanced} onChange={(event) => onUpdate("advanced", event.target.value)} aria-label="高级 JSON 参数" aria-invalid={Boolean(advancedError)} aria-describedby="advanced-json-help" /></label>
            {advancedError && <p className="field-error" role="alert">{advancedError}</p>}
            <small id="advanced-json-help">{advancedHelp(modelKind)}</small>
          </div>}
        </section>
      </div>
      <footer><button type="button" onClick={() => onReset(defaultSettings)}>恢复默认</button><span>{settings.model.trim() || "模型默认值"}</span></footer>
    </section>
  </>;
}

function validateAdvancedJson(value: string): string {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? "" : "Advanced JSON 必须是 JSON 对象。";
  } catch {
    return "Advanced JSON 不是有效的 JSON。";
  }
}
