# 🍚 Bữa Cơm Tình Nghĩa — game TikTok LIVE 2D (bản 0.5)

Người xem chat → nhân vật bước vào cổng → tự tìm mâm → ngồi ăn. Chủ tiệc (nhân vật parody hư cấu) chào khách,
đi thăm các mâm, phản ứng meme và tổ chức sự kiện. Mỗi mâm có thanh **Tình nghĩa** — đầy thì được ⭐.

## Chạy nhanh (Windows)

1. Cài Node.js LTS.
2. Chạy **`START-GAME.bat`** → tự cài thư viện, build, mở **bảng điều khiển** `http://127.0.0.1:8787/control`.
3. Trong bảng điều khiển: nhập `@ten_kenh` → **Kết nối live** (chỉ bấm khi kênh đang live).
4. Đưa màn hình game lên live (chọn một):
   - **TikTok LIVE Studio:** chạy `OPEN-LIVE-WINDOW.bat` → thêm nguồn **"Cửa sổ"** (cửa sổ tự khít 720×1280, góc dưới hiện kích thước, ✓ là chuẩn).
   - **OBS:** Browser Source `http://127.0.0.1:8787/`, 1080 × 1920. Không bật "Shutdown source when not visible".

Giữ cửa sổ server (màu đen) mở trong suốt buổi live. Bảng điều khiển có thể đóng/mở lại bất cứ lúc nào.

## Bảng điều khiển

| Mục | Chức năng |
|---|---|
| 01 Kết nối TikTok | Nhập @kênh hoặc link live → Kết nối / Ngắt. Trạng thái, roomId, lỗi. Tự kết nối lại 5 → 10 → 20 → 30 giây |
| 02 Màn hình live | Mở cửa sổ live 9:16, sao chép link OBS |
| 03 Sự kiện | Gọi tay Bát cháo / Thanh toán / Chụp ảnh, kết thúc sớm, bật-tắt tự động, chỉnh giãn cách |
| 04 Chủ tiệc | Gõ câu cho chủ tiệc nói, đổi tên, biển cổng, số câu/phút, thời gian tự về |
| 05 Thử tương tác | Comment giả, nút lệnh nhanh, thêm 20/60/150 bot |
| 06 Sân tiệc | Số khách, comment/10s, điểm Tình nghĩa 9 mâm, dọn sân |
| 08 Giọng chủ tiệc | Chọn TTS, giọng, tốc độ, cao độ, lưu key, nghe thử (thường / ông cụ), render sẵn, âm lượng, tiếng nền |
| 09 AI hiểu comment | Bật tầng 2, chọn Claude / OpenAI-compatible / thử nghiệm, model, key, giới hạn gọi/phút, ô thử |
| 10 Nhật ký | Live / sự kiện / quà / comment / hệ thống, lọc theo loại |
| 11 Chỉ số phiên live | Bắt đầu / kết thúc ghi, số liệu trực tiếp, biểu đồ nhỏ, danh sách báo cáo các phiên trước |
| Bên phải | Xem trước màn hình live (không phát tiếng) |

Cài đặt đổi trong bảng điều khiển được lưu vào `config.json`.

## Lệnh chat của người xem

| Chat | Kết quả |
|---|---|
| `nhập tiệc` | Tạo nhân vật, đi vào sân, tự xếp mâm |
| `mâm 5` | Đổi sang mâm 5 (người chưa vào thì vào thẳng mâm 5) |
| `ăn cơm` · `bát cháo` · `một hai ba dô` | Emoji + cộng tình nghĩa cho mâm |
| `em trả` · `thanh toán` | Ngoài sự kiện: chủ tiệc nói câu meme. Trong sự kiện: chạy lên quầy |
| `chụp ảnh` | Trong sự kiện chụp ảnh: có tên trong ảnh kỷ niệm |
| `quang ơi` · `anh Trường ơi` · `mâm em hết cơm rồi` | Chủ tiệc phản ứng (hết cơm → đi tới tận mâm) |
| `ra về` | Chào rồi đi ra cổng |

## Sự kiện (MVP 2)

Event Director tự mở 1 sự kiện mỗi ~2 phút khi có ≥ 3 khách ngồi, không lặp lại liền nhau, **chọn loại sự kiện theo Độ náo nhiệt**
(vắng: chụp ảnh / ông cụ / Quang; đông: bát cháo / gà xé). Khi đang có sự kiện, bảng LED trên sân khấu hiện tên, cách chơi và thanh thời gian.

| Sự kiện | Cách chơi | Kết quả |
|---|---|---|
| 🥣 **Bát cơm – bát cháo** (45s) | Chat `bát cháo`. Mỗi mâm hiện `🥣 3/6` | Mâm đầu tiên chia đủ cả mâm (hoặc tỉ lệ cao nhất ≥ 50%) thắng: +30, 🏆, chủ tiệc tới chúc mừng |
| 💸 **Anh thanh toán rồi** (32s) | Chat `em trả` → nhân vật chạy lên quầy | Twist: hoá đơn gửi nhầm! 3 người nhanh nhất: mâm +10 |
| 📸 **Kỷ niệm không bao giờ quên** (25s) | Chat `chụp ảnh` | Chớp đèn, hiện ảnh polaroid toàn sân kèm tên mọi người |
| 🗣 **Quang lên tiếng** (45s) | Chủ tiệc nêu tranh cãi vui, chat `A` / `B` | Chú Quang (hư cấu) lên bục phán — 30% chọn phe ít người cho bất ngờ. Đúng phe: mâm +1/người, mâm đúng nhiều nhất +10 🏆 |
| 🍗 **Gà luộc xé tay** (40s) | Chat `xé` (tối đa 3 lần/người) → miếng gà bay về mâm | Mâm đủ phần cho mọi người: +15 🏆 · mâm ôm quá nhiều bị trêu "tham ăn" |
| 😵‍💫 **Nói ít thôi, đau đầu lắm** (60s) | Chủ tiệc ngồi nghỉ, chat `kể chuyện` | Khách lên bục, game đọc 1 chuyện cười soạn sẵn (`content/jokes.json`), 2 chuyện thì chủ tiệc tỉnh dậy, mâm người kể +10. **Tự mở** khi sân "bùng nổ" và comment dồn dập (tối đa 5 phút/lần) |
| 🎤 **Đại hội anh em bốn bể** (70s) | Chat `phát biểu` → xếp hàng (tối đa 6) | Lần lượt đi lên bục, chủ tiệc đọc lời chúc có tên, mâm +8 |
| 👴 **Mày thích giọng ông cụ không?** (30s) | Chat `1` `2` `3` chọn chuyện | Chủ tiệc hoá ông cụ (tóc bạc, râu, kính), kể chuyện bằng giọng trầm có vang. Chat `giọng ông cụ` cũng mở sự kiện này (tối đa 5 phút/lần) |

**Điểm Tình nghĩa** tăng khi khách vào mâm, ăn cơm, chia cháo, cụng ly, thả tim, follow, tham gia sự kiện. Quà chỉ cộng thêm có trần (tối đa 20/lần) — không tính năng nào bắt buộc quà.

## Độ náo nhiệt (MVP 4)

Một con số 0–100 (trên HUD và bảng điều khiển) tính từ comment/10s, số khách, người mới vào, mức tham gia sự kiện → 4 mức
**Vắng / Ấm / Đông / Bùng nổ**. Chủ tiệc "chấm điểm" việc nên làm (Utility AI, không gọi LLM):

| Mức | Chủ tiệc | Sự kiện |
|---|---|---|
| Vắng | đi thăm mâm nhiều, gọi tên **người âm thầm** (vào > 2 phút chưa nói gì), nói nhiều hơn | dày hơn (×0,75), loại ít người cũng vui |
| Ấm | như bình thường | bình thường |
| Đông | bớt trả lời từng người (40%), nói câu chung cho cả sân, bớt bong bóng chat | sự kiện tập thể |
| Bùng nổ | trả lời từng người 15%, có thể "đau đầu" | thưa hơn (×1,3) |

Báo cáo phiên có thêm đường "Náo nhiệt" theo phút. Hệ số nằm ở `server/src/heat.ts` (chỉnh theo báo cáo thật).

## NPC hư cấu (MVP 4)

- **Chú Quang** (mũ phớt, kính râm, áo caro, giọng nhanh & cao hơn chủ tiệc — chỉnh ở mục 04): xuất hiện trong sự kiện "Quang lên tiếng";
  chat `quang ơi` thì ghé tận mâm (tối đa 1 lần / 3 phút, tắt được).
- **Chú Chực** (áo ba lỗ, cầm bát đũa): 4–6 phút một lần đi xin ăn 2–3 mâm. Mâm đó chat `mời chú` (+2 mỗi lời mời, tối đa +10)
  hoặc `đuổi`; 20 giây không ai mời thì sang mâm khác. Cả sân mời ≥ 5 lần → chú hát tặng. Có sự kiện thì chú tự về.
- Gọi tay ở mục 04: **Gọi chú Quang**, **Gọi chú Chực**.

## Giọng chủ tiệc (MVP 3)

Chủ tiệc nói bằng **giọng TTS có sẵn** của nhà cung cấp, chỉnh tốc độ/cao độ cho ra chất "anh cả bàn nhậu". **Không clone giọng người thật.**

| Nhà cung cấp | Key | Giọng gợi ý |
|---|---|---|
| **Edge** (mặc định) | Không cần, miễn phí | `vi-VN-NamMinhNeural` (nam miền Bắc). Thư viện không chính thức |
| Google Cloud TTS | API key | `vi-VN-Neural2-D`, `vi-VN-Wavenet-D` |
| FPT.AI | api-key | `leminh`, `minhquang`, `giahuy` |
| ElevenLabs | xi-api-key | `voice_id` của một giọng **có sẵn** trong Voice Library |
| Trình duyệt | — | Giọng tiếng Việt của Windows (dự phòng) |

- Câu vào hàng đợi là bắt đầu tổng hợp luôn; file mp3 được **cache** trong `cache/tts/`, đo thời lượng thật để canh bong bóng thoại.
- **Render sẵn**: ~100 câu cố định (kể cả biến thể mâm 1–9) được tạo trước → phát ngay không trễ. Edge tự render khi khởi động; nhà cung cấp trả phí thì bấm nút.
- TTS lỗi (mất mạng, sai key) → chủ tiệc vẫn nói bằng chữ, tạm bỏ qua TTS 30 giây rồi thử lại.
- Màn hình live: miệng chủ tiệc mấp máy theo âm lượng; hiệu ứng **ông cụ** = chậm + trầm + lọc + vang; **tiếng nền tiệc** (xì xào, cụng ly) tự tạo, bật/tắt và chỉnh âm lượng trong bảng điều khiển.
- Tab trình duyệt thường cần bấm nút "🔊 Bấm để bật tiếng"; OBS và `OPEN-LIVE-WINDOW.bat` tự phát được.
- Key lưu trong `secrets.json` (không gửi ra trình duyệt, đã có trong `.gitignore`).

## AI hiểu comment (tầng 2, MVP 3)

Comment không khớp lệnh (tầng 1, regex) được gom lô (≤ 15 câu/lần, giới hạn số lần gọi/phút) gửi cho LLM nhỏ để đoán ý:
"cho em sang bàn 4 ngồi với" → đổi mâm 4, "món gà nhìn ngon thế" → khen ngon, "cho em vào với" → vào tiệc…

- Hỗ trợ **Claude** (Anthropic, mặc định `claude-haiku-5-5`), **OpenAI-compatible** (OpenAI, Ollama chạy local, Gemini…), và **Thử nghiệm** (luật giả, không gọi mạng).
- AI **chỉ trả mã hành động** trong danh sách cố định, không viết lời cho chủ tiệc → comment bậy / "lừa AI" không thể khiến nhân vật nói bậy.
- Mặc định **tắt**. Bật trong mục 09.

## Nhãn parody / AI

Thanh dưới màn hình live luôn có dòng *"🎭 Parody giải trí · Nhân vật hư cấu, giọng nói do AI tạo · Không phải người thật"*
(sửa chữ / tắt ở mục 04). Trong app TikTok cũng nên bật nhãn **"Nội dung do AI tạo"** cho buổi live.

## Chỉ số & báo cáo phiên live

Tự bắt đầu ghi khi **kết nối live** (hoặc bấm "Bắt đầu ghi" để thử với bot). Bấm **"Kết thúc & tạo báo cáo"** — hoặc tắt server — để lưu
`sessions/<thời gian>-<tên>.html` (báo cáo mở bằng trình duyệt), `.json` (tóm tắt) và `.jsonl` (log từng sự kiện).

| Chỉ số | Ý nghĩa |
|---|---|
| Nhập tiệc / người comment | Cửa vào có đủ dễ không (còn tính trên người vào xem live) |
| Còn tương tác sau 3 / 10 phút | Khách vào rồi có ở lại chơi không (— khi chưa ai vào đủ lâu) |
| Comment / phút, % được hiểu | Độ sôi động và phần trăm comment game hiểu được (rule + AI) |
| Trễ TikTok → game | Từ lúc người xem gửi comment tới lúc server nhận (do mạng / TikTok) |
| Chủ tiệc nói trễ | Từ lúc câu thoại vào hàng đợi tới lúc chủ tiệc nói (P90) |
| Kẹt đường đi, FPS | Sức khoẻ màn hình live (chỉ đo khi màn hình live đang mở) |
| Sự kiện | Số sự kiện và số người tham gia mỗi sự kiện |

Báo cáo có **nhận xét tự động** (vd. tỉ lệ nhập tiệc thấp → nhắc lệnh thường hơn). Ngưỡng xanh/vàng/đỏ là mốc khởi điểm để so giữa các phiên,
không phải chuẩn của TikTok. Id người xem trong log được băm, không lưu tên.

## Dev

```bash
npm install
npm run sim     # server + 40 bot + Vite → http://127.0.0.1:5173/control.html
npm test        # 11 test: bộ lọc quà / combo / trùng gói, AI, làm sạch câu, đo mp3, chỉ số phiên, độ náo nhiệt
npm run typecheck
```

## Kết nối TikTok (học từ avatar-arena)

- `tiktok-live-connector` 2.5.0 — thư viện **không chính thức**, có thể hỏng khi TikTok đổi giao thức.
- Chỉ kết nối khi bấm nút; bộ đếm "gen" bỏ sự kiện của lần kết nối cũ; tự thử lại 5/10/20/30 giây.
- Tắt `enableExtendedGiftInfo` (cần gói sign-server trả phí); tên quà + số xu lấy từ payload.
- Bỏ gói trùng theo `msgId`; quà combo được cộng **ngay ở từng nhịp** (chỉ phần tăng thêm).
- Server chỉ nghe `127.0.0.1`; lệnh điều khiển chỉ nhận từ trang local. Chạy `--lan` nếu cần mở cho máy khác.
- Không dùng mật khẩu / cookie.

## Cấu trúc

```
START-GAME.bat · OPEN-LIVE-WINDOW.bat
config.json                 cài đặt (bảng điều khiển tự ghi)
secrets.json                khoá API (tự tạo khi lưu key, không chia sẻ file này)
sessions/                   log + báo cáo các phiên live
docs/KE-HOACH-MVP4.md       kế hoạch MVP 4 (đã triển khai ở bản 0.5)
docs/SPRITE-PROMPTS.md      quy cách sprite AI theo lớp + bộ prompt
cache/tts/                  file giọng đã tạo
content/commands.json       lệnh chat → intent (regex không dấu)
content/lines.json          thoại chủ tiệc + thoại sự kiện
content/blocklist.json      lọc tên / comment bậy
content/debates.json        tranh cãi A/B cho "Quang lên tiếng"
content/jokes.json          chuyện cười cho "Nói ít thôi, đau đầu lắm"
shared/layout.ts            toạ độ mâm, ghế, quầy, lối đi + tìm đường
shared/protocol.ts          giao thức WebSocket (overlay / preview / control)
server/src/
  index.ts                  HTTP + WebSocket + lệnh bảng điều khiển
  game.ts                   brain: comment, FSM chủ tiệc, cooldown, nhật ký, cài đặt
  events.ts                 Event Director + 8 sự kiện (chọn theo Độ náo nhiệt)
  heat.ts                   Độ náo nhiệt (+ .test.ts)
  npc.ts                    khung NPC (chú Quang, chú Chực)
  chuc.ts                   chú Chực đi xin ăn
  bond.ts                   điểm Tình nghĩa
  room.ts · speech.ts · intents.ts · text.ts
  sources/tiktok.ts         adapter kết nối
  sources/tiktokMapping.ts  chuẩn hoá payload, lọc trùng, combo (+ .test.ts)
  sources/simulator.ts      bot giả lập (hưởng ứng sự kiện)
  tts/providers.ts          Edge / Google / FPT.AI / ElevenLabs
  tts/service.ts            cache, hàng đợi tổng hợp, render sẵn, tạm dừng khi lỗi
  tts/mp3.ts                đo thời lượng mp3
  ai/classifier.ts          LLM phân loại comment (+ .test.ts)
  metrics.ts                chỉ số phiên live (+ .test.ts)
  report.ts                 báo cáo HTML
client/
  index.html · src/main.ts  màn hình live (Phaser)
  control.html · src/control/  bảng điều khiển
  src/scenes/PartyScene.ts  hiển thị theo lệnh server
  src/objects/              Person, Bubble, TableUI, EventPanel, look
  src/fx.ts                 pháo giấy, hiệu ứng mâm, ảnh kỷ niệm
  src/audio.ts              phát giọng, hiệu ứng ông cụ, khẩu hình, tiếng nền
```

## Thay đồ hoạ AI

- **Nền**: `client/public/assets/bg.png` (1080×1920). Giữ vị trí mâm theo `shared/layout.ts`
  (cột x = 220/540/860, hàng y = 660/1020/1380; bục trên, quầy góc phải trên, cổng dưới).
- **Nhân vật** (MVP 4): `client/public/assets/people.png` + `people.json` (atlas) — lớp thân / áo / quần / tóc vẽ **xám**, game tự tô màu
  và ghép theo ngoại hình từng người xem; chủ tiệc, ông cụ, chú Quang, chú Chực vẽ riêng nguyên bộ. Thiếu lớp nào thì nhân vật đó dùng hình khối.
  Quy cách khung + **bộ prompt**: `docs/SPRITE-PROMPTS.md`. Soát ảnh: mở `/?atlas-test=1`.

## Lưu ý nội dung

Chủ tiệc là **nhân vật parody hư cấu**: không dùng giọng clone hay ảnh người thật, không dùng địa chỉ nhà thật.
Nên ghi rõ "nội dung giải trí / parody" trên live.

## Tiếp theo

- Live thử ≥ 20 phút, so báo cáo phiên trước / sau MVP 4 (tỉ lệ nhập tiệc, giữ chân 3 phút, sự kiện nào kéo người nhất)
- Chỉnh hệ số Độ náo nhiệt theo số liệu thật
- Tạo sprite AI theo `docs/SPRITE-PROMPTS.md`; thêm frame đi / ngồi riêng
