# Voice Chat Feature - System Design Document

## Overview

This document describes the architecture and implementation of the real-time voice chat feature in Chatbox, which enables users to have spoken conversations with OpenAI's GPT-4o model using the Realtime API.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Renderer Process (React)                      │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │ Microphone  │───>│ AudioContext │───>│ ScriptProcessorNode   │  │
│  │ getUserMedia│    │ (24kHz)      │    │ (PCM16 conversion)    │  │
│  └─────────────┘    └──────────────┘    └───────────┬───────────┘  │
│                                                      │              │
│                                          base64 audio│              │
│                                                      ▼              │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────────┐  │
│  │ Speaker     │<───│ AudioContext │<───│ Audio Queue           │  │
│  │ Playback    │    │ (24kHz)      │    │ (PCM16 -> Float32)    │  │
│  └─────────────┘    └──────────────┘    └───────────▲───────────┘  │
│                                                      │              │
│                                          base64 audio│              │
│  ┌──────────────────────────────────────────────────┴───────────┐  │
│  │                    IPC Bridge (window.api.realtime)           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Main Process (Electron)                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    WebSocket Client (ws)                      │  │
│  │  - Manages connections to OpenAI Realtime API                 │  │
│  │  - Sets Authorization headers                                 │  │
│  │  - Routes messages between renderer and API                   │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket (wss://)
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenAI Realtime API                               │
│  - Model: gpt-4o-realtime-preview-2024-12-17                        │
│  - Server-side VAD (Voice Activity Detection)                        │
│  - Streaming audio input/output                                      │
│  - Real-time transcription                                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Main Process WebSocket Handler (`src/index.ts`)

The main process handles WebSocket connections because Electron's renderer process cannot set custom HTTP headers on WebSocket connections, which is required for OpenAI API authentication.

**Key Functions:**
- `realtime:connect` - Creates WebSocket connection with auth headers
- `realtime:send` - Sends messages to OpenAI
- `realtime:close` - Closes connection
- Event forwarding to renderer via IPC

**Connection Management:**
```typescript
const realtimeConnections = new Map<string, WebSocket>();
let connectionIdCounter = 0;
```

Each connection is tracked with a unique ID, allowing multiple simultaneous connections if needed.

### 2. Preload Script IPC Bridge (`src/preload.ts`)

Exposes the realtime API to the renderer process via `contextBridge`:

```typescript
window.api.realtime = {
    connect: (apiKey, model) => ipcRenderer.invoke('realtime:connect', ...),
    send: (connectionId, data) => ipcRenderer.invoke('realtime:send', ...),
    close: (connectionId) => ipcRenderer.invoke('realtime:close', ...),
    onMessage: (callback) => { /* IPC listener */ },
    onClose: (callback) => { /* IPC listener */ },
    onError: (callback) => { /* IPC listener */ },
}
```

### 3. Voice Chat Modal (`src/devtools/App.tsx` - MessageInput component)

The UI component that orchestrates the voice chat experience.

**State Management:**
```typescript
const [isRecording, setIsRecording] = useState(false)
const [voiceModalOpen, setVoiceModalOpen] = useState(false)
const [transcripts, setTranscripts] = useState<Array<{role, text}>>([])
const [currentTranscript, setCurrentTranscript] = useState('')
const [audioLevel, setAudioLevel] = useState(0)
```

**Refs for Audio Resources:**
```typescript
const audioContextRef = useRef<AudioContext | null>(null)      // Capture context
const playbackContextRef = useRef<AudioContext | null>(null)   // Playback context
const processorRef = useRef<ScriptProcessorNode | null>(null)  // Audio processing
const audioQueueRef = useRef<Int16Array[]>([])                 // Playback queue
```

## Data Flow

### Audio Capture Pipeline

1. **Microphone Access**
   ```typescript
   navigator.mediaDevices.getUserMedia({ audio: true })
   ```

2. **AudioContext Creation** (24kHz sample rate to match OpenAI requirements)
   ```typescript
   new AudioContext({ sampleRate: 24000 })
   ```

3. **Audio Processing Chain**
   ```
   MediaStream -> MediaStreamSource -> ScriptProcessorNode
   ```

4. **PCM16 Conversion** (Float32 to Int16)
   ```typescript
   const s = Math.max(-1, Math.min(1, inputData[i]));
   pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
   ```

5. **Base64 Encoding & Transmission**
   ```typescript
   const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
   window.api.realtime.send(connId, JSON.stringify({
       type: 'input_audio_buffer.append',
       audio: base64,
   }));
   ```

### Audio Playback Pipeline

1. **Receive Audio Delta Event**
   ```typescript
   event.type === 'response.audio.delta'
   ```

2. **Base64 Decode to PCM16**
   ```typescript
   const binaryString = atob(event.delta);
   const pcm16 = new Int16Array(bytes.buffer);
   ```

3. **Queue Audio Chunk**
   ```typescript
   audioQueueRef.current.push(pcm16);
   ```

4. **Convert PCM16 to Float32 & Play**
   ```typescript
   const float32 = new Float32Array(pcm16.length);
   for (let i = 0; i < pcm16.length; i++) {
       float32[i] = pcm16[i] / 32768;
   }
   // Create AudioBuffer and play
   ```

## OpenAI Realtime API Protocol

### Session Configuration

```typescript
{
    type: 'session.update',
    session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a helpful assistant...',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
        },
    },
}
```

### Key Event Types

| Event Type | Direction | Description |
|------------|-----------|-------------|
| `input_audio_buffer.append` | Client → Server | Send audio chunk |
| `response.audio.delta` | Server → Client | Receive audio chunk |
| `response.audio_transcript.delta` | Server → Client | Streaming transcript |
| `response.audio_transcript.done` | Server → Client | Final transcript |
| `conversation.item.input_audio_transcription.completed` | Server → Client | User speech transcription |

### Server-side VAD (Voice Activity Detection)

OpenAI's server automatically detects:
- When the user starts speaking
- When the user stops speaking (after `silence_duration_ms`)
- Triggers response generation automatically

## Security Considerations

### Electron Permissions

```typescript
// Main process permission handlers
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audio'];
    callback(allowedPermissions.includes(permission));
});
```

### API Key Handling

- API key is passed from settings store to the renderer
- Transmitted to main process via IPC for WebSocket header injection
- Never exposed in client-side WebSocket URL

## Resource Management

### Cleanup on Stop

```typescript
// Stop animation frame
cancelAnimationFrame(animationRef.current);

// Disconnect audio nodes
processorRef.current.disconnect();
audioContextRef.current.close();

// Stop microphone
micStream.getTracks().forEach(track => track.stop());

// Clear playback
audioQueueRef.current = [];
playbackContextRef.current.close();

// Close WebSocket
window.api.realtime.close(connectionId);
```

## UI/UX Design

### Modal Layout

```
┌─────────────────────────────────────┐
│ Voice Chat              [====]      │  <- Title + Audio Level
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ You                             │ │  <- User message (blue bg)
│ │ Hello, how are you?             │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Assistant                       │ │  <- AI message (default bg)
│ │ I'm doing well, thank you!      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Click Start to begin voice chat     │  <- Placeholder when empty
│                                     │
├─────────────────────────────────────┤
│      [Start]  [Close]               │  <- Action buttons
└─────────────────────────────────────┘
```

### Visual Feedback

1. **Audio Level Meter** - Real-time visualization of microphone input
2. **Streaming Transcript** - Italicized text while AI is speaking
3. **Button States** - Start (blue) / Stop (red) toggle

## Implementation Steps (Incremental Build)

The feature was built incrementally in testable steps:

1. **Step 1**: Add microphone button (UI only)
2. **Step 2**: Request microphone permission on click
3. **Step 3**: Toggle recording state with visual feedback
4. **Step 4**: Display real-time audio level meter
5. **Step 5**: Connect to OpenAI Realtime API via WebSocket
6. **Step 6**: Send audio data and receive responses
7. **Step 7**: Play back AI audio responses
8. **Step 8**: Create modal with conversation transcript

## Future Enhancements

Potential improvements for future iterations:

1. **Interrupt Handling** - Allow user to interrupt AI mid-response
2. **Error Recovery** - Auto-reconnect on connection drop
3. **Voice Selection** - UI to choose different AI voices
4. **Export Conversation** - Save voice chat to main chat history
5. **Push-to-Talk Mode** - Alternative to VAD-based detection
6. **Audio Visualization** - Waveform or spectrum display
7. **Noise Suppression** - Client-side audio preprocessing

## Dependencies

- **Electron** - Desktop application framework
- **ws** - WebSocket client for Node.js (main process)
- **Web Audio API** - Browser audio processing
- **MediaDevices API** - Microphone access
- **Material-UI** - React component library

## File Structure

```
src/
├── index.ts              # Main process + WebSocket handler
├── preload.ts            # IPC bridge for realtime API
└── devtools/
    └── App.tsx           # MessageInput component with voice modal
```
