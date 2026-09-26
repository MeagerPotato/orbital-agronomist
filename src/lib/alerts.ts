import type { Lang } from "./types";

/** Exact incoming-call line. Chinese uses the same meaning. */
export function droughtAlertHeadline(language: Lang): string {
  if (language === "zh") return "天眼农技助手来电：您的田有干旱提醒";
  return "Orbital Agronomist is calling: drought alert for your field";
}

/** Spoken force_message. Uses the field's real greenness change. */
export function droughtAlertOpener(
  language: Lang,
  crop: string,
  pctChangeVsBaseline: number,
): string {
  const pct = Math.round(pctChangeVsBaseline);
  const amount = Math.abs(pct);
  const hasPct = Number.isFinite(pct);
  if (language === "zh") {
    const change = hasPct
      ? `您的${crop}比去年同期大约${pct < 0 ? "少" : "多"}了${amount}%的绿色。`
      : "";
    return `您好，我是天眼农技助手，来电是给您的田一个干旱提醒。${change}我可以说说卫星和天气看到的情况，以及可以先做什么。`;
  }
  const change = hasPct
    ? `Your ${crop} is about ${amount}% ${pct < 0 ? "less green" : "greener"} than this time last year. `
    : "";
  return `This is Orbital Agronomist calling with a drought alert for your field. ${change}I can tell you what the satellite and the weather show, and what to do first.`;
}
