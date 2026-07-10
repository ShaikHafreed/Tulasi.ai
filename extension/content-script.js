// Relays whitelisted messages between the side panel and the Tulasi web
// app's own in-page bridge (frontend/src/lib/extensionBridge.ts). Never
// reads or scrapes the DOM, never touches app state directly — only
// forwards {type, message|action} payloads the page itself defines.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const requestId = crypto.randomUUID()

  const listener = (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== 'tulasi-app' || data.requestId !== requestId) return
    window.removeEventListener('message', listener)
    sendResponse(data)
  }
  window.addEventListener('message', listener)

  window.postMessage({ ...message, source: 'tulasi-extension', requestId }, '*')

  // Give up if the page never responds (e.g. an old build without the bridge).
  setTimeout(() => {
    window.removeEventListener('message', listener)
  }, 8000)

  return true // keep the message channel open for the async sendResponse
})
