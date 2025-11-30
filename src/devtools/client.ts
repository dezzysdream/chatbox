import { Configuration, OpenAIApi, ChatCompletionRequestMessage, ChatCompletionRequestMessageRoleEnum } from './openai-node'
import { Message } from './types'

export async function replay(apiKey: string, host: string, msgs: Message[], onText?: (text: string) => void, onError?: (error: Error) => void) {
    if (msgs.length === 0) {
        throw new Error('No messages to replay')
    }
    const head = msgs[0]
    msgs = msgs.slice(1)


    const maxLen = 1800
    let totalLen = head.content.length

    let prompts: Message[] = []
    for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (msg.content.length + totalLen > maxLen) {
            break
        }
        prompts = [msg, ...prompts]
        totalLen += msg.content.length
    }
    prompts = [head, ...prompts]

    try {
        console.log('[client.replay] preparing request', {
            apiHost: host,
            promptCount: prompts.length,
            headRole: head.role,
        })
        const messages: ChatCompletionRequestMessage[] = prompts.map(msg => ({ role: msg.role, content: msg.content }))

        // Detect if using OpenRouter
        const isOpenRouter = host.includes('openrouter.ai')

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        }

        // Add OpenRouter-specific headers
        if (isOpenRouter) {
            headers['HTTP-Referer'] = 'https://github.com/Bin-Huang/chatbox'
            headers['X-Title'] = 'Chatbox'
        }

        const response = await fetch(`${host}/v1/chat/completions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                messages,
                model: "gpt-3.5-turbo",
                stream: true
            })
        });
        if (!response.body) {
            throw new Error('No response body')
        }
        const reader = response.body.getReader();
        const d = new TextDecoder('utf8');
        let fullText = ''
        let partialData = '';
        let chunkCount = 0
        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            } else {
                const raw = d.decode(value)
                if (partialData == '') {
                    partialData = raw
                } else {
                    partialData += raw;
                }
                const delimiterIndex = partialData.indexOf('\n\n');
                if (delimiterIndex === -1) {
                    continue;
                }
                let items = partialData.split('\n\n')
                partialData = ''
                items = items.map(item => item.replace(/^data: /, '')).filter(item => item.length > 0).filter(item => item !== '[DONE]')
                const datas = items.map(item => {
                    let json: any
                    try {
                        json = JSON.parse(item)
                    } catch (error) {
                        throw new Error(`Error parsing item: ${item}.\nError Details: ${error}`)
                    }
                    if (json.error) {
                        throw new Error(`Error from OpenAI: ${JSON.stringify(json)}`)
                    }
                    return json
                })
                for (const data of datas) {
                    const text = data.choices[0]?.delta?.content
                    if (text !== undefined) {
                        fullText += text
                        chunkCount += 1
                        console.log('[client.replay] stream chunk', {
                            chunkCount,
                            deltaLength: text.length,
                        })
                        if (onText) {
                            onText(fullText)
                        }
                    }
                }
            }
        }
        console.log('[client.replay] stream completed', { chunkCount, totalLength: fullText.length })
        return fullText
    } catch (error) {
        console.error('[client.replay] request failed', { error })
        if (onError) {
            onError(error)
        }
        throw error
    }
}
