import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/preact'
import { ControlBar } from './ControlBar'

const idleStatus = { state: 'idle' as const, message: '', paragraphsFound: 5, paragraphsAnalyzed: 0 }
const noop = () => {}

describe('ControlBar', () => {
  it('disables Start when missingApiKey is true', () => {
    render(<ControlBar status={idleStatus} onStart={noop} onStop={noop} missingApiKey={true} />)
    const btn = screen.getByRole('button', { name: /start/i })
    expect(btn).toBeDisabled()
  })

  it('enables Start when missingApiKey is false and paragraphs exist', () => {
    render(<ControlBar status={idleStatus} onStart={noop} onStop={noop} missingApiKey={false} />)
    const btn = screen.getByRole('button', { name: /start/i })
    expect(btn).not.toBeDisabled()
  })

  it('shows API key message when missingApiKey is true', () => {
    render(<ControlBar status={idleStatus} onStart={noop} onStop={noop} missingApiKey={true} />)
    expect(screen.getByText(/api key required/i)).toBeTruthy()
  })

  it('shows paragraph count when missingApiKey is false and idle', () => {
    render(<ControlBar status={idleStatus} onStart={noop} onStop={noop} missingApiKey={false} />)
    expect(screen.getByText('5 paragraphs')).toBeTruthy()
  })

  it('still disables Start when no paragraphs found, even with key', () => {
    const noParas = { ...idleStatus, paragraphsFound: 0 }
    render(<ControlBar status={noParas} onStart={noop} onStop={noop} missingApiKey={false} />)
    const btn = screen.getByRole('button', { name: /start/i })
    expect(btn).toBeDisabled()
  })

  it('disables Redo when missingApiKey is true and analysis is done', () => {
    const doneStatus = { state: 'done' as const, message: '5 summaries', paragraphsFound: 5, paragraphsAnalyzed: 5 }
    render(<ControlBar status={doneStatus} onStart={noop} onStop={noop} missingApiKey={true} />)
    const btn = screen.getByRole('button', { name: /redo/i })
    expect(btn).toBeDisabled()
  })

  it('shows only the missing-key message when missingApiKey is true and state is error', () => {
    const errorStatus = { state: 'error' as const, message: 'No API key configured', paragraphsFound: 5, paragraphsAnalyzed: 0 }
    render(<ControlBar status={errorStatus} onStart={noop} onStop={noop} missingApiKey={true} />)
    const msgs = screen.getAllByText(/./i).filter(el => el.classList.contains('control-msg'))
    expect(msgs).toHaveLength(1)
    expect(msgs[0].textContent).toMatch(/api key required/i)
  })
})
