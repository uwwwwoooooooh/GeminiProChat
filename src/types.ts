export interface ChatPart {
  text: string
}

export interface ChatMessage {
  // role may be 'user' for the user, 'assistant' for UI assistant messages,
  // and 'model' for messages sent to the API. Include 'system' for system role.
  role: 'model' | 'user' | 'assistant' | 'system'
  parts: ChatPart[]
}

export interface ErrorMessage {
  code: string
  message: string
}
