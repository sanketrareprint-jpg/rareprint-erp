"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// "Not Contacted" is now a tab inside the main CRM leads page (List / Kanban
// / Follow-ups / Not Contacted) instead of a standalone read-only page, so
// contacts can be worked like any other lead — status changes, follow-ups,
// calls. This route just forwards old links/bookmarks to that tab.
export default function NotContactedRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/crm#notcontacted");
  }, [router]);
  return null;
}
