import { listFarms } from "@/lib/farms";

const HERO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/clips/brand/hero.png`;

const STEPS = [
  "Sentinel-2 sees the field",
  "Grok diagnoses and calls in the farmer's language",
  "Grok Imagine sends a how-to video",
];

const BUILT_WITH = [
  "Cursor",
  "Grok Voice",
  "Grok Imagine",
  "grok-4.7",
  "Sentinel-2",
  "NASA POWER",
  "Supabase",
];

export default function Home() {
  const farm = listFarms()[0];
  const farmId = farm?.id ?? "cn-rice-2022";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <img
          src={HERO}
          alt="A satellite above terraced rice paddies at dawn, a beam of light reaching a farmer with a phone"
          className="aspect-video w-full rounded-2xl border border-slate-700 object-cover"
        />
        <header className="max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Orbital Agronomist</h1>
          <p className="mt-3 text-xl text-slate-200 sm:text-2xl">
            Satellites can see a farm failing. Now they can call the farmer.
          </p>
        </header>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step} className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs tracking-wide text-amber-300 uppercase">{index + 1}</p>
              <p className="mt-2 text-base text-slate-100">{step}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href={`/dashboard/${farmId}`}
            className="rounded-full bg-amber-400 px-5 py-3 text-center text-base font-semibold text-slate-950"
          >
            Open live dashboard
          </a>
          <a
            href={`/call/${farmId}`}
            className="rounded-full border border-slate-500 px-5 py-3 text-center text-base font-semibold text-white"
          >
            Call the field
          </a>
        </div>
        <p className="max-w-3xl text-sm text-slate-400">
          Replay of the real August 2022 Yangtze drought. The farmer is fictional; the data is real.
        </p>
        <p className="text-sm text-slate-500">Built with {BUILT_WITH.join(" · ")}</p>
      </div>
    </main>
  );
}
