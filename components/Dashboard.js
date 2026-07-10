"use client";
import { useEffect, useRef } from "react";
import {
  Chart, BarController, BarElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Legend, Tooltip,
} from "chart.js";
import { money } from "@/lib/receipt";

Chart.register(
  BarController, BarElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Legend, Tooltip
);

export default function Dashboard({ receipts }) {
  const monthlyRef = useRef(null);
  const categoryRef = useRef(null);
  const monthlyChart = useRef(null);
  const categoryChart = useRef(null);

  // stats
  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const y = String(now.getFullYear());
  let mSum = 0, ySum = 0;
  receipts.forEach((r) => {
    if ((r.date || "").startsWith(ym)) mSum += r.amount;
    if ((r.date || "").startsWith(y)) ySum += r.amount;
  });

  useEffect(() => {
    const gridColor = "#e3dfd6", tick = "#8b897f";
    // quiet monochrome ramp (charcoal → warm grey) to match the minimal theme
    const palette = ["#1b1b1a", "#3f3d39", "#5c5a54", "#78756d", "#948f85",
      "#aca79b", "#c2bcae", "#d2ccbe", "#8b897f", "#4c4a46", "#6b6860"];

    // monthly: last 6 months
    const months = [], sums = [];
    const base = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      months.push(d.toLocaleString("en", { month: "short" }));
      sums.push(receipts.filter((r) => (r.date || "").startsWith(key)).reduce((s, r) => s + r.amount, 0));
    }
    // category totals
    const catTotals = {};
    receipts.forEach((r) => { catTotals[r.category || "Other"] = (catTotals[r.category || "Other"] || 0) + r.amount; });
    const catLabels = Object.keys(catTotals), catVals = Object.values(catTotals);

    monthlyChart.current?.destroy();
    if (monthlyRef.current) {
      monthlyChart.current = new Chart(monthlyRef.current, {
        type: "bar",
        data: { labels: months, datasets: [{ data: sums, backgroundColor: "#1b1b1a", borderRadius: 5 }] },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: tick } },
            y: { grid: { color: gridColor }, ticks: { color: tick } },
          },
        },
      });
    }
    categoryChart.current?.destroy();
    if (categoryRef.current) {
      categoryChart.current = new Chart(categoryRef.current, {
        type: "doughnut",
        data: { labels: catLabels, datasets: [{ data: catVals, backgroundColor: palette, borderColor: "#f7f5f1", borderWidth: 2 }] },
        options: { cutout: "62%", plugins: { legend: { position: "bottom", labels: { color: tick, boxWidth: 11, font: { size: 11 } } } } },
      });
    }
    return () => {
      monthlyChart.current?.destroy();
      categoryChart.current?.destroy();
    };
  }, [receipts]);

  return (
    <div className="tab active">
      <h2>Dashboard</h2>
      <p className="section-lead">A running view of what you have spent and saved.</p>
      <div className="figures">
        <div className="fig"><span className="fig-k">This month</span><span className="fig-v">{money(mSum)}</span></div>
        <div className="fig"><span className="fig-k">This year</span><span className="fig-v">{money(ySum)}</span></div>
        <div className="fig"><span className="fig-k">Receipts saved</span><span className="fig-v">{receipts.length}</span></div>
      </div>
      <div className="charts">
        <section className="chart">
          <h3>Monthly spend</h3>
          <div className="chart-box"><canvas ref={monthlyRef} /></div>
        </section>
        <section className="chart">
          <h3>By category</h3>
          <div className="chart-box"><canvas ref={categoryRef} /></div>
        </section>
      </div>
    </div>
  );
}
