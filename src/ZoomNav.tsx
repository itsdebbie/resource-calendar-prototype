import type { ReactNode } from 'react'
import { Button } from '@servicetitan/anvil2'
import type { Zoom } from './data'
import { ZoomInIcon, ZoomOutIcon } from './icons'

export function ZoomNav({
  zoom,
  onZoomIn,
  onZoomOut,
  children,
}: {
  zoom: Zoom
  onZoomIn: () => void
  onZoomOut: () => void
  children: ReactNode
}) {
  return (
    <div className="rc-zoom-nav" role="group" aria-label="Timeline zoom">
      <Button
        size="small"
        appearance="secondary"
        icon={ZoomOutIcon}
        aria-label="Zoom out"
        disabled={zoom === 'year'}
        onClick={onZoomOut}
      />
      {children}
      <Button
        size="small"
        appearance="secondary"
        icon={ZoomInIcon}
        aria-label="Zoom in"
        disabled={zoom === 'days'}
        onClick={onZoomIn}
      />
    </div>
  )
}
