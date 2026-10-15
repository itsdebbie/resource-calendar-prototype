import { useEffect, useState } from 'react'
import { Page, Text, Toaster } from '@servicetitan/anvil2'
import { ResourceCalendar } from './ResourceCalendar'
import { ProdPage } from './prod/ProdPage'
import { PrototypeScrollSwitch, ScrollDemoProvider } from './scrollDemo'
import './index.css'

type Route = 'redesign' | 'schedule' | 'calendar'

function routeFromHash(): Route {
  const hash = (window.location.hash || '#/').replace(/^#/, '')
  if (hash.startsWith('/prod/calendar') || hash.startsWith('/prod/resource')) return 'calendar'
  if (hash.startsWith('/prod')) return 'schedule'
  return 'redesign'
}

function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <ScrollDemoProvider>
    <div className="app-shell">
      <nav className="prod-nav" aria-label="Prototype pages">
        <a href="#/" className={route === 'redesign' ? 'is-active' : undefined}>
          Redesign
        </a>
        <a href="#/prod/schedule" className={route === 'schedule' ? 'is-active' : undefined}>
          Prod Schedule
        </a>
        <a href="#/prod/calendar" className={route === 'calendar' ? 'is-active' : undefined}>
          Prod Resource Calendar
        </a>
      </nav>
      <div className="app-toaster">
        <Toaster id="main-toaster" />
      </div>
      {route === 'redesign' ? (
        <Page>
          <Page.Header
            title="Resource Calendar"
            breadcrumbs={[
              { children: 'Schedule', href: '#' },
              { children: 'Resource Calendar' },
            ]}
            description={
              <Text subdued>
                Continuous timeline — scroll or jump to a date. Technician hours follow the dates on screen.
              </Text>
            }
          />
          <Page.Content>
            <div className="rc-page-content">
              <ResourceCalendar />
            </div>
          </Page.Content>
        </Page>
      ) : (
        <ProdPage view={route === 'calendar' ? 'calendar' : 'schedule'} />
      )}
      <PrototypeScrollSwitch />
    </div>
    </ScrollDemoProvider>
  )
}

export default App
