import type { Lang } from "./types";

export type CallCopy = {
  brand: string;
  languageGroup: string;
  pushToTalk: string;
  pushToTalkState: (on: boolean) => string;
  pushToTalkHint: string;
  disclaimer: (eventName: string) => string;
  incomingCall: string;
  decline: string;
  accept: string;
  micDenied: string;
  checking: string;
  transcriptEmpty: string;
  farmer: string;
  assistant: string;
  typeMessage: string;
  typePlaceholder: string;
  send: string;
  reconnect: string;
  holdToTalk: string;
  listeningHold: string;
  hangUp: string;
  callAgain: string;
  startCall: string;
  loading: string;
  farmMissing: string;
  videoReceived: string;
  tapToPlay: string;
  clipMissing: string;
  generateFresh: string;
  generating: (clock: string) => string;
  usingSaved: string;
  ready: string;
  connecting: string;
  greeting: string;
  listening: string;
  pushToTalkStatus: string;
  speaking: string;
  dropped: string;
  ended: string;
  stopped: string;
  micOn: string;
  micUnavailable: string;
  languageBadge: string;
};

const en: CallCopy = {
  brand: "Orbital Agronomist",
  languageGroup: "Language",
  pushToTalk: "Push to talk",
  pushToTalkState: (on) => `Push to talk ${on ? "on" : "off"}`,
  pushToTalkHint:
    "Hold the button (or spacebar) to send your voice. Background noise is ignored until you press.",
  disclaimer: (eventName) =>
    `Replay of real ${eventName} satellite and weather data. The farmer is fictional. Guidance is general; confirm with your local agricultural extension officer.`,
  incomingCall: "Incoming call",
  decline: "Decline",
  accept: "Accept",
  micDenied: "Microphone access was denied. Allow the mic in the browser, or type your message.",
  checking: "Checking satellite data…",
  transcriptEmpty: "The call transcript will appear here.",
  farmer: "Farmer",
  assistant: "Orbital Agronomist",
  typeMessage: "Type a message",
  typePlaceholder: "Or type a message",
  send: "Send",
  reconnect: "Reconnect",
  holdToTalk: "Hold to talk",
  listeningHold: "Listening…",
  hangUp: "Hang up",
  callAgain: "Call again",
  startCall: "Start call",
  loading: "Loading the field…",
  farmMissing: "This farm is not configured.",
  videoReceived: "Video message received",
  tapToPlay: "Tap to play",
  clipMissing: "The clip file is missing.",
  generateFresh: "Generate a fresh video",
  generating: (clock) => `Generating with Grok Imagine… ${clock}`,
  usingSaved: "Using saved video",
  ready: "Ready to call.",
  connecting: "Connecting the call.",
  greeting: "Greeting.",
  listening: "Listening.",
  pushToTalkStatus: "Push to talk.",
  speaking: "Speaking.",
  dropped: "The voice connection dropped.",
  ended: "Call ended.",
  stopped: "The call stopped.",
  micOn: "Microphone on.",
  micUnavailable: "Microphone unavailable.",
  languageBadge: "EN",
};

const zh: CallCopy = {
  brand: "天眼农技助手",
  languageGroup: "语言",
  pushToTalk: "按住说话",
  pushToTalkState: (on) => `按住说话${on ? "已开" : "已关"}`,
  pushToTalkHint: "按住按钮（或空格键）说话。未按下时，背景噪音会被忽略。",
  disclaimer: (eventName) =>
    `这里回放的是真实的${eventName}卫星与天气数据。农户是虚构的。建议仅供参考，请向当地农技推广人员确认。`,
  incomingCall: "来电",
  decline: "拒绝",
  accept: "接听",
  micDenied: "麦克风权限被拒绝。请在浏览器中允许使用麦克风，或改为输入文字。",
  checking: "正在查看卫星数据…",
  transcriptEmpty: "通话文字记录会显示在这里。",
  farmer: "农户",
  assistant: "天眼农技助手",
  typeMessage: "输入文字",
  typePlaceholder: "或输入文字",
  send: "发送",
  reconnect: "重新连接",
  holdToTalk: "按住说话",
  listeningHold: "正在听…",
  hangUp: "挂断",
  callAgain: "再打一次",
  startCall: "开始通话",
  loading: "正在加载田块…",
  farmMissing: "这块田尚未配置。",
  videoReceived: "收到视频消息",
  tapToPlay: "点按播放",
  clipMissing: "视频文件缺失。",
  generateFresh: "生成一段新视频",
  generating: (clock) => `正在用 Grok Imagine 生成… ${clock}`,
  usingSaved: "使用已保存的视频",
  ready: "可以开始通话。",
  connecting: "正在接通。",
  greeting: "正在问候。",
  listening: "正在听。",
  pushToTalkStatus: "按住说话。",
  speaking: "正在说话。",
  dropped: "语音连接已断开。",
  ended: "通话已结束。",
  stopped: "通话已停止。",
  micOn: "麦克风已打开。",
  micUnavailable: "麦克风不可用。",
  languageBadge: "中文",
};

export const callCopy: Record<Lang, CallCopy> = { en, zh };

const errorZh: Record<string, string> = {
  "Could not start the call": "无法开始通话",
  "Could not reconnect": "无法重新连接",
  "Could not get a voice token. Try again.": "无法获取语音令牌。请再试一次。",
  "Could not open a call record": "无法建立通话记录",
  "The voice connection failed.": "语音连接失败。",
  "The voice connection dropped.": "语音连接已断开。",
  "Voice session error": "语音会话出错",
  "Voice session response was empty": "语音会话没有返回内容",
  "Voice session response did not include a token": "语音会话没有返回令牌",
  "Voice connection failed": "语音连接失败",
  "Voice session is not configured": "语音会话未配置",
  "Unknown farm": "未知农场",
  "Unsupported language": "不支持的语言",
  "Could not update the call": "无法更新通话",
  "Could not end the call": "无法结束通话",
  "Could not send the drought alert": "无法发送干旱提醒",
  Forbidden: "请求被拒绝",
  "Call expired": "通话已超时",
  "Unknown call": "未知通话",
  "Invalid call id": "通话编号无效",
};

/** Known call-page errors. English messages stay exactly as the session emitted them. */
export function localizeError(language: Lang, message: string): string {
  if (language !== "zh" || !message) return message;
  return errorZh[message] ?? message;
}

const GENERATING_PREFIX = "Generating with Grok Imagine… ";

/** Fresh-video status from the hook. English notes are left unchanged. */
export function localizeFreshNote(language: Lang, note: string | null): string | null {
  if (!note || language !== "zh") return note;
  if (note.startsWith(GENERATING_PREFIX)) {
    return zh.generating(note.slice(GENERATING_PREFIX.length));
  }
  if (note === "Using saved video") return zh.usingSaved;
  return note;
}
