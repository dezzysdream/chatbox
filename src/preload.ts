// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer, nativeTheme } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('api', <ExposeInMainWindowAPI>{
    invoke: ipcRenderer.invoke,
    // receive: (channel: string, func) => {
    //     let validChannels = ['fromMain'];
    //     if (validChannels.includes(channel)) {
    //         // Deliberately strip event as it includes `sender`
    //         ipcRenderer.on(channel, (event, ...args) => func(...args));
    //     }
    // },

    onSystemThemeChange: (callback) => {
        ipcRenderer.on('native-theme-updated', callback);

        return () => ipcRenderer.off('native-theme-updated', callback);
    },

    // Real-Time API WebSocket methods
    realtime: {
        connect: (apiKey: string, model: string) =>
            ipcRenderer.invoke('realtime:connect', { apiKey, model }),

        send: (connectionId: string, data: string) =>
            ipcRenderer.invoke('realtime:send', { connectionId, data }),

        close: (connectionId: string) =>
            ipcRenderer.invoke('realtime:close', { connectionId }),

        onMessage: (callback: (data: { connectionId: string; data: string }) => void) => {
            const handler = (_event: any, data: any) => callback(data);
            ipcRenderer.on('realtime:message', handler);
            return () => ipcRenderer.off('realtime:message', handler);
        },

        onClose: (callback: (data: { connectionId: string; code: number; reason: string }) => void) => {
            const handler = (_event: any, data: any) => callback(data);
            ipcRenderer.on('realtime:close', handler);
            return () => ipcRenderer.off('realtime:close', handler);
        },

        onError: (callback: (data: { connectionId: string; error: string }) => void) => {
            const handler = (_event: any, data: any) => callback(data);
            ipcRenderer.on('realtime:error', handler);
            return () => ipcRenderer.off('realtime:error', handler);
        },
    },
});
