import { FarmActions } from "./farm-actions";
import { listFarms } from "@/lib/farms";

export default function Home() {
  const farms = listFarms();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
        <header>
          <p className="text-xs tracking-[0.25em] text-amber-300 uppercase">Orbital Agronomist</p>
          <h1 className="mt-2 text-4xl font-semibold text-white">A field, seen from orbit</h1>
          <p className="mt-3 max-w-xl text-lg text-slate-300">
            Real Sentinel-2 and NASA weather for one fictional farmer. Call the hotline, or open the
            judge dashboard.
          </p>
        </header>
        <div className="grid gap-4">
          {farms.map((farm) => (
            <article
              key={farm.id}
              className="rounded-2xl border border-slate-700 bg-slate-900 p-6"
            >
              <p className="text-sm text-amber-200">{farm.profile.event.name}</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{farm.profile.farmerName}</h2>
              <p className="text-lg text-slate-400">{farm.profile.farmerNameEn}</p>
              <p className="mt-2 text-slate-300">
                {farm.profile.crop} · {farm.profile.region}, {farm.profile.country}
              </p>
              <p className="mt-1 text-sm tracking-wide text-slate-400 uppercase">
                {farm.profile.languages.map((language) => (language === "zh" ? "中文" : "English")).join(" · ")}
              </p>
              <FarmActions farmId={farm.id} />
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
