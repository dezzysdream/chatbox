import React from 'react';
import './App.css';
import Block from './Block'
import * as client from './client'
import SessionItem from './SessionItem'
import {
    Toolbar, Box, Badge, Snackbar,
    List, ListSubheader, ListItemText, MenuList,
    IconButton, Button, Stack, Grid, MenuItem, ListItemIcon, Typography, Divider,
    TextField,
} from '@mui/material';
import { Session, createSession, Message, createMessage } from './types'
import ChatIcon from '@mui/icons-material/Chat';
import useStore, { openLink } from './store'
import SettingWindow from './SettingWindow'
import ChatConfigWindow from './ChatConfigWindow'
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import * as prompts from './prompts'
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import CleanWidnow from './CleanWindow';
import { ThemeSwitcherProvider } from './theme/ThemeSwitcher';
import MicIcon from '@mui/icons-material/Mic';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Paper from '@mui/material/Paper';

const { useEffect, useState } = React

function Main() {
    const store = useStore()

    // 是否展示设置窗口
    const [openSettingWindow, setOpenSettingWindow] = React.useState(false);
    useEffect(() => {
        if (store.needSetting) {
            setOpenSettingWindow(true)
        }
    }, [store.needSetting])

    // 是否展示应用更新提示
    const [needCheckUpdate, setNeedCheckUpdate] = useState(true)

    const [scrollToMsg, setScrollToMsg] = useState<{ msgId: string, smooth?: boolean }>(null)
    useEffect(() => {
        if (!scrollToMsg) {
            return
        }
        const container = document.getElementById('message-list')
        const element = document.getElementById(scrollToMsg.msgId)
        if (!container || !element) {
            return
        }
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isInsideLeft = elementRect.left >= containerRect.left;
        const isInsideRight = elementRect.right <= containerRect.right;
        const isInsideTop = elementRect.top >= containerRect.top;
        const isInsideBottom = elementRect.bottom <= containerRect.bottom;
        if (isInsideLeft && isInsideRight && isInsideTop && isInsideBottom) {
            return
        }
        // 平滑滚动
        element.scrollIntoView({
            behavior: scrollToMsg.smooth ? 'smooth' : 'auto',
            block: 'end',
            inline: 'nearest',
        })
        setScrollToMsg(null)
    }, [scrollToMsg])

    // 切换到当前会话，自动滚动到最后一条消息
    useEffect(() => {
        if (store.currentSession.messages.length === 0) {
            return
        }
        const last = store.currentSession.messages[store.currentSession.messages.length - 1]
        setScrollToMsg({ msgId: last.id, smooth: false })
    }, [store.currentSession])

    // 会话名称自动生成
    useEffect(() => {
        if (
            store.currentSession.name === 'Untitled'
            && store.currentSession.messages.findIndex(msg => msg.role === 'assistant') !== -1
        ) {
            generateName(store.currentSession)
        }
    }, [store.currentSession.messages])

    const [configureChatConfig, setConfigureChatConfig] = React.useState<Session | null>(null);

    const [sessionClean, setSessionClean] = React.useState<Session | null>(null);


    const generateName = async (session: Session) => {
        client.replay(
            store.settings.openaiKey,
            store.settings.apiHost,
            prompts.nameConversation(session.messages.slice(0, 3)),
            (name) => {
                name = name.replace(/['"""]/g, '')
                session.name = name
                store.updateChatSession(session)
            },
            (err) => {
                console.log(err)
            }
        )
    }

    const generate = async (session: Session, promptMsgs: Message[], targetMsg: Message) => {
        console.log('[generate] start', {
            sessionId: session.id,
            targetMsgId: targetMsg.id,
            promptCount: promptMsgs.length,
        })
        let streamStarted = false
        await client.replay(
            store.settings.openaiKey,
            store.settings.apiHost,
            promptMsgs,
            (text) => {
                if (!streamStarted) {
                    streamStarted = true
                    console.log('[generate] streaming response started', {
                        sessionId: session.id,
                        targetMsgId: targetMsg.id,
                    })
                }
                for (let i = 0; i < session.messages.length; i++) {
                    if (session.messages[i].id === targetMsg.id) {
                        session.messages[i] = {
                            ...session.messages[i],
                            content: text,
                        }
                        break
                    }
                }
                store.updateChatSession(session)
                setScrollToMsg({ msgId: targetMsg.id, smooth: false })
            },
            (err) => {
                console.error('[generate] OpenAI request failed', {
                    sessionId: session.id,
                    targetMsgId: targetMsg.id,
                    error: err.message,
                })
                for (let i = 0; i < session.messages.length; i++) {
                    if (session.messages[i].id === targetMsg.id) {
                        session.messages[i] = {
                            ...session.messages[i],
                            content: 'API Request Failed: \n```\n' + err.message + '\n```',
                        }
                        break
                    }
                }
                store.updateChatSession(session)
            }
        )
        console.log('[generate] completed', {
            sessionId: session.id,
            targetMsgId: targetMsg.id,
            hadStream: streamStarted,
        })
    }

    const [ messageInput, setMessageInput ] = useState('')
    useEffect(() => {
        document.getElementById('message-input')?.focus() // better way?
    }, [messageInput])

    return (
        <Box sx={{
            height: '100%',
            width: '100%',
        }}>
            <Grid container spacing={2} sx={{
                height: '100%',
            }}>
                <Grid item xs={3}
                    sx={{
                        height: '100%',
                    }}
                >
                    <Stack
                        sx={{
                            height: '100%',
                            padding: '20px 0',
                        }}
                        spacing={2}
                    >
                        <Toolbar variant="dense">
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
                                <ChatIcon />
                            </IconButton>
                            <Box>
                                <Typography variant="h5" color="inherit" component="div">
                                    ChatBox
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                    Prompt Lab
                                </Typography>
                            </Box>
                        </Toolbar>

                        <Divider />

                        <MenuList
                            sx={{
                                width: '100%',
                                // bgcolor: 'background.paper',
                                position: 'relative',
                                overflow: 'auto',
                                // height: '30vh',
                                height: '60vh',
                                '& ul': { padding: 0 },
                            }}
                            className="scroll"
                            subheader={
                                <ListSubheader component="div">
                                    CHAT
                                </ListSubheader>
                            }
                        >
                            {
                                store.chatSessions.map((session, ix) => (
                                    <SessionItem selected={store.currentSession.id === session.id}
                                        session={session}
                                        switchMe={() => {
                                            store.switchCurrentSession(session)
                                            document.getElementById('message-input')?.focus() // better way?
                                        }}
                                        deleteMe={() => store.deleteChatSession(session)}
                                        copyMe={() => {
                                            const newSession = createSession(session.name + ' Copyed')
                                            newSession.messages = session.messages
                                            store.createChatSession(newSession, ix)
                                        }}
                                        editMe={() => setConfigureChatConfig(session)}
                                    />
                                ))
                            }
                        </MenuList>

                        <Divider />

                        <MenuItem onClick={() => store.createEmptyChatSession()} >
                            <ListItemIcon>
                                <IconButton><AddIcon fontSize="small" /></IconButton>
                            </ListItemIcon>
                            <ListItemText>
                                New Chat
                            </ListItemText>
                            <Typography variant="body2" color="text.secondary">
                                {/* ⌘N */}
                            </Typography>
                        </MenuItem>
                        <MenuItem onClick={() => {
                            setOpenSettingWindow(true)
                        }}
                        >
                            <ListItemIcon>
                                <IconButton><SettingsIcon fontSize="small" /></IconButton>
                            </ListItemIcon>
                            <ListItemText>
                                Settings
                            </ListItemText>
                            <Typography variant="body2" color="text.secondary">
                                {/* ⌘N */}
                            </Typography>
                        </MenuItem>

                        <MenuItem onClick={() => {
                            setNeedCheckUpdate(false)
                            openLink('https://github.com/Bin-Huang/chatbox/releases')
                        }}>
                            <ListItemIcon>
                                <IconButton>
                                    <InfoOutlinedIcon fontSize="small" />
                                </IconButton>
                            </ListItemIcon>
                            <ListItemText>
                                <Badge color="primary" variant="dot" invisible={!needCheckUpdate} sx={{ paddingRight: '8px' }} >
                                    <Typography color="GrayText">
                                        Version: {store.version}
                                    </Typography>
                                </Badge>
                            </ListItemText>
                        </MenuItem>
                    </Stack>

                </Grid>
                <Grid item xs={9}
                    sx={{
                        height: '100%',
                    }}
                >
                    <Stack sx={{
                        height: '100%',
                        padding: '20px 0',
                    }} spacing={2}>
                        <Toolbar variant="dense">
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}>
                                <ChatBubbleOutlineOutlinedIcon />
                            </IconButton>
                            <Typography variant="h6" color="inherit" component="div" noWrap sx={{ flexGrow: 1 }}>
                                {store.currentSession.name}
                            </Typography>
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}
                                onClick={() => setSessionClean(store.currentSession)}
                            >
                                <CleaningServicesIcon />
                            </IconButton>
                        </Toolbar>
                        <Divider />
                        <List
                            id="message-list"
                            className='scroll'
                            sx={{
                                width: '100%',
                                height: '80%',
                                bgcolor: 'background.paper',
                                overflow: 'auto',
                                '& ul': { padding: 0 },
                            }}
                        >
                            {
                                store.currentSession.messages.map((msg, ix) => (
                                    <Block id={msg.id} key={msg.id} msg={msg}
                                        showWordCount={store.settings.showWordCount}
                                        showTokenCount={store.settings.showTokenCount}
                                        setMsg={(updated) => {
                                            store.currentSession.messages = store.currentSession.messages.map((m) => {
                                                if (m.id === updated.id) {
                                                    return updated
                                                }
                                                return m
                                            })
                                            store.updateChatSession(store.currentSession)
                                        }}
                                        delMsg={() => {
                                            store.currentSession.messages = store.currentSession.messages.filter((m) => m.id !== msg.id)
                                            store.updateChatSession(store.currentSession)
                                        }}
                                        refreshMsg={() => {
                                            if (msg.role === 'assistant') {
                                                const promptMsgs = store.currentSession.messages.slice(0, ix)
                                                generate(store.currentSession, promptMsgs, msg)
                                            } else {
                                                const promptsMsgs = store.currentSession.messages.slice(0, ix + 1)
                                                const newAssistantMsg = createMessage('assistant', '....')
                                                const newMessages = [...store.currentSession.messages]
                                                newMessages.splice(ix + 1, 0, newAssistantMsg)
                                                store.currentSession.messages = newMessages
                                                store.updateChatSession(store.currentSession)
                                                generate(store.currentSession, promptsMsgs, newAssistantMsg)
                                                setScrollToMsg({ msgId: newAssistantMsg.id, smooth: true })
                                            }
                                        }}
                                        copyMsg={() => {
                                            navigator.clipboard.writeText(msg.content)
                                            store.addToast('Copied to clipboard')
                                        }}
                                        quoteMsg={() => {
                                            let input = msg.content.split('\n').map(line => `> ${line}`).join('\n')
                                            input += '\n\n-------------------\n\n'
                                            setMessageInput(input)
                                        }}
                                        addToast={store.addToast}
                                    />
                                ))
                            }
                        </List>
                        <Box>
                            <MessageInput
                                messageInput={messageInput}
                                setMessageInput={setMessageInput}
                                apiKey={store.settings.openaiKey}
                                onSubmit={async (newUserMsg: Message) => {
                                    console.log('[ChatSession] User submission received', {
                                        sessionId: store.currentSession.id,
                                        messageId: newUserMsg.id,
                                        excerpt: newUserMsg.content.slice(0, 60),
                                    })
                                    const promptsMsgs = [...store.currentSession.messages, newUserMsg]
                                    const newAssistantMsg = createMessage('assistant', '....')
                                    store.currentSession.messages = [...store.currentSession.messages, newUserMsg, newAssistantMsg]
                                    store.updateChatSession(store.currentSession)
                                    console.log('[ChatSession] Placeholder assistant created', {
                                        placeholderId: newAssistantMsg.id,
                                        promptCount: promptsMsgs.length,
                                    })
                                    generate(store.currentSession, promptsMsgs, newAssistantMsg)
                                    console.log('[ChatSession] generate invoked', {
                                        sessionId: store.currentSession.id,
                                        targetMsgId: newAssistantMsg.id,
                                    })
                                    setScrollToMsg({ msgId: newAssistantMsg.id, smooth: true })
                                }}
                            />
                        </Box>
                    </Stack>
                </Grid>

                <SettingWindow open={openSettingWindow}
                    settings={store.settings}
                    save={(settings) => {
                        store.setSettings(settings)
                        setOpenSettingWindow(false)
                    }}
                    close={() => setOpenSettingWindow(false)}
                />
                {
                    configureChatConfig !== null && (
                        <ChatConfigWindow open={configureChatConfig !== null}
                            session={configureChatConfig}
                            save={(session) => {
                                store.updateChatSession(session)
                                setConfigureChatConfig(null)
                            }}
                            close={() => setConfigureChatConfig(null)}
                        />
                    )
                }
                {
                    sessionClean !== null && (
                        <CleanWidnow open={sessionClean !== null}
                            session={sessionClean}
                            save={(session) => {
                                store.updateChatSession(session)
                                setSessionClean(null)
                            }}
                            close={() => setSessionClean(null)}
                        />
                    )
                }
                {
                    store.toasts.map((toast) => (
                        <Snackbar
                            open
                            onClose={() => store.removeToast(toast.id)}
                            message={toast.content}
                            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                        />
                    ))
                }
            </Grid>
        </Box >
    );
}

export default function App() {
    return (
        <ThemeSwitcherProvider>
            <Main />
        </ThemeSwitcherProvider>
    )
}


function MessageInput(props: {
    onSubmit: (newMsg: Message) => void
    messageInput: string
    setMessageInput: (value: string) => void
    apiKey: string
}) {
    const {messageInput, setMessageInput} = props
    const [isRecording, setIsRecording] = useState(false)
    const [micStream, setMicStream] = useState<MediaStream | null>(null)
    const [audioLevel, setAudioLevel] = useState(0)
    const [connectionId, setConnectionId] = useState<string | null>(null)
    const [voiceModalOpen, setVoiceModalOpen] = useState(false)
    const [transcripts, setTranscripts] = useState<Array<{role: 'user' | 'assistant', text: string}>>([])
    const [currentTranscript, setCurrentTranscript] = useState('')
    const audioContextRef = React.useRef<AudioContext | null>(null)
    const analyserRef = React.useRef<AnalyserNode | null>(null)
    const animationRef = React.useRef<number | null>(null)
    const processorRef = React.useRef<ScriptProcessorNode | null>(null)
    const messageCleanupRef = React.useRef<(() => void) | null>(null)
    const playbackContextRef = React.useRef<AudioContext | null>(null)
    const audioQueueRef = React.useRef<Int16Array[]>([])
    const isPlayingRef = React.useRef(false)

    // Helper function to play queued audio
    const playNextAudio = React.useCallback(() => {
        if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

        const ctx = playbackContextRef.current;
        if (!ctx) return;

        isPlayingRef.current = true;
        const pcm16 = audioQueueRef.current.shift()!;

        // Convert Int16 to Float32
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
            float32[i] = pcm16[i] / 32768;
        }

        const buffer = ctx.createBuffer(1, float32.length, 24000);
        buffer.getChannelData(0).set(float32);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
            isPlayingRef.current = false;
            playNextAudio(); // Play next chunk
        };
        source.start();
    }, []);

    const submit = (event?: any) => {
        if (event) {
            event.preventDefault()
        }
        const trimmed = messageInput.trim()
        if (trimmed.length === 0) {
            return
        }
        console.log('[MessageInput] Submitting prompt', { charCount: trimmed.length })
        props.onSubmit(createMessage('user', trimmed))
        setMessageInput('')
    }
    return (
        <form onSubmit={submit}>
            <Stack direction="column" spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <IconButton
                        color="primary"
                        onClick={() => {
                            setVoiceModalOpen(true);
                            setTranscripts([]);
                            setCurrentTranscript('');
                        }}
                    >
                        <MicIcon />
                    </IconButton>

                    {/* Voice Chat Modal */}
                    <Dialog
                        open={voiceModalOpen}
                        onClose={() => {}}
                        maxWidth="sm"
                        fullWidth
                        PaperProps={{ sx: { minHeight: 400 } }}
                    >
                        <DialogTitle>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                                <Typography variant="h6">Voice Chat</Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                    {isRecording && (
                                        <Box
                                            sx={{
                                                width: 60,
                                                height: 8,
                                                bgcolor: 'grey.300',
                                                borderRadius: 1,
                                                overflow: 'hidden',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: `${audioLevel * 100}%`,
                                                    height: '100%',
                                                    bgcolor: audioLevel > 0.5 ? 'error.main' : 'success.main',
                                                    transition: 'width 0.05s',
                                                }}
                                            />
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </DialogTitle>
                        <DialogContent>
                            <Box sx={{ minHeight: 200, maxHeight: 300, overflow: 'auto' }}>
                                {transcripts.map((t, i) => (
                                    <Paper
                                        key={i}
                                        sx={{
                                            p: 1.5,
                                            mb: 1,
                                            bgcolor: t.role === 'user' ? 'primary.dark' : 'background.paper',
                                            color: t.role === 'user' ? 'primary.contrastText' : 'text.primary',
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                            {t.role === 'user' ? 'You' : 'Assistant'}
                                        </Typography>
                                        <Typography variant="body2">{t.text}</Typography>
                                    </Paper>
                                ))}
                                {currentTranscript && (
                                    <Paper sx={{ p: 1.5, mb: 1, bgcolor: 'background.paper' }}>
                                        <Typography variant="caption" sx={{ opacity: 0.7 }}>
                                            Assistant
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                                            {currentTranscript}
                                        </Typography>
                                    </Paper>
                                )}
                                {transcripts.length === 0 && !currentTranscript && (
                                    <Typography color="text.secondary" textAlign="center" sx={{ mt: 4 }}>
                                        {isRecording ? 'Listening... speak now!' : 'Click Start to begin voice chat'}
                                    </Typography>
                                )}
                            </Box>
                        </DialogContent>
                        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
                            {!isRecording ? (
                                <Button
                                    variant="contained"
                                    color="primary"
                                    startIcon={<MicIcon />}
                                    onClick={async () => {
                                        // Start recording logic
                                        console.log('[VoiceModal] Starting recording...');
                                        try {
                                            // First, connect to OpenAI Realtime API
                                            const result = await window.api.realtime.connect(
                                                props.apiKey,
                                                'gpt-4o-realtime-preview-2024-12-17'
                                            );
                                            console.log('[VoiceModal] WebSocket connected!', result);
                                            setConnectionId(result.connectionId);

                                            // Initialize playback context
                                            playbackContextRef.current = new AudioContext({ sampleRate: 24000 });

                                            // Set up message listener
                                            const cleanup = window.api.realtime.onMessage((data) => {
                                                try {
                                                    const event = JSON.parse(data.data);
                                                    if (event.type === 'response.audio.delta') {
                                                        const binaryString = atob(event.delta);
                                                        const bytes = new Uint8Array(binaryString.length);
                                                        for (let i = 0; i < binaryString.length; i++) {
                                                            bytes[i] = binaryString.charCodeAt(i);
                                                        }
                                                        const pcm16 = new Int16Array(bytes.buffer);
                                                        audioQueueRef.current.push(pcm16);
                                                        playNextAudio();
                                                    } else if (event.type === 'response.audio_transcript.delta') {
                                                        setCurrentTranscript(prev => prev + event.delta);
                                                    } else if (event.type === 'response.audio_transcript.done') {
                                                        setTranscripts(prev => [...prev, { role: 'assistant', text: event.transcript }]);
                                                        setCurrentTranscript('');
                                                    } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
                                                        setTranscripts(prev => [...prev, { role: 'user', text: event.transcript }]);
                                                    } else if (event.type === 'error') {
                                                        console.error('[VoiceModal] API Error:', event.error);
                                                    }
                                                } catch (e) {
                                                    console.error('[VoiceModal] Failed to parse message:', e);
                                                }
                                            });
                                            messageCleanupRef.current = cleanup;

                                            // Configure session
                                            const sessionConfig = {
                                                type: 'session.update',
                                                session: {
                                                    modalities: ['text', 'audio'],
                                                    instructions: 'You are a helpful assistant. Respond concisely.',
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
                                            };
                                            window.api.realtime.send(result.connectionId, JSON.stringify(sessionConfig));

                                            // Get microphone
                                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                                            setMicStream(stream);
                                            setIsRecording(true);

                                            // Set up audio context
                                            const audioContext = new AudioContext({ sampleRate: 24000 });
                                            audioContextRef.current = audioContext;
                                            const source = audioContext.createMediaStreamSource(stream);

                                            // Analyser for level
                                            const analyser = audioContext.createAnalyser();
                                            analyser.fftSize = 256;
                                            source.connect(analyser);
                                            analyserRef.current = analyser;

                                            // Processor to send audio
                                            const processor = audioContext.createScriptProcessor(4096, 1, 1);
                                            processorRef.current = processor;
                                            const connId = result.connectionId;

                                            processor.onaudioprocess = (e) => {
                                                const inputData = e.inputBuffer.getChannelData(0);
                                                const pcm16 = new Int16Array(inputData.length);
                                                for (let i = 0; i < inputData.length; i++) {
                                                    const s = Math.max(-1, Math.min(1, inputData[i]));
                                                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                                                }
                                                const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
                                                window.api.realtime.send(connId, JSON.stringify({
                                                    type: 'input_audio_buffer.append',
                                                    audio: base64,
                                                }));
                                            };

                                            source.connect(processor);
                                            processor.connect(audioContext.destination);

                                            // Level monitoring
                                            const dataArray = new Uint8Array(analyser.frequencyBinCount);
                                            const updateLevel = () => {
                                                analyser.getByteFrequencyData(dataArray);
                                                const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                                                setAudioLevel(average / 255);
                                                animationRef.current = requestAnimationFrame(updateLevel);
                                            };
                                            updateLevel();
                                        } catch (err: any) {
                                            console.error('[VoiceModal] Error:', err);
                                        }
                                    }}
                                >
                                    Start
                                </Button>
                            ) : (
                                <Button
                                    variant="contained"
                                    color="error"
                                    onClick={() => {
                                        // Stop recording
                                        console.log('[VoiceModal] Stopping...');
                                        if (animationRef.current) {
                                            cancelAnimationFrame(animationRef.current);
                                            animationRef.current = null;
                                        }
                                        if (processorRef.current) {
                                            processorRef.current.disconnect();
                                            processorRef.current = null;
                                        }
                                        if (audioContextRef.current) {
                                            audioContextRef.current.close();
                                            audioContextRef.current = null;
                                        }
                                        if (micStream) {
                                            micStream.getTracks().forEach(track => track.stop());
                                            setMicStream(null);
                                        }
                                        if (messageCleanupRef.current) {
                                            messageCleanupRef.current();
                                            messageCleanupRef.current = null;
                                        }
                                        audioQueueRef.current = [];
                                        isPlayingRef.current = false;
                                        if (playbackContextRef.current) {
                                            playbackContextRef.current.close();
                                            playbackContextRef.current = null;
                                        }
                                        if (connectionId) {
                                            window.api.realtime.close(connectionId);
                                            setConnectionId(null);
                                        }
                                        setAudioLevel(0);
                                        setIsRecording(false);
                                    }}
                                >
                                    Stop
                                </Button>
                            )}
                            <Button
                                variant="outlined"
                                onClick={() => {
                                    // Close modal and cleanup
                                    if (isRecording) {
                                        // Stop first
                                        if (animationRef.current) cancelAnimationFrame(animationRef.current);
                                        if (processorRef.current) processorRef.current.disconnect();
                                        if (audioContextRef.current) audioContextRef.current.close();
                                        if (micStream) micStream.getTracks().forEach(track => track.stop());
                                        if (messageCleanupRef.current) messageCleanupRef.current();
                                        if (playbackContextRef.current) playbackContextRef.current.close();
                                        if (connectionId) window.api.realtime.close(connectionId);
                                        setIsRecording(false);
                                        setMicStream(null);
                                        setConnectionId(null);
                                    }
                                    setVoiceModalOpen(false);
                                }}
                            >
                                Close
                            </Button>
                        </DialogActions>
                    </Dialog>

                    <TextField
                        multiline
                        label="Prompt"
                        value={messageInput}
                        onChange={(event) => setMessageInput(event.target.value)}
                        fullWidth
                        maxRows={12}
                        autoFocus
                        id='message-input'
                        onKeyDown={(event) => {
                            if (event.keyCode === 13 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                                event.preventDefault()
                                submit()
                                return
                            }
                        }}
                    />
                    <Button type='submit' variant="contained" size='large'>
                        SEND
                    </Button>
                </Stack>
                <Typography variant='caption' style={{ opacity: 0.6 }}>
                    Enter = Send • Shift+Enter = New Line
                </Typography>
            </Stack>
        </form>
    )
}
