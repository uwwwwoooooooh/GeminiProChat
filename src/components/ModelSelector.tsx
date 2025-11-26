import { createSignal, For } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'

interface Props {
  currentModel: Accessor<string>
  setCurrentModel: Setter<string>
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
  { id: 'gemini-3-pro-image-preview', label: 'Nano Banana' },
  { id: 'gemini-flash-latest', label: 'Flash' },
]

export default (props: Props) => {
  return (
    <div class="model-selector my-4">
      <div class="fi gap-2 op-50 dark:op-60 mb-2">
        <span>Model:</span>
      </div>
      <div class="flex gap-2 flex-wrap">
        <For each={AVAILABLE_MODELS}>
          {(model) => (
            <button
              onClick={() => props.setCurrentModel(model.id)}
              class={`px-3 py-1 rounded-md transition-colors ${
                props.currentModel() === model.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {model.label}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
