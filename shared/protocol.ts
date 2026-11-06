// Giao thức WebSocket giữa server (brain) và các trang:
//  - overlay  : màn hình game 9:16 (OBS / cửa sổ live)
//  - preview  : overlay nhúng trong bảng điều khiển (không phát tiếng)
//  - control  : bảng điều khiển /control.html
// Server quyết định mọi thứ; overlay chỉ hiển thị.

export type EmoteKind =
  | 'eat' | 'chao' | 'cheer' | 'heart' | 'gift' | 'pay' | 'wave' | 'dizzy' | 'beer' | 'camera' | 'laugh' | 'star'
  | 'think' | 'sleep' | 'chicken' | 'sad' | 'happy';

export type ClientRole = 'overlay' | 'preview' | 'control';

export interface GuestDTO {
  id: string;
  nick: string;
  look: number;   // seed để client phối tóc/áo/màu
  table: number;  // 0..TABLE_COUNT-1, hoặc -1 nếu đang đứng chờ ở cổng
  seat: number;   // 0..SEATS_PER_TABLE-1, hoặc chỉ số hàng chờ nếu table = -1
}

export type HostTarget = { kind: 'stage' } | { kind: 'table'; table: number } | { kind: 'counter' } | { kind: 'rest' };

export type LiveStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface LiveStateDTO {
  status: LiveStatus;
  uniqueId: string;
  roomId?: string;
  error?: string;
}

export interface StatsDTO {
  guests: number;
  capacity: number;
  waiting: number;
  chatPer10s: number;
  sim: number;
  live: LiveStateDTO;
}

export type EventId = 'chao' | 'payment' | 'photo' | 'toast' | 'oldvoice' | 'quang' | 'ga' | 'headache';

export type NpcId = 'quang' | 'chuc';
/** Ai nói câu thoại: chủ tiệc, NPC, hoặc một khách (id) — vd. khách kể chuyện */
export type Speaker = 'host' | NpcId | { guest: string };
export type NpcTarget = { kind: 'stage' } | { kind: 'table'; table: number } | { kind: 'gate' };
export interface NpcDTO { id: NpcId; name: string; target: NpcTarget }

export type HeatLevel = 'vang' | 'am' | 'dong' | 'bungno';
export interface HeatDTO { value: number; level: HeatLevel }

export interface EventDTO {
  id: EventId;
  title: string;
  hint: string;
  remainingMs: number;
  durationMs: number;
}

/** Tiến độ sự kiện theo mâm (vd. bát cháo: đã chia / số người trong mâm). */
export interface TableProgress { done: number; total: number; icon?: string }

export interface BondDTO {
  /** Điểm Tình nghĩa 0..100 của từng mâm */
  score: number[];
  /** Số lần mâm đạt 100 (sao) trong phiên */
  stars: number[];
}

export type TtsProviderId = 'edge' | 'google' | 'fpt' | 'elevenlabs' | 'browser' | 'off';
export type AiProviderId = 'anthropic' | 'openai' | 'mock';
/** Hiệu ứng âm thanh áp lên giọng ở màn hình live */
export type VoiceFx = 'normal' | 'old';

export interface TtsSettings {
  provider: TtsProviderId;
  /** Tên giọng của nhà cung cấp (vd. vi-VN-NamMinhNeural, vi-VN-Standard-D, leminh, voice_id ElevenLabs) */
  voice: string;
  /** Tốc độ, % so với mặc định (-40..+40) */
  rate: number;
  /** Cao độ, % so với mặc định (-30..+30) */
  pitch: number;
}

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  model: string;
  /** Cho provider 'openai' (OpenAI, Ollama, Gemini OpenAI-compatible, ...) */
  baseUrl: string;
  /** Giới hạn số lần gọi API mỗi phút */
  maxCallsPerMinute: number;
}

/** Khoá API lưu riêng trong secrets.json — bảng điều khiển chỉ biết là đã có hay chưa. */
export type SecretName = 'googleKey' | 'fptKey' | 'elevenKey' | 'anthropicKey' | 'openaiKey';

export interface SettingsDTO {
  hostName: string;
  venueName: string;
  speechPerMinute: number;
  afkMinutes: number;
  directorEnabled: boolean;
  /** Khoảng cách giữa 2 sự kiện tự động (giây) */
  eventGapSec: number;
  joinRequiresCommand: boolean;
  tiktokUsername: string;
  tts: TtsSettings;
  /** Âm lượng giọng chủ tiệc ở màn hình live 0..100 */
  voiceVolume: number;
  /** Tiếng nền bữa tiệc (xì xào, cụng ly) */
  ambience: boolean;
  ambienceVolume: number;
  ai: AiSettings;
  /** Nhãn cố định trên màn hình live: nội dung giải trí / nhân vật & giọng do AI tạo */
  disclaimer: { show: boolean; text: string };
  npc: {
    /** Chat "quang ơi" ngoài sự kiện → chú Quang ghé mâm (tối đa 1 lần / 3 phút) */
    quangOnCall: boolean;
    /** Chú Chực tự đi xin ăn giữa các sự kiện */
    chucEnabled: boolean;
    /** Giọng chú Quang: chênh tốc độ / cao độ so với giọng chủ tiệc (%) */
    quangVoice: { rate: number; pitch: number };
  };
  /** Khoá nào đã được lưu (không gửi giá trị) */
  secrets?: Partial<Record<SecretName, boolean>>;
}

export interface TtsStatusDTO {
  provider: TtsProviderId;
  ok: boolean;
  lastError: string;
  cacheFiles: number;
  prerender: { done: number; total: number; failed: number } | null;
}

export interface AiStatusDTO {
  enabled: boolean;
  calls: number;
  comments: number;
  matched: number;
  errors: number;
  avgMs: number;
  lastError: string;
  queue: number;
}

/** Chỉ số phiên live (ghi khi bấm "Bắt đầu ghi phiên" hoặc tự bật khi kết nối live). */
export interface MetricsDTO {
  active: boolean;
  label: string;
  startedAt: number;
  minutes: number;
  /** người vào xem live (sự kiện member + bất kỳ ai tương tác) */
  viewers: number;
  chatters: number;
  joined: number;
  /** % người comment đã nhập tiệc */
  joinRate: number;
  /** % người vào xem đã nhập tiệc */
  joinRateOfViewers: number;
  /** % khách (vào ≥3 phút trước) còn tương tác sau 3 phút; -1 = chưa đủ dữ liệu */
  retained3: number;
  retained10: number;
  avgStayMin: number;
  activeGuests: number;
  peakGuests: number;
  commentsPerMin: number;
  commentsPerMinNow: number;
  /** % comment được hiểu (rule + AI) */
  understood: number;
  /** % trong số được hiểu là nhờ AI */
  aiShare: number;
  tiktokDelayMs: number;
  tiktokDelayP90: number;
  speechWaitMs: number;
  speechWaitP90: number;
  ttsMs: number;
  ttsFail: number;
  stuckGuest: number;
  stuckHost: number;
  fpsAvg: number;
  fpsMin: number;
  gifts: number;
  coins: number;
  likes: number;
  events: number;
  eventParticipantsAvg: number;
  spark: number[];
  sparkGuests: number[];
  heatAvg: number;
  heatPeak: number;
}

export interface SessionListItem {
  id: string; label: string; startedAt: number; durationMin: number;
  joinRate: number; retained3: number; peakGuests: number; report: string;
}

export interface LogDTO { ts: number; kind: 'live' | 'chat' | 'gift' | 'event' | 'system'; msg: string }

export type ServerMsg =
  | { t: 'snapshot'; guests: GuestDTO[]; host: HostTarget; stats: StatsDTO; settings: SettingsDTO; bond: BondDTO; event: EventDTO | null;
      npcs: NpcDTO[]; heat: HeatDTO; hostPose: 'stand' | 'sit' }
  | { t: 'join'; g: GuestDTO }
  | { t: 'move'; id: string; table: number; seat: number }
  | { t: 'guest_goto'; id: string; spot: 'counter' | 'stage'; index: number }
  | { t: 'leave'; id: string }
  | { t: 'emote'; id: string; kind: EmoteKind }
  | { t: 'chat'; id: string; text: string }
  | { t: 'host_goto'; target: HostTarget; token: number }
  | { t: 'host_emote'; kind: EmoteKind }
  | { t: 'say'; text: string; ms: number; audioUrl?: string; lookAt?: string; fx?: VoiceFx; speaker?: Speaker }
  | { t: 'banner'; text: string; ms: number }
  | { t: 'stats'; stats: StatsDTO }
  | { t: 'settings'; settings: SettingsDTO }
  | { t: 'bond'; bond: BondDTO }
  | { t: 'table_fx'; table: number; kind: 'celebrate' | 'win' }
  | { t: 'event'; event: EventDTO | null }
  | { t: 'event_progress'; tables: (TableProgress | null)[] }
  | { t: 'event_note'; text: string }
  | { t: 'host_costume'; costume: 'normal' | 'old' }
  | { t: 'host_pose'; pose: 'stand' | 'sit' }
  | { t: 'npc'; id: NpcId; action: 'spawn' | 'goto' | 'leave'; target: NpcTarget; token: number; name: string }
  | { t: 'npc_emote'; id: NpcId; kind: EmoteKind }
  | { t: 'heat'; heat: HeatDTO }
  | { t: 'prop'; id: 'ga'; show: boolean; amount: number }
  | { t: 'ga_piece'; table: number; left: number }
  | { t: 'photo'; names: string[]; caption: string; ms: number }
  // chỉ gửi cho bảng điều khiển
  | { t: 'log'; entries: LogDTO[] }
  | { t: 'director'; enabled: boolean; nextInSec: number | null }
  | { t: 'tts_status'; status: TtsStatusDTO }
  | { t: 'ai_status'; status: AiStatusDTO }
  | { t: 'tts_test_result'; url?: string; ms?: number; error?: string }
  | { t: 'ai_test_result'; text: string; intent?: string; table?: number; error?: string; ms?: number }
  | { t: 'metrics'; m: MetricsDTO }
  | { t: 'sessions'; list: SessionListItem[] }
  | { t: 'session_report'; url: string };

export type ClientMsg =
  | { t: 'hello'; role: ClientRole }
  | { t: 'host_arrived'; token: number }
  | { t: 'npc_arrived'; id: NpcId; token: number }
  // màn hình live báo cáo sức khoẻ
  | { t: 'perf'; fps: number }
  | { t: 'stuck'; who: 'guest' | 'host' }
  | { t: 'session_start'; label: string }
  | { t: 'session_stop' }
  // bảng điều khiển
  | { t: 'live_connect'; username: string }
  | { t: 'live_disconnect' }
  | { t: 'event_start'; id: EventId }
  | { t: 'event_stop' }
  | { t: 'npc_call'; id: NpcId }
  | { t: 'settings_patch'; patch: Partial<SettingsDTO> }
  | { t: 'secret_set'; name: SecretName; value: string }
  | { t: 'tts_test'; text: string; fx?: VoiceFx }
  | { t: 'tts_prerender' }
  | { t: 'tts_clear_cache' }
  | { t: 'ai_test'; text: string }
  | { t: 'host_say'; text: string }
  | { t: 'reset_room' }
  | { t: 'sim_comment'; nick: string; text: string }
  | { t: 'sim_bots'; count: number };
