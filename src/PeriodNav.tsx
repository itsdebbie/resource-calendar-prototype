import { Button } from '@servicetitan/anvil2'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

export function PeriodNav({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="rc-period-nav" role="group" aria-label="Timeline period">
      <Button
        size="small"
        appearance="secondary"
        icon={ChevronLeftIcon}
        aria-label="Previous period"
        onClick={onPrev}
      />
      <Button
        size="small"
        appearance="secondary"
        icon={ChevronRightIcon}
        aria-label="Next period"
        onClick={onNext}
      />
    </div>
  )
}
