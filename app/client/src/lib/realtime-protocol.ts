// Data channel event types for WebRTC-based OpenAI Realtime API.
// Audio flows natively through WebRTC media tracks, so audio-related
// events (input_audio_buffer.append, response.audio.delta) are not used.

// --- Client → OpenAI (via data channel) ---

export interface RealtimeToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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

export type DataChannelClientEvent =
  | ResponseCreateEvent
  | ResponseCancelEvent
  | ConversationItemCreateEvent;

// --- OpenAI → Client (via data channel) ---

export interface SessionCreatedEvent {
  type: "session.created";
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

export interface ResponseOutputAudioTranscriptDeltaEvent {
  type: "response.output_audio_transcript.delta";
  response_id: string;
  item_id: string;
  output_index: number;
  content_index: number;
  delta: string;
}

export interface ResponseOutputAudioTranscriptDoneEvent {
  type: "response.output_audio_transcript.done";
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

export interface RealtimeErrorEvent {
  type: "error";
  error: {
    type: string;
    code: string;
    message: string;
  };
}

export type DataChannelServerEvent =
  | SessionCreatedEvent
  | InputAudioBufferSpeechStartedEvent
  | InputAudioBufferSpeechStoppedEvent
  | ResponseOutputAudioTranscriptDeltaEvent
  | ResponseOutputAudioTranscriptDoneEvent
  | InputAudioTranscriptionCompletedEvent
  | ResponseCreatedServerEvent
  | ResponseDoneEvent
  | ResponseOutputItemDoneEvent
  | RealtimeErrorEvent;
