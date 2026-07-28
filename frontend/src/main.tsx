import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installExtensionBridge } from './lib/extensionBridge'
import { registerServiceWorker } from './lib/registerServiceWorker'

installExtensionBridge()
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
