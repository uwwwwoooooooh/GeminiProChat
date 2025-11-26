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

// Legacy "fuyun" adapter removed — only modern google genai shapes are supported now.

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
  // Only support the modern Google GenAI client shapes
  try {
    const res = await tryUseGoogleGenAIShape(history, newMessage, modelName)
    if (res) {
      if (typeof res === 'string') return makeStreamFromString(res)
      if (res.outputText) return makeStreamFromString(res.outputText)
      if (res.result && res.result.output_text) return makeStreamFromString(res.result.output_text)
      if (Array.isArray(res.output) && res.output.length > 0) {
        const first = res.output[0]
        if (first && first.content) {
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

      return makeStreamFromString(JSON.stringify(res))
    }
  } catch (e) {
    console.warn('tryUseGoogleGenAIShape failed:', e)
  }

  throw new Error('No compatible GoogleGenAI client shape detected. Please ensure the installed client library matches one of the supported shapes.')
}
