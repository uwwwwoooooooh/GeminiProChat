import type { ChatMessage } from '@/types'
import { GoogleGenAI } from '@google/genai'

const GEMINI_API_KEY = (import.meta.env.GEMINI_API_KEY)
const apiBaseUrl = (import.meta.env.API_BASE_URL)?.trim().replace(/\/$/, '')
const GEMINI_MODEL_NAME = (import.meta.env.GEMINI_MODEL_NAME) || 'gemini-flash-latest'

// Try to initialize client with base URL when provided
const genAI = apiBaseUrl
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY, apiBaseUrl })
  : new GoogleGenAI({ apiKey: GEMINI_API_KEY })

function makeStreamFromString(text: string) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

async function tryUseFuyunShape(history: ChatMessage[], newMessage: string, modelName: string) {
  // older client shape: genAI.getGenerativeModel(...).startChat().sendMessageStream(...)
  if (typeof (genAI as any).getGenerativeModel === 'function') {
    const model = (genAI as any).getGenerativeModel({ model: modelName })
    if (model && typeof model.startChat === 'function') {
      const chat = model.startChat({
        history: history.map(msg => ({
          role: msg.role,
          parts: msg.parts.map(p => p.text).join(''),
        })),
        generationConfig: { maxOutputTokens: 8000 },
      })
      if (typeof chat.sendMessageStream === 'function') {
        return await chat.sendMessageStream(newMessage)
      }
    }
  }
  return null
}

async function tryUseGoogleGenAIShape(history: ChatMessage[], newMessage: string, modelName: string) {
  // new google genai client shape: genAI.models.generateContent or genAI.models.generate
  const models = (genAI as any).models || (genAI as any)
  if (!models) return null

  // Try generateContent
  if (typeof models.generateContent === 'function') {
    // Attempt library-specific payload shapes
    const payloads = [
      { model: modelName, input: newMessage },
      { model: modelName, text: newMessage },
      { model: modelName, contents: [{ type: 'text', text: newMessage }] },
      { model: modelName, prompt: newMessage },
    ]

    for (const payload of payloads) {
      try {
        const res = await models.generateContent(payload)
        return res
      } catch (e) {
        // try next shape
      }
    }
  }

  // Try generate or create
  if (typeof models.generate === 'function') {
    try {
      return await models.generate({ model: modelName, input: newMessage })
    } catch (e) {
      // ignore
    }
  }

  if (typeof models.create === 'function') {
    try {
      return await models.create({ model: modelName, input: newMessage })
    } catch (e) {
      // ignore
    }
  }

  return null
}

export const startChatAndSendMessageStream = async(
  history: ChatMessage[],
  newMessage: string,
  modelName: string = GEMINI_MODEL_NAME,
) => {
  // Try older fuyun-style client first
  try {
    const maybe = await tryUseFuyunShape(history, newMessage, modelName)
    if (maybe) {
      // If the returned object has a stream, adapt it to a ReadableStream
      if (maybe.stream && typeof maybe.stream[Symbol.asyncIterator] === 'function') {
        const result = maybe
        return new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            for await (const chunk of result.stream) {
              let text = ''
              try {
                if (typeof chunk.text === 'function') text = await chunk.text()
                else if (typeof chunk === 'string') text = chunk
                else text = String(chunk)
              } catch (e) {
                text = String(chunk)
              }
              controller.enqueue(encoder.encode(text))
            }
            controller.close()
          },
        })
      }

      // If maybe is a plain string or object with text, return stream
      if (typeof maybe === 'string') return makeStreamFromString(maybe)
      if (maybe.outputText) return makeStreamFromString(maybe.outputText)
      if (maybe.text) return makeStreamFromString(maybe.text)
    }
  } catch (e) {
    // fallthrough to other shapes
    console.warn('tryUseFuyunShape failed:', e)
  }

  // Try google genai shape
  try {
    const res = await tryUseGoogleGenAIShape(history, newMessage, modelName)
    if (res) {
      // Attempt to extract text from common response shapes
      //  - res.outputText
      //  - res.output[0].content[0].text
      //  - res.candidates[0].content[0].text
      //  - res.result?.output_text
      if (typeof res === 'string') return makeStreamFromString(res)
      if (res.outputText) return makeStreamFromString(res.outputText)
      if (res.result && res.result.output_text) return makeStreamFromString(res.result.output_text)
      if (Array.isArray(res.output) && res.output.length > 0) {
        const first = res.output[0]
        if (first && first.content) {
          // content can be array
          if (Array.isArray(first.content) && first.content[0] && first.content[0].text) return makeStreamFromString(first.content[0].text)
          if (first.text) return makeStreamFromString(first.text)
        }
      }
      if (Array.isArray(res.candidates) && res.candidates[0] && res.candidates[0].content) {
        const parts = res.candidates[0].content.parts || res.candidates[0].content
        if (Array.isArray(parts) && parts.length > 0) {
          const texts = parts.map((p: any) => p.text || p).join('')
          return makeStreamFromString(texts)
        }
      }

      // As a last resort, JSON stringify
      return makeStreamFromString(JSON.stringify(res))
    }
  } catch (e) {
    console.warn('tryUseGoogleGenAIShape failed:', e)
  }

  throw new Error('No compatible GoogleGenAI client shape detected. Please ensure the installed client library matches one of the supported shapes.')
}
