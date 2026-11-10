# -*- coding: utf-8 -*-
# 너굴라이언트 설치 도우미 그림 생성 (너굴마을 게임 화면 구성 - 나무 프레임 · 크림 패널 · 픽셀)
#   -> bg.bmp    : 창 배경 960x600
#   -> dial.bmp  : 시계 문자판 1120x1120 (= 280 x 4배). 바늘은 설치 창이 직접 그림
#   -> trig.bin  : 1도 단위 sin/cos 표
#   -> icon.ico  : 설치 도우미 아이콘 (너굴마을 로고)
#
# ⚠️ 라벨(상태 문구 · 버전 · 창 버튼)과 시계 상자 자리는 완전한 단색(BG)이어야 함.
#    BG 는 bootstrap.nsi 의 C_BG 와 반드시 같아야 함.
import math
import os
import random
import struct

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "neogul-logo.png")
FONT_TITLE = os.path.join(HERE, "Galmuri14.ttf")
FONT_SMALL = os.path.join(HERE, "Galmuri11-Bold.ttf")

W, H = 960, 600
BG = (239, 229, 207)          # #EFE5CF 크림 패널 = 모든 라벨의 배경색

# 너굴마을 팔레트
WOOD = (138, 90, 59)          # #8A5A3B
WOOD_D = (94, 58, 36)         # #5E3A24
WOOD_L = (176, 122, 82)       # #B07A52
WOOD_LL = (201, 150, 104)
PLATE = (247, 238, 214)       # 간판 안쪽
TEXT = (74, 46, 31)           # #4A2E1F
GREEN = (111, 174, 79)        # #6FAE4F
GREEN_D = (78, 138, 53)
GREEN_L = (148, 204, 104)
APPLE = (214, 58, 52)

CLOCK_CX, CLOCK_CY = 480, 250
CLOCK_BOX = 280
S = 4
BIG = CLOCK_BOX * S

FRAME = 18

# 라벨 자리 (bootstrap.nsi 의 컨트롤 위치 + 여유)
EXCLUDE = [
    (236, 420, 488, 32),   # 상태 문구
    (396, 524, 168, 24),   # 버전
    (848, 22, 48, 36),     # 최소화
    (890, 22, 48, 36),     # 닫기
]

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
random.seed(20261110)


def px_rect(x0, y0, x1, y1, c):
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)


# ── 나무 프레임 (판자 결 + 테두리 + 못) ─────────────────────────────────────────
def wood_band(x0, y0, x1, y1, horizontal=True):
    px_rect(x0, y0, x1, y1, WOOD)
    # 결: 2px 단위로 밝은 줄 / 어두운 줄 드문드문
    if horizontal:
        for y in range(y0 + 3, y1 - 3, 5):
            for x in range(x0, x1, 2):
                r = random.random()
                if r < 0.18:
                    px_rect(x, y, x + 2, y + 1, WOOD_L)
                elif r < 0.24:
                    px_rect(x, y, x + 2, y + 1, WOOD_D)
    else:
        for x in range(x0 + 3, x1 - 3, 5):
            for y in range(y0, y1, 2):
                r = random.random()
                if r < 0.18:
                    px_rect(x, y, x + 1, y + 2, WOOD_L)
                elif r < 0.24:
                    px_rect(x, y, x + 1, y + 2, WOOD_D)


wood_band(0, 0, W, FRAME)
wood_band(0, H - FRAME, W, H)
wood_band(0, 0, FRAME, H, horizontal=False)
wood_band(W - FRAME, 0, W, H, horizontal=False)
# 바깥/안쪽 테두리
d.rectangle([0, 0, W - 1, H - 1], outline=WOOD_D, width=3)
d.rectangle([FRAME - 3, FRAME - 3, W - FRAME + 2, H - FRAME + 2], outline=WOOD_D, width=3)
# 안쪽 크림 패널 가장자리 그림자(1px)
d.line([FRAME, FRAME, W - FRAME - 1, FRAME], fill=(224, 211, 182))
d.line([FRAME, FRAME, FRAME, H - FRAME - 1], fill=(224, 211, 182))
# 모서리 못
for (cx, cy) in [(9, 9), (W - 10, 9), (9, H - 10), (W - 10, H - 10)]:
    px_rect(cx - 3, cy - 3, cx + 3, cy + 3, WOOD_D)
    px_rect(cx - 2, cy - 2, cx + 2, cy + 2, WOOD_LL)
    px_rect(cx - 1, cy - 1, cx + 1, cy + 1, (232, 196, 150))

# ── 위쪽 간판 "너굴라이언트" ──────────────────────────────────────────────────
SX0, SX1, SY0, SY1 = 340, 620, 4, 66
px_rect(SX0, SY0, SX1, SY1, WOOD)
wood_band(SX0, SY0, SX1, SY1)
d.rectangle([SX0, SY0, SX1 - 1, SY1 - 1], outline=WOOD_D, width=3)
px_rect(SX0 + 12, SY0 + 11, SX1 - 12, SY1 - 11, PLATE)
d.rectangle([SX0 + 12, SY0 + 11, SX1 - 13, SY1 - 12], outline=WOOD_D, width=2)
for (cx, cy) in [(SX0 + 7, SY0 + 7), (SX1 - 8, SY0 + 7), (SX0 + 7, SY1 - 8), (SX1 - 8, SY1 - 8)]:
    px_rect(cx - 2, cy - 2, cx + 2, cy + 2, WOOD_D)
    px_rect(cx - 1, cy - 1, cx + 1, cy + 1, WOOD_LL)


def pixel_text(text, font_path, size, cx, cy, fill, shadow=None):
    """안티앨리어싱 없이(픽셀 그대로) 가운데 정렬로 찍기"""
    f = ImageFont.truetype(font_path, size)
    layer = Image.new("L", (W, 120), 0)
    ld = ImageDraw.Draw(layer)
    ld.fontmode = "1"
    bbox = ld.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = int(cx - tw / 2 - bbox[0])
    y = int(cy - th / 2 - bbox[1])
    if shadow:
        sh = Image.new("L", img.size, 0)
        sd = ImageDraw.Draw(sh)
        sd.fontmode = "1"
        sd.text((x + 2, y + 2), text, font=f, fill=255)
        img.paste(Image.new("RGB", img.size, shadow), (0, 0), sh)
    m = Image.new("L", img.size, 0)
    md = ImageDraw.Draw(m)
    md.fontmode = "1"
    md.text((x, y), text, font=f, fill=255)
    img.paste(Image.new("RGB", img.size, fill), (0, 0), m)


pixel_text("너굴라이언트", FONT_TITLE, 28, (SX0 + SX1) / 2, (SY0 + SY1) / 2, TEXT, shadow=(222, 205, 170))

# ── 아래 잔디 ────────────────────────────────────────────────────────────────
GY = H - FRAME - 22
px_rect(FRAME, GY + 8, W - FRAME, H - FRAME, GREEN)
px_rect(FRAME, GY + 8, W - FRAME, GY + 11, GREEN_L)
for x in range(FRAME, W - FRAME, 4):
    h = random.choice([2, 4, 6, 8])
    px_rect(x, GY + 8 - h, x + 4, GY + 8, GREEN if random.random() < 0.7 else GREEN_D)
    if random.random() < 0.25:
        px_rect(x, GY + 8 - h, x + 2, GY + 10 - h, GREEN_L)
for x in range(FRAME, W - FRAME, 6):
    if random.random() < 0.35:
        oy = GY + 14 + random.choice([0, 2, 4])
        px_rect(x, oy, x + 2, oy + 2, GREEN_D)
# 잔디 위 작은 꽃
for _ in range(9):
    fx = random.randrange(FRAME + 20, W - FRAME - 20)
    if 380 <= fx <= 580:
        continue
    col = random.choice([(255, 214, 102), (255, 160, 180), (255, 255, 255)])
    px_rect(fx, GY - 4, fx + 2, GY + 8, GREEN_D)
    px_rect(fx - 2, GY - 8, fx + 4, GY - 4, col)

# ── 오른쪽 사과나무 ──────────────────────────────────────────────────────────
TX = 820
px_rect(TX - 8, 420, TX + 8, GY + 8, WOOD)
px_rect(TX - 8, 420, TX - 4, GY + 8, WOOD_D)
px_rect(TX + 4, 430, TX + 8, GY + 8, WOOD_L)
for (bx, by, r) in [(TX, 380, 46), (TX - 42, 404, 32), (TX + 42, 404, 32), (TX - 20, 350, 30), (TX + 22, 352, 30)]:
    for yy in range(by - r, by + r, 4):
        for xx in range(bx - r, bx + r, 4):
            if (xx - bx) ** 2 + (yy - by) ** 2 <= r * r:
                c = GREEN if random.random() < 0.72 else (GREEN_D if random.random() < 0.6 else GREEN_L)
                px_rect(xx, yy, xx + 4, yy + 4, c)
for (ax, ay) in [(TX - 30, 392), (TX + 18, 370), (TX + 40, 412), (TX - 8, 414), (TX - 48, 418)]:
    px_rect(ax, ay, ax + 8, ay + 8, APPLE)
    px_rect(ax + 2, ay + 2, ax + 4, ay + 4, (255, 150, 140))
    px_rect(ax + 3, ay - 2, ax + 5, ay, WOOD_D)

# ── 왼쪽 너구리 (너굴마을 로고) ───────────────────────────────────────────────
logo = Image.open(LOGO).convert("RGBA")
LS = 208
lg = logo.resize((LS, LS), Image.NEAREST)
LX, LY = 34, GY + 14 - LS
# 크림 바탕에 바로 합성 (라벨/시계 자리와 겹치지 않는 위치)
img.paste(lg, (LX, LY), lg)

# ── 아래쪽 작은 글씨 ─────────────────────────────────────────────────────────
pixel_text("너굴마을 전용 런처 · mcng.kr", FONT_SMALL, 13, W / 2, 486, WOOD)

# 안전장치: 라벨 자리와 시계 상자는 완전한 단색
for (ex, ey, ew, eh) in EXCLUDE:
    d.rectangle([ex, ey, ex + ew - 1, ey + eh - 1], fill=BG)
d.rectangle([CLOCK_CX - CLOCK_BOX // 2, CLOCK_CY - CLOCK_BOX // 2,
             CLOCK_CX + CLOCK_BOX // 2 - 1, CLOCK_CY + CLOCK_BOX // 2 - 1], fill=BG)

img.save(os.path.join(HERE, "bg.bmp"), "BMP")
img.save(os.path.join(HERE, "bg_preview.png"))

# ── 문자판: 나무 벽시계 (반 크기 140 에 픽셀로 그리고 8배로 키움 → 화면에선 2px 도트) ──
D = CLOCK_BOX // 2           # 140
dial = Image.new("RGB", (D, D), BG)
dd = ImageDraw.Draw(dial)
c = D / 2
FACE = (250, 243, 226)


def ring(r_out, r_in, col):
    for y in range(D):
        for x in range(D):
            dist = math.hypot(x + 0.5 - c, y + 0.5 - c)
            if r_in <= dist < r_out:
                dial.putpixel((x, y), col)


ring(68, 0, WOOD_D)          # 바깥 테두리
ring(66.5, 0, WOOD)          # 나무 테
ring(63, 0, WOOD_D)
ring(61.5, 0, FACE)          # 문자판
# 나무 테의 밝은 결 (위쪽 왼쪽만 - 빛 방향)
for y in range(D):
    for x in range(D):
        dist = math.hypot(x + 0.5 - c, y + 0.5 - c)
        if 63.5 <= dist < 65.5 and (x + y) < D * 0.9 and (x * 7 + y * 3) % 5 == 0:
            dial.putpixel((x, y), WOOD_L)
# 분 눈금(점) - 시 눈금 자리는 빼고
for i in range(60):
    if i % 5 == 0:
        continue
    a = math.radians(i * 6)
    x = round(c + 56 * math.sin(a) - 0.5)
    y = round(c - 56 * math.cos(a) - 0.5)
    dial.putpixel((x, y), (205, 186, 150))
# 시 눈금 (2x2 ~ 3x3 도트 사각형), 12시는 초록 · 3/6/9는 진하게
for h12 in range(12):
    a = math.radians(h12 * 30)
    x = c + 53 * math.sin(a)
    y = c - 53 * math.cos(a)
    big_tick = h12 % 3 == 0
    sz = 3 if big_tick else 2
    col = GREEN if h12 == 0 else (WOOD_D if big_tick else WOOD)
    x0, y0 = int(round(x - sz / 2)), int(round(y - sz / 2))
    dd.rectangle([x0, y0, x0 + sz - 1, y0 + sz - 1], fill=col)
dial_big = dial.resize((BIG, BIG), Image.NEAREST)
dial_big.save(os.path.join(HERE, "dial.bmp"), "BMP")
dial.resize((CLOCK_BOX, CLOCK_BOX), Image.NEAREST).save(os.path.join(HERE, "dial_preview.png"))

# ── sin/cos 표 ───────────────────────────────────────────────────────────────
with open(os.path.join(HERE, "trig.bin"), "wb") as f:
    for deg in range(360):
        a = math.radians(deg)
        f.write(struct.pack("<ii", int(round(math.sin(a) * 10000)), int(round(math.cos(a) * 10000))))

# ── 아이콘 (너굴마을 로고) ────────────────────────────────────────────────────
logo.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print("bg.bmp", img.size, "| dial.bmp", dial_big.size, "| trig.bin | icon.ico")
