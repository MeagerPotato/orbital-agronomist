export function IncomingAlert({
  headline,
  incomingLabel,
  declineLabel,
  acceptLabel,
  busy,
  onAccept,
  onDecline,
}: {
  headline: string;
  incomingLabel: string;
  declineLabel: string;
  acceptLabel: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <section
      data-testid="incoming-alert"
      role="dialog"
      aria-labelledby="incoming-alert-title"
      className="flex flex-col items-center gap-6 rounded-3xl bg-slate-950 px-6 py-10 text-center text-white"
    >
      <span className="h-16 w-16 animate-pulse rounded-full bg-green-500" aria-hidden />
      <div>
        <p className="text-xs tracking-[0.2em] text-slate-400 uppercase">{incomingLabel}</p>
        <h2 id="incoming-alert-title" className="mt-2 text-xl font-semibold leading-snug">
          {headline}
        </h2>
      </div>
      <div className="flex w-full gap-3">
        <button
          type="button"
          onClick={onDecline}
          disabled={busy}
          className="flex-1 rounded-full bg-red-700 py-4 text-lg disabled:opacity-60"
        >
          {declineLabel}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex-1 rounded-full bg-green-600 py-4 text-lg disabled:opacity-60"
        >
          {acceptLabel}
        </button>
      </div>
    </section>
  );
}
