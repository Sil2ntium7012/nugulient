/* 계산기 화면 (Nova Calculator 와 같은 코드, 너굴라이언트 안에 넣음) */
(function () {
  'use strict';
  const NG = window.NG;
  const api = window.api || null;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ───────── 저장 ─────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ng.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ng.' + k, JSON.stringify(v)); } catch { /* 무시 */ } },
  };

  const S = {
    page: store.get('page', 'market'),
    theme: store.get('theme', 'black'),
    data: null,           // {prices, history, fetchedAt, error, nextRefresh}
    table: null,
    marketPlate: store.get('marketPlate', 'none'),
    marketSort: store.get('marketSort', 'base'),
    dstyle: store.get('dstyle', 'dark'),
    dpreview: store.get('dpreviewOpen', false),
    selected: store.get('selected', 'food18'),
    cart: store.get('cart', []),
    trade: Object.assign({ island: '', existing: 0, tickets: { royal: 0, high: 0, normal: 0 } }, store.get('trade', {})),
    add: { key: 'food18', plate: 'none', qty: 1, unit: '세트' },
    inv: store.get('inv', {}),
    invAll: store.get('invAll', false),
    invAdd: { id: 'wheat', qty: 1, unit: '세트' },
    settings: { closeToTray: true, notify: true, autoLaunch: false },
  };

  // ───────── 공통 조각 ─────────
  function icon(src, name, cls) {
    const ph = esc((name || '?').slice(0, 1));
    if (!src) return `<span class="ico ${cls || ''}"><span class="ph">${ph}</span></span>`;
    return `<span class="ico ${cls || ''}"><img src="${src}" alt="" decoding="sync" data-ph="${ph}"></span>`;
  }
  function chg(p) {
    const cls = p > 0.05 ? 'up' : p < -0.05 ? 'down' : 'flat';
    const arrow = p > 0.05 ? '▲' : p < -0.05 ? '▼' : '–';
    return `<span class="chg ${cls}">${arrow} ${Math.abs(p).toFixed(1)}%</span>`;
  }
  function plateIcon(id) { const p = NG.PLATE_BY_ID[id]; return p && p.icon ? `<img class="bowl" src="${p.icon}" alt="" data-ph="">` : ''; }
  function plateTag(id) { return id && id !== 'none' ? `<span class="plate-tag ${id}">${plateIcon(id)}${NG.PLATE_BY_ID[id].short}</span>` : ''; }
  function plateSeg(cur, attr, sm) {
    return `<div class="seg ${sm ? 'sm' : ''}">${NG.PLATES.map(p => `<button data-${attr}="${p.id}" data-plate="${p.id}" class="${p.id === cur ? 'on' : ''}">${p.id === 'none' ? '일반' : plateIcon(p.id) + p.short}</button>`).join('')}</div>`;
  }
  let toastT = null;
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = `<span class="dot ok"></span>${esc(msg)}`;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1900);
  }
  async function copy(text, msg) {
    try {
      if (api) await api.copy(text); else await navigator.clipboard.writeText(text);
      toast(msg || '복사했어요');
    } catch { toast('복사에 실패했어요'); }
  }
  const P = n => NG.fmt(n);

  // ───────── 데이터 ─────────
  function setData(d) {
    const same = S.data && d && S.data.prices && d.prices && S.data.prices.updated === d.prices.updated && S.data.error === d.error;
    S.data = d;
    if (same) { renderStatus(); return; }
    S.table = d && d.prices ? NG.buildPriceTable(d.prices) : null;
    renderStatus();
    render();
  }
  function historyFor(key, plate) {
    const h = S.data && S.data.history;
    const mult = NG.PLATE_BY_ID[plate || 'none'].mult;
    const days = (h && h.days) ? h.days.slice() : [];
    const pts = days.filter(d => d.prices && d.prices[key] != null).map(d => ({ date: d.date, v: Math.round(d.prices[key] * mult) }));
    const today = S.table && S.table.map[key];
    if (today && S.table.date && !pts.some(p => p.date === S.table.date)) pts.push({ date: S.table.date, v: Math.round(today.price * mult) });
    return pts.slice(-30);
  }
  function baseOf(key, plate) {
    const r = S.table && S.table.map[NG.apiKey(key, plate)];
    return r ? r.base : 0;
  }

  // ───────── 상태 패널 ─────────
  function renderStatus() {
    const d = S.data;
    const dot = $('#statusDot'), title = $('#statusTitle'), sub = $('#statusSub'), pill = $('#datePill');
    dot.className = 'dot';
    if (!d || !d.prices) {
      title.textContent = d && d.error ? '시세를 못 받아왔어요' : '시세 확인 중';
      sub.textContent = d && d.error ? '인터넷 연결을 확인해 주세요' : '잠시만요…';
      if (d && d.error) dot.classList.add('err');
      pill.textContent = '시세 없음';
      return;
    }
    const fetched = d.fetchedAt ? new Date(d.fetchedAt) : null;
    const time = fetched ? fetched.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    if (d.error) { dot.classList.add('old'); title.textContent = '저장된 시세 사용 중'; sub.textContent = '갱신 실패 · 5분 뒤 재시도'; }
    else { dot.classList.add('ok'); title.textContent = d.prices.date + ' 시세 적용됨'; sub.textContent = '마지막 갱신 ' + time; }
    pill.innerHTML = `<span class="dot ${d.error ? 'old' : 'ok'}" style="width:6px;height:6px;box-shadow:none"></span>${esc(d.prices.date)} 시세`;
  }
  function tickCountdown() {
    const el = $('#countdown');
    let next = S.data && S.data.nextRefresh;
    if (!next) {
      // 브라우저 미리보기용: 다음 00:30 KST
      const off = 9 * 3600e3, k = new Date(Date.now() + off);
      next = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), 0, 30) - off;
      if (next <= Date.now()) next += 864e5;
    }
    let s = Math.max(0, Math.floor((next - Date.now()) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0'); s %= 3600;
    el.textContent = `${h}:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // ───────── 라우팅 ─────────
  function render() {
    closeCopyMenu();
    $$('.nav').forEach(b => b.classList.toggle('on', b.dataset.page === S.page));
    const main = $('#main');
    const st = main.scrollTop;
    const fn = { market: pageMarket, trade: pageTrade, cook: pageCook, settings: pageSettings }[S.page] || pageMarket;
    // 페이지를 옮길 때만 등장 애니메이션 (새로고침·입력 때는 번쩍이지 않게)
    const enter = S.shownPage !== S.page;
    S.shownPage = S.page;
    main.innerHTML = `<div class="page${enter ? ' enter' : ''}">${fn()}</div>`;
    main.scrollTop = st;
    if (S.page === 'market') drawDetailChart();
  }
  function go(page) { S.page = page; store.set('page', page); $('#main').scrollTop = 0; render(); }
  window.__ncGo = (p) => { if (p && p !== S.page) go(p); };

  function noData() {
    return `<div class="card"><div class="empty">${S.data && S.data.error
      ? '너굴마을 시세를 받아오지 못했어요.<br>인터넷 연결을 확인하고 오른쪽 위 새로고침을 눌러 주세요.'
      : '시세를 불러오는 중이에요…'}</div></div>`;
  }

  // ═════════════════ 시세 ═════════════════
  function pageMarket() {
    if (!S.table) return head('오늘의 <em>요리 시세</em>', '매일 00시 변동 · 00:30에 자동으로 받아와요', refreshButton()) + noData();
    const plate = S.marketPlate;
    const foods = NG.FOODS.map(f => {
      const pts = NG.pointsOf(S.table, f.key, plate);
      return { f, pts, pct: NG.changePct(S.table, f.key), range: NG.tomorrowRange(S.table, f.key, plate) };
    });
    const sorters = {
      base: (a, b) => NG.FOODS.indexOf(a.f) - NG.FOODS.indexOf(b.f),
      price: (a, b) => b.pts - a.pts,
      up: (a, b) => b.pct - a.pct,
      down: (a, b) => a.pct - b.pct,
    };
    foods.sort(sorters[S.marketSort] || sorters.base);
    const ups = foods.filter(x => x.pct > 0).length, downs = foods.filter(x => x.pct < 0).length;
    const top = foods.slice().sort((a, b) => b.pts - a.pts)[0];
    const riser = foods.slice().sort((a, b) => b.pct - a.pct)[0];
    const faller = foods.slice().sort((a, b) => a.pct - b.pct)[0];
    const sel = NG.ITEM_BY_KEY[S.selected] && NG.ITEM_BY_KEY[S.selected].kind === 'food' ? S.selected : top.f.key;
    S.selected = sel;
    const sf = foods.find(x => x.f.key === sel);

    return head('오늘의 <em>요리 시세</em>', '무역 포인트 = 오늘 요리 판매가 · 하루 최대 ±5%, 기준가 대비 ±20%까지 변동', refreshButton()) + `
    <section class="hero">
      <div class="card accent hero-chart">
        <div class="detail-top">
          ${icon(sf.f.icon, sf.f.name, 'lg')}
          <div><div class="name">${esc(sf.f.name)} ${plateTag(plate)}</div>
          <div class="meta">기준가 ${P(baseOf(sel, plate))}P · ${chg(sf.pct)}</div></div>
          <div class="detail-price"><b>${P(sf.pts)}<small>P</small></b></div>
        </div>
        <div class="chart-wrap" id="detailChart"></div>
        <div class="range-legend">
          <span>내일 예상 <b>${sf.range ? P(sf.range.lo) + ' ~ ' + P(sf.range.hi) + 'P' : '-'}</b></span>
          <span>바닥(-20%) <b>${P(baseOf(sel, plate) * 0.8)}</b></span>
          <span>천장(+20%) <b>${P(baseOf(sel, plate) * 1.2)}</b></span>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></span>오늘 한눈에</h2><span class="sub">${esc(S.table.date)}</span></div>
        <div class="stat-grid">
          <div class="stat wide"><div class="k">포인트 1위</div><div class="v">${esc(top.f.name)} · ${P(top.pts)}P</div><div class="s">${plate === 'none' ? '그릇 없이' : NG.PLATE_BY_ID[plate].name + ' 기준'} 1세트 ${P(top.pts * 64)}P</div></div>
          <div class="stat"><div class="k">가장 많이 오름</div><div class="v" style="color:var(--up)">${NG.fmtPct(riser.pct)}</div><div class="s">${esc(riser.f.name)}</div></div>
          <div class="stat"><div class="k">가장 많이 내림</div><div class="v" style="color:var(--down)">${NG.fmtPct(faller.pct)}</div><div class="s">${esc(faller.f.name)}</div></div>
          <div class="stat"><div class="k">상승 / 하락</div><div class="v"><span style="color:var(--up)">${ups}</span> <span style="color:var(--mute)">/</span> <span style="color:var(--down)">${downs}</span></div><div class="s">전체 ${foods.length}개 요리</div></div>
          <div class="stat"><div class="k">맛의 기원</div><div class="v">380만 · 240만</div><div class="s">海 · 地 고정 포인트</div></div>
        </div>
      </div>
    </section>
    <div class="toolbar">
      ${plateSeg(plate, 'mplate')}
      <div class="seg">${[['base', '기본순'], ['price', '포인트 높은 순'], ['up', '기준가 대비 ↑'], ['down', '기준가 대비 ↓']].map(([k, l]) => `<button data-msort="${k}" class="${S.marketSort === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>
    <section class="food-grid">${foods.map(x => foodCard(x, plate)).join('')}</section>`;
  }

  function foodCard(x, plate) {
    const hist = historyFor(x.f.key, plate);
    const base = baseOf(x.f.key, plate);
    const pctPos = Math.max(-20, Math.min(20, x.pct));
    const left = pctPos >= 0 ? 50 : 50 + pctPos * 2.5;
    const width = Math.abs(pctPos) * 2.5;
    const color = x.pct >= 0 ? 'var(--up)' : 'var(--down)';
    return `<button class="food-card ${x.f.key === S.selected ? 'on' : ''}" data-sel="${x.f.key}">
      <div class="row1">${icon(x.f.icon, x.f.name)}<div style="min-width:0"><div class="nm">${esc(x.f.name)}</div><div class="pr">${P(x.pts)}<small>P</small></div></div>${chg(x.pct)}</div>
      ${sparkline(hist.map(h => h.v), base, color)}
      <div class="rangebar"><span class="mid"></span><span class="fill" style="left:${left}%;width:${Math.max(1.5, width)}%;background:${color}"></span></div>
      <div class="tm"><span>내일 ${x.range ? P(x.range.lo) + '~' + P(x.range.hi) : '-'}</span><span>±20%</span></div>
    </button>`;
  }

  function sparkline(vals, base, color) {
    if (vals.length < 2) return '<svg class="spark"></svg>';
    const lo = base * 0.8, hi = base * 1.2;
    const W = 200, H = 34;
    const xs = i => (i / (vals.length - 1)) * W;
    const ys = v => H - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - 4) - 2;
    const d = vals.map((v, i) => (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(v).toFixed(1)).join(' ');
    const area = d + ` L${W} ${H} L0 ${H} Z`;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${ys(base)}" y2="${ys(base)}" stroke="var(--line-2)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" stroke-width="1"/>
      <path d="${area}" fill="url(#${id})" stroke="none"/>
      <path d="${d}" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
    </svg>`;
  }

  function drawDetailChart() {
    const box = $('#detailChart');
    if (!box || !S.table) return;
    const key = S.selected, plate = S.marketPlate;
    const hist = historyFor(key, plate);
    const base = baseOf(key, plate);
    const W = box.clientWidth || 600, H = box.clientHeight || 200;
    const padL = 54, padR = 12, padT = 10, padB = 24;
    const lo = base * 0.8, hi = base * 1.2;
    const x = i => padL + (hist.length < 2 ? 0 : (i / (hist.length - 1)) * (W - padL - padR));
    const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const pct = NG.changePct(S.table, key);
    const color = pct >= 0 ? 'var(--up)' : 'var(--down)';
    const grid = [-20, -10, 0, 10, 20].map(p => {
      const v = base * (1 + p / 100);
      return `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line${p === 0 ? '-2' : ''})" ${p === 0 ? 'stroke-dasharray="4 4"' : ''} stroke-width="1"/>
        <text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" fill="var(--mute)" font-size="11" stroke="none">${p === 0 ? '기준' : (p > 0 ? '+' : '') + p + '%'}</text>`;
    }).join('');
    const d = hist.map((h, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(h.v).toFixed(1)).join(' ');
    const area = hist.length > 1 ? d + ` L${x(hist.length - 1)} ${H - padB} L${x(0)} ${H - padB} Z` : '';
    const labels = hist.map((h, i) => (i % Math.ceil(hist.length / 6) === 0 || i === hist.length - 1)
      ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" fill="var(--mute)" font-size="11" stroke="none">${h.date.slice(5).replace('-', '/')}</text>` : '').join('');
    const dots = hist.map((h, i) => `<circle cx="${x(i)}" cy="${y(h.v)}" r="${i === hist.length - 1 ? 4.5 : 2.5}" fill="${i === hist.length - 1 ? color : 'var(--card)'}" stroke="${color}" stroke-width="1.6"/>`).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="dg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" rx="10" fill="var(--chart-band)" stroke="none"/>
      ${grid}<path d="${area}" fill="url(#dg)" stroke="none"/><path d="${d}" stroke="${color}" stroke-width="2.4"/>${dots}${labels}
      <rect id="hoverZone" x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" stroke="none"/>
    </svg><div class="chart-tip" id="chartTip"></div>`;
    const zone = $('#hoverZone', box), tip = $('#chartTip', box);
    zone.addEventListener('mousemove', e => {
      const r = box.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let idx = Math.round(((mx - padL) / (W - padL - padR)) * (hist.length - 1));
      idx = Math.max(0, Math.min(hist.length - 1, idx));
      const h = hist[idx];
      const p = ((h.v / base - 1) * 100);
      tip.innerHTML = `${h.date} · <b>${P(h.v)}P</b> <span style="color:${p >= 0 ? 'var(--up)' : 'var(--down)'}">${NG.fmtPct(p)}</span>`;
      tip.style.left = x(idx) + 'px'; tip.style.top = y(h.v) + 'px'; tip.style.opacity = 1;
    });
    zone.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
  }

  function refreshButton() {
    return `<button class="btn soft" data-refresh="1" title="F5"><svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>위키에서 새로고침</button>`;
  }
  function head(title, sub, right) {
    return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div>${right || ''}</div>`;
  }

  // ═════════════════ 무역 ═════════════════
  function cartLines() { return S.cart.map(c => ({ key: c.key, plate: c.plate, qty: (Number(c.qty) || 0) * NG.UNITS[c.unit || '개'] })); }
  function saveCart() { store.set('cart', S.cart); }
  function saveTrade() { store.set('trade', S.trade); }

  function pageTrade() {
    if (!S.table) return head('<em>무역</em> 포인트 계산', '바구니에 담으면 섬 무역 포인트를 예상해요') + noData();
    const lines = cartLines();
    const plan = NG.planVoyages(lines, S.table, S.trade.tickets);
    const existing = Number(S.trade.existing) || 0;
    const a = S.add, it = NG.ITEM_BY_KEY[a.key];
    const addPts = NG.pointsOf(S.table, a.key, a.plate);
    const maxVal = Math.max(1, ...lines.map(l => NG.pointsOf(S.table, l.key, l.plate) * l.qty));

    return head('<em>무역</em> 포인트 계산', `${esc(S.table.date)} 시세 · 1세트 64개 · 1상자 3,456개 · 한 번에 28세트 출항`) + `
    <div class="two-col">
      <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
        <section class="card">
          <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></span>물품 담기</h2><span class="sub">개당 ${P(addPts)}P</span></div>
          <div class="add-row">
            <div class="field"><label>요리</label>${picker(a.key, 'add')}</div>
            <div class="field"><label>그릇</label>${it.kind === 'soul' ? '<div class="seg"><button class="on">특수요리</button></div>' : plateSeg(a.plate, 'aplate')}</div>
            <div class="field"><label>수량</label><div class="qty"><input class="input num" id="addQty" type="number" min="0" value="${esc(a.qty)}"><select class="select" id="addUnit" style="width:78px">${Object.keys(NG.UNITS).map(u => `<option ${u === a.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
            <button class="btn primary" id="addBtn" style="height:38px"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>담기</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>바구니 <span class="badge">${S.cart.length}</span></h2><div class="head-btns">${S.cart.length ? '<button class="ghost-btn" data-export="cart">내보내기</button>' : ''}<button class="ghost-btn" data-import="cart">불러오기</button>${S.cart.length ? '<button class="ghost-btn" id="clearCart">비우기</button>' : ''}</div></div>
          ${S.cart.length ? `<div class="cart-list">${S.cart.map((c, i) => cartRow(c, i, maxVal)).join('')}</div>`
            : '<div class="empty">아직 담은 물품이 없어요.<br>위에서 요리를 골라 담거나, 요리 탭의 최적 조합을 그대로 담을 수 있어요.</div>'}
        </section>
      </div>
      <aside class="sticky">
        <section class="card accent">
          <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M3 17l2 3h14l2-3"/><path d="M5 17V12l7-3 7 3v5"/></svg></span>무역 예상</h2><div class="head-btns"><button class="ghost-btn sm" data-export="trade">내보내기</button><button class="ghost-btn sm" data-import="trade">불러오기</button></div></div>
          <div class="form-grid">
            <div class="field"><label>섬 이름</label><input class="input" id="island" placeholder="우리 섬" value="${esc(S.trade.island)}"></div>
            <div class="field"><label>이미 넣은 포인트</label><input class="input num" id="existing" type="text" inputmode="numeric" placeholder="0" value="${existing ? P(existing) : ''}"></div>
          </div>
          <div class="field"><label>무역선 티켓</label></div>
          <div class="ticket-rows">${NG.TICKETS.map(t => `<div class="ticket-row"><div class="tname">${t.name} 티켓<small>+${Math.round(t.bonus * 100)}% · ${t.cooldown ? '쿨타임 ' + t.cooldown + '분' : '쿨타임 없음'}</small></div>
            <div class="stepper"><button data-tk="${t.id}" data-d="-1">−</button><input data-tki="${t.id}" value="${S.trade.tickets[t.id] || 0}" inputmode="numeric"><button data-tk="${t.id}" data-d="1">+</button></div></div>`).join('')}</div>
          ${plan.voyages.length ? `<div class="voyage-strip">${plan.voyages.map((v, i) => `<span class="voyage ${v.ticket || 'none'}" title="${P(v.value)}P">${i + 1}회 · ${v.slots}칸 · ${v.ticket ? NG.TICKETS.find(t => t.id === v.ticket).name : '티켓 없음'}</span>`).join('')}</div>` : ''}
          ${plan.missingTickets ? `<div class="warn">출항 ${plan.voyages.length}회에 티켓이 ${plan.missingTickets}장 부족해요. 부족한 회차는 보너스 없이 계산했어요.</div>` : ''}
          <div class="sum-list">
            <div class="sum-line"><span>물품 합계</span><b>${P(plan.rawTotal)}P</b></div>
            <div class="sum-line"><span>티켓 보너스</span><b style="color:var(--up)">+${P(plan.bonus)}P</b></div>
            <div class="sum-line"><span>출항</span><b>${plan.voyages.length}회 · ${plan.slots}세트${plan.waitMin ? ' · 대기 ' + plan.waitMin + '분' : ''}</b></div>
            <div class="sum-line big"><span>이번 무역</span><b>+${P(plan.total)}P</b></div>
            <div class="sum-line total"><span>섬 누적 예상</span><b>${P(existing + plan.total)}P</b></div>
          </div>
          <div class="btn-row"><button class="btn discord" id="copyTrade" ${S.cart.length ? '' : 'disabled style="opacity:.5"'}>${discordIcon()}디스코드로 복사</button></div>
          <p class="hint" style="margin:10px 0 0">보너스는 회차마다 담긴 물품 포인트에 붙어요. 비싼 물품부터 좋은 티켓 회차에 싣도록 계산했어요.</p>
        </section>
      </aside>
    </div>`;
  }

  function cartRow(c, i, maxVal) {
    const it = NG.ITEM_BY_KEY[c.key];
    if (!it) return '';
    const unitPts = NG.pointsOf(S.table, c.key, c.plate);
    const n = (Number(c.qty) || 0) * NG.UNITS[c.unit || '개'];
    const total = unitPts * n;
    return `<div class="cart-row">
      ${icon(it.icon, it.name)}
      <div style="min-width:0"><div class="nm"><span>${esc(it.name)}</span>${plateTag(c.plate)}</div>
        <div class="unit">개당 ${P(unitPts)}P · ${NG.fmtQty(n)}</div>
        <div class="bar"><i style="width:${Math.max(2, (total / maxVal) * 100)}%"></i></div></div>
      <div class="qty"><input class="input num" data-cq="${i}" type="number" min="0" value="${esc(c.qty)}"><select class="select" data-cu="${i}">${Object.keys(NG.UNITS).map(u => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div class="sum">${P(total)}P<small>${c.plate && c.plate !== 'none' ? NG.PLATE_BY_ID[c.plate].name : '그릇 없음'}</small></div>
      <button class="del" data-del="${i}" aria-label="삭제"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
    </div>`;
  }

  function picker(cur, id) {
    const it = NG.ITEM_BY_KEY[cur];
    return `<div class="picker" data-picker="${id}">
      <button class="picker-btn" data-pick-open="${id}">${icon(it.icon, it.name)}<span>${esc(it.name)}</span><em>${P(NG.pointsOf(S.table, it.key, 'none'))}P</em></button>
    </div>`;
  }
  function openPicker(id) {
    const host = $(`[data-picker="${id}"]`);
    if (!host || $('.picker-pop', host)) return;
    const pop = document.createElement('div');
    pop.className = 'picker-pop';
    let list;
    if (id === 'inv') {
      list = q => NG.RES.filter(r => !q || r.name.includes(q) || r.group.includes(q)).map(r => `<button class="pick-item ${r.id === S.invAdd.id ? 'on' : ''}" data-ipick="${r.id}">${icon(r.icon, r.name, 'sm')}<span>${esc(r.name)}</span><em>${esc(r.group)}${S.inv[r.id] && Number(S.inv[r.id].qty) > 0 ? ' · ' + esc(S.inv[r.id].qty) + esc(S.inv[r.id].unit || '') : ''}</em></button>`).join('');
    } else {
      const items = NG.ITEMS.slice().sort((a, b) => NG.pointsOf(S.table, b.key, 'none') - NG.pointsOf(S.table, a.key, 'none'));
      list = q => items.filter(i => !q || i.name.includes(q)).map(i => `<button class="pick-item ${i.key === S.add.key ? 'on' : ''}" data-pick="${i.key}">${icon(i.icon, i.name, 'sm')}<span>${esc(i.name)}</span><em>${P(NG.pointsOf(S.table, i.key, 'none'))}P ${i.kind === 'food' ? chg(NG.changePct(S.table, i.key)) : ''}</em></button>`).join('');
    }
    pop.innerHTML = `<input class="input" placeholder="${id === 'inv' ? '재료 검색' : '요리 검색'}" aria-label="검색"><div class="pick-list">${list('')}</div>`;
    host.appendChild(pop);
    const card = host.closest('.card');
    if (card) card.classList.add('raise');
    const inp = $('input', pop);
    inp.focus();
    inp.addEventListener('input', () => { $('.pick-list', pop).innerHTML = list(inp.value.trim()); });
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') { pop.remove(); if (card) card.classList.remove('raise'); } });
    setTimeout(() => document.addEventListener('mousedown', function close(e) {
      if (!host.contains(e.target)) { pop.remove(); if (card) card.classList.remove('raise'); document.removeEventListener('mousedown', close); }
    }), 0);
  }

  function discordIcon() {
    return '<svg viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M19.6 5.3A16.8 16.8 0 0 0 15.4 4l-.5 1a15.6 15.6 0 0 0-5.8 0L8.6 4a16.8 16.8 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.7-.8l.4-.3a12 12 0 0 0 11.4 0l.4.3-1.7.8 1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.5-.7-8.4-3.1-11.7zM8.5 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1zm7 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1z"/></svg>';
  }

  // ═════════════════ 요리 ═════════════════
  let cookCache = null;
  function computeCook() {
    const key = JSON.stringify(S.inv) + '|' + (S.table && S.table.date) + '|' + (S.table && S.table.updated);
    if (cookCache && cookCache.key === key) return cookCache;
    const result = NG.optimize(S.inv, S.table);
    const analysis = NG.analyze(S.inv, S.table);
    cookCache = { key, result, analysis };
    return cookCache;
  }

  function qtyChip(id, n, cls) {
    const r = NG.RES_BY_ID[id] || NG.ITEM_BY_KEY[id];
    if (!r) return '';
    return `<span class="chip ${cls || ''}">${icon(r.icon, r.name)}<span>${esc(r.name)}</span><b>${NG.fmtQty(n)}</b></span>`;
  }
  /** 부족 칩: 잉걸불 4색이 같은 개수면 한 칸으로 묶기 */
  function missChips(missing) {
    const E = ['emberGreen', 'emberBlue', 'emberGray', 'emberRed'];
    const keys = Object.keys(missing);
    const same = E.every(k => missing[k] && missing[k] === missing[E[0]]);
    let out = keys.filter(k => !(same && E.includes(k))).map(k => qtyChip(k, missing[k], 'miss')).join('');
    if (same) out += `<span class="chip miss">${icon(NG.RES_BY_ID.emberGold.icon, '잉')}<span>잉걸불 4색 각</span><b>${NG.fmtQty(missing[E[0]])}</b></span>`;
    return out;
  }
  const ARROW = '<span class="step-arrow"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>';

  /** 최적화 결과 → 만드는 순서 */
  function buildSteps(result) {
    const steps = [];
    // 1) 재료요리 / 황금 잉걸불
    const crafts = Object.keys(result.crafted).filter(k => result.crafted[k] > 0).map(k => {
      const n = result.crafted[k], recipe = NG.CRAFT[k];
      return { inputs: Object.keys(recipe).map(r => [r, recipe[r] * n]), out: [k, n] };
    });
    if (crafts.length) steps.push({ title: '재료요리 만들기', where: '요리실 NPC 야미', rows: crafts });
    // 2) 요리
    const byKey = {};
    for (const l of result.lines) byKey[l.key] = (byKey[l.key] || 0) + l.qty;
    const cooks = Object.keys(byKey).map(k => {
      const it = NG.ITEM_BY_KEY[k], n = byKey[k];
      return { inputs: Object.keys(it.use).map(r => [r, it.use[r] * n]), out: [k, n] };
    });
    if (cooks.length) steps.push({ title: '요리하기', where: '요리실 NPC 야미', rows: cooks });
    // 3) 플레이팅
    const plates = [];
    for (const p of NG.PLATES.slice(1)) {
      const lines = result.lines.filter(l => l.plate === p.id);
      const used = lines.reduce((a, l) => a + l.qty, 0);
      if (!used) continue;
      const have = Math.max(0, Math.floor((Number((S.inv[p.res] || {}).qty) || 0) * NG.UNITS[(S.inv[p.res] || {}).unit || '개']));
      const fromIngot = Math.max(0, used - have);
      if (fromIngot) plates.push({ inputs: [[p.ingot, fromIngot * 3]], out: [p.res, fromIngot], note: 'V자로 3개' });
      for (const l of lines) plates.push({ inputs: [[p.res, l.qty], [l.key, l.qty]], out: [l.key, l.qty], plate: p.id });
    }
    if (plates.length) steps.push({ title: '그릇에 담기', where: '제작대', rows: plates });
    return steps;
  }

  function stepsCard(result) {
    const steps = buildSteps(result);
    if (!steps.length) return '';
    const coal = result.used.coal || 0;
    return `<section class="card">
      <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg></span>만드는 순서</h2>
        <span class="sub">요리용 석탄 총 ${NG.fmtQty(coal)} 사용</span></div>
      <div class="steps">${steps.map((st, i) => `
        <div class="step"><div class="step-head"><span class="step-no">${i + 1}</span><b>${st.title}</b><small>${st.where}</small></div>
          ${st.rows.map(r => `<div class="step-row"><div class="chips">${r.inputs.map(([id, n]) => qtyChip(id, n)).join('<span class="plus">+</span>')}</div>${ARROW}
            <div class="chips">${r.plate ? `<span class="chip out">${plateIcon(r.plate)}${icon(NG.ITEM_BY_KEY[r.out[0]].icon, NG.ITEM_BY_KEY[r.out[0]].name)}<span>${esc(NG.PLATE_BY_ID[r.plate].short)} ${esc(NG.ITEM_BY_KEY[r.out[0]].name)}</span><b>${NG.fmtQty(r.out[1])}</b></span>` : qtyChip(r.out[0], r.out[1], 'out')}</div></div>`).join('')}
        </div>`).join('')}</div>
    </section>`;
  }

  function pageCook() {
    if (!S.table) return head('<em>요리</em> 최적화', '가진 재료로 무역 포인트가 가장 높은 조합') + noData();
    const hasInv = Object.values(S.inv).some(v => v && Number(v.qty) > 0);
    const { result, analysis } = computeCook();
    const maxP = Math.max(1, ...result.lines.map(l => l.points));
    const bestNow = analysis.filter(a => a.max > 0).sort((a, b) => b.unit - a.unit)[0];

    return head('<em>요리</em> 최적화', '재료요리는 중첩 1개(64개)로도 만들 수 있어요 · 가진 걸 모두 넣으면 지금 가장 이득인 조합을 찾아요',
      `<div class="btn-row" style="flex:none"><button class="btn soft" data-export="inv">재료 내보내기</button><button class="btn soft" data-import="inv">불러오기</button><button class="btn soft" id="invReset">초기화</button></div>`) + `
    ${invCard()}
    <section class="card accent">
      <div class="result-hero">
        <div><div class="lbl">지금 재료로 만들 수 있는 최대 무역 포인트</div><div class="big">${P(result.total)}<small>P</small></div></div>
        ${bestNow ? `<div class="stat" style="min-width:200px"><div class="k">만들 수 있는 것 중 개당 최고</div><div class="v">${esc(bestNow.name)}</div><div class="s">개당 ${P(bestNow.unit)}P · 최대 ${NG.fmtQty(bestNow.max)}</div></div>` : ''}
        <div class="actions">
          <button class="btn soft" id="toCart" ${result.lines.length ? '' : 'disabled style="opacity:.5"'}><svg viewBox="0 0 24 24"><path d="M3 4h2l2 12h11l2-8H6"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>바구니에 담기</button>
          <button class="btn discord" id="copyCook" ${result.lines.length ? '' : 'disabled style="opacity:.5"'}>${discordIcon()}디스코드로 복사</button>
        </div>
      </div>
      ${result.lines.length ? `<div class="plan-list">${result.lines.map(l => {
        const it = NG.ITEM_BY_KEY[l.key];
        return `<div class="plan-row">${icon(it.icon, it.name)}<div style="min-width:0"><div class="nm">${esc(l.name)} ${plateTag(l.plate)}</div><div class="sub">개당 ${P(l.unit)}P</div><div class="bar"><i style="width:${(l.points / maxP) * 100}%"></i></div></div><div class="q">${NG.fmtQty(l.qty)}</div><div class="p">${P(l.points)}P</div></div>`;
      }).join('')}</div>` : `<div class="empty" style="margin-top:16px">${hasInv ? '이 재료로는 만들 수 있는 요리가 없어요. 아래에서 무엇이 부족한지 확인해 보세요.' : '위에 가진 재료를 넣으면 바로 계산해요.'}</div>`}
    </section>

    ${stepsCard(result)}

    <section class="card">
      <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></span>요리별로 보기</h2><span class="sub">그 요리만 만든다면 · 다음 1세트에 부족한 재료</span></div>
      <div class="ana-list">${analysis.map((a, i) => {
        const it = NG.ITEM_BY_KEY[a.key];
        const miss = Object.keys(a.missing);
        return `<div class="ana-row ${i === 0 && a.max > 0 ? 'best' : ''}">
          <div class="fname">${icon(it.icon, it.name, 'sm')}<span>${esc(a.name)}</span></div>
          <div class="ana-num"><small>개당</small>${P(a.unit)}P</div>
          <div class="ana-num"><small>지금 최대</small>${a.max ? NG.fmtQty(a.max) : '<span style="color:var(--mute)">0</span>'}</div>
          <div class="ana-miss">${miss.length ? `<span class="miss-lbl">${a.kind === 'soul' ? '1개' : NG.fmtQty(a.target)}까지</span>${missChips(a.missing)}` : '<span class="ok-text">충분</span>'}</div>
        </div>`;
      }).join('')}</div>
    </section>`;
  }

  function invCard() {
    const filled = NG.RES.filter(r => S.inv[r.id] && Number(S.inv[r.id].qty) > 0);
    const list = S.invAll ? NG.RES : filled;
    const ia = S.invAdd;
    const ir = NG.RES_BY_ID[ia.id];
    let lastGroup = null;
    return `<section class="card">
      <div class="card-head"><h2><span class="icon-chip"><svg viewBox="0 0 24 24"><path d="M4 7l8-4 8 4-8 4-8-4z"/><path d="M4 7v10l8 4 8-4V7"/></svg></span>가진 재료 <span class="badge">${filled.length}</span></h2>
        <div class="seg sm"><button data-invall="0" class="${S.invAll ? '' : 'on'}">입력한 것만</button><button data-invall="1" class="${S.invAll ? 'on' : ''}">전체</button></div></div>
      <div class="add-row inv-add">
        <div class="field"><label>재료</label><div class="picker" data-picker="inv"><button class="picker-btn" data-pick-open="inv">${icon(ir.icon, ir.name)}<span>${esc(ir.name)}</span><em>${esc(ir.group)}</em></button></div></div>
        <div class="field"><label>수량</label><div class="qty"><input class="input num" id="invAddQty" type="number" min="0" value="${esc(ia.qty)}">
          <div class="seg sm">${Object.keys(NG.UNITS).map(u => `<button data-iaunit="${u}" class="${u === ia.unit ? 'on' : ''}">${u}</button>`).join('')}</div></div></div>
        <button class="btn primary" id="invAddBtn"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>더하기</button>
        <button class="btn soft" id="invSetBtn">이 값으로 설정</button>
      </div>
      ${list.length ? `<div class="inv-tiles">${list.map(r => {
        const v = S.inv[r.id] || {};
        const has = Number(v.qty) > 0;
        const g = S.invAll && r.group !== lastGroup ? `<div class="inv-gl">${r.group}</div>` : '';
        lastGroup = r.group;
        return `${g}<div class="inv-tile ${has ? 'has' : ''}">${icon(r.icon, r.name, 'sm')}<span class="nm" title="${esc(r.name)}">${esc(r.name)}</span>
          <input class="input num" data-inv="${r.id}" type="number" min="0" placeholder="0" value="${has ? esc(v.qty) : ''}">
          <select class="select" data-invu="${r.id}">${Object.keys(NG.UNITS).map(u => `<option ${u === (v.unit || defaultUnit(r)) ? 'selected' : ''}>${u}</option>`).join('')}</select>
          ${has ? `<button class="del sm" data-invdel="${r.id}" aria-label="지우기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : '<span></span>'}</div>`;
      }).join('')}</div>` : '<div class="empty" style="padding:18px">위에서 재료를 골라 더하거나, "전체"를 눌러 바로 입력하세요. 건초 더미는 밀 9개, 주괴 3개는 그릇 1개로 계산해요.</div>'}
    </section>`;
  }

  function defaultUnit(r) { return r.group === '농작물' || r.id === 'coal' ? '세트' : '개'; }

  // ═════════════════ 설정 ═════════════════
  function pageSettings() {
    const s = S.settings;
    const themes = [['white', '화이트', '#f4f6f9'], ['gray', '그레이', '#3a3f47'], ['black', '블랙', '#0c0f14']];
    return head('<em>설정</em>', '테마 · 자동 갱신 · 트레이') + `
    <section class="card">
      <div class="set-row"><div><b>테마</b><small>화이트 · 그레이 · 블랙</small></div>
        <div class="theme-cards">${themes.map(([id, n, c]) => `<button class="theme-card ${S.theme === id ? 'on' : ''}" data-theme-set="${id}"><i style="background:${c}"></i>${n}</button>`).join('')}</div></div>
      <div class="set-row"><div><b>창을 닫아도 트레이에서 계속 실행</b><small>켜 두면 00:30 자동 갱신이 놓치지 않고 돌아가요</small></div><button class="switch ${s.closeToTray ? 'on' : ''}" data-set="closeToTray" aria-label="트레이 실행"></button></div>
      <div class="set-row"><div><b>시세 갱신 알림</b><small>00:30에 새 시세를 받으면 윈도우 알림을 띄워요</small></div><button class="switch ${s.notify ? 'on' : ''}" data-set="notify" aria-label="알림"></button></div>
      <div class="set-row"><div><b>컴퓨터 켤 때 자동 실행</b><small>트레이로 조용히 시작해요</small></div><button class="switch ${s.autoLaunch ? 'on' : ''}" data-set="autoLaunch" aria-label="자동 실행"></button></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>데이터 출처</h2></div>
      <p class="hint" style="margin:0">너굴마을 위키(mcng.kr)의 공개 시세 API를 하루 한 번 00:30에 받아와요. 앱을 켤 때와 컴퓨터가 절전에서 깨어날 때도 확인해요.
      무역선 티켓 보너스·쿨타임과 28세트 제한, 플레이팅 +10/20/30%, 재료요리 레시피는 위키 기준이에요.</p>
      <p class="credit">Nova Calculator v${esc(S.settings.version || '')} · 제작 망고</p>
    </section>`;
  }

  // ───────── 이벤트 ─────────
  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-sel]');
    if (!t) return;
    const ds = t.dataset;
    if (ds.page) return go(ds.page);
    if (ds.themeSet) return setTheme(ds.themeSet);
    if (ds.win) return api && api.win(ds.win);
    if (ds.sel) { S.selected = ds.sel; store.set('selected', ds.sel); return render(); }
    if (ds.mplate) { S.marketPlate = ds.mplate; store.set('marketPlate', ds.mplate); return render(); }
    if (ds.msort) { S.marketSort = ds.msort; store.set('marketSort', ds.msort); return render(); }
    if (ds.aplate) { S.add.plate = ds.aplate; return render(); }
    if (ds.pickOpen) return openPicker(ds.pickOpen);
    if (ds.pick) {
      S.add.key = ds.pick;
      if (NG.ITEM_BY_KEY[ds.pick].kind === 'soul') { S.add.plate = 'none'; S.add.unit = '개'; }
      return render();
    }
    if (ds.tk) {
      const v = Math.max(0, (Number(S.trade.tickets[ds.tk]) || 0) + Number(ds.d));
      S.trade.tickets[ds.tk] = v; saveTrade(); return render();
    }
    if (ds.del != null) { S.cart.splice(Number(ds.del), 1); saveCart(); return render(); }
    if (ds.set) return toggleSetting(ds.set);
    if (ds.refresh) return manualRefresh(t);
    if (ds.ipick) { S.invAdd.id = ds.ipick; const r = NG.RES_BY_ID[ds.ipick]; S.invAdd.unit = defaultUnit(r); return renderKeepScroll(); }
    if (ds.invall != null) { S.invAll = ds.invall === '1'; store.set('invAll', S.invAll); return render(); }
    if (ds.iaunit) { S.invAdd.unit = ds.iaunit; return render(); }
    if (ds.invdel) { delete S.inv[ds.invdel]; store.set('inv', S.inv); return render(); }
    if (ds.export) return exportData(ds.export);
    if (ds.import) return importPick(ds.import);
    if (ds.copyas) {
      S.dstyle = ds.copyas; store.set('dstyle', ds.copyas);
      closeCopyMenu();
      return ds.copykind === 'trade' ? copyTrade() : copyCook();
    }
    if (ds.dpreview) { S.dpreview = !S.dpreview; store.set('dpreviewOpen', S.dpreview); return render(); }
    if (ds.k) return calcKey(ds.k);
    if (ds.c) return calcInsert(ds.c);
    switch (t.id) {
      case 'addBtn': return addToCart();
      case 'invAddBtn': return invAdd(false);
      case 'invSetBtn': return invAdd(true);
      case 'clearCart': return confirmBox('바구니를 비울까요?', `담아 둔 ${S.cart.length}개 물품이 모두 지워져요.`, '비우기', () => { S.cart = []; saveCart(); render(); toast('바구니를 비웠어요'); });
      case 'copyTrade': return openCopyMenu(t, 'trade');
      case 'copyCook': return openCopyMenu(t, 'cook');
      case 'toCart': return cookToCart();
      case 'invReset': return confirmBox('재료를 초기화할까요?', '입력한 재료가 모두 지워져요. 필요하면 먼저 "재료 내보내기"로 저장해 두세요.', '초기화', () => { S.inv = {}; store.set('inv', S.inv); render(); toast('재료를 초기화했어요'); });
      case 'refreshBtn': return manualRefresh(t);
      case 'calcCopy': return copy(String(calc.last || 0), '계산 결과를 복사했어요');
    }
  });

  let invTimer = null;
  document.addEventListener('input', e => {
    const t = e.target, ds = t.dataset;
    if (t.id === 'addQty') S.add.qty = t.value;
    else if (t.id === 'invAddQty') S.invAdd.qty = t.value;
    else if (t.id === 'island') { S.trade.island = t.value; saveTrade(); }
    else if (t.id === 'existing') {
      const n = Number(t.value.replace(/[^\d]/g, '')) || 0;
      S.trade.existing = n; saveTrade();
      deferTrade();
    } else if (ds.tki) { S.trade.tickets[ds.tki] = Math.max(0, Number(t.value.replace(/[^\d]/g, '')) || 0); saveTrade(); deferTrade(); }
    else if (ds.cq != null) { S.cart[ds.cq].qty = t.value; saveCart(); deferTrade(); }
    else if (ds.inv) {
      const r = NG.RES_BY_ID[ds.inv];
      const cur = S.inv[ds.inv] || { unit: defaultUnit(r) };
      cur.qty = t.value; S.inv[ds.inv] = cur; store.set('inv', S.inv);
      t.closest('.inv-row').classList.toggle('has', Number(t.value) > 0);
      clearTimeout(invTimer); invTimer = setTimeout(() => renderKeepFocus(), 350);
    } else if (t.id === 'calcExpr') calcUpdate();
  });
  document.addEventListener('change', e => {
    const t = e.target, ds = t.dataset;
    if (t.id === 'addUnit') S.add.unit = t.value;
    else if (ds.cu != null) { S.cart[ds.cu].unit = t.value; saveCart(); render(); }
    else if (ds.invu) {
      const cur = S.inv[ds.invu] || {};
      cur.unit = t.value; S.inv[ds.invu] = cur; store.set('inv', S.inv); renderKeepFocus();
    } else if (t.id === 'existing') render();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.target.id === 'addQty')) addToCart();
    if (e.key === 'Enter' && (e.target.id === 'invAddQty')) invAdd(false);
    if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r')) { e.preventDefault(); manualRefresh(); }
  });

  let tradeTimer = null;
  function deferTrade() { clearTimeout(tradeTimer); tradeTimer = setTimeout(renderKeepFocus, 400); }

  /** 입력 중인 칸의 포커스/커서를 유지하며 다시 그림 */
  function renderKeepFocus() {
    const a = document.activeElement;
    let sel = null;
    if (a && a.matches('input')) {
      const attrs = ['data-inv', 'data-cq', 'data-tki', 'id'];
      for (const at of attrs) if (a.getAttribute(at)) { sel = `[${at}="${a.getAttribute(at)}"]`; break; }
    }
    const pos = a && a.selectionStart != null && a.type !== 'number' ? a.selectionStart : null;
    render();
    if (sel) {
      const el = $(sel === '[id="calcExpr"]' ? '#calcExpr' : sel);
      if (el) { el.focus(); if (pos != null) try { el.setSelectionRange(pos, pos); } catch { /* number input */ } }
    }
  }

  function renderKeepScroll() { render(); }

  // 되돌릴 수 없는 동작은 한 번 더 확인
  function confirmBox(title, desc, okLabel, onOk) {
    const old = $('#confirmBox'); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'confirmBox'; wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(desc)}</p>
      <div class="btn-row"><button class="btn soft" data-cf="no">취소</button><button class="btn danger" data-cf="ok">${esc(okLabel)}</button></div></div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-cf]');
      if (e.target === wrap || (b && b.dataset.cf === 'no')) { e.stopPropagation(); close(); }
      else if (b && b.dataset.cf === 'ok') { e.stopPropagation(); close(); onOk(); }
    });
    $('[data-cf="no"]', wrap).focus();
  }

  function invAdd(set) {
    const a = S.invAdd, r = NG.RES_BY_ID[a.id];
    const add = Number(a.qty);
    if (!(add >= 0) || (!set && !(add > 0))) { toast('수량을 입력해 주세요'); return; }
    const cur = S.inv[a.id] || {};
    let total = add * NG.UNITS[a.unit];
    if (!set) total += (Number(cur.qty) || 0) * NG.UNITS[cur.unit || defaultUnit(r)];
    let unit = a.unit, qty;
    if (total % NG.UNITS[unit] !== 0) unit = total % NG.STACK === 0 ? '세트' : '개';
    qty = total / NG.UNITS[unit];
    if (total <= 0) delete S.inv[a.id]; else S.inv[a.id] = { qty, unit };
    store.set('inv', S.inv);
    toast(`${r.name} ${set ? '' : '+'}${add}${a.unit} → ${NG.fmtQty(total)}`);
    render();
  }

  // ───────── 파일로 공유 / 불러오기 ─────────
  const FILE_KIND = { cart: '바구니', trade: '무역 정보', inv: '재료' };
  function exportData(kind) {
    const data = kind === 'cart' ? S.cart : kind === 'trade' ? S.trade : S.inv;
    const payload = { app: 'NovaCalculator', kind, version: 1, savedAt: new Date().toISOString(), data };
    const text = JSON.stringify(payload, null, 2);
    const d = new Date();
    const name = `Nova-${FILE_KIND[kind].replace(' ', '')}-${d.getMonth() + 1}${String(d.getDate()).padStart(2, '0')}.json`;
    if (api && api.saveFile) {
      api.saveFile(name, text).then(p => { if (p) toast(`${FILE_KIND[kind]}를 저장했어요 · ${p.split(/[\\/]/).pop()}`); });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast(`${FILE_KIND[kind]}를 파일로 저장했어요`);
  }
  async function importPick(kind) {
    if (api && api.openFile) {
      const text = await api.openFile();
      if (text != null) importFile({ text: async () => text }, kind);
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => { if (inp.files[0]) importFile(inp.files[0], kind); };
    inp.click();
  }
  async function importFile(file, expect) {
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast('Nova Calculator 파일이 아니에요'); return; }
    if (!obj || obj.app !== 'NovaCalculator' || !FILE_KIND[obj.kind]) { toast('Nova Calculator 파일이 아니에요'); return; }
    const d = obj.data;
    if (obj.kind === 'cart') {
      if (!Array.isArray(d)) return toast('바구니 파일이 손상됐어요');
      S.cart = d.filter(c => c && NG.ITEM_BY_KEY[c.key] && NG.PLATE_BY_ID[c.plate || 'none'] && NG.UNITS[c.unit || '개'] && Number(c.qty) > 0)
        .map(c => ({ key: c.key, plate: NG.ITEM_BY_KEY[c.key].kind === 'soul' ? 'none' : (c.plate || 'none'), qty: Number(c.qty), unit: c.unit || '개' }));
      saveCart();
    } else if (obj.kind === 'trade') {
      if (!d || typeof d !== 'object') return toast('무역 정보 파일이 손상됐어요');
      const tk = d.tickets || {};
      S.trade = {
        island: String(d.island || '').slice(0, 40), existing: Math.max(0, Number(d.existing) || 0),
        tickets: { royal: Math.max(0, Number(tk.royal) || 0), high: Math.max(0, Number(tk.high) || 0), normal: Math.max(0, Number(tk.normal) || 0) },
      };
      saveTrade();
    } else if (obj.kind === 'inv') {
      if (!d || typeof d !== 'object') return toast('재료 파일이 손상됐어요');
      const inv = {};
      for (const k in d) if (NG.RES_BY_ID[k] && d[k] && Number(d[k].qty) > 0 && NG.UNITS[d[k].unit || '개']) inv[k] = { qty: Number(d[k].qty), unit: d[k].unit || '개' };
      S.inv = inv; store.set('inv', S.inv);
    }
    toast(`${FILE_KIND[obj.kind]}를 불러왔어요${expect && expect !== obj.kind ? ' (' + FILE_KIND[obj.kind] + ' 파일이었어요)' : ''}`);
    go(obj.kind === 'inv' ? 'cook' : 'trade');
  }
  // 파일을 창에 끌어다 놓아도 불러오기
  document.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) { e.preventDefault(); importFile(f); }
  });

  function addToCart() {
    const a = S.add;
    const qty = Number(a.qty);
    if (!(qty > 0)) { toast('수량을 입력해 주세요'); return; }
    const plate = NG.ITEM_BY_KEY[a.key].kind === 'soul' ? 'none' : a.plate;
    const same = S.cart.find(c => c.key === a.key && c.plate === plate && c.unit === a.unit);
    if (same) same.qty = (Number(same.qty) || 0) + qty;
    else S.cart.push({ key: a.key, plate, qty, unit: a.unit });
    saveCart();
    toast(`${NG.ITEM_BY_KEY[a.key].name} ${qty}${a.unit} 담았어요`);
    render();
  }

  function tradeText() {
    const lines = cartLines();
    const plan = NG.planVoyages(lines, S.table, S.trade.tickets);
    return NG.discordTrade({ island: S.trade.island, date: S.table.date, lines, table: S.table, plan, existing: Number(S.trade.existing) || 0 }, S.dstyle);
  }
  const COPY_MSG = { dark: '복사했어요 · 디스코드 다크 테마용', light: '복사했어요 · 디스코드 라이트 테마용', md: '복사했어요 · 어느 테마에서든 보여요' };
  function copyTrade() { copy(tradeText(), COPY_MSG[S.dstyle]); }

  // 복사 버튼을 누르면 디스코드 테마 고르는 메뉴
  function closeCopyMenu() { const m = $('#copyMenu'); if (m) m.remove(); }
  function openCopyMenu(btn, kind) {
    if ($('#copyMenu')) return closeCopyMenu();
    const opts = [['dark', '다크 테마', '디스코드 기본(어두운) 테마'], ['light', '라이트 테마', '밝은 테마'], ['md', '색 없이', '어느 테마든 보여요']];
    const m = document.createElement('div');
    m.id = 'copyMenu'; m.className = 'copy-menu';
    m.innerHTML = `<div class="copy-menu-title">어떤 디스코드 테마에 붙여넣을까요?</div>` + opts.map(([k, l, d]) =>
      `<button data-copyas="${k}" data-copykind="${kind}" class="${S.dstyle === k ? 'on' : ''}"><span class="sw ${k}"></span><span><b>${l}</b><small>${d}</small></span></button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    const h = m.offsetHeight, w = m.offsetWidth;
    const top = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
    m.style.top = top + 'px';
    m.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function close(e) {
      if (!m.contains(e.target)) { closeCopyMenu(); document.removeEventListener('mousedown', close); }
    }), 0);
  }
  function copyCook() {
    const { result } = computeCook();
    copy(NG.discordCook({ date: S.table.date, result }, S.dstyle), COPY_MSG[S.dstyle]);
  }

  // ───────── 디스코드 미리보기 ─────────
  const DC_FG = { 30: '#4f545c', 31: '#dc322f', 32: '#859900', 33: '#b58900', 34: '#268bd2', 35: '#d33682', 36: '#2aa198', 37: '#ffffff' };
  const DC_BG = { 40: '#002b36', 41: '#cb4b16', 42: '#586e75', 43: '#657b83', 44: '#839496', 45: '#6c71c4', 46: '#93a1a1', 47: '#fdf6e3' };
  function ansiToHtml(text) {
    const body = text.replace(/^```ansi\n/, '').replace(/\n```$/, '');
    let out = '', st = {};
    const parts = body.split(/\u001b\[([\d;]*)m/);
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        for (const n of parts[i].split(';').map(Number)) {
          if (n === 0) st = {}; else if (n === 1) st.b = 1; else if (n === 4) st.u = 1;
          else if (DC_FG[n]) st.fg = DC_FG[n]; else if (DC_BG[n]) st.bg = DC_BG[n];
        }
      } else if (parts[i]) {
        const css = (st.fg ? 'color:' + st.fg + ';' : '') + (st.bg ? 'background:' + st.bg + ';' : '') + (st.b ? 'font-weight:700;' : '') + (st.u ? 'text-decoration:underline;' : '');
        out += css ? `<span style="${css}">${esc(parts[i])}</span>` : esc(parts[i]);
      }
    }
    return out;
  }
  function mdToHtml(text) {
    const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    return text.split('\n').map(l => {
      if (l.startsWith('### ')) return `<div class="md-h3">${inline(l.slice(4))}</div>`;
      if (l.startsWith('## ')) return `<div class="md-h2">${inline(l.slice(3))}</div>`;
      if (l.startsWith('-# ')) return `<div class="md-sub">${inline(l.slice(3))}</div>`;
      if (l.startsWith('> ')) return `<div class="md-quote">${inline(l.slice(2))}</div>`;
      if (!l.trim()) return '<div style="height:6px"></div>';
      return `<div>${inline(l)}</div>`;
    }).join('');
  }
  function discordBox(text) {
    const styles = [['dark', '다크 테마'], ['light', '라이트 테마'], ['md', '색 없이']];
    return `<div class="dc-box">
      <div class="dc-head"><span class="dc-label">디스코드 복사</span>
        <div class="seg sm">${styles.map(([k, l]) => `<button data-dstyle="${k}" class="${S.dstyle === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="ghost-btn sm" data-dpreview="1">${S.dpreview ? '미리보기 닫기' : '미리보기'}</button></div>
      ${S.dpreview && text ? `<div class="dc-preview ${S.dstyle === 'light' ? 'light' : 'dark'}">${S.dstyle === 'md'
        ? `<div class="dc-md">${mdToHtml(text)}</div>` : `<pre class="dc-code">${ansiToHtml(text)}</pre>`}</div>` : ''}
    </div>`;
  }
  function cookToCart() {
    const { result } = computeCook();
    for (const l of result.lines) {
      const sets = l.qty % NG.STACK === 0 && l.qty > 0;
      S.cart.push({ key: l.key, plate: l.plate, qty: sets ? l.qty / NG.STACK : l.qty, unit: sets ? '세트' : '개' });
    }
    saveCart();
    toast('최적 조합을 바구니에 담았어요');
    go('trade');
  }

  let refreshing = false;
  async function manualRefresh() {
    if (!api) { toast('앱에서만 새로고침할 수 있어요'); return; }
    if (refreshing) return;
    refreshing = true;
    $$('#refreshBtn, [data-refresh]').forEach(b => b.classList.add('spin'));
    try { setData(await api.refresh()); toast(S.data.error ? '갱신 실패 · 저장된 시세를 쓰고 있어요' : '위키에서 최신 시세를 받아왔어요'); }
    finally { refreshing = false; $$('#refreshBtn, [data-refresh]').forEach(b => b.classList.remove('spin')); }
  }

  async function toggleSetting(k) {
    S.settings[k] = !S.settings[k];
    if (api) await api.setSettings(S.settings);
    render();
  }

  function setTheme(t) {
    S.theme = t; store.set('theme', t);
    if (api && api.setTheme) api.setTheme(t);
    document.documentElement.dataset.theme = t;
    $$('.theme-dots button').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t));
    if (S.page === 'settings' || S.page === 'market') render();
  }

  // ───────── 계산기 ─────────
  const calc = { last: 0, hist: store.get('calcHist', []) };
  function calcUpdate() {
    const expr = $('#calcExpr').value;
    const res = $('#calcResult'), units = $('#calcUnits');
    if (!expr.trim()) { res.textContent = '0'; res.classList.remove('err'); units.textContent = '0개'; calc.last = 0; return; }
    try {
      const v = NG.evalExpr(expr);
      if (!isFinite(v)) throw new Error('inf');
      calc.last = Math.round(v * 1e6) / 1e6;
      res.textContent = Number.isInteger(calc.last) ? P(calc.last) : calc.last.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
      res.classList.remove('err');
      units.textContent = v >= 0 && v < 1e9 ? NG.fmtQty(v) : '';
    } catch { res.textContent = '…'; res.classList.add('err'); }
  }
  function calcInsert(s) {
    const el = $('#calcExpr');
    const v = el.value;
    const st = el.selectionStart != null && document.activeElement === el ? el.selectionStart : v.length;
    const en = el.selectionEnd != null && document.activeElement === el ? el.selectionEnd : v.length;
    el.value = v.slice(0, st) + s + v.slice(en);
    const p = st + s.length;
    el.focus(); el.setSelectionRange(p, p);
    calcUpdate();
  }
  function calcKey(k) {
    const el = $('#calcExpr');
    if (k === 'C') { el.value = ''; calcUpdate(); return; }
    if (k === '⌫') {
      const st = document.activeElement === el ? el.selectionStart : el.value.length;
      if (st > 0) { el.value = el.value.slice(0, st - 1) + el.value.slice(st); el.focus(); el.setSelectionRange(st - 1, st - 1); }
      calcUpdate(); return;
    }
    if (k === '=') return calcCommit();
    calcInsert(k);
  }
  function calcCommit() {
    const el = $('#calcExpr');
    calcUpdate();
    if (!el.value.trim() || $('#calcResult').classList.contains('err')) return;
    calc.hist.unshift(el.value.trim() + ' = ' + $('#calcResult').textContent);
    calc.hist = calc.hist.slice(0, 3);
    store.set('calcHist', calc.hist);
    el.value = String(calc.last);
    renderCalcHist();
    calcUpdate();
  }
  function renderCalcHist() {
    $('#calcHist').innerHTML = calc.hist.slice().reverse().map(h => `<div title="클릭해서 결과 사용">${esc(h)}</div>`).join('');
  }
  $('#calcExpr').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); calcCommit(); }
    else if (e.key === 'Escape') { e.target.value = ''; calcUpdate(); }
  });
  $('#calcHist').addEventListener('click', e => {
    const d = e.target.closest('div[title]');
    if (!d) return;
    const v = d.textContent.split('=').pop().trim().replace(/,/g, '');
    calcInsert(v);
  });

  // 아이콘을 못 불러오면 글자로 대체 (CSP 때문에 인라인 onerror 대신)
  document.addEventListener('error', e => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset.ph != null) {
      const sp = document.createElement('span'); sp.className = 'ph'; sp.textContent = img.dataset.ph; img.replaceWith(sp);
    }
  }, true);

  // ───────── 시작 ─────────
  window.addEventListener('resize', () => { if (S.page === 'market') drawDetailChart(); });
  if (document.documentElement.classList.contains('embed') && S.page === 'settings') S.page = 'market';
  setTheme(S.theme);
  renderCalcHist();
  calcUpdate();
  tickCountdown();
  setInterval(tickCountdown, 1000);
  render();

  (async () => {
    if (api) {
      api.onData(setData);
      if (api.onShortcutRefresh) api.onShortcutRefresh(() => manualRefresh());
      try { S.settings = Object.assign(S.settings, await api.getSettings()); } catch { /* 무시 */ }
      if (S.settings.version) { $('#appVer').textContent = 'v' + S.settings.version; render(); }
      setData(await api.getData());
    } else {
      setData({ prices: null, error: '앱 밖에서 열려 시세를 받아올 수 없어요' });
    }
  })();
})();
