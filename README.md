# Thiên Mệnh Nghịch Đồ — Vertical Slice

Game tu tiên pixel-art 2D chạy trên web: **Phaser 3 + React + TypeScript + Vite**.
Ba nhân vật chơi được, cả ba đều dùng sprite sheet do bạn vẽ, đã được bóc tách
tự động thành atlas game-ready:

* **Như Yên** — Băng Cung. Năm sheet `nhuyen-*.png`, kiếm băng: liên chiêu 3 thức,
  3 chiêu thức, chạy nước rút và ảnh bộ.
* **Huyết Lang** — Tam Thủ Môn. Sheet `huyetlang-*.png`, trường đao: liên chiêu,
  3 chiêu thức (Huyết Diễm Trảm, Tam Thủ Hống, Liệt Ảnh Bộ).
* **Tôn Ngộ Không** — Hoa Quả Sơn. Chín sheet `wukong-*.png`, thiết côn: liên
  chiêu 3 thức, **4 chiêu công** (Cửu U Nộ Diễm, Hàng Ma Chân Lôi, Phần Thiên Ma
  Diễm, Ma Nguyệt Trảm) cộng Cân Đẩu Vân, chạy nước rút và cưỡi mây. Anh là
  người duy nhất có 4 chiêu công — vì cả bốn đều được vẽ nguyên một hàng art,
  khí tụ dần ra từ cây côn qua từng frame, nên cắt bớt một chiêu là vứt art đi
  chứ không phải gọn code đi.

Nhấn `Q` trong game để đổi qua lại giữa ba người.

Cùng map có **Boss 1 — Huyết Ma** (sheet trong `public/assets/boss/boss1/`), tự
tuần tra và tự đánh nhau với nhân vật đang chơi — xem [Boss 1](#boss-1--huyết-ma-và-hệ-ai-dùng-chung).

```bash
npm install
npm run dev              # http://localhost:5173
npm run build            # tsc -b && vite build

npm run build:nhuyen     # bóc tách 5 sheet Như Yên -> atlas/
npm run inspect:nhuyen   # báo cáo segmentation + kích thước frame sau khi scale
npm run measure:nhuyen   # thước đo "chân -> cổ áo", dùng để chỉnh scale từng sheet
npm run dump:nhuyen      # xuất toàn bộ frame để kiểm tra pose bằng mắt

npm run build:huyetlang    # bóc tách sheet Huyết Lang -> atlas/
npm run inspect:huyetlang  # báo cáo segmentation từng hàng
npm run measure:huyetlang  # thước đo "chân -> cổ áo"
npm run dump:huyetlang     # xuất toàn bộ frame để kiểm tra pose bằng mắt

npm run build:wukong       # bóc tách 6 sheet Tôn Ngộ Không -> atlas/
npm run inspect:wukong     # báo cáo segmentation từng hàng
npm run measure:wukong     # thước đo "chân -> vai"
npm run dump:wukong        # xuất toàn bộ frame để kiểm tra pose bằng mắt
npm run cuts:wukong        # vẽ đường cắt + neo chân lên sheet gốc để soi bằng mắt

npm run measure:stride   # đo bàn chân trôi bao nhiêu px mỗi hàng đi/chạy
npm run analyse:cycle    # đo độ nhiễu giữa các frame + tìm thứ tự chu kỳ êm nhất

npm run build:boss       # bóc tách 5 sheet Boss 1 -> atlas/
npm run inspect:boss     # báo cáo segmentation từng hàng
npm run dump:boss        # xuất strip từng sheet để kiểm tra pose
npm run check:ai         # 25 check cho hệ AI bằng clock giả (không cần browser)
npm run check:atlas      # dựng lại từng frame từ metadata, so với bản trước (phải Δ = 0)
```

## Điều khiển

Chung cho cả hai nhân vật:

| Phím | Hành động |
| --- | --- |
| `W A S D` / `← ↑ → ↓` | Di chuyển |
| `Q` | Đổi nhân vật (giữ nguyên vị trí đang đứng) |
| `H` | (debug) nhận 25 sát thương thô |
| `R` | (debug) hồi sinh tại điểm spawn |
| `B` | (debug) gọi lại Boss 1 tại chỗ đứng của nó |

**Huyết Lang** (HP 128, ATK 17, speed 108, SP 18):

| Phím | Hành động |
| --- | --- |
| `J` | Trường đao liên chiêu |
| `K` | **Huyết Diễm Trảm** — damage = attack × 2.2, cooldown 1600ms, tốn 6 SP |
| `L` | **Tam Thủ Hống** — damage = attack × 3.4, cooldown 5200ms, tốn 12 SP |
| `Space` | **Liệt Ảnh Bộ** — lao theo hướng nhắm, miễn sát thương, cooldown 900ms, tốn 4 SP |

**Như Yên** (HP 92, ATK 13, speed 132, SP 26):

| Phím | Hành động |
| --- | --- |
| `Shift` (giữ) | Chạy nước rút — speed × 1.6, dùng đúng dải frame "run" trong sheet |
| `J` | **Hàn Băng Tam Thức** — liên chiêu 3 thức, xem bảng dưới |
| `K` | **Băng Phách Trảm** — attack × 2.2, cooldown 1600ms, 6 SP. Phóng vệt kiếm khí bay 300px, **xuyên** qua mọi mục tiêu trên đường, +2 Băng |
| `L` | **Băng Tinh Trận** — attack × 3.4, cooldown 5200ms, 12 SP. Tụ khí 6 frame rồi dựng **trận 9 trụ băng**; sát thương là một đĩa lan từ 120px ra **294px**, kín đặc không kẽ, +3 Băng (đóng băng ngay) |
| `Space` | **Sương Ảnh Bộ** — lao 168px theo hướng nhắm trong 170ms, **miễn sát thương**, để lại 4 ảnh tàn, cooldown 900ms, 4 SP |

**Tôn Ngộ Không** (HP 84, ATK 14, speed 142, SP 34):

| Phím | Hành động |
| --- | --- |
| `Shift` (giữ) | Chạy nước rút — speed × 1.42, dùng đúng dải frame "run" trong sheet |
| `J` | **Cửu Chuyển Côn Pháp** — liên chiêu 3 thức: attack × 1.0 / 1.2 / 1.9, vùng đánh phủ −20…140 / −20…160 / −20…180px quanh chân. Tầm xa nhất roster, vì cây côn được vẽ quét qua cả một thân người. **Anh vung theo hướng nhắm chứ không theo hướng sprite quay**: cả tám hướng đều có art riêng, và ba hướng (ngang, bổ xuống, bổ lên) có đủ ba thức khác nhau — không kit nào khác được vậy. Bốn góc chéo có hai thức |
| `K` | **Cửu U Nộ Diễm** — attack × 3.0, cooldown 5600ms, 12 SP. Khí tụ dưới chân rồi bung thành trụ, ăn **đĩa bán kính 200px** quanh chỗ đứng |
| `L` | **Hàng Ma Chân Lôi** — attack × 2.4, cooldown 3800ms, 9 SP. Cầu khí tụ lại thành thương lôi, **hiện ra sẵn suốt 420px** theo hướng nhắm và ăn ngay trong một frame — câu trả lời chắc chắn cho một hàng địch |
| `U` | **Phần Thiên Ma Diễm** — attack × 2.6, cooldown 6800ms, 14 SP. Ma diễm dâng qua 7 nấc thành mặt quỷ, ăn **đĩa bán kính 260px** — rộng nhất của anh, và chậm nhất |
| `O` | **Ma Nguyệt Trảm** — attack × 1.9, cooldown 1500ms, 5 SP. Nguyệt trảm lớn dần thành **rồng khí**, quét dải rộng 84px dài **300px** trước mặt |
| `Space` | **Cân Đẩu Vân** — cưỡi mây 196px trong 190ms, **miễn sát thương**, cooldown 1000ms, 4 SP |

`U` và `O` là hai phím lẻ, và chúng là của riêng anh: `J K L Space` là hàng phím
mọi kit đều dùng chung, nhét chiêu thứ ba và thứ tư vào đó sẽ làm hàng phím
chung mang nghĩa khác đi ở đúng một nhân vật. Trên **touch pad chỉ có 3 nút
chiêu**, nên Phần Thiên Ma Diễm và Ma Nguyệt Trảm hiện chỉ bấm được bằng bàn
phím — nhân đôi chúng lên nút sẵn có thì tệ hơn.

Thứ tự slot bám theo tên file art (`skill1`…`skill4`), để HUD đọc cùng thứ tự
với thư mục art.

Mọi đòn đánh và skill đều **nhắm theo 8 hướng**, kể cả chéo — xem
[Nhắm 8 hướng](#nhắm-8-hướng-trên-art-4-hướng).

### Hàn Băng Tam Thức (liên chiêu `J`)

| Thức | Damage | Băng | Tâm đòn | Bán kính | Với tới | Art |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | attack × 0.9 | +1 | 58px | 52px | **110px** | `atk1_front` khi nhìn xuống, còn lại `atk1_side` |
| 2 | attack × 1.1 | +1 | 72px | 56px | **128px** | `atk2_side` |
| 3 | attack × 1.8 | +2 | 90px | 64px | **154px** | `atk3_side`, có knockback 14px |

Tầm được đặt theo chỗ vệt khí **được vẽ thật**: ở frame va chạm, vòng cung với tới
khoảng 111px / 122px / 130px sau chân cô ấy (đo bằng
`npm run frames:nhuyen -- --report`). Trước đây tầm chỉ tới 86/94/104px nên nhìn
như đánh trượt trong khi hoạt ảnh rõ ràng đã quét qua mục tiêu. Cạnh trong của
vòng tròn (`tâm - bán kính`) chỉ cách chân vài px, nên mục tiêu đứng sát người vẫn
ăn đòn.

* Cửa sổ liên chiêu: **620ms** sau khi thức trước diễn xong. Hết cửa sổ thì nhấn
  `J` lại bắt đầu từ thức 1.
* Nhấn `J` khi thức đang chạy quá **45%** sẽ được **đệm lại** và tự bung ngay khi
  thức đó kết thúc — nên mash `J` liên tục vẫn ăn đủ 3 thức, không rơi nhịp.
* Đánh xong thức 3 là hết chuỗi, HUD tắt hết pip.
* **Không có** attack cooldown riêng: nhịp do animation + cửa sổ liên chiêu quyết
  định. Trước đây có cả hai, và cái nào chặt hơn sẽ âm thầm ăn mất phím của cái kia.

### Băng Tinh Trận — trận 9 trụ (`L`)

Cái tên là "trận", nên nó là **một đội hình**, không phải một cú nổ:

| Trụ (hình ảnh) | Vị trí | Scale | Thời điểm |
| --- | --- | --- | --- |
| Trung tâm | ngay chỗ cô ấy đứng | 1.0 | ngay lập tức |
| Vành ngoài ×8 | cách 190px, chia đều 45° | 0.78 | lệch nhau 45ms |

* Trụ trung tâm mọc **ngay dưới chân cô ấy** vì sheet vẽ đúng như vậy — bóng người
  nhỏ giữa trụ băng chính là cô ấy.
* Vành ngoài quay theo **hướng nhắm**, nên luôn có một trụ mọc thẳng phía trước.

**Sát thương không đi theo từng trụ.** Nó là **một đĩa lan ra cùng với trận**: 9
đợt, mỗi đợt trùng nhịp một trụ, bán kính tăng đều từ 120px (băng của trụ trung
tâm) tới **294px** (rìa ngoài của băng được vẽ):

| Đợt | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Bán kính | 120 | 142 | 163 | 185 | 207 | 229 | 250 | 272 | **294** |
| Thời điểm | 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315 | 360ms |

* Mục tiêu chỉ trúng **một lần**, bởi đợt đầu tiên với tới nó — nên trận vẫn **lan
  từ trong ra**: gần đóng băng trước, xa đóng băng sau.
* Vì sao đổi: bản trước dùng **9 vòng tròn rời** theo từng trụ, và **có kẽ hở thật**.
  Qua khỏi vành, các trụ tách xa nhau: mục tiêu ở 250px nằm đúng giữa hai trụ có
  khoảng cách tới trụ gần nhất là 104.07px — nhiều hơn bán kính 104px của trụ —
  nên **ăn 0 damage** trong khi băng nổ ở cả hai bên nó. Đĩa lan ra thì không thể
  có kẽ.
* Đã kiểm chứng trong game: 40 / 150 / 190 / 250 (cả 3 góc, gồm đúng chỗ kẽ cũ) /
  290px đều ăn damage; 340 / 420px (ngoài vùng băng được vẽ) ăn 0.
* `recovery` 560ms giữ cô ấy ở pose cuối cho tới khi trận nổ xong.

### Nhắm 8 hướng trên art 4 hướng

`Direction` buộc phải là 4 hướng vì art chỉ có thế: 4 pose đứng, 3 pose đi, 1 pose
đánh. Nhưng **hitbox, projectile và hiệu ứng thì không cần thô như vậy**. Nên
payload mang thêm `aim` — một vector đơn vị:

* `direction` → chọn clip để phát (hướng vẽ gần nhất).
* `aim` → tâm đòn, đường bay của vệt kiếm khí, góc quay sprite hiệu ứng, hướng
  knockback, hướng lao của Sương Ảnh Bộ, và hướng quay của trận băng.

Bàn phím chỉ tạo ra được 8 hướng, nên **chuẩn hoá trục input đã chính là snap 8
hướng** — không cần lượng tử hoá thêm. Nhấn chéo thì cô ấy phát pose hông nhưng
đòn bay đúng đường chéo; cả 8 hướng đều ăn đòn thật.

### Băng Tâm Quyết (passive)

Mọi đòn của Như Yên cộng dồn **Băng** lên mục tiêu:

* Đủ **3 Băng** → mục tiêu **Đóng Băng** 1.7s, đồng thời reset stack về 0.
* Khi Đóng Băng, mục tiêu nhận **+35% sát thương** (`Math.ceil`, nên không bao giờ
  mất phần lẻ) — HUD hiện số damage to hơn kèm dấu `!`.
* Stack tự rụng sau **4s** không bị đánh thêm.
* Luyện thạch đổi màu theo số stack (1 → xanh nhạt, 2 → xanh đậm, Đóng Băng → xanh
  băng đặc) và nổ mảnh băng cắt từ chính sheet của cô ấy.

---

# Boss 1 — "Huyết Ma" và hệ AI dùng chung

Boss đứng cùng map với Như Yên, ở phía đông điểm spawn (`BOSS_POST`), và **tự
hoạt động**: tuần tra → phát hiện → truy đuổi → chọn chiêu theo tầm → đánh →
hồi chiêu, mất dấu thì về chỗ cũ.

| Chiêu | Tầm | Sát thương | Hồi | Ghi chú |
| --- | --- | --- | --- | --- |
| **Huyết Trảm** (melee) | tâm đòn 76px, bán kính 74 → với tới **150px** | attack × 1 | 1500ms | vệt kiếm đỏ, knockback 16 |
| **Huyết Nhận** (bolt) | bay **460px**, bán kính 46 | attack × 0.85 | 3400ms | **projectile thật**: quét theo đường bay, né được |
| **Ma Dực Trận** (nova) | đĩa **210px** quanh boss | attack × 1.6 | 9000ms | dạng cánh + vòng rune, rung camera |

Stats: HP 620, ATK 16, DEF 6, speed 92. HP bar vẽ ngay trên đầu boss. Phím `B`
gọi lại boss để đánh thử tiếp.

## Hệ AI: `src/game/systems/EnemyAI.ts`

Đây là phần **dùng chung**, không biết gì về Phaser, sprite, hay boss nào:

* `AiActor` — những động từ AI được phép gọi lên cơ thể: `move`, `halt`, `look`,
  `perform`, `ready`, cùng `position` / `alive` / `busy`.
* `AiProfile` — dữ liệu tả cách con này *thích* đánh: bán kính aggro/leash,
  `keepDistance`, tầm + ưu tiên + `recover` từng chiêu, tuần tra, strafe.
* `EnemyAI.update(time, delta, target)` — quyết định mỗi frame.

Thêm boss/mob mới = **một profile + một entity**, không viết lại AI.

Thứ tự ưu tiên trong vòng lặp:

1. **Chết / đang diễn animation** → AI bỏ tay hoàn toàn. Nếu không, nó sẽ tự huỷ
   cú đánh của chính mình giữa chừng và đòn đánh trúng ở nơi hoạt ảnh chưa tới.
2. **Đang `recover`** → đứng yên hết phần đuôi của chiêu vừa dùng, để đòn đánh
   đọc ra "đã cam kết" chứ không phải một dòng chảy liên tục.
3. **Mục tiêu trong tầm** → chọn chiêu có ưu tiên cao nhất mà tầm khớp và đã hồi.
4. **Ngoài tầm** → áp sát, nhưng chỉ tới `keepDistance` rồi đi vòng (strafe).
   Đi thẳng vào người rồi đứng chết trông như lỗi.
5. **Không có mục tiêu** → tuần tra quanh mốc, nghỉ giữa các chặng, bị kéo đi xa
   thì tự về.

Aggro có **hysteresis** có chủ đích: 460px để phát hiện, 760px mới mất dấu. Dùng
một bán kính cho cả hai thì mục tiêu đứng đúng mép sẽ làm boss nhấp nháy giữa
đuổi và tuần tra mỗi vài frame.

## Sát thương hai chiều: `src/game/systems/Damageable.ts`

Trước đây scene chỉ biết cách đánh **luyện thạch**, nên boss sẽ cần một bản sao
song song của toàn bộ logic tầm/Băng/knockback. Giờ mọi mục tiêu đều là
`Damageable` (`hitPoint`, `hitRadius`, `applyHit`) và mọi đòn đều là `HitInfo`
có `side: 'player' | 'enemy'`:

* Đòn của người chơi quét qua **cùng một danh sách** `targets` — luyện thạch và
  boss như nhau. Thêm enemy thứ hai là **một dòng push**.
* `hitRadius` của mục tiêu được cộng vào tầm, nên thân boss to bị tính từ **rìa**
  chứ không phải từ tâm. Luyện thạch giữ `hitRadius = 0` để không âm thầm nới
  rộng toàn bộ tầm đã tinh chỉnh của Như Yên.
* `side` chặn bắn nhau cùng phe: đòn `'enemy'` không trừ HP boss.
* Sương Ảnh Bộ vẫn xuyên đòn — `hitPlayer` kiểm tra `invulnerable` một chỗ duy
  nhất, thay vì ba chiêu của boss mỗi cái kiểm tra một kiểu.

## Trúng đòn: nháy màu chứ không cướp quyền điều khiển

Trước đây `takeDamage` giao thân người cho animation trúng đòn: `setVelocity(0,0)`,
`isBusy` bật, không nhận input cho tới khi clip chạy hết. Với **một** con quái đó
là một nhịp kịch tính. Với **ba** con thì cứ mỗi lần bất kỳ con nào chạm tới là
thêm một phần tư giây tay lái chết — người chơi đọc ra thành *khựng liên tục*,
dù thực ra không ai bị choáng, chỉ là input rơi.

Giờ nó **không bao giờ** giữ thân người:

* Mọi đòn đều **nháy màu** (`setTintFill`, 70ms) — đó mới là phần phản hồi chính,
  và nó hiện được kể cả khi nhân vật đang chạy hoặc đang vung côn.
* Animation loạng choạng chỉ chạy khi **không có gì khác để diễn** — không đang
  đánh, không đang niệm chiêu, không đang cưỡi mây. Đứng yên thì nó diễn trọn;
  bấm một phím hướng là nó bị cắt ngang ngay khung hình đó.
* `FLINCH_GAP = 900ms` chặn animation khởi động lại chồng lên chính nó. Đây đúng
  là hàng rào mà **boss đã có sẵn** từ khi nó bị stun-lock ra khỏi trận đánh của
  chính mình — người chơi chỉ là chưa được hưởng.
* Đòn đang vung **không bị huỷ nữa**: trước kia `pending = null` nghĩa là cú
  đánh vẫn diễn hết nhưng không gây sát thương gì. Giờ nó vẫn ăn.

Đo thực tế: giữ phím đi trong 2.5s trong khi ăn **16 đòn** (một đòn mỗi 150ms) →
**0 / 361 khung hình** bị chặn di chuyển.

Áp cho cả bốn kit — code `takeDamage` của Như Yên, Huyết Lang, Miku và Tôn Ngộ
Không vốn là bốn bản sao giống hệt nhau.

## Kiểm tra AI bằng clock giả

```bash
npm run check:ai
```

`EnemyAI` không phụ thuộc Phaser nên toàn bộ vòng quyết định test được ngoài
browser: 25 check gồm tuần tra trong bán kính, mép aggro, hysteresis, dừng đúng
`keepDistance`, chọn chiêu theo dải tầm (300px → bolt, 100px → nova, 60px không
bao giờ bolt), giữ `actionGap` và cooldown từng chiêu, không điều khiển khi đang
diễn animation hoặc đã chết, và thôi đánh khi mục tiêu chết.

## Pipeline bóc tách boss

5 sheet trong `public/assets/boss/boss1/` (`npm run build:boss`). Điểm khác so
với sheet của Như Yên:

* **Đã có alpha thật**: nền đỏ nhìn thấy trong image viewer nằm dưới alpha 0, nên
  không phải dựng mô hình nền.
* **Hiệu ứng nối liền các hàng**: vụ nổ đỏ của sheet attack/skill lấp kín khoảng
  trống giữa các hàng, nên `sheet-frames.mjs` được bổ sung bước **chia dải theo
  tỉ lệ chiều cao** rồi mới tìm đường cắt *bên trong* dải. Cắt cả ảnh theo lưới
  đều thì lát ngang qua pose, vì bản thân các dải không cách nhau đều.
* **Hướng nhìn không đoán**: xác định bằng cách so tâm **mắt đỏ** với tâm **khối
  tóc trắng** từng frame. Kết quả: walk sheet vẽ **cả 4 hướng** (r0 xuống,
  r1 phải, r2 trái, r3 lên) nên không phải lật ảnh; attack r3 hướng phải;
  skill r2 là dạng cánh nhìn thẳng.
* **Scale**: 5 sheet vẽ boss ở 5 cỡ khác nhau (chiều cao thân thô 403 / 182 /
  ~206 / ~201 / 115px). Ruler tự động bị vệt đỏ làm nhiễu ở sheet attack/skill,
  nên các scale còn lại được chốt bằng ảnh đối chiếu nhiều scale cạnh nhau.

Atlas: 8 texture, 14 clip, 6.04 Mpx (~24MB VRAM).

Engine segmentation giờ **dùng chung** cho Như Yên và boss
(`tools/sheet-frames.mjs`): inventory + luật màu là phần riêng của từng nhân vật
(`extract-nhuyen.mjs`, `extract-boss.mjs`).

---

# Dung lượng: 41 → 23MB VRAM, dist 22 → 9.4MB

Ba khoản phí riêng biệt, đo trước/sau. **Không đổi một pixel nào** — mọi atlas
dựng lại vẫn khớp tuyệt đối, kiểm bằng `npm run check:atlas`.

| | Trước | Sau | |
| --- | --- | --- | --- |
| File atlas | 10.67 MB | **7.59 MB** | −29% |
| VRAM (w×h×4) | 41 MB | **23 MB** | −45% |
| `dist` ship cho người chơi | 22 MB | **9.4 MB** | −57% |

### 1. Encoder PNG ghi filter 0 cho mọi dòng

PNG cho phép mỗi scanline chọn 1 trong 5 bộ lọc, và chính nó quyết định phần
lớn dung lượng vì deflate nén delta nhỏ tốt hơn pixel thô. Encoder tự viết
trước đây ghi filter 0 (None) cho tất cả. Chọn bộ lọc rẻ nhất từng dòng
(heuristic của libpng) + deflate với `Z_FILTERED`: **10.67 → 7.85 MB**, lossless.

### 2. 65% diện tích mỗi atlas là pixel rỗng

Mỗi file là một lưới ô **cùng kích thước với frame lớn nhất trong nhóm**, nên
frame nhỏ vẫn chiếm ô to. Trả giá hai lần: một lần khi tải, một lần trong VRAM —
texture tốn `w × h × 4` bất kể vẽ gì trên đó.

Giờ mỗi frame được **cắt sát nội dung rồi xếp lại** (`tools/atlas-pack.mjs`),
metadata `sourceSize` / `spriteSourceSize` giữ nguyên ô gốc để Phaser đặt lại
đúng chỗ cũ. Sprite vẫn **báo kích thước chưa cắt** (`Frame.realWidth`), nên
origin, pivot chân từng frame và mọi thứ suy từ `displayOrigin` không đổi.

Packer thử nhiều bề rộng rồi chọn cái phí ít nhất: luôn nhồi tới 2048px sẽ ra
những dải dài một tầng (1924×162) mà tầng cuối gần như trống.

### 3. Build vẫn ship sheet gốc

`stripSourceSheets` giữ **danh sách cứng** các sheet cần loại khỏi `dist`, và nó
mục hai lần: không hề biết 5 sheet boss thêm sau, và vẫn gọi tên một sheet Như
Yên đã bị đổi tên. Kết quả: **22.8MB art không ai fetch** vẫn nằm trong bản
build.

Giờ danh sách được **suy ra** từ chính các atlas JSON: ảnh nào không được atlas
nào tham chiếu thì không thể với tới được, nên bị bỏ. Đổi tên hay thêm nhân vật
mới cũng không làm nó mục lại.

### 4. WebP lossless cho atlas

Atlas đã được đóng gói + trim sẵn — chỉ còn *cách mã hoá* mỗi texture để tận
dụng thêm. `tools/image-io.mjs` (`sharp`, mới thêm vào devDependencies) mã hoá
mỗi atlas ra `.webp` lossless thay vì `.png`; `check-atlas.mjs` được nới đúng
một chỗ để so khớp — bỏ qua RGB của pixel **hoàn toàn trong suốt** (libwebp có
quyền ghi đè màu ở đó để nén tốt hơn, nhưng alpha = 0 thì Phaser không bao giờ
vẽ ra màu đó). Mọi pixel còn hiển thị vẫn phải khớp tuyệt đối.

Đo trên một atlas 7 texture dùng làm bộ kiểm thử (có sẵn PNG tham chiếu):
1.78MB → 0.98MB, giảm 45%, `check:atlas` báo delta = 0 trên cả 90 frame. Chạy
lại `npm run build:<nhân_vật>` để tái tạo atlas ở định dạng mới, rồi
`npm run upload:*` để đẩy lên Supabase Storage.

### Còn có thể làm nữa

* **Bỏ frame lật được**: boss có `walk_left` vẽ riêng (8 frame) mà lật
  `walk_right` là ra; Như Yên có `idle_left`/`idle_right`. Đổi lấy việc mất nét
  vẽ tay riêng cho từng hướng.
* Packer hiện phí ~8% so với trần lý thuyết (5.53 Mpx). MaxRects sẽ ép sát hơn,
  nhưng phần lớn miếng ngon đã lấy rồi.

---

# Pipeline bóc tách sprite — Như Yên

Năm sheet nguồn trong `public/assets/characters/nhuyen/`, đều 1536×1024 RGBA:

| Sheet | Nội dung |
| --- | --- |
| `nhuyen-idle.png` | r0 chính diện, r1 sau lưng, r2 **phải**, r3 **trái** — 4 frame/hàng |
| `nhuyen-walk&run.png` | r0 đi xuống, r1 đi lên, r2 đi sang phải, r3 **chạy** sang phải — 7 frame/hàng |
| `nhuyen-attack (1).png` | r0 c0–c5 chém ngang; r1 c0–c1 đà sau, c2 vung lên, c3 chẻ xuống, c4 xoay, **c5 chỉ có vệt khí**; r2 c0–c4 đánh chính diện, **c5 chỉ có mảnh băng** |
| `nhuyen-skill.png` | r0 c0–c3 tụ khí, r1 c0–c1 lốc băng cực đại, **r1 c2–c3 chỉ có trụ băng** |
| `nhuyen-hurt&death.png` | r0 trúng đòn (3), r1 quỵ xuống (5), r2 nằm + tan biến (6) |

Các sheet này **đã có alpha thật**, nên không cần dựng mô hình nền để tách. Bù
lại có ba chỗ khó:

1. **Vệt kiếm khí rộng hơn ô của nó** và tràn sang ô bên cạnh — cắt theo "cột
   trống" sẽ dán hai frame thành một (hàng `attack` r1 bị đúng lỗi này).
2. **Frame tan biến của hàng death là các đốm sáng rời**, cùng phép cắt đó lại băm
   một frame thành cả chục mảnh vụn.
3. **Không hàng nào nằm trên grid**: mỗi hàng có pitch và offset riêng.

### Cắt cột hai lượt (`tools/extract-nhuyen.mjs`)

Số frame mỗi hàng được **khai báo sẵn** trong `SHEETS`, việc của thuật toán chỉ là
tìm đường cắt:

* **Lượt 1 — theo khoảng trống**: lấy các khối đặc, bỏ khối nhỏ hơn 2% khối lượng
  hàng (đó là đốm sáng, không phải frame). Nếu số khối đã đúng thì cắt ở giữa các
  khoảng trống. 14/16 hàng ra đúng ngay lượt này.
* **Lượt 2 — theo grid lý tưởng**: khi lượt 1 sai số lượng (hàng `attack` r1), quét
  quanh mỗi vạch grid ±42% pitch và chọn **cột trống nhất**, ưu tiên gần vạch grid
  khi bằng điểm.
* **Connected components** quyết định pixel thuộc frame nào: một vệt khí chỉ được
  giữ bởi frame chứa **quá nửa** pixel của nó, nên không bao giờ bị vẽ hai lần.
  Nhờ vậy `r1c5` / `r2c5` / `r1c2` / `r1c3` bóc ra **sạch, không lẫn nhân vật**.

### Bốn điểm neo cho mỗi frame

Không quy tắc nào đúng cho mọi pose, nên extractor đo sẵn cả bốn, builder chọn:

| Neo | Cách đo | Dùng cho |
| --- | --- | --- |
| `feet` | tâm ngang của dải **pixel tối thấp nhất** (giày, tóc là hai vùng gần đen duy nhất) | pose một-nhịp có chân trụ: đánh, trúng đòn, ngã |
| `cycle` | `feet` nhưng đã **canh các frame trong hàng với nhau** | mọi animation lặp tại chỗ: đứng, đi, chạy |
| `ground` | đáy vùng vẽ, canh theo dải thấp nhất | trụ băng (mọc từ mặt đất) |
| `centre` | tâm khung bao | vệt khí / mảnh băng bay (cần xoay quanh tâm) |

### Vì sao chu kỳ đi/chạy cần neo riêng

`feet` neo vào **bàn chân thấp nhất**. Trong một chu kỳ bước, chân trụ đổi liên
tục, nên điểm neo nhảy qua nhảy lại giữa hai chân — ở hai hàng nhìn hông, cú nhảy
đó lên tới **40px**, đọc ra thành nhân vật *trượt ngang* mỗi bước.

Theo chiều dọc còn tệ hơn: ở frame "chân qua nhau" cả hai chân đều rời đất, neo
trèo lên cao nên nhân vật bị vẽ **thấp xuống** — tức là lún đúng lúc một chu kỳ đi
phải nhô lên. Bước nhảy dọc tới 5–6px, và vì nó **ngược** với nhịp tự nhiên nên
khi đi lên/xuống trông rất gằn.

`cycle` sửa cả hai bằng cách canh các frame với nhau thay vì canh theo bàn chân:

1. Mỗi frame quy về **profile chiếm chỗ của phần thân** — áo bào xanh, da, và vùng
   gần đen (giày, khăn, cán kiếm). Tóc và khí đều **không** tính: cả hai bay tự do,
   để vào thì chúng lại kéo lệch đúng bằng cái vừa sửa được.
2. Profile được lập chỉ mục **tương đối với neo `feet` của chính frame đó**, chứ
   không theo toạ độ sheet — hai frame cùng hàng cách nhau ~220px trên sheet nên
   profile theo toạ độ sheet không bao giờ chồng nhau.
3. Tương quan chéo với frame tham chiếu (frame có khối lượng thân trung vị) cho ra
   **phần lệch còn lại**; cộng lại khoảng cách giữa hai neo là được **độ dịch thật
   của phần thân**. Neo đi theo con số đó, cả hai trục.
4. Cuối cùng dịch cả hàng để **trung bình** vẫn khớp chỗ mà `feet` chỉ ra — nhịp
   lắc thật còn nguyên, chỉ mất cú giật.

Kết quả (bước nhảy tệ nhất giữa hai frame, đơn vị px sau scale):

| Hàng | X: `feet` → `cycle` | Y: `feet` → `cycle` |
| --- | --- | --- |
| đi xuống | 7.2 → 3.0 | 2.7 → 2.7 |
| đi lên | 4.9 → 3.7 | **5.3 → 4.2** |
| đi hông | **40.3 → 3.0** | 3.7 → 5.2 |
| chạy hông | **37.6 → 2.6** | 6.1 → 3.7 |

Kiểm chứng bằng mắt: xếp mọi frame của một hàng lên nhau tại điểm neo. Với `feet`
hai hàng nhìn hông nhoè thành một vệt; với `cycle` chúng xếp lại thành **một bóng
người gọn**. Bảng số dọc trông lẫn lộn vì mốc đo (trọng tâm áo bào) tự nó cũng
xê dịch — phép xếp hình mới là bằng chứng thật.

### Chuẩn hoá scale từng sheet

Mỗi sheet vẽ Như Yên **một cỡ khác nhau**. Đo khoảng cách **chân → cổ áo** trên các
pose đứng thẳng (`npm run measure:nhuyen`) rồi đưa tất cả về 112px:

| Sheet | `scale` | Ghi chú |
| --- | --- | --- |
| `idle` | 2.00 | mốc tham chiếu |
| `walk&run` | 1.93 | |
| `attack` | 1.65 | vẽ nhỏ hơn idle ~18% |
| `skill` | 1.59 | |
| `hurt&death` | 2.74 | vẽ **to hơn** idle ~37% |

`scale` là số thực, và luôn là phép **thu nhỏ** — không frame nào bị phóng to, nên
không mất nét. Phép resample là area-average trên alpha premultiplied nên viền
không bị quầng tối. 112px là chiều cao chuẩn mọi nhân vật trong game dùng chung,
nhờ đó cả hai đứng cùng một thế giới mà không lệch tỉ lệ.

### Frame box riêng + pivot nướng sẵn (`tools/build-nhuyen-atlas.mjs`)

Mỗi file output có **frame box riêng**, đo vừa đúng phần art nó chứa, và mỗi frame
mang một **pivot đã chuẩn hoá** đặt tại chân nhân vật:

| File | Frame | Anchor | Clip |
| --- | --- | --- | --- |
| `atlas/nhuyen-idle.png` | 100×128 | 50,123 | `idle_{down,up,right,left}` ×4 |
| `atlas/nhuyen-walk.png` | 130×136 | 65,129 | `walk_{down,up,side}`, `run_side` ×7 |
| `atlas/nhuyen-attack.png` | 310×172 | 155,162 | `atk1_front`, `atk1_side`, `atk2_side`, `atk3_side` |
| `atlas/nhuyen-skill.png` | 366×276 | 183,177 | `cast_side` ×6 |
| `atlas/nhuyen-hurt.png` | 132×126 | 66,118 | `hurt` ×3, `death` ×11 |
| `atlas/nhuyen-fx.png` | 204×146 | 102,73 | `fx_crescent`, `fx_shards` |
| `atlas/nhuyen-fx-ice.png` | 250×272 | 125,269 | `fx_eruption` ×2 |

Tổng **2.72 Mpx (~11 MB VRAM)**, 18 clip. Phaser áp lại pivot ở **mỗi frame**
animation (`AnimationState.updateFrame` → `setOrigin`), nên frame idle 100×128 và
frame tụ khí 366×276 vẫn đứng đúng một điểm. Dùng một box chung đủ chỗ cho lốc băng
sẽ làm texture phình gấp ~4 lần và mỗi frame idle phải fill một quad rỗng to tướng.

Hai hệ quả trong code:

* `sprite.x, sprite.y` của Như Yên **chính là điểm cô ấy đứng** — không cần cộng
  offset nửa frame khi tính hitbox hay depth sort.
* Body vật lý phải tính lại offset mỗi khi frame đổi cỡ — `NhuYen.syncBody()` làm
  việc đó, `tick()` phát hiện frame đổi. Đã kiểm tra: sai số chân = **0px** xuyên
  suốt chuyển tiếp 104×128 → 366×276 → 104×128.

### Chỉ nướng clip **duy nhất**, hướng trái dùng `flipX`

Hướng trái không có bản sao trong atlas mà lật bằng `flipX` lúc chạy (pivot nằm
đúng giữa theo chiều ngang nên lật quanh chân). Riêng `idle` giữ cả 4 hướng vì
hoạ sĩ đã vẽ đủ — art gốc nét hơn ảnh lật.

### Output ghi vào `atlas/`, không ghi cạnh sheet nguồn

Sheet nguồn vốn đã tên `nhuyen-idle.png`, `nhuyen-skill.png`… trùng luôn với tên
file mà builder muốn xuất ra. Vì vậy builder ghi vào thư mục con `atlas/` và còn
có `assertNotSource()` chặn cứng mọi đường ghi trỏ vào sheet nguồn.

### Băng Tinh Trận là **một chuỗi 8 frame liền mạch**

Sheet `nhuyen-skill.png` vẽ 8 frame: 6 frame cô ấy tụ khí, rồi **2 frame trụ băng
nổ lên** — và cái bóng nhỏ giữa trụ băng chính là cô ấy. Tức là chiêu này nổ **tại
chỗ cô ấy đứng**, không phải thả ra phía trước. Nên:

* `ICE_ARRAY_REACH = 0` — trụ băng nổ đúng điểm cô ấy đứng, và vì `depth` của nó là
  `groundY + 260` nên nó **vẽ chồng lên cô ấy**, khớp với art.
* Frame va chạm là **frame 6** (frame cuối, lúc lốc băng cao nhất) — trên sheet hai
  frame trụ băng nối ngay sau nó.
* `SkillDefinition.recovery` giữ cô ấy ở pose cuối thêm **400ms** (`repeat: 0` đã
  đậu animation ở frame cuối) cho trụ băng nổ xong. Không có nó thì cô ấy bật về
  idle ngay giữa trụ băng của chính mình — và đó chính là "thiếu một phần phía sau".

### Bốn chỗ phải thoả hiệp (do sheet gốc)

1. **Thức 2 và 3 của liên chiêu chỉ có art hông**: khi nhìn lên/xuống, hai thức này
   vẫn vung ngang. Vẽ thêm 6 frame chính diện thì chỉ cần sửa `NhuYenClip.attack`.
2. **Không có art đánh từ phía sau**: hướng `up` dùng luôn art hông.
3. **Băng Phách Trảm dùng lại `atk2_side`** làm pose phóng chiêu — đó là frame quét
   rộng nhất trong sheet, và chiêu này còn có projectile + FX riêng nên vẫn phân
   biệt được với thức 2 của liên chiêu.
4. **Chu kỳ chạy chỉ có hướng hông**: chạy lên/xuống dùng lại chu kỳ đi, chỉ chạy
   nhanh hơn — xem mục dưới về nhịp phát.

### Nhịp phát: đặt theo cảm giác, vì art không có chân trụ để đồng bộ

Bản trước suy `timeScale` từ `stride` — quãng mặt đất một chu kỳ **được vẽ** để
phủ — với giả định art có bàn chân trụ trượt lùi đúng bằng tốc độ di chuyển.
**Giả định đó sai với art này.** Đo bàn chân qua từng frame:

```bash
node tools/measure-stride.mjs walk_side run_side
```

| Hàng | Chân sau trôi cả hàng | Vị trí hai chân |
| --- | --- | --- |
| `walk_side` (7 frame) | **10px** | ổn định quanh −11 và +29 |
| `run_side` (7 frame) | **9px** | ổn định quanh −13 và +30 |

Tức đây là **7 biến thể của một thế bước**, không phải chu kỳ đi có pha chân trụ —
không có gì để đồng bộ. Chia cho một `stride` không tồn tại đã đẩy clip lên ~17fps
khi chạy (17.6fps khi chạy dọc, vì hướng dọc dùng art đi bộ). Trong khi đó mỗi
frame liền nhau lệch nhau **17–24% silhouette**, gần như toàn bộ là tóc và tay
kiếm chứ không phải chân:

```bash
node tools/analyse-cycle.mjs walk_side run_side walk_down walk_up
```

Nên nó đọc thành **tay vung loạn**, không phải chạy. Giờ nhịp được đặt cho dễ nhìn,
tốc độ chỉ *nhích* nhẹ (clamp 0.9–1.2) để chạy vẫn trông gấp hơn đi:

| Trạng thái | Trước | Sau | Nhiễu/giây (Δsilhouette × fps) |
| --- | --- | --- | --- |
| Đi ngang | 10.9 fps | **9 fps** | 2.58 → 2.10 |
| Chạy ngang (`run_side`) | 16.6 fps | **12 fps** | 3.79 → 2.74 |
| Đi dọc | 10.9 fps | **9 fps** | 1.79 → 1.48 |
| Chạy dọc (art đi bộ) | 17.6 fps | **10.8 fps** | 2.89 → 1.77 |

Đánh đổi: chậm hơn thì tay êm hơn nhưng chân "trôi" nhiều hơn — mà chân **vốn đã
trôi** vì art không vẽ chân trụ, nên đây là đổi cái không thấy được lấy cái thấy
rõ. Knob nằm ở `frameRate` từng clip trong `CLIPS` và `SPEED_RESPONSE` trong
`nhuYenAnimations.ts`.

Đã thử **đổi thứ tự frame** để giảm nhiễu (`analyse-cycle.mjs` brute-force toàn bộ
chu trình): chỉ giảm 22.8% → 21.1%, mà thứ tự "êm" nhất lại tách frame 2–3 (pha
chân chụm) ra hai đầu chu kỳ → thành khập khiễng. Nên giữ thứ tự của người vẽ.

---

## Pipeline bóc tách Tôn Ngộ Không

Mười sáu sheet nguồn trong `public/assets/characters/wukong/source/`:

| Sheet | Bố cục | Nội dung |
| --- | --- | --- |
| `wukong-idle-walk.png` | 5 hàng × 8 | **2 chu kỳ 4 frame mỗi hàng.** Đứng: xuống / lên / phải / trái. Đi: xuống / **phải** / lên / **trái**. Cả tám hướng đều là art thật — không lật gương lần nào. r4 còn hai chu kỳ nghiêng phải nữa, cắt nhưng không nướng |
| `wukong-run.png` | 7 hàng × 8 | 14 chu kỳ chạy ở các độ ngả khác nhau; nướng 3 (trước / sau / nghiêng). Hàng nghiêng **vẽ quay trái** nên được lật một lần lúc nướng |
| `wukong-attack1.png` | 3 hàng × 4 | **Liên chiêu**: mỗi hàng một nhát riêng, 4 nhịp — r0 đâm tới, r1 xoay rồi nện đất, r2 lao dài. Đều nghiêng, không có chính diện |
| `wukong-attack2.png` | 6 hàng × 5 | **Đánh không-ngang, bản 5 nhịp.** Thân luôn chính diện. r0 nhảy đâm thẳng xuống, r1 nện đất, r2–r5 quạt ra bốn góc (phải-lên, phải-xuống, trái-lên, trái-xuống) |
| `wukong-attack3.png` | 6 hàng × 6 | **Cùng những hướng đó, vẽ nặng hơn trên 6 nhịp.** r1 đâm chính diện, r2 phải-lên, r3 trái-lên (quay lưng), r4 phải-xuống, r5 trái-xuống. r0 (bổ thẳng lên) **không còn nướng** — sheet quay lưng vẽ hướng đó hay hơn |
| `wukong-attack-quaylung.png` | 3 hàng × 5,5,4 | **Cả chuỗi bổ thẳng lên**, quay lưng về phía camera: r0 mở đòn, r1 xoay rồi nện đất, r2 lao dài — đúng ba nhịp mà chuỗi đánh ngang có |
| `wukong-attack.png` | 7 hàng × 4 | Sheet đánh đời đầu, **không còn nướng**: nó mặc bộ đồ cũ (choàng tím lông vũ) trong khi bản vẽ lại mặc đỏ khăn quàng, nên giữ lại r0/r1 sẽ đổi áo anh đúng vào nhịp bổ lên hoặc xuống |
| `wukong-fly.png` | 5 hàng | Cân Đẩu Vân: r0 lơ lửng (7), r1–r2 bay (4), r3–r4 vệt dài (3, 2) |
| `wukong-hurt-death.png` | 5 hàng | **File cũ, chưa vẽ lại** — xem ghi chú dưới |
| `wukong-skillquaylung.png` | 4 hàng | **Hàng Ma Chân Lôi, nửa nhìn thẳng**: r0 bổ xuống, r1 bổ lên (quay lưng), r2 chéo xuống-phải, r3 chéo lên-phải |
| `wukong-skilltraiphai.png` | 2 hàng × 7 | **Hàng Ma Chân Lôi, nửa nhìn ngang** — cả hai hàng vẽ quay phải, một hàng lật lúc nướng thành bản quay trái |
| `wukong-skill-2.png` | 5 hàng | Bản Hàng Ma Chân Lôi trước đó, **không còn nướng** |
| `wukong-skill4.png` | 4 hàng | **Ma Nguyệt Trảm vẽ lại theo bốn hướng**: r0 chém xuống (chính diện), r1 chém lên (quay lưng), r2/r3 sang ngang — cả hai vẽ quay phải |
| `wukong-skill1,3.png` | 1–2 hàng | Hai chiêu còn lại, mỗi chiêu một file, mỗi hàng đọc trái→phải rồi trên→dưới |
| `wukong-skill2.png` | 2 hàng | Hàng Ma Chân Lôi bản đầu, **không còn nướng** — bản mới có đủ năm góc và không phóng tia ra nữa |

### Bộ vẽ lại đã xoá gần hết phần khai tay

Bản sheet đầu tiên phải khai bằng tay 10 mảng `cuts` đọc từ thước, cộng ngưỡng
`drop` để dọn mảnh vệt khí bị đường cắt xén ra. **Bộ mới không cần gì trong số
đó.** Mỗi khoảnh khắc là một đảo pixel riêng có khoảng trong suốt bao quanh, nên
engine cắt tự tìm được ranh giới; inventory giờ chỉ còn `rows`, `cols`, `scale`.

Điều đáng nói: **cutter không cần lưới đều**. Ô rộng hẹp chênh nhau gấp bốn vẫn
cắt đúng — finale của Hàng Ma Chân Lôi rộng 1148px cạnh một pose mở đầu 328px —
vì nó tìm *khoảng trống*, không tìm nhịp lưới. Quy tắc duy nhất khi export: đừng
để nét của frame này chạm frame kia, và chừa khoảng ~25px cho chắc.

### Hai chỗ vẫn phải can thiệp

1. **Số frame.** Máy không đoán được một hàng có mấy khoảnh khắc — đó là thứ duy
   nhất bức tranh không tự nói ra. `cols` khai con số đó. Sai một là hỏng: với
   `skill1`, khai 6 thay vì 7 sẽ gộp nguyệt trảm cuối vào trụ nova.
2. **Ranh giới hàng chạm nhau.** Áo choàng bay khỏi đỉnh hàng này rơi xuống hàng
   trên nó, nên component dính xuyên hàng — mà component vắt qua hai hàng thì
   *không thuộc hàng nào*, và ô lẽ ra chứa nó ra frame rỗng. `clipToRows` rạch
   một khe 2px ở mọi ranh giới hàng liền kề, làm trên bản đã decode chứ không
   đụng sheet gốc.

### Neo `strip`: đăng ký cả hàng như một cuộn phim

Các neo khác (`feet`, `ground`, `centre`) đều hỏi **từng frame** một câu hỏi.
Đúng cho một pose, sai cho một hàng vẽ kiểu camera đứng yên: ô finale không có
thân người (trụ khí lấy đâu ra bàn chân), và ngay cả ô có thân thì anh cũng đang
*được vẽ là đang di chuyển* — neo lại vào bàn chân là triệt tiêu đúng chuyển
động đó.

Nên cả sheet được đăng ký như cuộn phim: mọi frame neo ở **cùng khoảng lệch tính
từ mép trái ô của nó**, lấy từ chỗ anh đứng ở frame đầu *của cả sheet* — không
phải frame đầu mỗi hàng, vì chiêu nào tràn sang hàng thứ hai thì hàng đó mở đầu
giữa chừng, không có pose đứng sạch để đo.

Mép **trái**, không phải tâm ô: các ô là mốc thời gian, không có gì bắt chúng
rộng bằng nhau. Đăng ký theo tâm ô thì neo rơi vào giữa thân cây thương, thành
ra tia lôi phóng ra từ khoảng không sau lưng anh.

### Nướng nguyên hàng, kể cả ô cuối

Mỗi chiêu là **một clip trọn hàng theo phương ngang**, ô finale nằm trong cùng
clip với các ô trước nó. Ô cuối không phải hiệu ứng đi kèm — nó là *frame mà cú
ra chiêu đi tới*. Bản đầu tôi cắt nó ra thành sprite riêng rồi spawn lại lúc
chạy, và đó đúng là chỗ duy nhất trong art không có mối nối: hiệu ứng hiện ra
trễ một nhịp so với cái pose vốn đã đang vẽ ra nó.

Nhờ vậy `WukongEffects.ts` chỉ còn ~110 dòng so với ~260 của hai module FX kia:
không projectile nào phải dựng lại, không element nào giả bằng tint. Còn lại đúng
phần lặt vặt — cụm khí nổ trên mục tiêu ăn đòn, vệt cháy, tàn lửa, ảnh tàn cưỡi
mây.

### Đánh thường đi theo **hướng nhắm**, không theo hướng sprite quay

`Direction` vẫn là bốn hướng vì art di chuyển chỉ có bốn. Nhưng ba sheet đánh
thường gộp lại đã phủ **cả tám hướng**: `attack1` vẽ ngang, `attack2` và
`attack3` vẽ sáu hướng còn lại. Nên `WukongClip.attack()` đọc thẳng vector
`aim` — vốn đã tám hướng từ trước, xem `aimFromVector` — và chỉ rơi về hướng
sprite khi không có `aim`.

Ngưỡng chia múi là `sin(22.5°)`: một hướng được coi là chéo khi **cả hai** trục
vượt ngưỡng đó, tức đúng nêm 45° quanh mỗi góc.

Chuỗi dài bao nhiêu là do art có bấy nhiêu. Ngang, bổ xuống và bổ lên đều có ba
nhát riêng — ngang và lên còn được vẽ **cùng một hình dáng** (mở đòn / nện đất /
lao dài), nên hai hướng đọc ra như một bộ đòn nhìn từ hai góc. Bốn góc chéo có
hai; chỗ nào chuỗi ngắn thì **lặp nhát cuối chứ không lặp nhát đầu**, để lần nhấn
thứ ba luôn là nhát nặng hơn.

### Hàng Ma Chân Lôi: chiêu duy nhất có nhiều hơn một góc vẽ

Ba chiêu kia vẫn một hàng, lật gương cho trái. Chiêu này có **sáu hàng** chia
làm hai file, chọn theo vector `aim` giống hệt đánh thường:

| file | hàng | hướng |
| --- | --- | --- |
| `wukong-skillquaylung.png` | r0 (6 ô) | bổ thẳng **xuống**, chính diện |
| | r1 (6 ô) | bổ thẳng **lên**, quay lưng |
| | r2 (5 ô) | chéo **xuống**-phải, chính diện |
| | r3 (5 ô) | chéo **lên**-phải, quay lưng |
| `wukong-skilltraiphai.png` | r0, r1 (7 ô) | ngang — **cả hai hàng đều vẽ quay phải** |

Hai hàng chéo lật khi tia chỉ sang trái; hai hàng ngang thì **không lật lúc
chạy** — hàng thứ hai được lật một lần lúc nướng thành `cast_lance_left`, nên cả
trái lẫn phải đều là frame riêng. Lật phải đọc từ **`aim.x`** chứ không từ
`Direction`: nhắm chéo lên-trái thì `Direction` vẫn ra `up`, không ra `left`.

Băng thứ ba của file quay lưng cao 445px vì hai hàng chéo **chồng nhau theo chiều
dọc** — không có khoảng trống nào để tìm. Dòng quét vắng nhất giữa chúng là y764,
và đó là chỗ hai băng dưới được khai tay.

### Ma Nguyệt Trảm: chiêu thứ hai có nhiều góc vẽ

Bốn hàng, một hướng chính mỗi hàng — r0 chém thẳng xuống (chính diện, anh lơ
lửng rồi cắm lưỡi khí xuống đất), r1 chém thẳng lên (quay lưng, rồng cuộn trên
đầu), r2 và r3 phóng rồng sang ngang. **Cả hai hàng ngang đều vẽ quay phải**, nên
một hàng được lật lúc nướng thành bản quay trái — y hệt cách file ngang của Hàng
Ma Chân Lôi được xử lý.

Bốn hướng chéo rơi về **hàng ngang** chứ không về hàng chính diện: con rồng là
một luồng quét dài theo phương ngang, nó đọc ra tự nhiên hơn nhiều khi tiếp tục
bay sang bên so với khi chĩa thẳng vào camera.

Neo `feet` chứ không `strip`: bốn hàng này cũng không chung đường chân — r0 cắm
lưỡi khí xuống sâu dưới gót — và mọi ô đều có thân người để tìm giày. Không hàng
nào vẽ ô tàn tro, nên không phải bỏ ô cuối như bên Hàng Ma Chân Lôi.

Cỡ nhân vật lấy từ **thang A/B**, rồi chia cho `CAST_SCALE` 1.1 của chiêu này để
thứ hiện lên màn hình đúng bằng cỡ lúc đi bộ.

### Tia khí bay: ngoại lệ thứ hai của quy tắc "không dựng lại lúc chạy"

Quy tắc của kit này là mọi hiệu ứng đều là **frame của chính clip ra chiêu**. Hai
thứ phá lệ, và cùng một lý do: chúng phải xuất hiện ở chỗ **nhân vật không có
mặt**. Trụ lửa Cửu U Nộ Diễm nổ ở cuối làn; tia Hàng Ma Chân Lôi bay dọc làn đó.

Bản vẽ mới không có tia bay — quả cầu quay quanh người rồi tắt tại chỗ — nên tia
lấy lại từ sheet đời đầu: `wukong-skill2.png` r1 c1–c4, bốn ô tia **không có thân
người**, dài dần tới ba lần chính nó rồi kết bằng một sao va chạm. Nó **xoay theo
`aim`** chứ không lật gương, nên một luồng vẽ sẵn phục vụ cả tám hướng.

Điểm phóng đọc từ chính art mới. Lấy mẫu các lõi trắng-nóng của
`cast_lance_right` qua các frame giữa, có đúng một cụm 90–120 pixel **đứng yên ở
(148, −49)** trong khi mọi thứ khác chuyển động — đó là đầu tia mà chiêu đã tụ
suốt cả hàng, và tia phải rời đi từ đó chứ không phải từ khoảng không sau lưng.

**Tầm chiêu 560px**, và con số này đã đổi ba lần — luôn vì cùng một lý do: nó đọc
từ chỗ art thực sự vẽ tới, không phải chọn bừa.

| bản | tầm | vì sao |
| --- | --- | --- |
| sheet đời đầu | 500 | sao va chạm ở cuối tia cách chân 501px |
| bản giữa (giữ cầu trên côn) | 300 → 260 | không có gì bay ra cả |
| bản hiện tại | **560** | đầu tia ở 148px + tia bay thêm 447px |

### `rowAnchorShift`: khi không tìm được bàn chân

Neo `feet` hỏi bức tranh một câu: pixel **tối nhất** nằm thấp nhất ở đâu. Câu đó
đúng vì đôi giày là thứ đen nhất trên người nhân vật — cho tới khi một hàng vẽ
chân co lên dưới lớp áo choàng đang phát sáng, với tia khí quét ngang qua. Lúc đó
pixel tối nhất là một nếp hiệu ứng, và neo trượt cả trăm pixel sang ngang.

Hai hàng chéo của file quay lưng bị đúng vậy. Không có quy tắc nào tìm được chân
anh trong đó vì chân **không hiện ra**, nên khoảng lệch được đọc bằng thước —
nhưng không phải bằng mắt: script đo **đáy của khối gần-đen** (mọi hiệu ứng trên
nhân vật này đều sáng, nên gần-đen chỉ còn giày, giáp và tóc) rồi so với
`cast_lance_right`. Trước khi chỉnh, hai hàng đó lơ lửng **58 và 62px** trên mặt
đất; sau khi chỉnh còn −6 và −2, ngang với lúc đứng yên (−6).

Ngoại lệ duy nhất còn lại là `cast_lance_down`: nó đi từ −11 ở ô đầu tới −74 ở ô
giữa, nhưng đó là **hoạ sĩ vẽ anh nhảy lên** rồi bổ xuống, không phải lỗi neo.

### Thước cuối cùng: **thang A/B**, không phải đo đạc

Chiêu này làm hỏng mọi thước tự động từng dùng ở đây, và lý do đáng ghi lại.

`--measure` (chân-tới-vai) nói dối vì áo choàng phủ kín băng đo. Neo-tới-đỉnh-đầu
nói dối vì **mọi tư thế của chiêu này đều ngả hoặc nhảy** — nó rút ngắn số đo
trong khi nhân vật to y nguyên: sáu hàng đều ra 116 so với 111 lúc đi bộ, mà trên
màn hình chúng lớn hơn hẳn một phần năm. Đo bề ngang mái tóc thì bắt trúng cánh
tay giơ lên; đo mảng da mặt thì bắt trúng lõi sáng của quả cầu, ra 88px cho một
nhân vật cao 110px.

Cách chạy được là **thang A/B**: dựng bản ứng viên ở vài hệ số cạnh bản đi bộ
trên cùng một đường chân, rồi chọn nấc nào khớp. Mắt người phân biệt *cái nào to
hơn* chính xác hơn hẳn so với đọc số pixel của từng cái. Script ở
`.tmp/pick.mjs`; sáu hàng của chiêu này đều lấy số từ nó.

### `rowScale`: khi các hàng trong cùng một sheet không cùng cỡ### `rowScale`: khi các hàng trong cùng một sheet không cùng cỡ

Quy tắc xưa nay là **một `scale` cho một sheet** — một sheet là một buổi vẽ, các
hàng của nó thống nhất với nhau. `attack2` và `attack3` phá quy tắc đó: hai nhát
bổ thẳng xuống của `attack2` được vẽ to gần gấp đôi bốn nhát quạt ra góc (băng
hàng r0 cao 246px so với r5 99px). Một con số cho cả sheet thì một nửa số hàng ra
sai cỡ thân người.

Nên `sheet-frames.mjs` có thêm `frameScale(sheet, frame)`, đọc `spec.rowScale[row]`
rồi mới rơi về `spec.scale`. Con số đọc **bằng mắt**, so `atk1_side_0` trên cùng
một đường chân — ba cái thước tự động đều nói dối trên art này: chân-tới-vai thì
áo choàng phủ kín băng đo, căn-bậc-hai-diện-tích thì áo choàng bay làm phồng, còn
neo-tới-đỉnh-đầu thì lẫn tư thế khom vào cỡ người.

### Ghi chú: hurt/death chưa khớp

`wukong-hurt-death.png` là file duy nhất chưa được vẽ lại, nên **trang phục khác
hẳn** bộ mới: nhân vật đổi áo lúc trúng đòn và lúc chết. Vẫn nướng, vì một nhân
vật không thể bị choáng hay chết thì tệ hơn là một nhân vật đổi áo trong lúc đó.
Vẽ lại theo cùng bố cục là thay được ngay, không phải sửa code.

---
## Cấu trúc

```
src/
├── game/
│   ├── entities/NhuYen.ts              # Như Yên: liên chiêu, 3 skill, run/dash, pivot ở chân
│   ├── entities/HuyetLang.ts           # Huyết Lang: liên chiêu trường đao, 3 skill, pivot ở chân
│   ├── entities/RemoteAvatar.ts        # bản sao hình ảnh của người chơi khác (multiplayer)
│   ├── entities/playerHandle.ts        # lớp keo mỏng để Scene điều khiển cả hai nhân vật
│   ├── scenes/BootScene.ts             # load atlas nhân vật, bake texture môi trường (PIXEL=2)
│   ├── scenes/WorldScene.ts            # map theo zone, mob, boss, loot, warp, multiplayer
│   ├── systems/HuyetLangController.ts  # input Huyết Lang
│   ├── systems/NhuYenController.ts     # input Như Yên (4 phím chiêu + Shift chạy)
│   ├── systems/CombatSystem.ts         # cooldown nhiều slot, damage, SP (không cần Phaser)
│   ├── systems/ComboChain.ts           # trạng thái liên chiêu + cửa sổ chain (không cần Phaser)
│   ├── systems/FrostMark.ts            # Băng stack / Đóng Băng cho một mục tiêu (không cần Phaser)
│   ├── systems/NhuYenEffects.ts        # spawn vệt khí, trụ băng, mảnh băng, ảnh tàn
│   ├── animations/nhuYenAnimations.ts  # clip registry, (hướng -> clip + flipX), frame va chạm
│   ├── animations/huyetLangAnimations.ts # clip registry Huyết Lang
│   ├── config/gameConfig.ts            # pixelArt, FIT scale, arcade physics
│   ├── events.ts                       # event bus Phaser <-> React
│   └── types.ts                        # Direction, CharacterState, CharacterStats
├── components/GameCanvas.tsx           # mount/destroy Phaser.Game (+ window.__game khi DEV)
├── components/GameUI.tsx               # HUD HP/SP pixel, pip liên chiêu, thanh chiêu thức
└── App.tsx

tools/
├── png-decode.mjs / png.mjs / pixel.mjs   # decode/encode PNG + toolkit vẽ pixel
├── image-io.mjs                           # encode WebP lossless + decode PNG/WebP dùng chung
├── atlas-pack.mjs                         # trim frame + shelf pack -> một texture
├── extract-nhuyen.mjs                     # cắt cột 2 lượt, 3 điểm neo, resample số thực
├── build-nhuyen-atlas.mjs                 # frame box riêng + pivot -> atlas/
├── extract-huyetlang.mjs / build-huyetlang-atlas.mjs  # inventory + atlas Huyết Lang
├── measure-stride.mjs                     # đo chân trụ: quãng mặt đất art thực sự vẽ
├── analyse-cycle.mjs                      # đo Δsilhouette/frame, brute-force chu kỳ êm nhất
├── sheet-frames.mjs                       # engine segmentation dùng chung (Như Yên + boss)
├── extract-boss.mjs / build-boss-atlas.mjs# inventory + atlas cho Boss 1
├── check-atlas.mjs                        # dựng lại frame từ metadata, so pixel với bản trước
├── preview-atlas.mjs                      # contact sheet để kiểm tra atlas bằng mắt
├── check-enemy-ai.mjs                     # test hệ AI bằng clock giả
└── upload-game-assets.mjs                 # đẩy atlas lên Supabase Storage
```

## Ghi chú kỹ thuật

- `pixelArt: true`, `render.antialias: false`, `roundPixels: true`, filter `NEAREST`
  set lại sau khi load; CSS `image-rendering: pixelated`.
- Physics body của nhân vật là hộp 26×16 **ở chân**, suy ra từ `STANDING_POINT`
  trong atlas — thay art chỉ cần build lại atlas, không sửa hằng số rải rác.
- Prop cũng dùng hộp collision ở chân + Y-sorting theo đường chân.
- Texture môi trường (cỏ/cây/đá) là placeholder vẽ bằng code, bake ở `PIXEL = 2`
  cho khớp mật độ pixel của sheet nhân vật.
- React **không** dùng `StrictMode`: double-mount sẽ tạo → hủy → tạo lại
  `Phaser.Game` và làm loader bị hủy giữa dòng.
- Scene hủy đăng ký `GameBus` ở **cả** `SHUTDOWN` và `DESTROY`.

### Quyết định riêng của Như Yên

- **Sát thương bung theo frame animation, không theo timer.** Frame va chạm khai
  báo trong `IMPACT_FRAME` ngay cạnh art của nó. Nhờ vậy chỉnh lại nhịp art là
  chỉnh luôn nhịp đòn, và một chiêu bị ngắt giữa đường (trúng đòn khi đang vung)
  sẽ **không bao giờ tới frame đó** nên không gây sát thương — không cần cờ hủy.
- **Mọi tầm đánh tính trên mặt phẳng đất**, không tính ở tầm ngực. Trong góc nhìn
  3/4 này, Y trên màn hình mã hoá *xa/gần* chứ không phải *cao/thấp*; trộn hai thứ
  đó lại thì khoảng lệch dọc giữa nhân vật đứng và một luyện thạch ngang hông ăn
  hết bán kính đánh (đúng lỗi này làm liên chiêu không ăn gì lúc đầu). Effect tự
  nhấc mình lên `FX_LIFT` khi vẽ; con số va chạm thì phẳng.
- **Vị trí mục tiêu = tâm hộp collision** của nó, không phải tâm ảnh — tức chỗ nó
  thực sự đứng trên đất.
- **Projectile kiểm tra theo đoạn đã quét**, không theo điểm hiện tại. Vệt kiếm khí
  đi 300px trong 380ms, tức ~13px mỗi frame ở 60fps — nhưng nếu frame bị hụt, nó
  nhảy xa hơn cả bán kính trúng của chính nó và phép kiểm tra theo điểm sẽ cho nó
  xuyên thẳng qua mục tiêu mà không chạm.
- **`comboSteps` nằm trong `CharacterChangedPayload`.** Entity thông báo hình dạng
  liên chiêu của nó *trong lúc được tạo*, tức luôn trước khi Scene kịp thông báo
  entity đó. HUD nào lấy số pip từ event `ComboChanged` sẽ bị lệnh đổi nhân vật
  theo sau xoá sạch.
- **Sương Ảnh Bộ dừng theo cả thời gian lẫn khoảng cách.** `tick()` chạy trước
  bước vật lý, nên phép kiểm tra tính luôn bước sắp diễn ra — kiểm tra khoảng cách
  đã đi chỉ phát hiện được lúc đã lố. Đo thực tế: **165px** so với đích 168px, thay
  vì 181px khi kiểm tra kiểu ngây thơ.
- **Vite không copy sheet nguồn vào `dist/`.** Plugin `stripSourceSheets` trong
  `vite.config.ts` xoá chúng sau khi build — sheet nguồn nằm trong `public/` vì đó
  là nơi bạn vẽ và là nơi tool đọc, nhưng game chỉ tải atlas. Không có plugin này
  thì `dist/` là 19MB, trong đó ~13MB không ai fetch; có rồi còn **5.9MB**.
- Phaser 3.60+ chạy tween theo `Date.now()` (`TweenManager.getDelta`), **không**
  theo delta của game loop. Đáng biết khi debug: bơm loop bằng tay sẽ thấy FX như
  bị "rò rỉ" trong khi thực ra chúng chỉ chưa tới lượt tan.
