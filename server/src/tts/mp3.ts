// Đo thời lượng file MP3 bằng cách đếm frame (đủ chính xác để canh bong bóng thoại / hàng đợi nói).

const BITRATES: Record<string, number[]> = {
  // [version][layer] -> bảng kbps; chỉ cần Layer III
  'V1L3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  'V2L3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function mp3DurationMs(buf: Buffer): number {
  let i = 0;
  // bỏ qua thẻ ID3v2
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + size;
  }
  let seconds = 0;
  let frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3;      // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3;    // 1 = Layer III
    const brIdx = buf[i + 2] >> 4;
    const srIdx = (buf[i + 2] >> 2) & 3;
    const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) { i++; continue; }
    const kbps = BITRATES[ver === 3 ? 'V1L3' : 'V2L3'][brIdx];
    const sr = RATES[ver][srIdx];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor(((samples / 8) * kbps * 1000) / sr) + pad;
    if (len < 4) { i++; continue; }
    seconds += samples / sr;
    frames++;
    i += len;
  }
  return frames ? Math.round(seconds * 1000) : 0;
}
