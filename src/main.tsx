import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AnvilProvider } from '@servicetitan/anvil2'
import '@servicetitan/anvil2/assets/css-utils/a2-utils.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AnvilProvider>
      <App />
    </AnvilProvider>
  </StrictMode>,
)
