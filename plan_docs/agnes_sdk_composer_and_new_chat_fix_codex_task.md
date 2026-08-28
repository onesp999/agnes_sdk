# Codex Task

## Project

`agnes_sdk`

## Task

修复 `demo-chat-app` 两个前端交互问题：

1. Composer 输入长文本自动增高后，发送 / 清空 draft 时没有恢复默认高度。
2. “新对话”按钮会无条件创建新的空 Conversation；如果已经存在可复用的新会话，应直接切换到该会话，而不是继续创建重复空会话。

---

## Goal

### Goal A — Composer Auto-Resize Reset

保持现有 textarea 自动增高能力，同时让高度与 `draft` 状态同步。

期望：

```text
短文本
→ 默认高度

长文本
→ 自动增高
→ 最大 208px

发送
→ draft 清空
→ textarea 恢复默认高度
```

程序化修改 draft 的路径也必须正确同步高度，包括：

```text
newChat()
switchConversation()
reusePrompt()
send()
```

### Goal B — Reuse Existing New Conversation

点击“新对话”时：

```text
已经存在可复用的新会话
→ 选中该会话
→ 不创建新 Conversation
→ 不新增 IndexedDB 记录

不存在可复用的新会话
→ 创建新的 Conversation
→ 选中
→ 持久化
```

如果当前本身已经是可复用的新会话：

```text
点击“新对话”
→ 保持该会话
→ 不生成第二个空会话
→ 清空 composer draft
→ 聚焦输入框
```

---

## Non-Goals

本次明确不做：

- 不重构整个 Composer。
- 不修改 textarea 的最大高度设计。
- 不调整 Composer 视觉样式。
- 不引入 autosize 第三方依赖。
- 不修改 Chat / Image / Video API。
- 不修改 Thinking Block。
- 不重构 Conversation 数据模型。
- 不新增 `isNew` / `isDraft` / `isEmpty` 持久化字段。
- 不修改 IndexedDB schema / version。
- 不自动删除用户历史中已经存在的重复空会话。
- 不批量清理历史 Conversation。
- 不修改会话自动标题生成逻辑。
- 不做需求外 UI 重构。

---

# Repository Context

## Relevant Files

优先检查：

```text
demo-chat-app/frontend/src/App.tsx
demo-chat-app/frontend/src/App.conversations.test.tsx
demo-chat-app/frontend/src/features/conversations/useConversations.ts
demo-chat-app/frontend/src/features/conversations/model.ts
demo-chat-app/frontend/src/features/conversations/model.test.ts
demo-chat-app/frontend/src/styles.css
```

必要时检查：

```text
demo-chat-app/frontend/src/storage/conversations.ts
```

但本任务原则上不需要修改 storage schema。

---

# Confirmed Current Behavior

## Composer

当前 `App.tsx`：

```ts
function resizeComposer(target: HTMLTextAreaElement) {
  target.style.height = "auto";
  target.style.height = `${Math.min(target.scrollHeight, 208)}px`;
}
```

textarea 只在用户输入时调用：

```tsx
onChange={(event) => {
  setDraft(event.target.value);
  resizeComposer(event.target);
}}
```

发送成功后则只是：

```ts
setDraft("");
```

因此：

```text
draft value 被 React 清空
但 DOM style.height 保留旧值
```

导致长输入发送以后 Composer 仍然保持大高度。

当前 CSS：

```css
.composer textarea {
  min-height: 38px;
  max-height: 208px;
  resize: none;
  overflow-y: auto;
}
```

CSS 上限设计本身没有问题。

---

## New Conversation

当前 `App.newChat()`：

```ts
function newChat() {
  if (!conversationState.ready) return;
  conversationState.createNew();
  setDraft("");
  inputRef.current?.focus();
}
```

当前 `useConversations.createNew()`：

```text
每次调用
→ createConversation()
→ commit 新数组
→ setActiveId(new id)
→ store.put(new conversation)
→ store.setCurrentId(new id)
```

没有检查当前是否已经存在一个未使用的新会话。

因此连续点击：

```text
新对话
新对话
新对话
```

会持续产生新的空 Conversation。

---

# Definition: Reusable New Conversation

本任务不要只通过：

```text
title === "新对话"
```

判断。

因为标题属于展示信息，也允许被重命名。

推荐定义一个纯派生 predicate，例如：

```ts
isReusableNewConversation(conversation)
```

至少满足：

```text
conversation.messages.length === 0
```

并结合项目现有默认新会话语义，优先要求：

```text
conversation.title === NEW_CONVERSATION_TITLE
```

即：

```text
messages.length === 0
AND
title === NEW_CONVERSATION_TITLE
```

理由：

- 仅标题判断：可能误判被手动命名为“新对话”的已有 Conversation。
- 仅 messages 为空：可能抢占用户手动重命名但暂未发送消息的空 Conversation。
- 两个条件同时满足，更接近“系统自动创建但尚未使用的 pristine 新会话”。

如果真实代码存在更明确的 pristine / draft 语义，以真实代码为准。

不要为了本需求新增持久化状态字段。

---

# Required Behavior

## Part A — Composer Height

### A1. Height Follows Draft

textarea 高度必须成为 `draft` 的派生 UI 状态，而不是只响应用户 `onChange`。

以下所有情况都必须触发正确重算：

```text
用户输入
setDraft("")
setDraft(longText)
新建会话
切换会话
复用 Prompt
发送成功
```

### A2. Send Resets Height

```text
Given textarea 因长文本已增高
When 用户发送消息
Then draft 清空
And textarea 恢复默认高度
```

不允许继续保留发送前的 inline `style.height`。

### A3. Auto Grow Remains

继续保持：

```text
target.style.height = "auto"
target.style.height = min(scrollHeight, 208px)
```

或真实代码中的等价实现。

### A4. Max Height Remains

长文本超过上限：

```text
height <= 208px
overflow-y: auto
```

不修改现有最大高度。

### A5. Programmatic Draft Write

`reusePrompt(message)`：

```text
setDraft(message.content)
```

如果 message 很长，textarea 必须自动扩展。

不能因为去掉 `onChange` resize 而破坏这个路径。

### A6. New / Switch Conversation

`newChat()` 和 `switchConversation()` 当前都会：

```ts
setDraft("");
```

清空后 Composer 必须自动恢复默认高度。

---

# Part B — New Conversation Reuse

## B1. No Existing Reusable Conversation

```text
Given 所有 Conversation 都已有内容或不满足 pristine 条件
When 用户点击“新对话”
Then 创建一个新的 Conversation
And 选中新 Conversation
And 持久化该 Conversation
```

保持当前正常创建行为。

## B2. Current Conversation Already Pristine

```text
Given 当前 active Conversation 是 reusable new conversation
When 用户再次点击“新对话”
Then 不创建新的 Conversation
And active Conversation id 不发生无意义变化
And Conversation 数量不增加
And draft 被清空
And textarea 获得 focus
```

## B3. Another Reusable Conversation Exists

例如：

```text
Conversation A
- 已有聊天消息
- 当前 active

Conversation B
- messages = []
- title = NEW_CONVERSATION_TITLE
```

点击“新对话”：

```text
→ 选择 Conversation B
→ 不创建 Conversation C
```

## B4. Existing Conversation Becomes Active

复用已有新会话时需要：

```text
setActiveId(existing.id)
store.setCurrentId(existing.id)
```

不要：

```text
store.put(new duplicate)
```

没有新 Conversation 时才进行 `put()`。

## B5. createNew Return Semantics

如果现有调用方依赖 `createNew()` 返回 Conversation，则：

```text
新建时
→ 返回新 Conversation

复用时
→ 返回被复用的 Conversation
```

不要让返回类型因为本修复变成不一致。

## B6. Use Current Sorted State

`conversationsRef.current` 当前由 `commit()` 保持排序。

如果历史数据已经意外存在多个 pristine 空会话：

- 本任务不要删除它们；
- 选择一个确定性的已有会话即可；
- 优先使用当前排序中的第一个匹配项，即最近更新/最靠前的匹配 Conversation；
- 不再创建新的第 N+1 个重复空会话。

这是兼容历史 bug 的安全行为，不是数据清理。

## B7. Renamed Empty Conversation

例如：

```text
messages = []
title = "待处理的问题"
```

默认不要把它当作系统可复用的新会话。

点击“新对话”时可以创建真正的：

```text
title = NEW_CONVERSATION_TITLE
messages = []
```

避免用户手工命名的空 Conversation 被无意复用。

## B8. Populated Conversation Named "新对话"

例如用户手动将一个有消息的 Conversation 重命名为：

```text
新对话
```

不能被误认为 reusable new conversation。

必须因为：

```text
messages.length > 0
```

而排除。

---

# Recommended Implementation

## 1. Composer

推荐将 autosize 逻辑统一为：

```text
draft change
→ inputRef.current
→ height = auto
→ height = min(scrollHeight, 208px)
```

在 React DOM 已经同步 `value` 后执行。

可根据真实环境选择：

```ts
useEffect
```

或：

```ts
useLayoutEffect
```

如果普通 `useEffect` 已能稳定读取更新后的 `scrollHeight`，优先保持简单。

采用 draft-driven resize 后，应评估是否删除：

```tsx
resizeComposer(event.target)
```

避免同时维护：

```text
onChange DOM resize
+
draft effect resize
```

两套来源。

推荐最终形成：

```text
draft
=
textarea value 唯一状态源

textarea height
=
draft 的派生 UI 状态
```

不要在：

```text
send()
newChat()
switchConversation()
reusePrompt()
```

分别写四套 height reset/resize 补丁。

---

## 2. Conversation

优先在 Conversation 状态层修复，而不是只在 `App.newChat()` 判断。

也就是：

```text
useConversations.createNew()
```

自身保证：

```text
存在 reusable Conversation
→ select/reuse

不存在
→ create
```

原因：

- 保证未来其他调用者调用 `createNew()` 时语义一致；
- 避免 UI 层与状态层出现两套新会话规则；
- persistence 行为集中在 hook 内。

推荐把 pristine 判定做成一个小的纯逻辑函数。

可以放在：

```text
features/conversations/model.ts
```

例如语义：

```text
isReusableNewConversation(conversation)
```

这样可直接在：

```text
model.test.ts
```

覆盖边界。

如果 Codex 判断单独导出 helper 反而增加无价值接口，也可以在 `useConversations.ts` 内保持小型局部函数，并通过 App 集成测试覆盖。

不要新增数据库字段。

---

# Implementation Plan

## Step 1 — Inspect

确认真实代码：

```text
App.tsx
useConversations.ts
model.ts
App.conversations.test.tsx
model.test.ts
styles.css
```

与执行单描述一致。

---

## Step 2 — Fix Composer Autosize

调整 `App.tsx`：

1. 保留现有 resize algorithm。
2. 让 resize 在 `draft` 更新后统一执行。
3. 长文本继续增高。
4. `draft === ""` 时恢复默认高度。
5. `reusePrompt()` 的长文本自动重算。
6. 评估并删除 `onChange` 中重复 autosize。

不要修改 CSS 的 `208px` 上限。

---

## Step 3 — Define Reusable Conversation

实现清晰的 pristine 判定：

```text
messages.length === 0
AND
title === NEW_CONVERSATION_TITLE
```

不要只检查 title。

---

## Step 4 — Change createNew Semantics

调整：

```text
useConversations.createNew()
```

逻辑：

```text
const reusable = find existing pristine conversation

if reusable:
    setActiveId(reusable.id)
    store.setCurrentId(reusable.id)
    return reusable

else:
    const conversation = createConversation()
    commit(...)
    setActiveId(conversation.id)
    store.put(conversation)
    store.setCurrentId(conversation.id)
    return conversation
```

保持 `App.newChat()`：

```text
create/reuse conversation
clear draft
focus textarea
```

不要让 App 自己扫描 conversations。

---

## Step 5 — Tests

补充 Composer 和 Conversation 的自动化测试。

优先复用现有：

```text
App.conversations.test.tsx
model.test.ts
```

不要建立新的大型测试框架。

---

## Step 6 — Verify

运行：

```bash
cd demo-chat-app
npm test
npm run build
```

---

# BDD Scenarios

## Scenario 1 — Long Composer Resets After Send

```gherkin
Given the composer contains a long draft
And the textarea has expanded
When the user sends the message
Then the draft should become empty
And the textarea should return to its default height
```

## Scenario 2 — Long Composer Still Expands

```gherkin
Given the composer is at its default height
When the user enters a long multiline draft
Then the textarea should expand
And its height should not exceed 208px
```

## Scenario 3 — Reused Prompt Recalculates Height

```gherkin
Given the composer is empty
When a long previous prompt is reused
Then the textarea should expand to match the new draft
```

## Scenario 4 — Repeated New Chat Does Not Create Duplicates

```gherkin
Given the active conversation is a pristine empty new conversation
When the user clicks New Chat multiple times
Then the conversation count should remain unchanged
And the same empty conversation should remain available
```

## Scenario 5 — Existing Empty New Conversation Is Reused

```gherkin
Given the active conversation already contains messages
And another pristine empty new conversation exists
When the user clicks New Chat
Then the existing empty conversation should become active
And no additional conversation should be created
```

## Scenario 6 — New Conversation Is Created When Needed

```gherkin
Given no pristine empty new conversation exists
When the user clicks New Chat
Then exactly one new conversation should be created
And it should become active
```

## Scenario 7 — Renamed Empty Conversation Is Not Hijacked

```gherkin
Given an empty conversation has been manually renamed
And no default pristine new conversation exists
When the user clicks New Chat
Then a new default conversation should be created
And the renamed conversation should remain unchanged
```

## Scenario 8 — Populated "新对话" Is Not Reused

```gherkin
Given a conversation contains messages
And its title is "新对话"
When the user clicks New Chat
Then that populated conversation should not qualify as reusable
```

---

# Suggested Tests

## Composer Integration Tests

在：

```text
frontend/src/App.conversations.test.tsx
```

增加合适测试。

jsdom 默认不会真实布局，必要时：

```text
mock textarea.scrollHeight
```

例如根据 textarea value 返回：

```text
empty / short → default scrollHeight
long → larger scrollHeight
```

不要用真实浏览器 layout 作为单元测试依赖。

至少验证：

```text
long draft
→ style.height increases

submit
→ value === ""
→ style.height returns to default-sized result
```

以及：

```text
reuse long prompt
→ height recalculated
```

---

## New Conversation Integration Tests

### Test A

应用首次启动已有一个系统自动创建的空 Conversation：

```text
click New Chat
click New Chat
```

验证：

```text
conversation row count 不增加
```

### Test B

```text
在初始 Conversation 发送一条消息
→ click New Chat
```

验证：

```text
新建 exactly one empty Conversation
```

再次点击：

```text
row count 不再增加
```

### Test C

```text
Conversation A 有消息
Conversation B pristine empty
切回 A
click New Chat
```

验证：

```text
B active
conversation count unchanged
```

### Test D

若方便通过现有 UI 测试实现：

```text
空 Conversation 被 rename
click New Chat
```

验证：

```text
renamed empty 保留
新的默认 Conversation 被创建
```

---

## Model Tests

如果新增：

```ts
isReusableNewConversation()
```

则在：

```text
features/conversations/model.test.ts
```

测试：

```text
default title + zero messages → true
custom title + zero messages → false
default title + messages → false
```

保持测试简单。

---

# Regression Requirements

必须确认以下现有行为不受影响：

```text
发送 Chat
发送 Image
发送 Video
Enter 发送
Shift+Enter 换行
会话切换
会话重命名
会话删除
会话持久化
Thinking Block
重新生成
复制消息
```

尤其不要让“复用空新会话”导致：

```text
已有 Conversation 被覆盖
已有消息被清空
已有 renamed Conversation 被重置
```

---

# Expected File Scope

预计主要修改：

```text
demo-chat-app/frontend/src/App.tsx
demo-chat-app/frontend/src/App.conversations.test.tsx
demo-chat-app/frontend/src/features/conversations/useConversations.ts
```

可能修改：

```text
demo-chat-app/frontend/src/features/conversations/model.ts
demo-chat-app/frontend/src/features/conversations/model.test.ts
```

原则上无需修改：

```text
demo-chat-app/frontend/src/styles.css
demo-chat-app/frontend/src/storage/conversations.ts
packages/javascript/
packages/python/
backend/
```

如果真实代码需要不同文件，以真实代码为准并说明。

---

# Constraints

- 只修这两个明确问题。
- 保持小 diff。
- 不新增依赖。
- 不新增持久化 Conversation 状态字段。
- 不升级 IndexedDB version。
- 不自动删除历史空 Conversation。
- 不做需求外重构。
- 不改变 textarea 最大高度。
- 不改变 API 请求。
- 不改变 Chat / Image / Video 功能。
- 不通过删测试、skip 或降低断言制造通过。
- 如果执行单与真实代码不一致，以真实代码为准，并在最终总结中说明差异。

---

# Verification Commands

在：

```bash
cd demo-chat-app
```

执行：

```bash
npm test
npm run build
```

必须报告真实结果。

---

# Done Criteria

## Composer

- [ ] 长文本仍能自动增高。
- [ ] 高度不超过现有 208px 上限。
- [ ] 发送后文本清空。
- [ ] 发送后 textarea 恢复默认高度。
- [ ] 新建/复用新会话后 draft 清空并恢复默认高度。
- [ ] 切换 Conversation 后 draft 清空并恢复默认高度。
- [ ] 复用长 Prompt 后 textarea 能重新增高。
- [ ] Enter / Shift+Enter 无回归。

## New Conversation

- [ ] 当前已有 pristine 新会话时，不再创建重复 Conversation。
- [ ] 其他位置已有 pristine 新会话时，点击“新对话”切换到该 Conversation。
- [ ] 不存在 reusable Conversation 时正常创建一个新 Conversation。
- [ ] 新建 Conversation 正常持久化。
- [ ] 复用 Conversation 只更新 currentId，不新增 duplicate storage record。
- [ ] 有消息的 Conversation 即使标题为“新对话”也不会被误复用。
- [ ] 手工重命名的空 Conversation 默认不会被系统抢占。
- [ ] 历史中已有重复空 Conversation 不被自动删除。
- [ ] 连续点击“新对话”不会继续累积空会话。

## Verification

- [ ] `npm test` 通过，或说明真实失败原因。
- [ ] `npm run build` 通过，或说明真实失败原因。
- [ ] 最终列出修改文件。
- [ ] 最终说明两个 bug 的 Root Cause。
- [ ] 最终说明行为验证结果。
- [ ] 最终说明与执行单的任何偏差。
- [ ] 最终说明剩余风险。

---

# Final Codex Response Requirements

完成后请输出：

```text
What Changed
- Composer:
- New conversation:

Root Cause
- Composer:
- New conversation:

Files Changed
- ...

Verification
- npm test: Passed / Failed
- npm run build: Passed / Failed

Behavior Verification
- long input autosize:
- send reset:
- programmatic draft resize:
- repeated New Chat dedupe:
- reuse existing pristine conversation:
- create when none exists:
- renamed empty conversation:
- persistence:

Deviations From Task
- None

Remaining Risks
- None / ...
```

不要只回复“已完成”，必须给出实际测试和 build 结果。
