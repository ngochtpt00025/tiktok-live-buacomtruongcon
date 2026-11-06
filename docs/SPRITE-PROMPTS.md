# Sprite AI theo lớp — quy cách & bộ prompt

Game tự dùng sprite khi có **`client/public/assets/people.png` + `people.json`** (atlas Phaser, dạng *JSON Hash* hoặc *JSON Array*).
Thiếu file / thiếu lớp nào thì nhân vật đó tự quay về hình khối như cũ — không bao giờ bị lỗi trắng.
Kiểm tra: mở `http://127.0.0.1:8787/?atlas-test=1` → lưới 56 nhân vật + 4 nhân vật riêng, dòng trên cùng cho biết đang dùng sprite hay hình khối.

## Quy cách khung

| | |
|---|---|
| Kích thước mỗi frame | **128 × 168 px**, nền trong suốt (PNG) |
| Gốc chân | điểm **(64, 144)** — tâm hai bàn chân chạm đất ở đây |
| Hướng nhìn | nghiêng 3/4 sang **phải** (game tự lật khi đi sang trái) |
| Tỉ lệ | đầu to kiểu chibi: đầu ≈ 1/3 chiều cao; đỉnh đầu (kể cả mũ) không vượt y = 0 |
| Miệng | **để trống / ngậm nhẹ** — game tự vẽ miệng mấp máy khi nói (ở toạ độ ~ (64, 58)) |

## Tên frame trong atlas

Lớp **xám** (vẽ bằng các sắc xám trung tính, game nhân màu bằng `tint`, nên 1 ảnh xám = 12 màu áo):

| Frame | Nội dung | Màu |
|---|---|---|
| `body_0` … `body_3` | thân + đầu + tay chân, **4 tông da** (sáng → ngăm), không quần áo tóc | màu thật |
| `pants` | quần dài | **xám** |
| `shirt_0` … `shirt_3` | 4 kiểu áo: phông cổ tròn, sơ mi, áo khoác mỏng, áo polo | **xám** |
| `hair_0` … `hair_3` | tóc ngắn, tóc dài, đầu đinh, mũ lưỡi trai | **xám** |
| `acc_glasses` | kính cận | màu thật |
| `acc_scarf` | khăn quàng đỏ | màu thật |

Nhân vật **vẽ riêng nguyên bộ** (màu thật, không ghép lớp):

| Frame | Nhân vật |
|---|---|
| `char_host` | chủ tiệc: sơ mi trắng, cà vạt vàng, tóc đầu đinh — **hư cấu, không giống người thật** |
| `char_host_old` | chủ tiệc hoá ông cụ: tóc bạc, râu trắng, kính, áo nâu |
| `char_quang` | chú Quang: mũ phớt, kính râm, áo sơ mi caro xanh, cầm cốc trà đá |
| `char_chuc` | chú Chực: áo ba lỗ trắng, quần nâu, tay cầm bát + đôi đũa |

> Hiện game dùng 1 frame đứng cho mỗi lớp (đi lại = nhún nhảy; ngồi = co người). Frame đi / ngồi riêng có thể thêm sau.

## Quy trình

1. **Tạo 1 nhân vật mẫu** (prompt A) → chọn ảnh ưng nhất → dùng làm **ảnh tham chiếu** cho mọi lần tạo sau (image prompt / style reference), cùng seed nếu công cụ hỗ trợ.
2. Tạo **thân** 4 tông da (prompt B), rồi từng lớp **áo / quần / tóc** trên nền trong suốt (prompt C), cùng tư thế với nhân vật mẫu.
3. Làm sạch: xoá nền (remove.bg / Photopea), đưa về **128 × 168**, căn **gốc chân (64, 144)** — đặt mọi lớp lên cùng 1 file nhiều layer để chồng khít rồi xuất từng layer.
4. Lớp xám: chuyển áo / quần / tóc sang **grayscale** và kéo sáng ~70–85% (tint nhân với màu → xám càng sáng, màu càng tươi).
5. Đóng gói bằng **Free Texture Packer** (miễn phí) → định dạng *Phaser 3* → `people.png` + `people.json`, tên frame = tên file (bỏ đuôi `.png`).
6. Chép vào `client/public/assets/`, chạy `START-GAME.bat`, mở `/?atlas-test=1` để soát.

## Prompt (dùng cho Midjourney / Leonardo / SDXL / ChatGPT image — chỉnh theo công cụ)

**Phong cách chung (dán vào cuối mọi prompt):**
```
cute chibi 2D game character, Vietnamese casual style, thick clean dark-brown outline, flat cel shading with one soft shadow tone,
warm friendly colors, full body, standing, 3/4 view facing right, feet together on the ground, centered,
transparent background, no text, no logo, consistent proportions (big head about one third of height)
```

**A — nhân vật mẫu:**
```
a friendly young Vietnamese man at a family party, plain t-shirt, long trousers, short black hair, smiling with closed mouth, [phong cách chung]
```

**B — thân (4 lần, đổi tông da):**
```
the same character as the reference, base body only: head, neck, arms, hands and legs in plain skin-colored underwear shape,
NO clothes, NO hair (bald smooth head), skin tone: [very light | light tan | medium brown | warm light], closed relaxed mouth, [phong cách chung]
```

**C — lớp (mỗi lớp 1 ảnh, nền trong suốt, chỉ vẽ món đồ đó, đúng vị trí trên cơ thể mẫu):**
```
only the [crew-neck t-shirt | button shirt | light jacket | polo shirt | long trousers | short hair | long hair | buzz cut hair | baseball cap]
of the reference character, isolated, as it sits on his body, nothing else visible, flat light-gray color, [phong cách chung]
```

**Nhân vật riêng:**
```
char_host:     a cheerful middle-aged party host, white short-sleeve shirt, yellow tie, black trousers, buzz cut hair, arms open welcoming, fictional character, [phong cách chung]
char_host_old: the same host dressed as a funny old grandpa, white hair, long white beard, round glasses, brown traditional shirt, [phong cách chung]
char_quang:    a cool middle-aged uncle, brown fedora hat with red band, black sunglasses, blue plaid shirt, holding a glass of iced tea, confident pose, fictional character, [phong cách chung]
char_chuc:     a funny skinny uncle, white tank top, brown trousers, holding a rice bowl and chopsticks, hungry hopeful expression, fictional character, [phong cách chung]
```

> Các nhân vật đều **hư cấu**: không đưa ảnh / tên người thật vào prompt, không yêu cầu "giống ai đó".
