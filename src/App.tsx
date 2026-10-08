import { Page, Text } from '@servicetitan/anvil2'
import { ResourceCalendar } from './ResourceCalendar'
import './index.css'

function App() {
  return (
    <div className="app-shell">
      <Page>
        <Page.Header
          title="Resource Calendar"
          breadcrumbs={[
            { children: 'Schedule', href: '#' },
            { children: 'Resource Calendar' },
          ]}
          description={
            <Text subdued>
              Continuous timeline — scroll, jump to a date, or pinch/ctrl-scroll to zoom. Technician hours follow the dates on screen.
            </Text>
          }
        />
        <Page.Content>
          <div className="rc-page-content">
            <ResourceCalendar />
          </div>
        </Page.Content>
      </Page>
    </div>
  )
}

export default App
