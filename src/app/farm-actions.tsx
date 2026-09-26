"use client";

import { useEffect, useState } from "react";
import { absoluteUrl, demoForced } from "@/lib/origin";

export function FarmActions({ farmId }: { farmId: string }) {
  const [dashboard, setDashboard] = useState(`/dashboard/${farmId}`);
  const [call, setCall] = useState(`/call/${farmId}`);

  useEffect(() => {
    const demo = demoForced() ? "?demo=1" : "";
    setDashboard(absoluteUrl(`/dashboard/${farmId}`));
    setCall(absoluteUrl(`/call/${farmId}${demo}`));
  }, [farmId]);

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <a
        href={dashboard}
        className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950"
      >
        Open dashboard
      </a>
      <a
        href={call}
        className="rounded-full border border-slate-500 px-4 py-2 text-sm font-semibold text-white"
      >
        Call from this device
      </a>
    </div>
  );
}
