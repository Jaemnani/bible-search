/**
 * 기기 내장 TTS 래퍼 (Web Speech API — SpeechSynthesis).
 *
 * P4-core(1) 의 무료 재생 경로. 서버·API 키·저장소가 전혀 필요 없고 오프라인에서도 동작한다.
 * (고품질 mp3 를 NAS 에 캐시하는 경로는 `/api/audio` 가 url 을 주면 그쪽이 우선 — tts 는 폴백.)
 *
 * 브라우저 특이사항 두 가지를 여기서 흡수한다:
 *  1) getVoices() 가 최초 호출 때 빈 배열 → `voiceschanged` 를 기다려야 한다.
 *  2) 데스크톱 Chrome 은 약 15초 뒤 합성이 저절로 멈춘다 → 말하는 동안 주기적으로 resume().
 */

export interface TtsVoice {
  uri: string;
  name: string;
  lang: string;
}

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/** ko 우선, 그다음 en 순으로 정렬된 음성 목록. 아직 로드 전이면 빈 배열. */
export function listVoices(): TtsVoice[] {
  if (!ttsSupported()) return [];
  return [...window.speechSynthesis.getVoices()]
    .filter((v) => v.lang?.toLowerCase().startsWith("ko") || v.lang?.toLowerCase().startsWith("en"))
    .sort((a, b) => {
      const ka = a.lang.toLowerCase().startsWith("ko") ? 0 : 1;
      const kb = b.lang.toLowerCase().startsWith("ko") ? 0 : 1;
      return ka - kb || a.name.localeCompare(b.name);
    })
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

/**
 * 음성 목록이 채워질 때까지 기다린다(이미 있으면 즉시).
 * `voiceschanged` 가 끝내 안 오는 브라우저가 있어 타임아웃으로 끊는다.
 */
export function onVoicesReady(cb: (voices: TtsVoice[]) => void): () => void {
  if (!ttsSupported()) {
    cb([]);
    return () => {};
  }
  let done = false;
  const finish = () => {
    if (done) return;
    const v = listVoices();
    if (v.length === 0) return; // 아직 비어 있으면 다음 이벤트/타임아웃을 기다린다
    done = true;
    cleanup();
    cb(v);
  };
  const timer = window.setTimeout(() => {
    if (done) return;
    done = true;
    cleanup();
    cb(listVoices());
  }, 2000);
  const cleanup = () => {
    window.clearTimeout(timer);
    window.speechSynthesis.removeEventListener("voiceschanged", finish);
  };
  window.speechSynthesis.addEventListener("voiceschanged", finish);
  finish();
  return cleanup;
}

let keepAlive: number | null = null;

function startKeepAlive() {
  stopKeepAlive();
  // Chrome 이 ~15초에 자체 일시정지하는 버그 회피. 재생 중일 때만 깨운다.
  keepAlive = window.setInterval(() => {
    const s = window.speechSynthesis;
    if (s.speaking && !s.paused) s.resume();
    else if (!s.speaking) stopKeepAlive();
  }, 8000);
}
function stopKeepAlive() {
  if (keepAlive !== null) {
    window.clearInterval(keepAlive);
    keepAlive = null;
  }
}

export interface SpeakOptions {
  text: string;
  voiceUri?: string | null;
  rate?: number;
  onEnd?: () => void;
  onError?: (reason: string) => void;
}

/**
 * 현재 발화를 취소하고 새로 말한다.
 * iOS Safari 는 최초 speak() 가 사용자 제스처 안에서 호출돼야 하므로, 재생 버튼 핸들러에서 부를 것.
 */
export function speak({ text, voiceUri, rate = 1, onEnd, onError }: SpeakOptions): void {
  if (!ttsSupported()) {
    onError?.("unsupported");
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();

  const u = new SpeechSynthesisUtterance(text);
  const voice = voiceUri ? synth.getVoices().find((v) => v.voiceURI === voiceUri) : undefined;
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "ko-KR";
  u.rate = rate;
  u.onend = () => {
    stopKeepAlive();
    onEnd?.();
  };
  u.onerror = (e) => {
    stopKeepAlive();
    // 사용자가 stop() 으로 취소한 경우는 오류가 아니다.
    const reason = (e as SpeechSynthesisErrorEvent).error ?? "unknown";
    if (reason === "interrupted" || reason === "canceled") return;
    onError?.(reason);
  };

  synth.speak(u);
  startKeepAlive();
}

export function pause(): void {
  if (ttsSupported()) window.speechSynthesis.pause();
}
export function resume(): void {
  if (ttsSupported()) window.speechSynthesis.resume();
}
export function stop(): void {
  if (!ttsSupported()) return;
  stopKeepAlive();
  window.speechSynthesis.cancel();
}
