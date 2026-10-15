import { useEffect, useState } from 'react'
import { Calendar, Icon, Popover } from '@servicetitan/anvil2'
import type { Zoom } from './data'
import { CalendarIcon } from './icons'
import {
  MONTH_LABELS,
  PICKER_LABEL_SIZER,
  calendarStartDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  utc,
} from './timeline'
import './calendar.css'

function toDayIso(value: string) {
  const iso = value.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : ''
}

function isoFromParts(year: number, month = 0, day = 1) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

export function DateJumpPicker({
  zoom,
  value,
  label,
  onPick,
}: {
  zoom: Zoom
  value: string
  label: string
  onPick: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onClose={() => setOpen(false)} placement="bottom-start" disableCaret>
      <Popover.Trigger>
        {(props) => (
          <button
            type="button"
            className="rc-date-btn"
            aria-label={label}
            {...props}
            onClick={() => setOpen((current) => !current)}
          >
            <Icon svg={CalendarIcon} size="small" inherit />
            <span className="rc-date-label-wrap">
              <span className="rc-date-sizer">{PICKER_LABEL_SIZER}</span>
              <span className="rc-date-label">{label}</span>
            </span>
            <span className="rc-date-caret" aria-hidden>
              ▾
            </span>
          </button>
        )}
      </Popover.Trigger>
      <Popover.Content>
        <div className="rc-date-pop">
          {zoom === 'days' || zoom === 'weeks' ? (
            <Calendar
              key={zoom}
              value={value}
              defaultFocusedDate={value}
              startDay={calendarStartDay()}
              onSelection={({ value: next }) => {
                if (typeof next !== 'string' || !next) return
                const iso = toDayIso(next)
                if (!iso) return
                onPick(iso)
                setOpen(false)
              }}
            />
          ) : zoom === 'months' ? (
            <MonthPicker
              key={zoom}
              value={value}
              onPick={(iso) => {
                onPick(iso)
                setOpen(false)
              }}
            />
          ) : zoom === 'quarters' ? (
            <QuarterPicker
              key={zoom}
              value={value}
              onPick={(iso) => {
                onPick(iso)
                setOpen(false)
              }}
            />
          ) : (
            <YearPicker
              key={zoom}
              value={value}
              onPick={(iso) => {
                onPick(iso)
                setOpen(false)
              }}
            />
          )}
        </div>
      </Popover.Content>
    </Popover>
  )
}

function MonthPicker({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const selected = new Date(utc(value))
  const valueYear = selected.getUTCFullYear()
  const [year, setYear] = useState(valueYear)
  useEffect(() => {
    setYear(valueYear)
  }, [valueYear])
  return (
    <div className="rc-period-pop" data-picker-value={value} data-picker-year={year}>
      <div className="rc-period-head">
        <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          ‹
        </button>
        <span>{year}</span>
        <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
          ›
        </button>
      </div>
      <div className="rc-period-grid is-months">
        {MONTH_LABELS.map((name, month) => (
          <button
            key={name}
            type="button"
            className={year === selected.getUTCFullYear() && month === selected.getUTCMonth() ? 'is-on' : undefined}
            onClick={() => onPick(startOfMonth(isoFromParts(year, month, 1)))}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

function QuarterPicker({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const selected = new Date(utc(value))
  const selectedQ = Math.floor(selected.getUTCMonth() / 3)
  const [year, setYear] = useState(selected.getUTCFullYear())
  useEffect(() => {
    setYear(new Date(utc(value)).getUTCFullYear())
  }, [value])
  return (
    <div className="rc-period-pop">
      <div className="rc-period-head">
        <button type="button" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          ‹
        </button>
        <span>{year}</span>
        <button type="button" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
          ›
        </button>
      </div>
      <div className="rc-period-grid is-quarters">
        {[0, 1, 2, 3].map((q) => (
          <button
            key={q}
            type="button"
            className={year === selected.getUTCFullYear() && q === selectedQ ? 'is-on' : undefined}
            onClick={() => onPick(startOfQuarter(isoFromParts(year, q * 3, 1)))}
          >
            Q{q + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

function YearPicker({ value, onPick }: { value: string; onPick: (iso: string) => void }) {
  const selectedYear = new Date(utc(value)).getUTCFullYear()
  const [origin, setOrigin] = useState(Math.floor(selectedYear / 12) * 12)
  useEffect(() => {
    const y = new Date(utc(value)).getUTCFullYear()
    setOrigin(Math.floor(y / 12) * 12)
  }, [value])
  const years = Array.from({ length: 12 }, (_, i) => origin + i)
  return (
    <div className="rc-period-pop">
      <div className="rc-period-head">
        <button type="button" onClick={() => setOrigin((y) => y - 12)} aria-label="Previous years">
          ‹
        </button>
        <span>
          {years[0]}–{years[years.length - 1]}
        </span>
        <button type="button" onClick={() => setOrigin((y) => y + 12)} aria-label="Next years">
          ›
        </button>
      </div>
      <div className="rc-period-grid is-years">
        {years.map((year) => (
          <button
            key={year}
            type="button"
            className={year === selectedYear ? 'is-on' : undefined}
            onClick={() => onPick(startOfYear(isoFromParts(year, 0, 1)))}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  )
}
