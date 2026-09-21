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
              Group by Projects prototype. Monthly is the construction-optimal zoom. Bulk select works through
              monthly; quarter and year are larger chunks only.
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
