import type { Metadata } from "next";
import { QRCodeSVG } from "qrcode.react";

const LIVE_URL = "https://orbital-agronomist.vercel.app/dashboard/cn-rice-2022";

export const metadata: Metadata = {
  title: "Orbital Agronomist — expo handout",
};

const STEPS = [
  "Scan the code and open the live dashboard for this rice field.",
  "Press “Send drought alert call,” or start a call and ask why the rice is stressed.",
  "Listen to the advice. A short video arrives in the farmer’s language.",
];

export default function ExpoHandout() {
  return (
    <main className="sheet">
      <style>{`
        html, body { background: #f4f1ea !important; color: #1c1917 !important; }
        .sheet {
          box-sizing: border-box;
          width: 8.5in;
          min-height: 11in;
          margin: 0 auto;
          padding: 0.7in 0.75in;
          background: #f4f1ea;
          color: #1c1917;
          display: flex;
          flex-direction: column;
          gap: 0.35in;
        }
        h1 { font-size: 42px; line-height: 1.05; margin: 0; }
        .tagline { font-size: 20px; line-height: 1.35; max-width: 6.6in; margin: 0.12in 0 0; }
        ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.16in; }
        li { display: flex; gap: 0.16in; align-items: flex-start; font-size: 16px; line-height: 1.4; }
        .num {
          flex: none;
          width: 0.36in;
          height: 0.36in;
          border-radius: 999px;
          background: #1c1917;
          color: #f4f1ea;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 700;
        }
        .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 0.14in; margin-top: 0.1in; }
        .url { font-size: 13px; word-break: break-all; text-align: center; }
        .url a { color: inherit; }
        footer { margin-top: auto; font-size: 12px; letter-spacing: 0.01em; color: #44403c; }
        @page { size: letter; margin: 0.5in; }
        @media print {
          html, body { background: #fff !important; }
          .sheet { width: auto; min-height: auto; padding: 0; background: #fff; }
        }
      `}</style>
      <header>
        <h1>Orbital Agronomist</h1>
        <p className="tagline">Satellites can see a farm failing. Now they can call the farmer.</p>
      </header>
      <ol>
        {STEPS.map((step, index) => (
          <li key={step}>
            <span className="num">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="qr-wrap">
        <QRCodeSVG value={LIVE_URL} size={280} bgColor="#f4f1ea" fgColor="#1c1917" level="M" />
        <p className="url">
          <a href={LIVE_URL}>{LIVE_URL}</a>
        </p>
      </div>
      <footer>Built with Cursor · Grok Voice · Grok Imagine · grok-4.7 · Sentinel-2 · NASA POWER · Supabase</footer>
    </main>
  );
}
