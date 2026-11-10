# -*- coding: utf-8 -*-
# 너굴라이언트 설치 도우미 그림 생성 (너굴마을 게임 화면 구성 - 나무 프레임 · 크림 패널 · 픽셀)
#   -> bg.bmp    : 창 배경 960x600
#   -> icon.ico  : 설치 도우미 아이콘 (너굴마을 로고)
#
# ⚠️ 라벨(상태 문구 · 버전 · 창 버튼)과 시계 상자 자리는 완전한 단색(BG)이어야 함.
#    BG 는 bootstrap.nsi 의 C_BG 와 반드시 같아야 함.
import os
import random

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "neogul-logo.png")
FONT_TITLE = os.path.join(HERE, "Galmuri11-Bold.ttf")
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

# 진행 바 채움 영역 (bootstrap.nsi 의 BAR_* 와 반드시 같아야 함)
BAR_X, BAR_Y, BAR_W, BAR_H = 284, 388, 392, 12

FRAME = 18

# 라벨 자리 (bootstrap.nsi 의 컨트롤 위치 + 여유)
EXCLUDE = [
    (236, 342, 488, 32),   # 상태 문구
    (396, 466, 168, 24),   # 버전
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


pixel_text("너굴라이언트", FONT_TITLE, 22, (SX0 + SX1) / 2, (SY0 + SY1) / 2, TEXT, shadow=(222, 205, 170))

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

# ── 가운데 너굴마을 로고 ─────────────────────────────────────────────────────
logo = Image.open(LOGO).convert("RGBA")
LS = 256
img.paste(logo, ((W - LS) // 2, 76), logo)

# ── 진행 바 나무 테두리 (안쪽 채움은 설치 창이 초록으로 늘림) ───────────────────
fx0, fy0, fx1, fy1 = BAR_X - 4, BAR_Y - 4, BAR_X + BAR_W + 4, BAR_Y + BAR_H + 4
px_rect(fx0 - 3, fy0 - 3, fx1 + 3, fy1 + 3, WOOD_D)
px_rect(fx0, fy0, fx1, fy1, WOOD)
px_rect(fx0, fy0, fx1, fy0 + 1, WOOD_L)
px_rect(BAR_X, BAR_Y, BAR_X + BAR_W, BAR_Y + BAR_H, (214, 199, 168))   # 빈 칸
px_rect(BAR_X, BAR_Y, BAR_X + BAR_W, BAR_Y + 2, (196, 180, 148))

# ── 아래쪽 작은 글씨 ─────────────────────────────────────────────────────────
pixel_text("너굴마을 전용 런처 · mcng.kr", FONT_SMALL, 11, W / 2, 434, WOOD)

# 안전장치: 라벨 자리와 시계 상자는 완전한 단색
for (ex, ey, ew, eh) in EXCLUDE:
    d.rectangle([ex, ey, ex + ew - 1, ey + eh - 1], fill=BG)

img.save(os.path.join(HERE, "bg.bmp"), "BMP")
img.save(os.path.join(HERE, "bg_preview.png"))

# ── 아이콘 (너굴마을 로고) ────────────────────────────────────────────────────
logo.save(os.path.join(HERE, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print("bg.bmp", img.size, "| icon.ico")
