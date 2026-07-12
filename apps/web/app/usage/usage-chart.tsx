"use client";

import { useState } from "react";

import type { UsageData, UsageDay } from "@/lib/usage-data";

const CHART_HEIGHT = 240;
const CHART_WIDTH = 960;
const PADDING = { bottom: 36, left: 44, right: 12, top: 16 };
type PopoverSeries = {
  color: string;
  label: string;
  value: number;
};

export function UsageChart({ days }: { days: UsageData["days"] }) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const maxValue = Math.max(1, ...days.map((day) => Math.max(day.api, day.browser)));
  const yMax = getRoundedMax(maxValue);
  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(3, Math.min(10, groupWidth * 0.34));
  const ticks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);

  return (
    <ChartContainer
      activeIndex={activeIndex}
      days={days}
      getSeries={(day) => [
        { color: "bg-sky-400", label: "API", value: day.api },
        { color: "bg-violet-400", label: "Browser", value: day.browser },
      ]}
    >
      <svg
        aria-label="Completed API and browser tests by day"
        className="block w-full"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <ChartGrid plotHeight={plotHeight} ticks={ticks} yMax={yMax} />

        {days.map((day, index) => {
          const center = PADDING.left + groupWidth * (index + 0.5);
          const apiHeight = (day.api / yMax) * plotHeight;
          const browserHeight = (day.browser / yMax) * plotHeight;
          const showLabel = index === 0 || index === days.length - 1 || index % 5 === 4;

          return (
            <ChartDayTarget
              center={center}
              day={day}
              groupWidth={groupWidth}
              index={index}
              key={day.date}
              onActiveChange={setActiveIndex}
              plotHeight={plotHeight}
            >
              <rect
                fill="#38bdf8"
                height={apiHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth - 1}
                y={PADDING.top + plotHeight - apiHeight}
              />
              <rect
                fill="#a78bfa"
                height={browserHeight}
                rx="2"
                width={barWidth}
                x={center + 1}
                y={PADDING.top + plotHeight - browserHeight}
              />
              {showLabel ? <ChartDateLabel center={center} label={day.label} /> : null}
            </ChartDayTarget>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

export function TestResultsChart({ days }: { days: UsageData["days"] }) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const yMax = getRoundedMax(Math.max(1, ...days.map((day) => day.total)));
  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(5, Math.min(18, groupWidth * 0.64));
  const ticks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);

  return (
    <ChartContainer
      activeIndex={activeIndex}
      days={days}
      getSeries={(day) => [
        { color: "bg-emerald-400", label: "Passed", value: day.passed },
        { color: "bg-red-400", label: "Failed", value: day.failed },
      ]}
    >
      <svg
        aria-label="Passed and failed tests by day"
        className="block w-full"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <ChartGrid plotHeight={plotHeight} ticks={ticks} yMax={yMax} />

        {days.map((day, index) => {
          const center = PADDING.left + groupWidth * (index + 0.5);
          const passedHeight = (day.passed / yMax) * plotHeight;
          const failedHeight = (day.failed / yMax) * plotHeight;
          const bottom = PADDING.top + plotHeight;
          const showLabel = index === 0 || index === days.length - 1 || index % 5 === 4;

          return (
            <ChartDayTarget
              center={center}
              day={day}
              groupWidth={groupWidth}
              index={index}
              key={day.date}
              onActiveChange={setActiveIndex}
              plotHeight={plotHeight}
            >
              <rect
                fill="#34d399"
                height={passedHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth / 2}
                y={bottom - passedHeight}
              />
              <rect
                fill="#f87171"
                height={failedHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth / 2}
                y={bottom - passedHeight - failedHeight}
              />
              {showLabel ? <ChartDateLabel center={center} label={day.label} /> : null}
            </ChartDayTarget>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

export function TestSourcesChart({ days }: { days: UsageData["days"] }) {
  const [activeIndex, setActiveIndex] = useState<number>();
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const maxValue = Math.max(
    1,
    ...days.map((day) => Math.max(day.scheduled, day.testSessions)),
  );
  const yMax = getRoundedMax(maxValue);
  const groupWidth = plotWidth / days.length;
  const barWidth = Math.max(3, Math.min(10, groupWidth * 0.34));
  const ticks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);

  return (
    <ChartContainer
      activeIndex={activeIndex}
      days={days}
      getSeries={(day) => [
        { color: "bg-emerald-400", label: "Scheduled", value: day.scheduled },
        { color: "bg-amber-400", label: "Test sessions", value: day.testSessions },
      ]}
    >
      <svg
        aria-label="Scheduled checks and test sessions by day"
        className="block w-full"
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      >
        <ChartGrid plotHeight={plotHeight} ticks={ticks} yMax={yMax} />

        {days.map((day, index) => {
          const center = PADDING.left + groupWidth * (index + 0.5);
          const scheduledHeight = (day.scheduled / yMax) * plotHeight;
          const sessionsHeight = (day.testSessions / yMax) * plotHeight;
          const showLabel = index === 0 || index === days.length - 1 || index % 5 === 4;

          return (
            <ChartDayTarget
              center={center}
              day={day}
              groupWidth={groupWidth}
              index={index}
              key={day.date}
              onActiveChange={setActiveIndex}
              plotHeight={plotHeight}
            >
              <rect
                fill="#34d399"
                height={scheduledHeight}
                rx="2"
                width={barWidth}
                x={center - barWidth - 1}
                y={PADDING.top + plotHeight - scheduledHeight}
              />
              <rect
                fill="#fbbf24"
                height={sessionsHeight}
                rx="2"
                width={barWidth}
                x={center + 1}
                y={PADDING.top + plotHeight - sessionsHeight}
              />
              {showLabel ? <ChartDateLabel center={center} label={day.label} /> : null}
            </ChartDayTarget>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

function ChartContainer({
  activeIndex,
  children,
  days,
  getSeries,
}: {
  activeIndex?: number;
  children: React.ReactNode;
  days: UsageDay[];
  getSeries: (day: UsageDay) => [PopoverSeries, PopoverSeries];
}) {
  const activeDay = activeIndex === undefined ? undefined : days[activeIndex];

  return (
    <div className="overflow-x-auto">
      <div className="relative min-w-[720px]">
        {children}
        {activeDay && activeIndex !== undefined ? (
          <ChartPopover
            day={activeDay}
            index={activeIndex}
            series={getSeries(activeDay)}
            totalDays={days.length}
          />
        ) : null}
      </div>
    </div>
  );
}

function ChartDayTarget({
  center,
  children,
  day,
  groupWidth,
  index,
  onActiveChange,
  plotHeight,
}: {
  center: number;
  children: React.ReactNode;
  day: UsageDay;
  groupWidth: number;
  index: number;
  onActiveChange: (index?: number) => void;
  plotHeight: number;
}) {
  return (
    <g
      aria-label={`Show details for ${day.label}`}
      className="cursor-pointer outline-none focus:[&_rect:first-child]:fill-slate-700/20"
      onBlur={() => onActiveChange(undefined)}
      onFocus={() => onActiveChange(index)}
      onMouseEnter={() => onActiveChange(index)}
      onMouseLeave={() => onActiveChange(undefined)}
      role="button"
      tabIndex={0}
    >
      <rect
        fill="transparent"
        height={plotHeight}
        width={groupWidth}
        x={center - groupWidth / 2}
        y={PADDING.top}
      />
      {children}
    </g>
  );
}

function ChartGrid({
  plotHeight,
  ticks,
  yMax,
}: {
  plotHeight: number;
  ticks: number[];
  yMax: number;
}) {
  return ticks.map((tick) => {
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
  });
}

function ChartDateLabel({ center, label }: { center: number; label: string }) {
  return (
    <text
      fill="#64748b"
      fontSize="10"
      textAnchor="middle"
      x={center}
      y={CHART_HEIGHT - 10}
    >
      {label}
    </text>
  );
}

function ChartPopover({
  day,
  index,
  series,
  totalDays,
}: {
  day: UsageDay;
  index: number;
  series: [PopoverSeries, PopoverSeries];
  totalDays: number;
}) {
  const alignment =
    index < 3
      ? "translate-x-0"
      : index >= totalDays - 3
        ? "-translate-x-full"
        : "-translate-x-1/2";

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none absolute top-2 z-10 w-56 rounded-md border border-slate-700 bg-[#18212d]/95 p-3 text-xs shadow-xl backdrop-blur ${alignment}`}
      data-testid="chart-popover"
      style={{ left: `${((index + 0.5) / totalDays) * 100}%` }}
    >
      <div className="font-semibold text-slate-100">{day.label}</div>
      <div className="mt-0.5 text-slate-500">{day.date}</div>
      <div className="mt-3 space-y-1.5 tabular-nums">
        <PopoverRow label="Total" value={day.total} />
        <PopoverPair left={series[0]} right={series[1]} />
      </div>
    </div>
  );
}

function PopoverRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-slate-400">
      <span>{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function PopoverPair({
  left,
  right,
}: {
  left: { color: string; label: string; value: number };
  right: { color: string; label: string; value: number };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 border-t border-slate-700/70 pt-1.5 text-slate-400">
      {[left, right].map((item) => (
        <div className="flex min-w-0 items-center gap-1.5" key={item.label}>
          <span className={`h-2 w-2 shrink-0 rounded-sm ${item.color}`} />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="font-semibold text-slate-100">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function getRoundedMax(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
