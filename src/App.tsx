import { createMemo, createSignal, createEffect, onCleanup } from 'solid-js'
import {
  CategoryScale,
  Chart as ChartJS,
  Decimation,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type Chart,
  type ScatterDataPoint,
} from 'chart.js'
import './App.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineController,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  Decimation,
)

type SimulationParams = {
  winAmount: number
  lossAmount: number
  tosses: number
}

type SimulationResult = SimulationParams & {
  id: number
  points: ScatterDataPoint[]
  wins: number
  losses: number
  finalBalance: number
  bestBalance: number
  worstBalance: number
  maxDrawdown: number
}

const DEFAULT_PARAMS: SimulationParams = {
  winAmount: 10,
  lossAmount: 9,
  tosses: 250,
}

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

const simulateCoinStrategy = (
  params: SimulationParams,
  id = Date.now(),
): SimulationResult => {
  const winAmount = clampNumber(params.winAmount, 0, 1_000_000)
  const lossAmount = clampNumber(params.lossAmount, 0, 1_000_000)
  const tosses = Math.round(clampNumber(params.tosses, 1, 50_000))

  let balance = 0
  let wins = 0
  let losses = 0
  let peak = 0
  let maxDrawdown = 0
  let bestBalance = 0
  let worstBalance = 0
  const points: ScatterDataPoint[] = [{ x: 0, y: 0 }]

  for (let toss = 1; toss <= tosses; toss += 1) {
    if (Math.random() < 0.5) {
      balance += winAmount
      wins += 1
    } else {
      balance -= lossAmount
      losses += 1
    }

    peak = Math.max(peak, balance)
    maxDrawdown = Math.max(maxDrawdown, peak - balance)
    bestBalance = Math.max(bestBalance, balance)
    worstBalance = Math.min(worstBalance, balance)
    points.push({ x: toss, y: balance })
  }

  return {
    id,
    winAmount,
    lossAmount,
    tosses,
    points,
    wins,
    losses,
    finalBalance: balance,
    bestBalance,
    worstBalance,
    maxDrawdown,
  }
}

const formatNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
  }).format(value)

const signed = (value: number) =>
  `${value > 0 ? '+' : ''}${formatNumber(value)}`

function App() {
  let chartCanvas: HTMLCanvasElement | undefined
  let balanceChart: Chart<'line', ScatterDataPoint[], number> | undefined

  const [winAmount, setWinAmount] = createSignal(DEFAULT_PARAMS.winAmount)
  const [lossAmount, setLossAmount] = createSignal(DEFAULT_PARAMS.lossAmount)
  const [tosses, setTosses] = createSignal(DEFAULT_PARAMS.tosses)
  const [result, setResult] = createSignal(
    simulateCoinStrategy(DEFAULT_PARAMS, 1),
  )

  const expectedPerToss = createMemo(
    () => (result().winAmount - result().lossAmount) / 2,
  )
  const expectedTotal = createMemo(() => expectedPerToss() * result().tosses)
  const variancePerToss = createMemo(() => {
    const mean = expectedPerToss()
    return (
      ((result().winAmount - mean) ** 2 +
        (-result().lossAmount - mean) ** 2) /
      2
    )
  })
  const standardDeviation = createMemo(() =>
    Math.sqrt(variancePerToss() * result().tosses),
  )
  const sampleMean = createMemo(() => result().finalBalance / result().tosses)
  const winRate = createMemo(() => result().wins / result().tosses)

  const runSimulation = () => {
    setResult(
      simulateCoinStrategy({
        winAmount: winAmount(),
        lossAmount: lossAmount(),
        tosses: tosses(),
      }),
    )
  }

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    runSimulation()
  }

  createEffect(() => {
    const simulation = result()
    if (!chartCanvas) return

    balanceChart?.destroy()
    balanceChart = new ChartJS(chartCanvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Balance',
            data: simulation.points,
            borderColor: '#176b87',
            backgroundColor: 'rgba(23, 107, 135, 0.14)',
            borderWidth: 2,
            fill: true,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Expected balance',
            data: [
              { x: 0, y: 0 },
              { x: simulation.tosses, y: expectedTotal() },
            ],
            borderColor: '#c05246',
            borderDash: [8, 6],
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          decimation: {
            enabled: simulation.points.length > 1_000,
            algorithm: 'lttb',
            samples: 800,
          },
          legend: {
            align: 'end',
            labels: {
              boxWidth: 10,
              usePointStyle: true,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${signed(Number(context.parsed.y))}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Coin toss',
            },
            grid: {
              color: 'rgba(12, 33, 46, 0.08)',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Balance, coins',
            },
            grid: {
              color: 'rgba(12, 33, 46, 0.08)',
            },
          },
        },
      },
    })
  })

  onCleanup(() => balanceChart?.destroy())

  return (
    <main class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Monte Carlo coin strategy tester</p>
          <h1>Balance variance simulator</h1>
        </div>
        <div class="run-summary">
          <span>Last run</span>
          <strong>{result().tosses.toLocaleString('en-US')} tosses</strong>
        </div>
      </header>

      <section class="workbench">
        <aside class="control-panel" aria-label="Simulation controls">
          <form onSubmit={onSubmit}>
            <div class="field-stack">
              <label for="win-amount" class="form-label">
                Coins won on heads
              </label>
              <div class="input-group">
                <span class="input-group-text">+</span>
                <input
                  id="win-amount"
                  class="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                  value={winAmount()}
                  onInput={(event) =>
                    setWinAmount(event.currentTarget.valueAsNumber)
                  }
                />
              </div>
            </div>

            <div class="field-stack">
              <label for="loss-amount" class="form-label">
                Coins lost on tails
              </label>
              <div class="input-group">
                <span class="input-group-text">-</span>
                <input
                  id="loss-amount"
                  class="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                  value={lossAmount()}
                  onInput={(event) =>
                    setLossAmount(event.currentTarget.valueAsNumber)
                  }
                />
              </div>
            </div>

            <div class="field-stack">
              <label for="toss-count" class="form-label">
                Number of tosses
              </label>
              <input
                id="toss-count"
                class="form-control"
                type="number"
                min="1"
                max="50000"
                step="1"
                value={tosses()}
                onInput={(event) =>
                  setTosses(Math.round(event.currentTarget.valueAsNumber))
                }
              />
            </div>

            <button class="btn btn-primary w-100" type="submit">
              Run simulation
            </button>
          </form>

          <div class="metric-list" aria-label="Simulation results">
            <div>
              <span>Final balance</span>
              <strong class={result().finalBalance >= 0 ? 'profit' : 'loss'}>
                {signed(result().finalBalance)}
              </strong>
            </div>
            <div>
              <span>Expected total</span>
              <strong>{signed(expectedTotal())}</strong>
            </div>
            <div>
              <span>Standard deviation</span>
              <strong>{formatNumber(standardDeviation())}</strong>
            </div>
            <div>
              <span>Max drawdown</span>
              <strong>{formatNumber(result().maxDrawdown)}</strong>
            </div>
          </div>
        </aside>

        <section class="chart-panel" aria-label="Balance chart">
          <div class="chart-toolbar">
            <div>
              <h2>Balance path</h2>
              <p>
                Real random tosses compared with the theoretical expected
                balance.
              </p>
            </div>
            <div class="badge-row" aria-label="Run quality metrics">
              <span class="badge text-bg-light">
                Win rate {formatNumber(winRate() * 100, 1)}%
              </span>
              <span class="badge text-bg-light">
                Sample mean {signed(sampleMean())}
              </span>
            </div>
          </div>

          <div class="chart-frame">
            <canvas ref={chartCanvas} aria-label="Balance movement chart" />
          </div>

          <div class="range-grid" aria-label="Balance range">
            <div>
              <span>Best balance</span>
              <strong>{signed(result().bestBalance)}</strong>
            </div>
            <div>
              <span>Worst balance</span>
              <strong>{signed(result().worstBalance)}</strong>
            </div>
            <div>
              <span>Wins / losses</span>
              <strong>
                {result().wins.toLocaleString('en-US')} /{' '}
                {result().losses.toLocaleString('en-US')}
              </strong>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
