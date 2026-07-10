"use client";
import { useToast } from "./Toast";

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Export({ receipts }) {
  const toast = useToast();

  const exportCsv = () => {
    if (!receipts.length) { toast("Nothing to export yet."); return; }
    const head = ["Date", "Brand", "Category", "Amount", "ImageURL"];
    const rows = receipts.map((r) =>
      [r.date, r.brand, r.category, r.amount, r.imgUrl]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
    download("receipts.csv", [head.join(","), ...rows].join("\n"), "text/csv");
  };

  const exportJson = () => {
    if (!receipts.length) { toast("Nothing to export yet."); return; }
    download("receipts-backup.json", JSON.stringify(receipts, null, 2), "application/json");
  };

  return (
    <div className="tab active">
      <h2>Export for taxes</h2>
      <p className="hint">Download every receipt as a spreadsheet (CSV) or a JSON backup. Both open in Excel and Google Sheets.</p>
      <div className="export-row">
        <button className="primary-btn" onClick={exportCsv}>Download CSV</button>
        <button className="ghost-btn" onClick={exportJson}>Download JSON backup</button>
      </div>
      <p className="hint">
        {receipts.length ? `${receipts.length} receipt(s) ready to export.` : "No receipts ready to export yet."}
      </p>
    </div>
  );
}
