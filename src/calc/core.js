/* 너굴마을 무역 계산기 - 계산 로직 (브라우저/Node 공용) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────── 단위 ─────────────────────────
  const STACK = 64;              // 1세트
  const CHEST = 3456;            // 1상자 (54칸 × 64)
  const UNITS = { '개': 1, '세트': STACK, '상자': CHEST };
  const VOYAGE_SLOTS = 28;       // 한 번 출항에 28세트(칸)

  const IMG = 'https://mcng.kr/assets/img/wiki/';

  // ───────────────────────── 재료 ─────────────────────────
  // [id, 이름, 그룹, 아이콘 경로]
  const RES = [
    ['wheat', '밀', '농작물', 'cook/wheat.png'], ['hay', '건초 더미', '농작물', 'cook/hay_block.png'], ['paddy', '벼', '농작물', 'cook/beetroot.png'],
    ['pumpkin', '호박', '농작물', 'cook/pumpkin.png'], ['melon', '수박', '농작물', 'cook/melon.png'], ['potato', '감자', '농작물', 'cook/potato.png'],
    ['berry', '달콤한 열매', '농작물', 'cook/sweet_berries.png'], ['chili', '고추', '농작물', 'cook/nether_wart.png'], ['carrot', '당근', '농작물', 'cook/carrot.png'],
    ['apple', '사과', '농작물', 'cook/apple.png'], ['cane', '사탕수수', '농작물', 'cook/sugar_cane.png'],

    ['cabbage', '양배추', '채집물', 'gather/farmer_vege.png'],
    ['leek', '대파', '채집물', 'gather/farmer_leak.png'],
    ['garlic', '마늘', '채집물', 'gather/farmer_garlic.png'],
    ['chicken', '닭고기', '채집물', 'gather/meat_chicken.png'],
    ['beef', '소고기', '채집물', 'gather/meat_beef.png'],
    ['pork', '돼지고기', '채집물', 'gather/meat_porkchop.png'],
    ['shrimp', '갯새우', '채집물', 'gather/fisher_shrimp.png'],
    ['squid', '갯벌 오징어', '채집물', 'gather/fisher_squid.png'],
    ['crab', '꽃게', '채집물', 'gather/fisher_crab.png'],
    ['scallop', '가리비', '채집물', 'gather/fisher_seafood2.png'],
    ['oyster', '굴', '채집물', 'gather/fisher_seafood1.png'],
    ['seaweed', '미역', '채집물', 'gather/fisher_seafood3.png'],

    ['coal', '요리용 석탄', '기타', 'cook/cook_charcoal.png'],

    ['bread', '빵', '재료요리', 'cook/bread.png'],
    ['rice', '쌀', '재료요리', 'cook/meal.png'],
    ['xPumpkin', '호박 액기스', '재료요리', 'cook/extract_pumpkin.png'],
    ['xMelon', '수박 액기스', '재료요리', 'cook/extract_melon.png'],
    ['xPotato', '감자 액기스', '재료요리', 'cook/extract_potato.png'],
    ['xBerry', '열매 액기스', '재료요리', 'cook/extract_berry.png'],
    ['xChili', '고추 액기스', '재료요리', 'cook/extract_chill.png'],
    ['xCarrot', '당근 액기스', '재료요리', 'cook/extract_carrot.png'],
    ['xApple', '사과 액기스', '재료요리', 'cook/extract_apple.png'],
    ['sugar', '수북한 설탕', '재료요리', 'cook/extract_sugar.png'],
    ['flour', '수북한 밀가루', '재료요리', 'cook/extract_wheat.png'],

    ['bronzeBowl', '청동 그릇', '플레이팅', 'plating/bronze_bowl.png'],
    ['silverBowl', '은 그릇', '플레이팅', 'plating/silver_bowl.png'],
    ['goldBowl', '금 그릇', '플레이팅', 'plating/gold_bowl.png'],
    ['bronzeIngot', '청동', '플레이팅', 'plating/bronze_ingot.png'],
    ['silverIngot', '은 주괴', '플레이팅', 'plating/silver_ingot.png'],
    ['goldIngot', '금 주괴', '플레이팅', 'plating/gold_ingot.png'],

    ['orca', '범고래', '특수', 'fishing/killer_whale_01.png'],
    ['shark', '상어', '특수', 'fishing/shark_model_01.png'],
    ['conch', '소라고동', '특수', 'fishing/conch_01.png'],
    ['emberGreen', '초록 잉걸불', '특수', 'gather/soul_green.png'],
    ['emberBlue', '푸른 잉걸불', '특수', 'gather/soul_blue.png'],
    ['emberGray', '잿빛 잉걸불', '특수', 'gather/soul_gray.png'],
    ['emberRed', '붉은 잉걸불', '특수', 'gather/soul_red.png'],
    ['emberGold', '황금 잉걸불', '특수', 'cook/soul_gold.png'],
  ].map(([id, name, group, icon]) => ({ id, name, group, icon: icon ? IMG + icon : null }));
  const RES_BY_ID = Object.fromEntries(RES.map(r => [r.id, r]));
  const GROUPS = ['농작물', '채집물', '기타', '재료요리', '플레이팅', '특수'];

  // 재료요리 / 제작 (중첩 1개 = 64개로도 요리되므로 64개 단위)
  const CRAFT = {
    bread:    { wheat: 64, coal: 1 },
    rice:     { paddy: 64, coal: 1 },
    xPumpkin: { pumpkin: 64, coal: 1 },
    xMelon:   { melon: 64, coal: 1 },
    xPotato:  { potato: 64, coal: 1 },
    xBerry:   { berry: 32, coal: 1 },
    xChili:   { chili: 64, coal: 1 },
    xCarrot:  { carrot: 64, coal: 1 },
    xApple:   { apple: 8, coal: 1 },
    sugar:    { cane: 64, coal: 1 },
    flour:    { wheat: 64, coal: 1 },
    emberGold: { emberGreen: 20, emberBlue: 20, emberGray: 20, emberRed: 20 },
  };

  // ───────────────────────── 요리 ─────────────────────────
  const FOODS = [
    ['food1', '코울슬로', { cabbage: 1, xCarrot: 1 }],
    ['food2', '마늘 바게트', { garlic: 1, bread: 1 }],
    ['food3', '감자 대파 수프', { leek: 1, xPotato: 1 }],
    ['food4', '치킨 라이스', { chicken: 1, rice: 1 }],
    ['food5', '비프 샌드위치', { beef: 1, bread: 1 }],
    ['food6', '제육볶음', { pork: 1, xChili: 1 }],
    ['food7', '새우 볶음밥', { shrimp: 1, rice: 1 }],
    ['food8', '달콤 오징어 구이', { squid: 1, sugar: 1 }],
    ['food9', '가리비 호박 구이', { scallop: 1, xPumpkin: 1 }],
    ['food10', '수박 미역 샐러드', { seaweed: 1, xMelon: 1 }],
    ['food11', '사과 샐러드', { xBerry: 1, xApple: 1 }],
    ['food12', '호박죽', { rice: 1, xPumpkin: 1 }],
    ['food13', '과일 굴 무침', { oyster: 1, xBerry: 1 }],
    ['food14', '호박 브륄레', { xPumpkin: 1, sugar: 1 }],
    ['food15', '당근 케이크', { xCarrot: 1, flour: 1, sugar: 1 }],
    ['food16', '감자전', { xPotato: 1, flour: 1 }],
    ['food17', '수박 주스', { xMelon: 1, sugar: 1 }],
    ['food18', '애플파이', { xApple: 1, flour: 1 }],
    ['food19', '게살버거', { bread: 1, crab: 1 }],
  ].map(([key, name, ing]) => ({
    key, name, kind: 'food', use: Object.assign({}, ing, { coal: 1 }),
    icon: IMG + 'cook/' + key + '.png',
  }));
  const SOULS = [
    { key: 'soulSea', name: '맛의 기원 (海)', kind: 'soul', points: 3800000,
      use: { orca: 1, shark: 1, conch: 1, emberGold: 1 }, icon: IMG + 'cook/soul_food1.png' },
    { key: 'soulLand', name: '맛의 기원 (地)', kind: 'soul', points: 2400000,
      use: { bread: 128, rice: 128, xApple: 32, emberGold: 1 }, icon: IMG + 'cook/soul_food2.png' },
  ];
  const ITEMS = FOODS.concat(SOULS);
  const ITEM_BY_KEY = Object.fromEntries(ITEMS.map(i => [i.key, i]));

  const PLATES = [
    { id: 'none', name: '그릇 없음', short: '', mult: 1, res: null },
    { id: 'bronze', name: '청동 그릇', short: '청동', mult: 1.1, res: 'bronzeBowl', ingot: 'bronzeIngot', icon: IMG + 'plating/bronze_bowl.png' },
    { id: 'silver', name: '은 그릇', short: '은', mult: 1.2, res: 'silverBowl', ingot: 'silverIngot', icon: IMG + 'plating/silver_bowl.png' },
    { id: 'gold', name: '금 그릇', short: '금', mult: 1.3, res: 'goldBowl', ingot: 'goldIngot', icon: IMG + 'plating/gold_bowl.png' },
  ];
  const PLATE_BY_ID = Object.fromEntries(PLATES.map(p => [p.id, p]));

  // 무역선 티켓 (위키 기준)
  const TICKETS = [
    { id: 'royal', name: '로얄', bonus: 0.03, cooldown: 0 },
    { id: 'high', name: '고급', bonus: 0.02, cooldown: 15 },
    { id: 'normal', name: '일반', bonus: 0.01, cooldown: 30 },
  ];

  const DAILY_LIMIT = 5;   // 하루 최대 ±5%p
  const TOTAL_LIMIT = 20;  // 기준가 대비 ±20%

  // ───────────────────────── 시세 ─────────────────────────
  /** API 응답(/api/v1/public/cook/prices)의 data → 가격표 */
  function buildPriceTable(apiData) {
    const map = {};
    const items = (apiData && apiData.items) || [];
    for (const it of items) map[it.key] = it;
    return { date: apiData && apiData.date, updated: apiData && apiData.updated, map };
  }

  function apiKey(foodKey, plate) {
    return !plate || plate === 'none' ? foodKey : plate + '_bowl_' + foodKey;
  }

  /** 한 개당 무역 포인트 */
  function pointsOf(table, key, plate) {
    const item = ITEM_BY_KEY[key];
    if (!item) return 0;
    if (item.kind === 'soul') return item.points;
    const row = table && table.map[apiKey(key, plate)];
    if (row) return row.price;
    const base = table && table.map[key];
    if (base) return Math.round(base.price * PLATE_BY_ID[plate || 'none'].mult);
    return 0;
  }

  function changePct(table, key) {
    const row = table && table.map[key];
    return row ? row.tenths / 10 : 0;
  }

  /** 내일 예상 범위 (하루 ±5%p, 누적 ±20%) */
  function tomorrowRange(table, key, plate) {
    const row = table && table.map[apiKey(key, plate)];
    if (!row) return null;
    const t = row.tenths / 10;
    const lo = Math.max(-TOTAL_LIMIT, t - DAILY_LIMIT);
    const hi = Math.min(TOTAL_LIMIT, t + DAILY_LIMIT);
    return {
      lo: Math.round(row.base * (1 + lo / 100)),
      hi: Math.round(row.base * (1 + hi / 100)),
      loPct: lo, hiPct: hi,
    };
  }

  // ───────────────────────── 인벤토리 ─────────────────────────
  /** {id: {qty, unit}} 또는 {id: number} → {id: 개수} (건초→밀, 주괴→그릇) */
  function normalizeInventory(inv) {
    const s = {};
    for (const r of RES) {
      const v = inv && inv[r.id];
      let n = 0;
      if (typeof v === 'number') n = v;
      else if (v && typeof v === 'object') n = (Number(v.qty) || 0) * (UNITS[v.unit] || 1);
      s[r.id] = Math.max(0, Math.floor(n));
    }
    s.wheat += s.hay * 9; s.hay = 0;
    for (const p of PLATES) {
      if (!p.res) continue;
      s[p.res] += Math.floor(s[p.ingot] / 3);
      s[p.ingot] = 0;
    }
    return s;
  }

  /** st에서 res를 n개 꺼냄. 모자라면 재료요리를 만들어서 충당. 실패 시 false (st는 망가질 수 있음) */
  function take(st, res, n, crafted) {
    if (n <= 0) return true;
    const have = st[res] || 0;
    if (have >= n) { st[res] = have - n; return true; }
    const recipe = CRAFT[res];
    if (!recipe) return false;
    const need = n - have;
    st[res] = 0;
    for (const r in recipe) if (!take(st, r, recipe[r] * need, crafted)) return false;
    if (crafted) crafted[res] = (crafted[res] || 0) + need;
    return true;
  }

  function tryMake(st, item, n, crafted) {
    const s = Object.assign({}, st);
    const c = crafted ? Object.assign({}, crafted) : null;
    for (const r in item.use) if (!take(s, r, item.use[r] * n, c)) return null;
    return { st: s, crafted: c };
  }

  function maxMake(st, item) {
    let lo = 0, hi = 1;
    while (tryMake(st, item, hi)) { lo = hi; hi *= 2; if (hi > 1e8) break; }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tryMake(st, item, mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  /** n개 만들 때 부족한 기본 재료 */
  function shortage(st, item, n) {
    const s = Object.assign({}, st);
    const missing = {};
    function need(res, k) {
      if (k <= 0) return;
      const have = s[res] || 0;
      if (have >= k) { s[res] = have - k; return; }
      s[res] = 0;
      const rest = k - have;
      const recipe = CRAFT[res];
      if (!recipe) { missing[res] = (missing[res] || 0) + rest; return; }
      for (const r in recipe) need(r, recipe[r] * rest);
    }
    for (const r in item.use) need(r, item.use[r] * n);
    return missing;
  }

  // ───────────────────────── 선형계획 (심플렉스) ─────────────────────────
  /** maximize c·x  s.t. A x ≤ b, x ≥ 0, b ≥ 0 */
  function simplex(c, A, b) {
    const m = A.length, n = c.length, W = n + m + 1;
    const T = A.map((row, i) => {
      const r = new Float64Array(W);
      for (let j = 0; j < n; j++) r[j] = row[j];
      r[n + i] = 1; r[W - 1] = b[i];
      return r;
    });
    const z = new Float64Array(W);
    for (let j = 0; j < n; j++) z[j] = -c[j];
    const basis = Array.from({ length: m }, (_, i) => n + i);
    const EPS = 1e-9;
    for (let iter = 0; iter < 20000; iter++) {
      let e = -1;
      if (iter < 2000) { let best = -EPS; for (let j = 0; j < W - 1; j++) if (z[j] < best) { best = z[j]; e = j; } }
      else { for (let j = 0; j < W - 1; j++) if (z[j] < -EPS) { e = j; break; } }
      if (e < 0) break;
      let r = -1, best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][e];
        if (a > EPS) {
          const ratio = T[i][W - 1] / a;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[r])) { best = ratio; r = i; }
        }
      }
      if (r < 0) return null; // unbounded (발생하지 않아야 함)
      const pr = T[r], pv = pr[e];
      for (let j = 0; j < W; j++) pr[j] /= pv;
      for (let i = 0; i < m; i++) {
        if (i === r) continue;
        const f = T[i][e];
        if (f !== 0) { const ri = T[i]; for (let j = 0; j < W; j++) ri[j] -= f * pr[j]; }
      }
      const f = z[e];
      if (f !== 0) for (let j = 0; j < W; j++) z[j] -= f * pr[j];
      basis[r] = e;
    }
    const x = new Array(n).fill(0);
    for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][W - 1];
    return x;
  }

  // ───────────────────────── 최적화 ─────────────────────────
  /**
   * 가진 재료로 무역 포인트 최대가 되는 요리 조합
   * @returns {{lines, crafted, used, left, total}}
   */
  function optimize(inv, table) {
    const stock = normalizeInventory(inv);
    const candidates = ITEMS.filter(it => it.kind === 'soul' || pointsOf(table, it.key, 'none') > 0);

    // LP 변수 구성
    const vars = [];
    for (const k in CRAFT) vars.push({ type: 'craft', id: k, obj: -0.001, use: CRAFT[k], prod: { [k]: 1 } });
    const itemVar = {};
    for (const it of candidates) {
      itemVar[it.key] = vars.length;
      vars.push({ type: 'item', id: it.key, obj: pointsOf(table, it.key, 'none') / 1000, use: it.use, prod: {} });
    }
    const plateVars = [];
    for (const it of FOODS) {
      if (itemVar[it.key] == null) continue;
      for (const p of PLATES) {
        if (!p.res || !stock[p.res]) continue;
        const bonus = pointsOf(table, it.key, p.id) - pointsOf(table, it.key, 'none');
        plateVars.push(vars.length);
        vars.push({ type: 'plate', id: it.key, plate: p.id, obj: bonus / 1000, use: { [p.res]: 1 }, prod: {}, link: itemVar[it.key] });
      }
    }
    const resIds = RES.map(r => r.id);
    const A = [], b = [];
    for (const r of resIds) {
      const row = vars.map(v => (v.use[r] || 0) - (v.prod[r] || 0));
      if (row.some(x => x !== 0)) { A.push(row); b.push(stock[r]); }
    }
    for (const it of FOODS) {
      const vi = itemVar[it.key];
      if (vi == null) continue;
      const row = vars.map((v, j) => (j === vi ? -1 : (v.type === 'plate' && v.id === it.key ? 1 : 0)));
      if (row.some(x => x === 1)) { A.push(row); b.push(0); }
    }
    let x = null;
    try { x = simplex(vars.map(v => v.obj), A, b); } catch (e) { x = null; }

    // 정수화: LP 결과를 내림 → 순서대로 실제 제작 → 남은 재료로 하나씩 탐욕 추가
    let st = Object.assign({}, stock);
    let crafted = {};
    const counts = {};
    const order = candidates.slice().sort((p, q) => pointsOf(table, q.key, 'none') - pointsOf(table, p.key, 'none'));
    function apply(it, n) {
      if (n <= 0) return 0;
      let res = tryMake(st, it, n, crafted);
      if (!res) { n = Math.min(n, maxMake(st, it)); if (n <= 0) return 0; res = tryMake(st, it, n, crafted); }
      st = res.st; crafted = res.crafted; counts[it.key] = (counts[it.key] || 0) + n;
      return n;
    }
    if (x) {
      for (const it of order) apply(it, Math.floor(x[itemVar[it.key]] + 1e-6));
    } else {
      for (const it of order) apply(it, maxMake(st, it));
    }
    for (let guard = 0; guard < 5000; guard++) {
      let best = null;
      for (const it of order) {
        if (tryMake(st, it, 1)) { best = it; break; }
      }
      if (!best) break;
      apply(best, 1);
    }

    // 플레이팅: 보너스가 큰 요리부터 금 → 은 → 청동
    const plated = {};
    const remainCount = Object.assign({}, counts);
    for (const p of PLATES.slice(1).reverse()) {
      let bowls = st[p.res] || 0;
      const foods = FOODS.filter(f => remainCount[f.key] > 0)
        .sort((u, v) => (pointsOf(table, v.key, p.id) - pointsOf(table, v.key, 'none')) - (pointsOf(table, u.key, p.id) - pointsOf(table, u.key, 'none')));
      for (const f of foods) {
        if (bowls <= 0) break;
        const k = Math.min(bowls, remainCount[f.key]);
        plated[f.key + '|' + p.id] = k;
        remainCount[f.key] -= k; bowls -= k; st[p.res] -= k;
      }
    }
    const lines = [];
    for (const it of ITEMS) {
      if (!counts[it.key]) continue;
      for (const p of PLATES) {
        const n = p.id === 'none' ? remainCount[it.key] : (plated[it.key + '|' + p.id] || 0);
        if (n > 0) {
          const unit = pointsOf(table, it.key, p.id);
          lines.push({ key: it.key, name: it.name, plate: p.id, qty: n, unit, points: unit * n });
        }
      }
    }
    lines.sort((u, v) => v.points - u.points);
    const total = lines.reduce((a, l) => a + l.points, 0);
    const used = {};
    for (const r of resIds) if (stock[r] - st[r] > 0) used[r] = stock[r] - st[r];
    return { lines, crafted, used, left: st, stock, total, lp: !!x };
  }

  /** 요리별 분석: 단독으로 최대 몇 개, 병목, 다음 1세트에 부족한 것 */
  function analyze(inv, table) {
    const st = normalizeInventory(inv);
    return ITEMS.map(it => {
      const max = maxMake(st, it);
      const step = it.kind === 'soul' ? 1 : STACK;
      const target = it.kind === 'soul' ? max + 1 : (Math.floor(max / STACK) + 1) * STACK;
      const miss = shortage(st, it, target);
      const next = shortage(st, it, max + 1);
      return {
        key: it.key, name: it.name, kind: it.kind, max, target, step,
        unit: pointsOf(table, it.key, 'none'),
        missing: miss, bottleneck: Object.keys(next),
      };
    }).sort((a, b) => (b.unit * b.max - a.unit * a.max) || (b.unit - a.unit));
  }

  // ───────────────────────── 무역 출항 ─────────────────────────
  /**
   * @param lines [{key, plate, qty}]
   * @param tickets {royal, high, normal}
   */
  function planVoyages(lines, table, tickets) {
    const slots = [];
    let rawTotal = 0;
    for (const l of lines) {
      const it = ITEM_BY_KEY[l.key];
      if (!it || !(l.qty > 0)) continue;
      const unit = pointsOf(table, l.key, l.plate);
      const stack = it.kind === 'soul' ? 1 : STACK;
      let q = l.qty;
      rawTotal += unit * q;
      while (q > 0) { const k = Math.min(stack, q); slots.push(unit * k); q -= k; }
    }
    slots.sort((a, b) => b - a);
    const voyages = [];
    for (let i = 0; i < slots.length; i += VOYAGE_SLOTS) {
      const chunk = slots.slice(i, i + VOYAGE_SLOTS);
      voyages.push({ slots: chunk.length, value: chunk.reduce((a, v) => a + v, 0) });
    }
    const pool = [];
    for (const t of TICKETS) for (let i = 0; i < (Number(tickets && tickets[t.id]) || 0); i++) pool.push(t);
    let bonus = 0;
    const usedTickets = { royal: 0, high: 0, normal: 0 };
    voyages.forEach((v, i) => {
      const t = pool[i] || null;
      v.ticket = t ? t.id : null;
      v.bonus = t ? Math.round(v.value * t.bonus) : 0;
      bonus += v.bonus;
      if (t) usedTickets[t.id]++;
    });
    const cds = voyages.filter(v => v.ticket).map(v => TICKETS.find(t => t.id === v.ticket).cooldown);
    const wait = cds.length ? cds.reduce((a, c) => a + c, 0) - Math.max.apply(null, cds) : 0;
    return {
      voyages, slots: slots.length, rawTotal, bonus, total: rawTotal + bonus,
      usedTickets, missingTickets: Math.max(0, voyages.length - pool.length), waitMin: wait,
    };
  }

  // ───────────────────────── 포맷 ─────────────────────────
  const nf = new Intl.NumberFormat('ko-KR');
  function fmt(n) { return nf.format(Math.round(n || 0)); }
  function fmtQty(n) {
    n = Math.round(n || 0);
    if (n < STACK) return fmt(n) + '개';
    const parts = [];
    let rest = n;
    if (rest >= CHEST) { parts.push(fmt(Math.floor(rest / CHEST)) + '상자'); rest %= CHEST; }
    if (rest >= STACK) { parts.push(Math.floor(rest / STACK) + '세트'); rest %= STACK; }
    if (rest) parts.push(rest + '개');
    return parts.join(' ');
  }
  function fmtPct(p) { return (p > 0 ? '+' : '') + p.toFixed(1) + '%'; }
  function plateLabel(id) { return id && id !== 'none' ? PLATE_BY_ID[id].short + ' 그릇' : ''; }

  // ───────────────────────── 디스코드 복사 ─────────────────────────
  // style: 'dark' (디스코드 다크 테마) | 'light' (라이트 테마) | 'md' (색 없이, 어느 테마든)
  // 디스코드 ansi 팔레트는 30(회색)이 어두운 배경에서 거의 안 보이므로 다크에서는 쓰지 않음
  const ESC = '\u001b[';
  const R = ESC + '0m';
  // 디스코드 글자색(31~36)은 환경에 따라 아주 흐리게 보여서 쓰지 않음.
  // 글자는 흰색(다크)/검정(라이트) 굵기로만 구분하고, 강조는 배경색 띠(흰 글씨)로 처리.
  const THEMES = {
    dark: {
      title: '1;37', sub: '0;37', sep: '0;37', name: '1;37', qty: '0;37', pts: '1;37',
      label: '0;37', value: '1;37', bonus: '1;37', total: '1;37;45', acc: '1;37;41', ship: '0;37', warn: '1;37;41',
      plate: { bronze: '1;37', silver: '1;37', gold: '1;37' },
    },
    light: {
      title: '1;30', sub: '0;30', sep: '0;30', name: '1;30', qty: '0;30', pts: '1;30',
      label: '0;30', value: '1;30', bonus: '1;30', total: '1;37;45', acc: '1;37;41', ship: '0;30', warn: '1;37;41',
      plate: { bronze: '1;30', silver: '1;30', gold: '1;30' },
    },
  };
  function padEndW(s, w) {
    let len = 0;
    for (const ch of s) len += /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/.test(ch) ? 2 : 1;
    return s + ' '.repeat(Math.max(1, w - len));
  }

  /** rows: [{name, plate, qty, pts}], summary: [{label, value, kind}] , foot: [{text, kind}] */
  function renderDiscord(doc, style) {
    if (style === 'md') {
      const out = [];
      out.push('### ' + doc.title);
      if (doc.sub) out.push('-# ' + doc.sub);
      for (const r of doc.rows) {
        const tag = r.plate && r.plate !== 'none' ? '`' + PLATE_BY_ID[r.plate].short + '` ' : '';
        out.push('> `' + fmt(r.pts) + 'P` ' + tag + '**' + r.name + '** x ' + fmtQty(r.qty));
      }
      out.push('');
      for (const s of doc.summary) {
        if (s.kind === 'total') out.push('## ' + s.label + ' ' + s.value);
        else out.push('**' + s.label + '** ' + (s.kind === 'bonus' || s.kind === 'acc' ? '`' + s.value + '`' : s.value));
      }
      for (const f of doc.foot) out.push((f.kind === 'warn' ? '**' + f.text + '**' : '-# ' + f.text));
      return out.join('\n');
    }
    const T = THEMES[style] || THEMES.dark;
    const c = (code, str) => ESC + code + 'm' + str + R;
    // 한글은 디스코드 글꼴에서 폭이 일정하지 않아서, 폭이 일정한 숫자를 왼쪽 열로 두고 오른쪽 정렬
    const ptsStr = doc.rows.map(r => fmt(r.pts) + 'P');
    const sumStr = doc.summary.map(x => x.value);
    const W = Math.max(...ptsStr.concat(sumStr).map(x => x.length), 6);
    const line = c(T.sep, '-'.repeat(W + 22));
    const out = ['```ansi'];
    out.push(c(T.title, doc.title) + (doc.sub ? '  ' + c(T.sub, doc.sub) : ''));
    out.push(line);
    doc.rows.forEach((r, i) => {
      const tag = r.plate && r.plate !== 'none' ? c(T.plate[r.plate], '[' + PLATE_BY_ID[r.plate].short + ']') + ' ' : '';
      out.push(c(T.pts, ptsStr[i].padStart(W)) + '  ' + tag + c(T.name, r.name) + c(T.qty, ' x ' + fmtQty(r.qty)));
    });
    out.push(line);
    doc.summary.forEach((x, i) => {
      if (x.kind === 'total' || x.kind === 'acc') out.push(c(T[x.kind], sumStr[i].padStart(W) + '  ' + x.label + ' '));
      else out.push(c(T[x.kind] || T.value, sumStr[i].padStart(W)) + '  ' + c(T.label, x.label));
    });
    for (const f of doc.foot) out.push(c(T[f.kind] || T.ship, f.text));
    out.push('```');
    return out.join('\n');
  }

  function discordTrade(opts, style) {
    const { island, date, lines, table, plan, existing } = opts;
    const rows = lines.filter(l => ITEM_BY_KEY[l.key] && l.qty > 0).map(l => ({
      name: ITEM_BY_KEY[l.key].name, plate: l.plate, qty: l.qty, pts: pointsOf(table, l.key, l.plate) * l.qty,
    }));
    const summary = [{ label: '물품 합계', value: fmt(plan.rawTotal) + 'P', kind: 'value' }];
    if (plan.bonus) summary.push({ label: '티켓 보너스', value: '+' + fmt(plan.bonus) + 'P', kind: 'bonus' });
    summary.push({ label: '이번 무역', value: '+' + fmt(plan.total) + 'P', kind: 'total' });
    if (existing) {
      summary.push({ label: '기존 포인트', value: fmt(existing) + 'P', kind: 'value' });
      summary.push({ label: '섬 누적 예상', value: fmt(existing + plan.total) + 'P', kind: 'acc' });
    }
    const t = plan.usedTickets;
    const tk = [t.royal ? '로얄 ' + t.royal : '', t.high ? '고급 ' + t.high : '', t.normal ? '일반 ' + t.normal : ''].filter(Boolean).join(' · ');
    const foot = [{ text: '출항 ' + plan.voyages.length + '회' + (tk ? ' (' + tk + ')' : '') + (plan.waitMin ? ' · 대기 ' + plan.waitMin + '분' : ''), kind: 'ship' }];
    if (plan.missingTickets) foot.push({ text: '티켓 ' + plan.missingTickets + '장 부족 (보너스 없이 계산)', kind: 'warn' });
    return renderDiscord({ title: (island || '우리 섬') + ' 무역 예상', sub: date + ' 시세', rows, summary, foot }, style);
  }

  function discordCook(opts, style) {
    const { date, result } = opts;
    const rows = result.lines.map(l => ({ name: l.name, plate: l.plate, qty: l.qty, pts: l.points }));
    const cr = Object.keys(result.crafted).filter(k => result.crafted[k] > 0 && RES_BY_ID[k]);
    const foot = cr.length ? [{ text: '재료요리: ' + cr.map(k => RES_BY_ID[k].name + ' ' + fmt(result.crafted[k])).join(', '), kind: 'ship' }] : [];
    return renderDiscord({ title: '지금 재료로 가장 이득인 요리', sub: date + ' 시세', rows,
      summary: [{ label: '예상 무역 포인트', value: fmt(result.total) + 'P', kind: 'total' }], foot }, style);
  }
  // ───────────────────────── 계산기 수식 ─────────────────────────
  function evalExpr(src) {
    const s = String(src).replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    let i = 0;
    function peek() { while (s[i] === ' ') i++; return s[i]; }
    function num() {
      peek();
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new Error('bad');
      i += m[0].length;
      let v = parseFloat(m[0]);
      // 단위 접미사
      const rest = s.slice(i);
      if (rest.startsWith('상자')) { v *= CHEST; i += 2; }
      else if (rest.startsWith('세트')) { v *= STACK; i += 2; }
      else if (rest.startsWith('개')) { i += 1; }
      return v;
    }
    function factor() {
      const c = peek();
      if (c === '-') { i++; return -factor(); }
      if (c === '+') { i++; return factor(); }
      if (c === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('paren'); i++; return post(v); }
      return post(num());
    }
    function post(v) { while (peek() === '%') { i++; v /= 100; } return v; }
    function term() {
      let v = factor();
      for (;;) {
        const c = peek();
        if (c === '*') { i++; v *= factor(); } else if (c === '/') { i++; v /= factor(); } else return v;
      }
    }
    function expr() {
      let v = term();
      for (;;) {
        const c = peek();
        if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v;
      }
    }
    const v = expr();
    if (peek() !== undefined) throw new Error('trailing');
    return v;
  }

  return {
    STACK, CHEST, UNITS, VOYAGE_SLOTS, RES, RES_BY_ID, GROUPS, CRAFT, FOODS, SOULS, ITEMS, ITEM_BY_KEY,
    PLATES, PLATE_BY_ID, TICKETS, DAILY_LIMIT, TOTAL_LIMIT,
    buildPriceTable, pointsOf, changePct, tomorrowRange, apiKey,
    normalizeInventory, maxMake, shortage, tryMake, simplex, optimize, analyze, planVoyages,
    fmt, fmtQty, fmtPct, plateLabel, discordTrade, discordCook, evalExpr,
  };
});
