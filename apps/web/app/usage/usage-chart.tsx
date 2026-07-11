import type { UsageData } from "@/lib/usage-data";

const CHART_HEIGHT = 240;
const CHART_WIDTH = 960;
const PADDING = { bottom: 36, left: 44, right: 12, top: 16 };

export function UsageChart({ days }: { days: UsageData["days"] }) {
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const maxValue = Math.max(1, ...days.map((day) => Math.max(day.api, day.browser)));
  const yMax = getRoundedMax(maxValue);
  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(3, Math.min(10, groupWidth * 0.34));
  const ticks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);

  return (
    <div className="overflow-x-auto">
      <svg
        aria-label="Completed API and browser tests by day"
        className="min-w-[720px]"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        {ticks.map((tick) => {
          const y = PADDING.top + plotHeight - (tick / yMax) * plotHeight;
          return (
            <g key={tick}>
              <line
                stroke="#273244"
                strokeDasharray="3 4"
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text fill="#64748b" fontSize="10" textAnchor="end" x={36} y={y + 3}>
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {days.map((day, index) => {
          const center = PADDING.left + groupWidth * (index + 0.5);
          const apiHeight = (day.api / yMax) * plotHeight;
          const browserHeight = (day.browser / yMax) * plotHeight;
          const showLabel = index === 0 || index === days.length - 1 || index % 5 === 4;

          return (
            <g key={day.date}>
              <rect
                fill="#38bdf8"
                height={apiHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth - 1}
                y={PADDING.top + plotHeight - apiHeight}
              >
                <title>{`${day.label}: ${day.api} API tests`}</title>
              </rect>
              <rect
                fill="#a78bfa"
                height={browserHeight}
                rx="2"
                width={barWidth}
                x={center + 1}
                y={PADDING.top + plotHeight - browserHeight}
              >
                <title>{`${day.label}: ${day.browser} browser tests`}</title>
              </rect>
              {showLabel ? (
                <text
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  x={center}
                  y={CHART_HEIGHT - 10}
                >
                  {day.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TestResultsChart({ days }: { days: UsageData["days"] }) {
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const yMax = getRoundedMax(Math.max(1, ...days.map((day) => day.total)));
  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(5, Math.min(18, groupWidth * 0.64));
  const ticks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);

  return (
    <div className="overflow-x-auto">
      <svg
        aria-label="Passed and failed tests by day"
        className="min-w-[720px]"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        {ticks.map((tick) => {
          const y = PADDING.top + plotHeight - (tick / yMax) * plotHeight;
          return (
            <g key={tick}>
              <line
                stroke="#273244"
                strokeDasharray="3 4"
                x1={PADDING.left}
                x2={CHART_WIDTH - PADDING.right}
                y1={y}
                y2={y}
              />
              <text fill="#64748b" fontSize="10" textAnchor="end" x={36} y={y + 3}>
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {days.map((day, index) => {
          const center = PADDING.left + groupWidth * (index + 0.5);
          const passedHeight = (day.passed / yMax) * plotHeight;
          const failedHeight = (day.failed / yMax) * plotHeight;
          const bottom = PADDING.top + plotHeight;
          const showLabel = index === 0 || index === days.length - 1 || index % 5 === 4;

          return (
            <g key={day.date}>
              <rect
                fill="#34d399"
                height={passedHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth / 2}
                y={bottom - passedHeight}
              >
                <title>{`${day.label}: ${day.passed} passed`}</title>
              </rect>
              <rect
                fill="#f87171"
                height={failedHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth / 2}
                y={bottom - passedHeight - failedHeight}
              >
                <title>{`${day.label}: ${day.failed} failed`}</title>
              </rect>
              {showLabel ? (
                <text
                  fill="#64748b"
                  fontSize="10"
                  textAnchor="middle"
                  x={center}
                  y={CHART_HEIGHT - 10}
                >
                  {day.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function getRoundedMax(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
