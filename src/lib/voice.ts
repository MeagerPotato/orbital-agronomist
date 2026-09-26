import knowledgeSources from "../../data/knowledge/sources.json";
import type { CallBundle } from "./farm-data";
import { knowledgeCollectionIdFor } from "./farms";
import { PhoneAudio } from "./phone-audio";
import type { ToolHandler } from "./tools";

const REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
const MAX_EARLY_CHUNKS = 50;

export type CallStatus =
  | "idle"
  | "connecting"
  | "greeting"
  | "listening"
  | "checking"
  | "speaking"
  | "ended"
  | "error";

type TranscriptRole = "user" | "assistant";

export type VoiceCallbacks = {
  onStatus: (status: CallStatus) => void;
  onTranscript: (role: TranscriptRole, text: string, final: boolean, itemId: string) => void;
  onTool: (name: string, phase: "call" | "result") => void;
  onChecking: (active: boolean) => void;
  onMic: (state: "on" | "denied") => void;
  onError: (message: string) => void;
  onCallId: (callId: string) => void;
};

type ServerEvent = Record<string, unknown> & { type?: string };

type PendingTool = {
  name: string;
  callId: string;
  arguments: unknown;
};

type QueuedEvent = {
  type: string;
  payload: Record<string, unknown>;
};

const AUDIO_DELTA_TYPES = new Set([
  "response.output_audio.delta",
  "response.audio.delta",
]);

export function readEphemeralToken(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new Error("Voice session response was empty");
  }
  const body = payload as Record<string, unknown>;
  const secret = body.client_secret;
  if (secret && typeof secret === "object") {
    const value = (secret as { value?: unknown }).value;
    if (typeof value === "string" && value) return value;
  }
  if (typeof body.value === "string" && body.value) return body.value;
  throw new Error("Voice session response did not include a token");
}

export class VoiceSession {
  private audio = new PhoneAudio();
  private socket: WebSocket | null = null;
  private callbacks: VoiceCallbacks;
  private bundle: CallBundle | null = null;
  private handlers: Record<string, ToolHandler> = {};
  private callId: string | null = null;
  private configured = false;
  private greeted = false;
  private ended = false;
  private earlyAudio: string[] = [];
  private pendingTools: PendingTool[] = [];
  private seenToolIds = new Set<string>();
  private responseDone = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private seenEventTypes = new Set<string>();
  private postedTranscripts = new Set<string>();
  private assistantDraft = "";
  private assistantItemId = "";
  private greetingText = "";
  private greetingEcho = false;
  private userDrafts = new Map<string, { text: string; posted: boolean }>();
  private userFallbackId = "";
  private typedCount = 0;
  private loggedFileSearch = new Set<string>();
  private pendingLiterature: string[] = [];
  private eventQueue: QueuedEvent[] = [];
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private checking = false;

  constructor(callbacks: VoiceCallbacks) {
    this.callbacks = callbacks;
  }

  async start(input: {
    bundle: CallBundle;
    createHandlers: (callId: string) => Record<string, ToolHandler>;
  }): Promise<void> {
    if (this.socket || this.ended) return;
    this.bundle = input.bundle;
    this.callbacks.onStatus("connecting");
    this.audio.unlock();
    const micPromise = this.audio.beginCapture((chunk) => this.onMicChunk(chunk));
    micPromise.then(
      () => this.callbacks.onMic("on"),
      () => this.callbacks.onMic("denied"),
    );

    try {
      const [tokenPayload, callPayload] = await Promise.all([
        this.fetchToken(),
        this.createCall(input.bundle),
      ]);
      this.callId = callPayload.id;
      this.callbacks.onCallId(callPayload.id);
      this.handlers = input.createHandlers(callPayload.id);
      this.postEvent("status", { status: "started", language: input.bundle.language });
      await this.audio.resume();
      const token = readEphemeralToken(tokenPayload);
      await this.connect(token);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start the call";
      this.callbacks.onError(message);
      this.callbacks.onStatus("error");
      await this.hangUp();
    }
  }

  muteMic(): void {
    this.audio.setMicEnabled(false);
  }

  sendText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.socket || this.socket.readyState !== WebSocket.OPEN || !this.configured) {
      return;
    }
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: trimmed }],
      },
    });
    this.typedCount += 1;
    this.publishTranscript("user", trimmed, true, `typed-${this.typedCount}`);
    this.send({ type: "response.create" });
    this.callbacks.onStatus("speaking");
  }

  async hangUp(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.postEvent("status", { status: "ended" });
    await this.flushEvents();
    this.socket?.close();
    this.socket = null;
    await this.audio.close();
    if (this.callId) {
      try {
        await fetch("/api/calls", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: this.callId }),
          keepalive: true,
        });
      } catch (error) {
        console.error("[voice] failed to end call", error);
      }
    }
    this.callbacks.onStatus("ended");
  }

  private async fetchToken(): Promise<unknown> {
    const response = await fetch("/api/session", { method: "POST" });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Could not start a voice session");
    }
    return payload;
  }

  private async createCall(bundle: CallBundle): Promise<{ id: string }> {
    const response = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmId: bundle.farmId, language: bundle.language }),
    });
    const payload = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !payload.id) {
      throw new Error(payload.error || "Could not open a call record");
    }
    return { id: payload.id };
  }

  private connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(REALTIME_URL, [`xai-client-secret.${token}`]);
      this.socket = socket;
      let opened = false;
      socket.onopen = () => {
        opened = true;
        this.sendSessionUpdate();
        resolve();
      };
      socket.onerror = () => {
        if (!opened) reject(new Error("Voice connection failed"));
        else this.callbacks.onError("Voice connection failed");
      };
      socket.onclose = () => {
        if (!this.ended) {
          this.callbacks.onError("Voice connection closed");
          void this.hangUp();
        }
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          this.noteEventType("binary-frame");
          return;
        }
        let message: ServerEvent;
        try {
          message = JSON.parse(event.data) as ServerEvent;
        } catch {
          this.noteEventType("non-json");
          return;
        }
        this.onServerEvent(message);
      };
    });
  }

  private sendSessionUpdate(): void {
    const bundle = this.bundle;
    if (!bundle) return;
    this.send({
      type: "session.update",
      session: {
        voice: bundle.voice,
        instructions: bundle.instructions,
        tools: sessionTools(bundle),
        turn_detection: { type: "server_vad", silence_duration_ms: 900 },
        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              model: "grok-transcribe",
              language_hint: bundle.language,
            },
          },
          output: {
            format: { type: "audio/pcm", rate: 24000 },
          },
        },
      },
    });
  }

  private onMicChunk(base64: string): void {
    if (!this.configured || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.earlyAudio.push(base64);
      if (this.earlyAudio.length > MAX_EARLY_CHUNKS) this.earlyAudio.shift();
      return;
    }
    this.send({ type: "input_audio_buffer.append", audio: base64 });
  }

  private flushEarlyAudio(): void {
    const buffered = this.earlyAudio.splice(0);
    for (const chunk of buffered) {
      this.send({ type: "input_audio_buffer.append", audio: chunk });
    }
  }

  private onServerEvent(event: ServerEvent): void {
    const type = typeof event.type === "string" ? event.type : "unknown";
    this.noteEventType(type, event);
    this.noteFileSearch(type, event);

    if (type === "error") {
      const detail = event.error as { message?: string } | undefined;
      this.callbacks.onError(detail?.message || "Voice session error");
      return;
    }

    if (type === "session.updated" && !this.configured) {
      this.configured = true;
      this.flushEarlyAudio();
      this.sendGreeting();
      return;
    }

    if (AUDIO_DELTA_TYPES.has(type)) {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (delta) {
        this.audio.playBase64(delta);
        if (this.configured && !this.checking) this.callbacks.onStatus("speaking");
      }
      return;
    }

    if (type === "input_audio_buffer.speech_started" || type.endsWith("speech_started")) {
      this.audio.stopPlayback();
      return;
    }

    if (this.consumeTranscript(type, event)) return;

    if (type === "response.created") {
      this.responseDone = false;
      this.assistantDraft = "";
      if (!this.greetingEcho) this.finalizeUserTranscripts();
      if (!this.greetingEcho) {
        const response = event.response;
        const responseId =
          response && typeof response === "object" && typeof (response as { id?: unknown }).id === "string"
            ? (response as { id: string }).id
            : "";
        this.assistantItemId = responseId || `assistant-${Date.now()}`;
      }
      return;
    }

    if (type === "response.function_call_arguments.done") {
      this.queueTool(event);
      return;
    }

    if (type === "response.done") {
      const echoing = this.greetingEcho;
      this.greetingEcho = false;
      if (!echoing) this.captureDoneTranscript(event);
      this.captureDoneTools(event);
      this.responseDone = true;
      if (this.pendingTools.length > 0) this.armToolFlush();
      else if (!this.checking) this.callbacks.onStatus("listening");
    }
  }

  private sendGreeting(): void {
    const bundle = this.bundle;
    if (!bundle || this.greeted) return;
    this.greeted = true;
    this.greetingEcho = true;
    this.greetingText = bundle.greeting;
    this.assistantItemId = "greeting";
    this.callbacks.onStatus("greeting");
    this.publishTranscript("assistant", bundle.greeting, true, "greeting");
    this.send({
      type: "conversation.item.create",
      item: {
        type: "force_message",
        role: "assistant",
        interruptible: false,
        content: [{ type: "output_text", text: bundle.greeting }],
      },
    });
  }

  private consumeTranscript(type: string, event: ServerEvent): boolean {
    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (this.greetingEcho) return true;
      if (delta) {
        this.assistantDraft += delta;
        if (this.matchesGreeting(this.assistantDraft)) return true;
        const itemId = this.assistantTranscriptId(event);
        this.callbacks.onTranscript("assistant", this.assistantDraft, false, itemId);
      }
      return true;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      if (this.greetingEcho) {
        this.assistantDraft = "";
        return true;
      }
      const transcript =
        typeof event.transcript === "string" ? event.transcript : this.assistantDraft;
      if (transcript && !this.matchesGreeting(transcript)) {
        this.publishTranscript("assistant", transcript, true, this.assistantTranscriptId(event));
      }
      this.assistantDraft = "";
      return true;
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio_transcription.done" ||
      type === "conversation.item.input_audio_transcription.updated"
    ) {
      const status = typeof event.status === "string" ? event.status : "";
      const final = type !== "conversation.item.input_audio_transcription.updated" && status !== "in_progress";
      this.handleUserTranscript(event, final);
      return true;
    }

    return false;
  }

  private captureDoneTools(event: ServerEvent): void {
    const response = event.response;
    if (!response || typeof response !== "object") return;
    const output = (response as { output?: unknown }).output;
    if (!Array.isArray(output)) return;
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const row = item as { type?: string; name?: string; call_id?: string; arguments?: unknown };
      if (row.type !== "function_call" || !row.name || !row.call_id) continue;
      this.queueTool({
        type: "response.function_call_arguments.done",
        name: row.name,
        call_id: row.call_id,
        arguments: row.arguments,
      });
    }
  }

  private captureDoneTranscript(event: ServerEvent): void {
    const response = event.response;
    if (!response || typeof response !== "object") return;
    const output = (response as { output?: unknown }).output;
    if (!Array.isArray(output)) return;
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const transcript = (part as { transcript?: unknown }).transcript;
        if (typeof transcript === "string" && transcript.trim() && !this.matchesGreeting(transcript)) {
          this.publishTranscript("assistant", transcript, true, this.assistantItemId || "assistant-current");
        }
      }
    }
  }

  private queueTool(event: ServerEvent): void {
    const name = typeof event.name === "string" ? event.name : "";
    const callId = typeof event.call_id === "string" ? event.call_id : "";
    if (!name || !callId || this.seenToolIds.has(callId)) return;
    if (name === "collections_search" || name === "file_search") {
      this.seenToolIds.add(callId);
      this.logLiteratureSearch(callId, event);
      return;
    }
    this.seenToolIds.add(callId);
    this.pendingTools.push({ name, callId, arguments: event.arguments });
    this.callbacks.onTool(name, "call");
    this.postEvent("tool_call", { name, callId, arguments: event.arguments ?? {} });
    if (!this.checking) {
      this.checking = true;
      this.callbacks.onChecking(true);
      this.callbacks.onStatus("checking");
    }
    if (this.responseDone) this.armToolFlush();
  }

  private armToolFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      void this.flushTools();
    }, 200);
  }

  private async flushTools(): Promise<void> {
    if (this.flushing || this.pendingTools.length === 0 || this.ended) return;
    this.flushing = true;
    const batch = this.pendingTools.splice(0);
    try {
      const results: Array<{ call: PendingTool; result: unknown }> = [];
      for (const call of batch) {
        const handler = this.handlers[call.name];
        let result: unknown;
        try {
          result = handler ? await handler(parseArgs(call.arguments)) : { error: "Unknown tool" };
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "Tool failed" };
        }
        results.push({ call, result });
        this.callbacks.onTool(call.name, "result");
        this.postEvent("tool_result", { name: call.name, callId: call.callId, result });
      }
      for (const { call, result } of results) {
        this.send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify(result),
          },
        });
      }
      await this.audio.waitUntilIdle();
      if (!this.ended) this.send({ type: "response.create" });
    } finally {
      this.flushing = false;
      this.responseDone = false;
      this.checking = false;
      this.callbacks.onChecking(false);
      if (this.pendingTools.length > 0) this.armToolFlush();
    }
  }

  private handleUserTranscript(event: ServerEvent, final: boolean): void {
    const itemId = this.userItemId(event);
    const raw = typeof event.transcript === "string" ? event.transcript : "";
    if (isDiscardedTranscript(raw)) {
      this.userDrafts.delete(itemId);
      this.callbacks.onTranscript("user", "", true, itemId);
      return;
    }
    const text = raw.trim();
    const prior = this.userDrafts.get(itemId) ?? { text: "", posted: false };
    prior.text = text;
    this.userDrafts.set(itemId, prior);
    this.callbacks.onTranscript("user", text, final || prior.posted, itemId);
    if (final) this.postUserTranscript(itemId);
  }

  private finalizeUserTranscripts(): void {
    for (const itemId of this.userDrafts.keys()) {
      const row = this.userDrafts.get(itemId);
      if (!row || row.posted || isDiscardedTranscript(row.text)) continue;
      this.callbacks.onTranscript("user", row.text, true, itemId);
      this.postUserTranscript(itemId);
    }
  }

  private postUserTranscript(itemId: string): void {
    const row = this.userDrafts.get(itemId);
    if (!row || row.posted || isDiscardedTranscript(row.text)) return;
    const key = `user:${itemId}`;
    row.posted = true;
    if (this.postedTranscripts.has(key)) return;
    this.postedTranscripts.add(key);
    this.postEvent("user_transcript", { text: row.text });
    if (itemId === this.userFallbackId) this.userFallbackId = "";
  }

  private userItemId(event: ServerEvent): string {
    const id = event.item_id;
    if (typeof id === "string" && id) return id;
    if (!this.userFallbackId) this.userFallbackId = `user-${Date.now()}`;
    return this.userFallbackId;
  }

  private assistantTranscriptId(event: ServerEvent): string {
    const id = event.item_id;
    if (typeof id === "string" && id) {
      this.assistantItemId = id;
      return id;
    }
    if (!this.assistantItemId) this.assistantItemId = `assistant-${Date.now()}`;
    return this.assistantItemId;
  }

  private matchesGreeting(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || !this.greetingText) return false;
    return trimmed === this.greetingText || this.greetingText.startsWith(trimmed);
  }

  private publishTranscript(role: TranscriptRole, text: string, final: boolean, itemId: string): void {
    const trimmed = text.trim();
    if (isDiscardedTranscript(trimmed)) return;
    this.callbacks.onTranscript(role, trimmed, final, itemId);
    if (role === "assistant" && final) this.attributeLiterature(trimmed);
    if (!final) return;
    const key = `${role}:${itemId}`;
    if (this.postedTranscripts.has(key)) return;
    this.postedTranscripts.add(key);
    this.postEvent(role === "user" ? "user_transcript" : "assistant_transcript", { text: trimmed });
  }

  private postEvent(type: string, payload: Record<string, unknown>): void {
    if (!this.callId) return;
    this.eventQueue.push({ type, payload });
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => {
      void this.flushEvents();
    }, 250);
  }

  private async flushEvents(): Promise<void> {
    if (this.eventTimer) clearTimeout(this.eventTimer);
    this.eventTimer = null;
    if (!this.callId || this.eventQueue.length === 0) return;
    const events = this.eventQueue.splice(0);
    try {
      await fetch("/api/call-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId: this.callId, events }),
        keepalive: true,
      });
    } catch (error) {
      console.error("[voice] failed to store call events", error);
    }
  }

  private logLiteratureSearch(callId: string, event: ServerEvent): void {
    const hits: FileSearchResult[] = [];
    collectFileHits(event, hits);
    const sources = literatureSources(hits);
    this.callbacks.onTool("file_search", "call");
    this.postEvent("tool_call", { name: "file_search", callId, arguments: event.arguments ?? {} });
    if (sources.length > 0) {
      this.finishLiteratureSearch(callId, sources);
      return;
    }
    this.pendingLiterature.push(callId);
  }

  private finishLiteratureSearch(
    callId: string,
    sources: Array<{ title: string; publisher: string; url: string; file: string }>,
  ): void {
    this.callbacks.onTool("file_search", "result");
    this.postEvent("tool_result", { name: "file_search", callId, sources });
  }

  private attributeLiterature(text: string): void {
    if (this.pendingLiterature.length === 0) return;
    const sources = sourcesNamedIn(text);
    if (sources.length === 0) return;
    const callId = this.pendingLiterature.shift();
    if (!callId) return;
    this.finishLiteratureSearch(callId, sources);
  }

  private noteFileSearch(type: string, event: ServerEvent): void {
    for (const item of fileSearchItems(type, event)) {
      if (!item.results) continue;
      const id = item.id || `search:${(item.queries ?? []).join("|")}`;
      if (this.loggedFileSearch.has(id)) continue;
      if (item.status && item.status !== "completed") continue;
      this.loggedFileSearch.add(id);
      const sources = literatureSources(item.results);
      this.callbacks.onTool("file_search", "call");
      this.postEvent("tool_call", { name: "file_search", queries: item.queries ?? [] });
      this.callbacks.onTool("file_search", "result");
      this.postEvent("tool_result", {
        name: "file_search",
        queries: item.queries ?? [],
        sources,
      });
    }
  }

  private send(message: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private noteEventType(type: string, event?: ServerEvent): void {
    if (process.env.NODE_ENV !== "development" || this.seenEventTypes.has(type)) return;
    this.seenEventTypes.add(type);
    if (AUDIO_DELTA_TYPES.has(type)) {
      console.log("[voice] event", type);
      return;
    }
    console.log("[voice] event", type, event ? summarizeEvent(event) : "");
  }
}

export function isDiscardedTranscript(text: string): boolean {
  const trimmed = text.trim();
  return !trimmed || trimmed === "..." || trimmed.toLowerCase() === "[noise]";
}

function sessionTools(bundle: CallBundle): unknown[] {
  const collectionId = knowledgeCollectionIdFor(bundle.farmId);
  if (!collectionId) return bundle.tools;
  return [
    ...bundle.tools,
    { type: "file_search", vector_store_ids: [collectionId], max_num_results: 3 },
  ];
}

type KnowledgeDocument = {
  title: string;
  publisher: string;
  url: string;
  file: string;
  fileId?: string;
};

type FileSearchResult = { file_id?: string; filename?: string };
type FileSearchItem = {
  id: string;
  status?: string;
  queries?: string[];
  results?: FileSearchResult[];
};

function fileSearchItems(type: string, event: ServerEvent): FileSearchItem[] {
  const items: FileSearchItem[] = [];
  if (type === "response.output_item.done") {
    const parsed = asFileSearchItem(event.item);
    if (parsed) items.push(parsed);
  }
  if (type === "response.file_search_call.completed") {
    items.push({
      id: stringField(event.item_id) || stringField(event.id),
      status: "completed",
      queries: stringList(event.queries),
      results: resultList(event.results),
    });
  }
  if (type === "response.done") {
    const response = event.response;
    if (response && typeof response === "object") {
      const output = (response as { output?: unknown }).output;
      if (Array.isArray(output)) {
        for (const item of output) {
          const parsed = asFileSearchItem(item);
          if (parsed) items.push(parsed);
        }
      }
    }
  }
  return items;
}

function asFileSearchItem(value: unknown): FileSearchItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as { type?: unknown; id?: unknown; status?: unknown; queries?: unknown; results?: unknown };
  if (item.type !== "file_search_call") return undefined;
  return {
    id: typeof item.id === "string" ? item.id : "",
    status: typeof item.status === "string" ? item.status : undefined,
    queries: stringList(item.queries),
    results: resultList(item.results),
  };
}

function resultList(value: unknown): FileSearchResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { file_id?: unknown; filename?: unknown };
    return [
      {
        file_id: typeof row.file_id === "string" ? row.file_id : undefined,
        filename: typeof row.filename === "string" ? row.filename : undefined,
      },
    ];
  });
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectFileHits(value: unknown, hits: FileSearchResult[], depth = 0): void {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectFileHits(entry, hits, depth + 1);
    return;
  }
  if (typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (typeof row.file_id === "string" || typeof row.filename === "string") {
    hits.push({
      file_id: typeof row.file_id === "string" ? row.file_id : undefined,
      filename: typeof row.filename === "string" ? row.filename : undefined,
    });
  }
  for (const child of Object.values(row)) collectFileHits(child, hits, depth + 1);
}

function sourcesNamedIn(text: string): Array<{ title: string; publisher: string; url: string; file: string }> {
  const lower = text.toLowerCase();
  const irri = lower.includes("irri") || text.includes("国际水稻研究所");
  const fao = /\bfao\b/i.test(text) || text.includes("粮农组织");
  return (knowledgeSources.documents as KnowledgeDocument[]).flatMap((doc) => {
    const row = { title: doc.title, publisher: doc.publisher, url: doc.url, file: doc.file };
    if (doc.publisher === "FAO" && fao) return [row];
    if (doc.publisher !== "IRRI" || !irri) return [];
    const title = doc.title.toLowerCase();
    if (lower.includes(title)) return [row];
    if (title === "drought" && lower.includes("drought")) return [row];
    if (title.includes("heat") && (lower.includes("canopy") || lower.includes("feels the heat"))) return [row];
    if (title.includes("water") && (lower.includes("water management") || lower.includes("alternate wetting"))) {
      return [row];
    }
    return [];
  });
}

function literatureSources(results: FileSearchResult[]): Array<{
  title: string;
  publisher: string;
  url: string;
  file: string;
}> {
  const found: Array<{ title: string; publisher: string; url: string; file: string }> = [];
  const seen = new Set<string>();
  for (const result of results) {
    const doc = (knowledgeSources.documents as KnowledgeDocument[]).find(
      (item) =>
        (result.file_id && item.fileId === result.file_id) ||
        (result.filename && (item.file === result.filename || result.filename.endsWith(item.file))),
    );
    const key = doc?.file || result.file_id || result.filename || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push(
      doc
        ? { title: doc.title, publisher: doc.publisher, url: doc.url, file: doc.file }
        : { title: result.filename || "Literature", publisher: "", url: "", file: result.filename || "" },
    );
  }
  return found;
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function summarizeEvent(event: ServerEvent): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...event };
  for (const key of ["delta", "audio", "arguments"]) {
    if (typeof clone[key] === "string" && (clone[key] as string).length > 180) {
      clone[key] = `[${(clone[key] as string).length} chars]`;
    }
  }
  return clone;
}
