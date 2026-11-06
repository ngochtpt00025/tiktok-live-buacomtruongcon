# Kế hoạch MVP 4 — NPC Quang, Độ náo nhiệt, sự kiện mới, sprite AI

> ✅ **Đã triển khai ở bản 0.5** (M1–M6). Chọn mặc định cho 4 câu hỏi cuối: ngoại hình chú Quang như mô tả; `quang ơi` gọi được chú Quang
> (tắt được ở mục 04); kho tranh cãi (`content/debates.json`, 20 câu) và chuyện cười (`content/jokes.json`, 30 chuyện) là bản đầu để bạn sửa;
> sprite: code ghép lớp + bộ prompt trong `docs/SPRITE-PROMPTS.md`.
> Khác kế hoạch: sprite hiện dùng 1 frame đứng (đi = nhún, ngồi = co người); frame đi / ngồi riêng làm sau khi có ảnh.

> Mục tiêu: sân tiệc "sống" hơn khi đông lẫn khi vắng, có thêm nhân vật phụ và minigame,
> rồi dùng **báo cáo phiên** (mục 11) để đo xem thay đổi có tăng tỉ lệ nhập tiệc / giữ chân 3 phút hay không.

## Thứ tự làm

| # | Hạng mục | Phụ thuộc | Ước lượng |
|---|---|---|---|
| M1 | **Khung NPC** + **NPC Quang** + sự kiện **"Quang lên tiếng"** | — | 2 ngày |
| M2 | **Độ náo nhiệt** của sân → chủ tiệc & Event Director đổi cách cư xử | — | 1 ngày |
| M3 | **"Nói ít thôi, đau đầu lắm"** bản đầy đủ | M2 | 0,5–1 ngày |
| M4 | Minigame **"Gà luộc xé tay"** | — | 1 ngày |
| M5 | NPC **"Thánh ăn chực"** | M1 | 0,5–1 ngày |
| M6 | **Sprite AI theo lớp** (thân / áo / tóc / phụ kiện) | — | 1 ngày code + thời gian làm ảnh |

M6 làm song song được: bạn tạo ảnh trong lúc mình làm M1–M5. Sau mỗi mốc: chạy bot giả lập, rồi live thử và so báo cáo phiên với phiên trước.

---

## M1. Khung NPC + NPC Quang (hư cấu) + sự kiện "Quang lên tiếng"

### Nhân vật

- **Chú Quang** — bạn thân hư cấu của chủ tiệc, "người phán xử" của mọi tranh cãi trên bàn nhậu. Câu cửa miệng:
  *"Quang đã nói thế rồi thì ok đi em!"*.
- Ngoại hình riêng, dễ phân biệt chủ tiệc: áo sơ mi kẻ caro, mũ phớt, kính râm, cầm cốc trà đá. Hoạt hình hoá, **không** dựa trên ảnh người thật.
- Giọng: cùng nhà cung cấp TTS nhưng khác chất giọng — vd. Edge `NamMinh` với tốc độ +10%, cao độ +12% (nhanh, "lanh chanh");
  Google có thể dùng hẳn giọng khác (`vi-VN-Wavenet-B`). Cấu hình riêng trong bảng điều khiển.
- Bình thường **không ở trong sân** (đứng ngoài cổng). Xuất hiện khi có sự kiện, hoặc khi người xem chat `quang ơi` (tối đa 1 lần / 3 phút):
  đi từ cổng vào, nói 1 câu, đi ra.

### Sự kiện "Quang lên tiếng" (45 giây)

1. Chủ tiệc nêu một **tranh cãi vui 2 phương án** (lấy ngẫu nhiên từ `content/debates.json`), ví dụ:
   - "Gà luộc chấm muối tiêu chanh **(A)** hay nước mắm gừng **(B)**?"
   - "Ăn cơm trước **(A)** hay cụng ly trước **(B)**?"
   - "Mâm chẵn **(A)** hay mâm lẻ **(B)** hát hay hơn?"
2. Người xem chat `A` / `B` (hoặc `1` / `2`). Bảng LED hiện thanh tỉ lệ theo thời gian thực.
3. Giây thứ ~25: Chú Quang đi từ cổng lên bục, đứng cạnh chủ tiệc, "suy nghĩ" (emote 🤔).
4. Hết giờ: Quang **phán**. 70% chọn phe đông, 30% chọn phe ít ("cú lật" cho vui) → *"Quang đã nói thế rồi thì ok đi em!"*.
   Chủ tiệc phản ứng theo kết quả (đồng ý / dở khóc dở cười).
5. Người chọn đúng phe Quang phán: mâm của họ +1 tình nghĩa mỗi người; mâm có nhiều người đúng nhất: +10 và 🏆.

### Kỹ thuật

- **Server — `npc.ts`**: danh sách NPC `{ id, name, look, voice, state, pos }`, FSM nhỏ (`offstage → walking → onstage → leaving`).
- **Giao thức**: `npc_spawn`, `npc_goto(target)`, `npc_leave`; `say` thêm trường `speaker: 'host' | npcId`.
- **Hàng đợi thoại**: mỗi câu mang `speaker` → TTS dùng giọng của người nói (khoá cache đã có voice/rate/pitch nên không lẫn).
- **Client**: `Person` dùng chung cho NPC (đã có bong bóng, khẩu hình, đi theo path); thêm vị trí `STAGE_NPC_SPOT`.
- **Nội dung**: `lines.json` thêm nhóm `quang_*`; `content/debates.json` (~20 tranh cãi, sửa không cần code).
- **Bot giả lập**: chat A/B ngẫu nhiên khi có sự kiện.
- **Rủi ro**: 2 người nói chồng tiếng → hàng đợi thoại vẫn chỉ phát 1 câu mỗi lúc, chỉ đổi người nói.

---

## M2. Độ náo nhiệt (0–100)

Một chỉ số duy nhất để mọi hành vi tự điều chỉnh theo độ đông, thay cho FSM cố định hiện tại.

**Công thức** (trung bình trượt, cập nhật mỗi 2 giây):

```
náo nhiệt = 35% · min(1, comment/10s ÷ 20)
          + 25% · min(1, khách trong sân ÷ 40)
          + 20% · min(1, người mới vào/phút ÷ 8)
          + 20% · min(1, tham gia sự kiện/phút ÷ 15)
```

Các hệ số này là mốc khởi điểm, sẽ chỉnh theo báo cáo phiên thật.

| Mức | Chủ tiệc | Event Director | Khác |
|---|---|---|---|
| **Vắng** (< 20) | Đi thăm mâm thường xuyên, gọi tên từng người, câu mời "chat nhập tiệc"; nói nhiều hơn (8 câu/phút) | Sự kiện nhỏ, ít người cũng chơi được (chụp ảnh, ông cụ); giãn cách ngắn hơn | Banner hướng dẫn dày hơn |
| **Ấm** (20–50) | Như hiện tại | Như hiện tại | — |
| **Đông** (50–80) | Ít trả lời từng người, nhiều câu nói chung cho cả sân | Ưu tiên sự kiện tập thể (bát cháo, gà xé, Quang) | Giảm bong bóng chat khách |
| **Bùng nổ** (> 80) | Có thể kích hoạt "Nói ít thôi, đau đầu lắm" (M3) | Giãn cách dài hơn, sự kiện ngắn hơn | Pháo giấy, banner ăn mừng |

**Kỹ thuật**: chủ tiệc chuyển sang chấm điểm từng hành động (Utility AI): mỗi hành động (thăm mâm X, nói chung, đứng bục, gọi người âm thầm…)
có điểm = f(náo nhiệt, thời gian từ lần cuối, số người ở mâm…) → chọn điểm cao nhất, có ngẫu nhiên nhẹ.
Không gọi LLM. Hiện thanh "🔥 Náo nhiệt" nhỏ trên HUD và trong bảng điều khiển. Báo cáo phiên thêm biểu đồ náo nhiệt theo phút.

---

## M3. "Nói ít thôi, đau đầu lắm" — bản đầy đủ

Hiện mới có câu thoại và hiệu ứng chóng mặt. Bản đầy đủ là một sự kiện ngắn (~40 giây), **không** nằm trong vòng tự động mà kích hoạt khi:
náo nhiệt > 80 **và** comment/10s vượt ngưỡng **và** đã qua 5 phút kể từ lần trước.

1. Chủ tiệc chóng mặt 😵‍💫 → *"Nói ít thôi, đau đầu lắm!"* → đi tới ghế ở mép bục, **ngồi nghỉ** (tư thế ngồi, mắt nhắm, 💤).
2. Bảng LED: *"Anh Trường mệt rồi! Chat `kể chuyện` để kể chuyện vui gọi anh ấy dậy"*.
3. Chọn ngẫu nhiên 1 người trong số người chat `kể chuyện` → nhân vật đi lên bục, chủ tiệc (đang ngồi) nghe;
   câu chuyện lấy từ kho **chuyện cười soạn sẵn** (`content/jokes.json`, ~30 chuyện ngắn, sạch) — đọc bằng giọng "người dẫn" khác giọng chủ tiệc.
   Không đọc nội dung người xem gõ.
4. Sau 1–2 chuyện: chủ tiệc bật dậy *"Hay! Tỉnh cả người!"*, mâm người kể +10, cả sân 🎉.
5. Không ai kể → *"Anh sợ nhất là những người âm thầm…"* → chủ tiệc tự dậy.

**Kỹ thuật**: trạng thái `RESTING` cho chủ tiệc + texture ngồi; chỗ ghế `HOST_REST_SPOT`; intent `STORY`.

---

## M4. Minigame "Gà luộc xé tay" (40 giây)

Đúng tinh thần "chia sẻ": cả sân cùng xé một con gà, ai cũng phải có phần.

1. Một đĩa gà luộc to xuất hiện trên bục (sprite gà, thu nhỏ dần theo số miếng còn lại, ~24 miếng).
2. Người xem chat `xé` → một miếng gà **bay theo đường cong** từ bục về mâm của người đó (+ tiếng "xoẹt").
   Mỗi người tối đa 3 lần để tránh spam.
3. Kết thúc khi hết gà hoặc hết giờ:
   - Mâm mà **mọi người ngồi đều có ≥ 1 miếng** → "Mâm công bằng" +15 🏆.
   - Mâm ôm nhiều miếng hơn số người × 2 → chủ tiệc trêu "tham ăn thế!" (vui, không trừ điểm).
4. Chủ tiệc kết: *"Gà luộc xé tay phải chia đều, thế mới là tình nghĩa!"*.

**Kỹ thuật**: sự kiện mới trong `events.ts`; client hiệu ứng miếng gà (tween theo đường cong Bézier) + bộ đếm trên mâm (dùng lại `TableUI.setProgress`).

---

## M5. NPC "Thánh ăn chực" (hư cấu)

Nhân vật phụ lang thang, tạo tình huống nhỏ giữa các sự kiện lớn. Dùng khung NPC của M1.

- Mỗi 4–6 phút (khi không có sự kiện), "Chú Chực" (áo ba lỗ, cầm bát đũa) đi vào từ cổng, chọn mâm đông / nhiều tình nghĩa nhất, đứng cạnh *"Cho chú xin miếng…"* 🍗.
- Người mâm đó chat:
  - `mời chú` → chú ngồi ăn vui vẻ, mâm +2 mỗi lời mời (tối đa +10) → *"Mâm này hiếu khách quá!"*.
  - `đuổi` / không ai mời trong 20 giây → chú lủi thủi sang mâm khác.
- Sau 2–3 mâm thì chú về. Nếu cả sân mời nhiều → cuối lượt chú "trả lễ": *"Chú tặng cả sân một bài hát!"* (pháo giấy).

---

## M6. Sprite AI theo lớp

Hiện nhân vật vẽ bằng hình khối trong `Person.ts › drawBody` và đã được **cache thành texture theo `Look`**. Chỉ cần thay bước vẽ, phần còn lại giữ nguyên.

### Quy cách ảnh (bạn tạo bằng AI rồi làm sạch nền)

- Khung mỗi frame **128 × 168 px** (vẽ ở 2x), **gốc chân** ở (64, 144), nhìn nghiêng 3/4 sang phải (lật ngang khi đi sang trái).
- **Lớp** (PNG trong suốt, cùng khung, chồng lên nhau đúng vị trí):
  - `body_{skin}` — 4 tông da
  - `shirt_{style}` — 3–4 kiểu áo, vẽ **xám** để code tô màu (`setTint`) → 12 màu áo không cần 12 ảnh
  - `pants` — xám, tô màu
  - `hair_{0..3}` — 4 kiểu tóc, xám, tô màu
  - `acc_glasses`, `acc_scarf`, `acc_cap`
- **Frame**: `idle` ×2, `walk` ×4, `sit` ×1. Miệng để trống (code vẽ miệng mấp máy như hiện tại).
- Nhân vật riêng (vẽ nguyên bộ, không ghép lớp): **chủ tiệc**, **chủ tiệc ông cụ**, **chú Quang**, **chú Chực**.
- Đóng gói bằng Free Texture Packer / TexturePacker → `client/public/assets/people.png` + `people.json` (atlas Phaser).

**Mẹo giữ đồng bộ phong cách**: gen 1 nhân vật mẫu trước, dùng làm ảnh tham chiếu (image prompt) cho mọi lớp; cùng 1 bảng màu và nét viền.

### Code

- `PeopleAtlas`: nếu có `people.json` thì ghép lớp → **bake** vào RenderTexture theo `Look` + frame (giữ cơ chế cache, 150 người vẫn nhẹ); không có thì dùng hình khối như cũ.
- Hoạt ảnh đi: đổi frame theo quãng đường thay cho nhún nhảy.
- Thêm trang `/?atlas-test=1` hiển thị mọi tổ hợp lớp để soát ảnh trước khi live.

---

## Đo kết quả

Sau mỗi mốc, chạy ít nhất 1 phiên live thử ≥ 20 phút và so với phiên trước trong mục 11:

- Tỉ lệ nhập tiệc / người comment
- Còn tương tác sau 3 phút và 10 phút
- Số người tham gia trung bình mỗi sự kiện (sự kiện nào kéo người nhất)
- Chủ tiệc nói trễ (P90), số lần kẹt đường đi, fps màn hình live

## Cần bạn quyết (đã chọn mặc định — xem đầu file)

1. Chú Quang: giữ ngoại hình mô tả ở trên, hay bạn có ý khác?
2. Chú Quang có tự xuất hiện khi chat `quang ơi` ngoài sự kiện không? (Kế hoạch: có, tối đa 1 lần / 3 phút.)
3. Kho chuyện cười cho M3 và tranh cãi cho M1: bạn muốn tự soạn, hay để mình soạn bản đầu cho bạn sửa?
4. M6: bạn tự gen ảnh theo quy cách trên, hay muốn mình viết sẵn bộ prompt cho từng lớp?
