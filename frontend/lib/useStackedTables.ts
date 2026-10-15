"use client";

import { useEffect } from "react";

/**
 * Phone card layout for wide tables (2026-10-15). Add `mobile-stack` to a
 * <table>; below 768px globals.css shows each row as a card and each cell as
 * "Heading ...... value". This hook copies every column's <th> text onto its
 * <td>s as data-label (the CSS prints it via ::before), and keeps doing so as
 * rows load or change. colSpan is respected. Desktop is unaffected — the
 * attribute is only read by the phone CSS.
 *
 * Call once per page that has `mobile-stack` tables.
 */
export function useStackedTables() {
  useEffect(() => {
    let frame = 0;
    const label = () => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>("table.mobile-stack").forEach((table) => {
        const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
        if (!headRow) return;
        const headings: string[] = [];
        for (const th of Array.from(headRow.cells)) {
          for (let i = 0; i < th.colSpan; i++) headings.push((th.textContent ?? "").trim());
        }
        for (const body of [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])]) {
          for (const row of Array.from(body.rows)) {
            let col = 0;
            for (const cell of Array.from(row.cells)) {
              const text = cell.colSpan > 1 ? "" : headings[col] ?? "";
              if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
              col += cell.colSpan;
            }
          }
        }
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(label); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
}
