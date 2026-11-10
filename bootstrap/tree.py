# 픽셀아트 사과나무 스프라이트 (저해상도로 그리고 2배 확대)
import math, random
from PIL import Image

def make_tree(seed=7):
    random.seed(seed)
    Wt, Ht = 84, 92          # 저해상도 캔버스 (최종 168x208)
    img = Image.new("RGBA", (Wt, Ht), (0, 0, 0, 0))
    P = img.load()
    # 팔레트
    OUT = (38, 70, 34, 255)       # 잎 외곽선
    G0 = (56, 104, 44, 255)       # 가장 어두운 잎
    G1 = (78, 138, 53, 255)
    G2 = (111, 174, 79, 255)      # 기본
    G3 = (148, 204, 104, 255)
    G4 = (196, 232, 140, 255)     # 하이라이트
    T_OUT = (62, 36, 22, 255)
    T0 = (94, 58, 36, 255)
    T1 = (138, 90, 59, 255)
    T2 = (176, 122, 82, 255)
    A_OUT = (110, 24, 28, 255)
    A0 = (178, 40, 40, 255)
    A1 = (222, 66, 56, 255)
    A2 = (255, 170, 150, 255)

    # ── 줄기 ──
    cx = Wt // 2
    trunk_top, trunk_bot = 56, 91
    for y in range(trunk_top, trunk_bot):
        # 아래로 갈수록 살짝 넓어지고, 맨 아래는 뿌리처럼 퍼짐
        half = 5 + (1 if y > 83 else 0) + (1 if y > 86 else 0) + (2 if y > 88 else 0)
        for x in range(cx - half, cx + half + 1):
            edge = x in (cx - half, cx + half)
            if edge:
                P[x, y] = T_OUT
            elif x <= cx - half + 2:
                P[x, y] = T2 if (y % 5) else T1
            elif x >= cx + half - 2:
                P[x, y] = T0
            else:
                P[x, y] = T1 if (x + y) % 7 else T0
    for x in range(cx - 9, cx + 10):
        P[x, trunk_bot - 1] = T_OUT
    # 나뭇결 몇 줄
    for (x, y0, y1) in [(cx - 1, 64, 70), (cx + 1, 74, 80), (cx - 2, 83, 87)]:
        for y in range(y0, y1):
            P[x, y] = T0
    # 가지 (잎 속으로 들어가는 두 갈래)
    for i in range(10):
        for (dx, sign) in [(0, -1), (0, 1)]:
            x = cx + sign * (2 + i)
            y = trunk_top - i // 2
            for t in (0, 1):
                P[x, y + t] = T1 if t == 0 else T0

    # ── 잎: 덩어리(뒤→앞) ──
    blobs = [  # (cx, cy, r)  뒤쪽 먼저
        (cx - 22, 40, 16), (cx + 22, 40, 16),
        (cx, 22, 19), (cx - 13, 26, 15), (cx + 14, 27, 15),
        (cx - 8, 44, 16), (cx + 9, 45, 16), (cx, 36, 17),
    ]
    owner = {}
    for i, (bx, by, r) in enumerate(blobs):
        for y in range(by - r, by + r + 1):
            for x in range(bx - r, bx + r + 1):
                # 살짝 울퉁불퉁한 원
                ang = math.atan2(y - by, x - bx)
                rr = r + 1.2 * math.sin(ang * 5 + i) + 0.8 * math.sin(ang * 9 + i * 2)
                if (x - bx) ** 2 + (y - by) ** 2 <= rr * rr and 0 <= x < Wt and 0 <= y < Ht:
                    owner[(x, y)] = i
    # 명암: 덩어리 중심 기준 왼쪽 위가 밝음
    for (x, y), i in owner.items():
        bx, by, r = blobs[i]
        nx, ny = (x - bx) / r, (y - by) / r
        light = -(nx * 0.65 + ny * 0.85)            # 왼쪽 위 = +
        d = math.hypot(nx, ny)
        v = light * 0.9 + (0.35 - d) * 0.5
        # 4x4 순서 디더링으로 단계 사이를 자연스럽게
        bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y % 4][x % 4] / 16 - 0.5
        v += bayer * 0.28
        if v > 0.55:
            c = G4
        elif v > 0.22:
            c = G3
        elif v > -0.18:
            c = G2
        elif v > -0.5:
            c = G1
        else:
            c = G0
        P[x, y] = c
    # 앞 덩어리가 뒤 덩어리를 덮는 경계에 어두운 선 (입체감)
    for (x, y), i in owner.items():
        for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            j = owner.get((x + dx, y + dy))
            if j is not None and j < i:
                bx, by, r = blobs[i]
                # 덩어리 아래/오른쪽 경계만
                if (x - bx) * 0.5 + (y - by) > r * 0.25:
                    P[x + dx, y + dy] = G0
    # 바깥 외곽선
    for (x, y) in list(owner.keys()):
        for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
            q = (x + dx, y + dy)
            if q not in owner and 0 <= q[0] < Wt and 0 <= q[1] < Ht:
                if P[q][3] == 0 or q[1] < trunk_top + 2:
                    P[q] = OUT
    # 잎 뭉치 작은 무늬 (어두운 V 모양 몇 개)
    keys = list(owner.keys())
    for _ in range(26):
        x, y = random.choice(keys)
        if P[x, y] in (G2, G3) and (x + 1, y + 1) in owner and (x - 1, y + 1) in owner:
            P[x, y + 1] = G1; P[x - 1, y] = G1; P[x + 1, y] = G1

    # ── 사과 ──
    apples = [(cx - 16, 30), (cx + 12, 20), (cx + 20, 42), (cx - 4, 48), (cx - 25, 46), (cx + 4, 33)]
    for (ax, ay) in apples:
        shape = [" ooo ", "oaAAo", "oAAAo", "oA00o", " ooo "]
        for yy, row in enumerate(shape):
            for xx, ch in enumerate(row):
                X, Y = ax + xx - 2, ay + yy - 2
                if ch == "o": P[X, Y] = A_OUT
                elif ch == "A": P[X, Y] = A1
                elif ch == "a": P[X, Y] = A2
                elif ch == "0": P[X, Y] = A0
        P[ax, ay - 3] = T0                     # 꼭지
        P[ax + 1, ay - 4] = G3                 # 잎사귀

    return img.resize((Wt * 2, Ht * 2), Image.NEAREST)

if __name__ == "__main__":
    t = make_tree()
    bg = Image.new("RGBA", (t.width + 40, t.height + 20), (239, 229, 207, 255))
    bg.paste(t, (20, 0), t)
    bg.resize((bg.width * 2, bg.height * 2), Image.NEAREST).save("/tmp/claude-0/-home-claude/fa459da1-51c7-548c-91e9-3200c15fa510/scratchpad/tree_test.png")
