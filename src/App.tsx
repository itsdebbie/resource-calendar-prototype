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
    </div>
  )
}

export default App
