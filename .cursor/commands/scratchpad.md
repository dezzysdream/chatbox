## Chat Feature Architecture & Flow Summary

### Layers
- **UI Layer**: Renders chat view, input, and handles submit triggers.
- **State/Store Layer**: Manages settings, sessions, current session, and toasts.
- **Service Layer**: Calls LLM API and streams responses.
- **Platform (Electron)**: Hosts renderer, preload bridge, theme updates.

### Key Modules
- **UI**: `src/devtools/App.tsx`
  - Renders message list and `MessageInput`.
  - Wires `onSubmit` to append user message, add assistant placeholder, and call `generate`.
- **Message Rendering**: `src/devtools/Block.tsx`
  - Displays each `Message` (Markdown rendered to HTML).
- **Types/Factories**: `src/devtools/types.ts`
  - `Message`, `Session`, `createMessage`, `createSession`.
- **Store/State**: `src/devtools/store.ts`
  - `updateChatSession`, `createEmptyChatSession`, toasts.
- **Service**: `src/devtools/client.ts`
  - `replay` posts to `${settings.apiHost}/v1/chat/completions`, streams tokens, returns full text.
- **Electron Host**: `src/index.ts`, `src/preload.ts`
  - Window creation, CSP, devtools, theme events exposed via preload.

### Send Message Flow
1. User types in `MessageInput` and presses Enter or clicks SEND.
2. `MessageInput.submit` prevents default, validates, and calls `onSubmit` with a new user `Message`.
3. `Main.onSubmit` appends user message + assistant placeholder, updates store, calls `generate`.
4. `generate` calls `client.replay` to stream assistant content; updates the placeholder via store.
5. UI re-renders with updated messages; assistant content streams live.

### Event Wiring
- Enter-to-send: `TextField.onKeyDown` → `submit()`.
- Button-to-send: `<form onSubmit={submit}>` + `<Button type='submit'>`.

### Current Validation Issue
- `MessageInput.submit` checks `messageInput.length === 0` only; whitespace-only strings pass and create empty-looking messages.

### Proposed Fix (Input Boundary)
- In `MessageInput.submit` (in `src/devtools/App.tsx`):
  - `const trimmed = messageInput.trim()`
  - `if (trimmed.length === 0) return;`
  - `props.onSubmit(createMessage('user', trimmed))`
  - `setMessageInput('')`

### Impact
- Blocks whitespace-only messages consistently for both Enter and button submits.
- No changes required to `onSubmit`, store, or service layers.

### QA Checklist (Manual)
- Whitespace-only input (spaces): press Enter → no message added.
- Whitespace-only input (tabs/newlines via Shift+Enter): SEND/Enter → no message added.
- Leading/trailing spaces: type `  hello  ` → message saved/displayed as `hello`.
- Internal spaces preserved: type `hello   world` → renders with 3 spaces.
- Both paths: verify with Enter and with SEND button.
- Normal flow: send a regular prompt and confirm assistant streams a response.

### Notes for Future Automated Tests
- Component-level test for `MessageInput.submit`:
  - Given input `"   "` → onSubmit not called.
  - Given input `"  hi  "` → onSubmit called with `"hi"`.
- Render test for `Block` with `whiteSpace: 'pre-wrap'`:
  - Given content `"hello   world"` → DOM text includes 3 spaces.

