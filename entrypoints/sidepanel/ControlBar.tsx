import type { AnalysisState, Status } from './App'

export function ControlBar({ status, onStart, onStop, missingApiKey }: {
  status: Status; onStart: () => void; onStop: () => void; missingApiKey: boolean
}) {
  const isRunning = status.state === 'running'
  const isDone = status.state === 'done'
  const isError = status.state === 'error'
  const pct = Math.round(status.paragraphsAnalyzed / Math.max(1, status.paragraphsFound) * 100)
  const startDisabled = missingApiKey || status.paragraphsFound === 0

  return (
    <div class="control-bar">
      <div class="control-left">
        {isRunning && (
          <>
            <div class="control-msg">{status.message}</div>
            <div class="control-progress">
              <div class="progress-bar"><div class="progress-fill" style={`width:${pct}%`} /></div>
              <span class="progress-text">{status.paragraphsAnalyzed}/{status.paragraphsFound}</span>
            </div>
          </>
        )}
        {isDone && !missingApiKey && <div class="control-msg control-msg--done">{status.message}</div>}
        {isError && !missingApiKey && <div class="control-msg control-msg--error">{status.message}</div>}
        {missingApiKey && !isRunning && (
          <div class="control-msg control-msg--error">API key required — open ⚙ to configure</div>
        )}
        {!missingApiKey && status.state === 'idle' && (
          <div class="control-msg">
            {status.paragraphsFound > 0 ? `${status.paragraphsFound} paragraphs` : 'No page loaded'}
          </div>
        )}
      </div>
      {isRunning ? (
        <button class="ctrl-btn ctrl-btn--stop" onClick={onStop}>Stop</button>
      ) : (
        <button class="ctrl-btn ctrl-btn--start" onClick={onStart} disabled={startDisabled}>
          {isDone ? 'Redo' : 'Start'}
        </button>
      )}
    </div>
  )
}
