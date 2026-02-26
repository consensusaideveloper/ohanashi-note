// WebSocket message types between client and relay server.
// These mirror the OpenAI Realtime API event structure.

// --- Client → Server (forwarded to OpenAI) ---

export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface SessionUpdateEvent {
  type: "session.update";
  session: {
    modalities: Array<"text" | "audio">;
    instructions: string;
    voice: string;
    input_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw";
    output_audio_format: "pcm16" | "g711_ulaw" | "g711_alaw";
    input_audio_transcription: { model: string; language?: string } | null;
    turn_detection: {
      type: "server_vad";
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
    } | null;
    temperature: number;
    tools?: RealtimeToolDefinition[];
    tool_choice?: "auto" | "none" | "required";
  };
}

export interface InputAudioBufferAppendEvent {
  type: "input_audio_buffer.append";
  audio: string; // base64-encoded PCM16 audio
}

export interface InputAudioBufferCommitEvent {
  type: "input_audio_buffer.commit";
}

export interface InputAudioBufferClearEvent {
  type: "input_audio_buffer.clear";
}

export interface ResponseCreateEvent {
  type: "response.create";
}

export interface ResponseCancelEvent {
  type: "response.cancel";
}

export interface ConversationItemCreateEvent {
  type: "conversation.item.create";
  item: {
    type: "function_call_output";
    call_id: string;
    output: string;
  };
}

export type ClientEvent =
  | SessionUpdateEvent
  | InputAudioBufferAppendEvent
  | InputAudioBufferCommitEvent
  | InputAudioBufferClearEvent
  | ResponseCreateEvent
  | ResponseCancelEvent
  | ConversationItemCreateEvent;

// --- Server → Client (forwarded from OpenAI) ---

export interface SessionCreatedEvent {
  type: "session.created";
  session: Record<string, unknown>;
}

export interface SessionUpdatedEvent {
  type: "session.updated";
  session: Record<string, unknown>;
}

export interface InputAudioBufferSpeechStartedEvent {
  type: "input_audio_buffer.speech_started";
  audio_start_ms: number;
  item_id: string;
}

export interface InputAudioBufferSpeechStoppedEvent {
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms: number;
  item_id: string;
}

export interface ResponseAudioDeltaEvent {
  type: "response.audio.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string; // base64-encoded PCM16 audio chunk
}

export interface ResponseAudioDoneEvent {
  type: "response.audio.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
}

export interface ResponseAudioTranscriptDeltaEvent {
  type: "response.audio_transcript.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseAudioTranscriptDoneEvent {
  type: "response.audio_transcript.done";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  transcript: string;
}

export interface InputAudioTranscriptionCompletedEvent {
  type: "conversation.item.input_audio_transcription.completed";
  item_id: string;
  content_index: number;
  transcript: string;
}

export interface ResponseCreatedServerEvent {
  type: "response.created";
  response: Record<string, unknown>;
}

export interface ResponseDoneEvent {
  type: "response.done";
  response: Record<string, unknown>;
}

export interface ResponseOutputItemDoneEvent {
  type: "response.output_item.done";
  response_id: string;
  output_index: number;
  item: {
    id: string;
    type: "message" | "function_call";
    name?: string;
    call_id?: string;
    arguments?: string;
  };
}

export interface ErrorEvent {
  type: "error";
  error: {
    type: string;
    code: string;
    message: string;
  };
}

export type ServerEvent =
  | SessionCreatedEvent
  | SessionUpdatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | ResponseAudioDeltaEvent
  | ResponseAudioDoneEvent
  | ResponseAudioTranscriptDeltaEvent
  | ResponseAudioTranscriptDoneEvent
  | InputAudioTranscriptionCompletedEvent
  | ResponseCreatedServerEvent
  | ResponseDoneEvent
  | ResponseOutputItemDoneEvent
  | ErrorEvent;
