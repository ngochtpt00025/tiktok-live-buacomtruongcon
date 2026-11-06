/**
 * Phát giọng chủ tiệc.
 *  - Nếu server gửi audioUrl (TTS thật, MVP 3) → phát file.
 *  - Nếu không, và trang mở với ?voice=1 → đọc bằng speechSynthesis (giọng vi-VN có sẵn của máy, chỉ để test).
 * Mỗi lúc chỉ một câu: câu mới cắt câu cũ (server đã giới hạn nhịp nói).
 */
export class Voice {
  enabled = new URLSearchParams(location.search).get('voice') === '1';
  private audio?: HTMLAudioElement;

  speak(text: string, audioUrl?: string) {
    if (audioUrl) {
      this.audio?.pause();
      this.audio = new Audio(audioUrl);
      void this.audio.play().catch(() => {});
      return;
    }
    if (!this.enabled || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 1.05;
    u.pitch = 0.8;
    const vi = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
}
