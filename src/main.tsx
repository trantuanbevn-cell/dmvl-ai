import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

import { installSpellGlobal } from './lib/spellGlobal'
installSpellGlobal()
import { reloadOnce } from './lib/staleChunk'
window.addEventListener('vite:preloadError', e => { e.preventDefault(); reloadOnce() })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
