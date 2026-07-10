const messagesEl = document.getElementById('messages')
const inputEl = document.getElementById('input')
const sendEl = document.getElementById('send')
const confirmBar = document.getElementById('confirm-bar')
const confirmLabel = document.getElementById('confirm-label')
const confirmYes = document.getElementById('confirm-yes')
const confirmNo = document.getElementById('confirm-no')

let pendingAction = null

function addMessage(kind, text) {
  const div = document.createElement('div')
  div.className = `msg ${kind}`
  div.textContent = text
  messagesEl.appendChild(div)
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function showConfirm(action) {
  pendingAction = action
  confirmLabel.textContent = `Confirm: ${action.action}?`
  confirmBar.style.display = 'flex'
}

function hideConfirm() {
  pendingAction = null
  confirmBar.style.display = 'none'
}

async function sendToPage(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('no-active-tab')
  return chrome.tabs.sendMessage(tab.id, payload)
}

async function handleSend() {
  const text = inputEl.value.trim()
  if (!text) return
  inputEl.value = ''
  sendEl.disabled = true
  addMessage('user', text)

  try {
    const response = await sendToPage({ type: 'send_chat_message', message: text })
    if (!response) {
      addMessage('error', "Couldn't reach the Tulasi tab — open tulasi.ai (or localhost:5173) first.")
      return
    }
    if (response.type === 'chat_error') {
      addMessage('error', response.message)
      return
    }
    addMessage('assistant', response.reply)
    for (const item of response.executed ?? []) {
      addMessage('status', `Done — ${item.action.action}`)
    }
    const [firstPending] = response.pendingConfirm ?? []
    if (firstPending) showConfirm(firstPending)
  } catch {
    addMessage('error', "Couldn't reach the Tulasi tab — open tulasi.ai (or localhost:5173) first.")
  } finally {
    sendEl.disabled = false
  }
}

confirmYes.addEventListener('click', async () => {
  if (!pendingAction) return
  const action = pendingAction
  hideConfirm()
  const response = await sendToPage({ type: 'confirm_action', action })
  if (response?.type === 'action_confirmed') {
    addMessage('status', `Done — ${action.action}`)
  }
})

confirmNo.addEventListener('click', hideConfirm)
sendEl.addEventListener('click', handleSend)
inputEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') handleSend()
})

addMessage(
  'assistant',
  'Open your Tulasi tab with a scan loaded, then tell me what to do — resize, print-check, rotate, or export.',
)
