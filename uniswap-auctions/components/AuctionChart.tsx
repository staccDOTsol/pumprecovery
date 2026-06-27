"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts";
import type { PricePoint } from "@/lib/types";

export function AuctionChart({ data, height = 360 }: { data: PricePoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { labelBackgroundColor: "#16a34a" }, horzLine: { labelBackgroundColor: "#16a34a" } },
      handleScale: false,
      handleScroll: false,
    });
    const series = chart.addAreaSeries({
      lineColor: "#86efac",
      topColor: "rgba(134,239,172,0.35)",
      bottomColor: "rgba(134,239,172,0.0)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) chart.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      // lightweight-charts wants ascending unique unix-second timestamps
      data.map((p) => ({ time: p.time as never, value: p.value })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}
