"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// 질문(너굴 도우미) · 계산기 페이지
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const api = window.nugul;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NG = window.NG;

  // ═════════════ 계산기 (iframe 연결) ═════════════
  const frame = $("#calcFrame");
  let calcReady = false;
  const post = (msg) => frame.contentWindow && frame.contentWindow.postMessage({ ns: "nc", ...msg }, "*");
  const METHODS = {
    get: () => api.calc.get(),
    refresh: () => api.calc.refresh(),
    copy: (t) => api.calc.copy(t),
    saveFile: (n, t) => api.calc.saveFile(n, t),
    openFile: () => api.calc.openFile(),
  };
  window.addEventListener("message", async (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = e.data;
    if (!m || m.ns !== "nc") return;
    if (m.ready) {
      post({ push: "ack" });
      if (calcReady) return;
      calcReady = true;
      sendTheme();
      if (pendingTab) { post({ push: "tab", page: pendingTab }); pendingTab = null; }
      return;
    }
    if (!m.id || !METHODS[m.method]) return;
    try { post({ id: m.id, result: await METHODS[m.method](...(m.args || [])) }); }
    catch (err) { post({ id: m.id, error: String(err?.message || err) }); }
  });
  api.calc.onData((d) => { cookData = d; post({ push: "data", payload: d }); });

  // 런처 색을 계산기에도 그대로
  function sendTheme() {
    if (!calcReady) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue("--" + k).trim();
    const mix = (a, pct) => `color-mix(in srgb, ${a} ${pct}%, transparent)`;
    const accent = v("accent");
    post({
      push: "theme",
      scheme: document.body.dataset.scheme || "dark",
      vars: {
        "--bg": v("bg-1"), "--bg-grad": "transparent", "--panel": v("bg-1"),
        "--card": v("bg-2"), "--card-2": v("bg-3"), "--card-hi": "transparent", "--input": v("bg-1"),
        "--line": v("border-soft"), "--line-2": v("border"),
        "--text": v("text-0"), "--text-2": v("text-1"), "--mute": v("text-2"),
        "--accent": accent, "--accent-2": v("accent-strong"), "--accent-ink": v("accent-ink"),
        "--accent-soft": mix(accent, 14), "--accent-line": mix(accent, 45),
        "--up": v("leaf") || "#8ccf6a", "--down": v("danger") || "#e5604d",
        "--shadow": "none", "--shadow-sm": "0 2px 8px rgba(0,0,0,.12)", "--chart-band": mix(v("text-0"), 4),
        "--scroll": v("bg-3"), "--font": v("font"),
        "color-scheme": document.body.dataset.scheme === "light" ? "light" : "dark",
      },
    });
  }
  new MutationObserver(sendTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
  new MutationObserver(sendTheme).observe(document.body, { attributes: true, attributeFilter: ["data-scheme"] });

  let pendingTab = null;
  function openCalc(tab) {
    if (tab) { if (calcReady) post({ push: "tab", page: tab }); else pendingTab = tab; }
    showPage("calc");
  }

  // ═════════════ 너굴 도우미 ═════════════
  let kb = null, kbLoading = null, kbInfo = null, cookData = null;
  const log = $("#askLog");
  const SUGGEST = [
    "서버 주소랑 버전", "디코인증 어떻게 해?", "요리 유통기한", "무역 티켓 쿨타임", "플레이팅 하는 법",
    "고급광산 시간", "오늘 요리 시세 1위", "멤버십 혜택", "부계정 써도 돼?", "초월강화 확률",
  ];

  async function loadKB(force) {
    if (kbLoading) return kbLoading;
    kbLoading = (async () => {
      $("#askSub").textContent = "위키를 읽는 중이에요…";
      const r = await api.kb.get(!!force);
      const parse = (h) => (h ? new DOMParser().parseFromString(h, "text/html") : null);
      if (!r.pages.wiki) {
        $("#askSub").textContent = "위키를 받아오지 못했어요. 인터넷 연결을 확인하고 '위키 새로 받기'를 눌러 주세요.";
        kbLoading = null;
        return null;
      }
      kb = window.NugulAsk.buildKB({ wiki: parse(r.pages.wiki), rules: parse(r.pages.rules) });
      kbInfo = r;
      const t = r.fetchedAt ? new Date(r.fetchedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
      $("#askSub").textContent = `너굴마을 위키·규칙 ${kb.N}개 항목에서 찾아서 답해요 · ${t} 기준${r.error ? " (새로 받기 실패, 저장된 위키 사용 중)" : ""}`;
      kbLoading = null;
      return kb;
    })();
    return kbLoading;
  }

  function bubble(html, who) {
    const el = document.createElement("div");
    el.className = `ask-msg ${who}`;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function lineHtml(l) {
    if (l.head) return `<li class="sub">${esc(l.text.replace(/^■\s*/, ""))}</li>`;
    const t = l.text;
    const i = t.indexOf(" — ");
    if (i > 0 && i < 40) return `<li${l.step ? ' class="step"' : ""}><b>${esc(t.slice(0, i))}</b><span>${esc(t.slice(i + 3))}</span></li>`;
    return `<li${l.step ? ' class="step"' : ""}><span>${esc(t)}</span></li>`;
  }
  function sourceBtn(c) {
    if (c.src === "rules") return `<button class="btn ghost sm" data-link="rules">규칙 전체 보기</button>`;
    return `<button class="btn ghost sm" data-url="wiki:${esc(c.anchor)}">위키에서 보기</button>`;
  }
  function relatedChips(list) {
    if (!list || !list.length) return "";
    return `<div class="ask-rel"><span>이것도 볼까요?</span>${list.map((c) => `<button class="chip-btn" data-chunk="${c.i}">${esc(c.label)}</button>`).join("")}</div>`;
  }
  function answerHtml(chunk, lines, opts = {}) {
    return `<div class="ask-ans-head"><span class="src ${chunk.src}">${chunk.src === "rules" ? "규칙" : "위키"}</span><b>${esc(chunk.label)}</b></div>
      ${opts.note ? `<p class="ask-note">${esc(opts.note)}</p>` : ""}
      <ul class="ask-lines ${opts.outline ? "outline" : ""}">${lines.map(lineHtml).join("")}</ul>
      <div class="ask-foot">${sourceBtn(chunk)}${opts.more ? `<button class="btn ghost sm" data-chunk="${chunk.i}">전부 보기</button>` : ""}</div>
      ${relatedChips(opts.related)}`;
  }

  // ───── 시세 질문 (계산기 데이터 사용) ─────
  function priceTable() {
    return cookData && cookData.prices ? NG.buildPriceTable(cookData.prices) : null;
  }
  function findItem(q) {
    const flat = q.replace(/\s/g, "");
    return NG.ITEMS.filter((it) => flat.includes(it.name.replace(/\s|\(|\)/g, "")) || flat.includes(it.name.replace(/\s/g, "")))
      .sort((a, b) => b.name.length - a.name.length)[0];
  }
  function priceAnswer(q) {
    const T = priceTable();
    const wantsTop = /(1위|제일|가장|최고|비싼|추천|뭐\s*만들|뭘\s*만들)/.test(q) && /(요리|시세|가격|포인트|무역)/.test(q);
    const it = findItem(q);
    const priceCue = /(가격|시세|얼마|포인트|무역|팔면|판매)/.test(q);
    if (!wantsTop && !(it && (priceCue || q.replace(/\s/g, "").length <= it.name.length + 3))) return null;
    if (!T) return `<div class="ask-ans-head"><span class="src live">시세</span><b>오늘 요리 시세</b></div><p class="ask-note">시세를 아직 못 받아왔어요. 계산기 탭에서 새로고침해 주세요.</p>`;
    if (wantsTop && !it) {
      const top = NG.FOODS.map((f) => ({ f, p: NG.pointsOf(T, f.key, "none"), c: NG.changePct(T, f.key) })).sort((a, b) => b.p - a.p).slice(0, 5);
      return `<div class="ask-ans-head"><span class="src live">시세</span><b>${esc(T.date)} 요리 시세 TOP 5</b></div>
        <ul class="ask-lines">${top.map((x, i) => `<li><b>${i + 1}. ${esc(x.f.name)}</b><span>${NG.fmt(x.p)}P · 기준가 대비 ${NG.fmtPct(x.c)}</span></li>`).join("")}</ul>
        <p class="ask-note">무역 포인트는 오늘 판매가와 같아요. 그릇에 담으면 청동 +10% · 은 +20% · 금 +30%.</p>
        <div class="ask-foot"><button class="btn primary sm" data-calc="cook">내 재료로 최적 조합 계산</button><button class="btn ghost sm" data-calc="market">시세 그래프 보기</button></div>`;
    }
    if (it.kind === "soul") {
      return `<div class="ask-ans-head"><span class="src live">시세</span><b>${esc(it.name)}</b></div>
        <ul class="ask-lines"><li><b>무역 포인트</b><span>${NG.fmt(it.points)}P (고정)</span></li></ul>
        <div class="ask-foot"><button class="btn ghost sm" data-calc="trade">무역 계산기 열기</button></div>`;
    }
    const pct = NG.changePct(T, it.key);
    const r = NG.tomorrowRange(T, it.key, "none");
    return `<div class="ask-ans-head"><span class="src live">시세</span><b>${esc(it.name)} · ${esc(T.date)}</b></div>
      <ul class="ask-lines">
        <li><b>오늘 가격 (무역 포인트)</b><span>${NG.fmt(NG.pointsOf(T, it.key, "none"))}P · 기준가 대비 ${NG.fmtPct(pct)}</span></li>
        <li><b>그릇에 담으면</b><span>청동 ${NG.fmt(NG.pointsOf(T, it.key, "bronze"))}P · 은 ${NG.fmt(NG.pointsOf(T, it.key, "silver"))}P · 금 ${NG.fmt(NG.pointsOf(T, it.key, "gold"))}P</span></li>
        ${r ? `<li><b>내일 예상</b><span>${NG.fmt(r.lo)} ~ ${NG.fmt(r.hi)}P (하루 최대 ±5%, 기준가 ±20% 안)</span></li>` : ""}
        <li><b>재료</b><span>${Object.keys(it.use).map((k) => esc(NG.RES_BY_ID[k].name) + " " + it.use[k]).join(" + ")}</span></li>
      </ul>
      <div class="ask-foot"><button class="btn ghost sm" data-calc="market">그래프 보기</button><button class="btn ghost sm" data-calc="trade">무역 계산기</button></div>`;
  }

  async function ask(q) {
    q = String(q || "").trim();
    if (!q) return;
    bubble(esc(q), "me");
    const wait = bubble('<span class="ask-typing"><i></i><i></i><i></i></span>', "bot");
    if (!cookData) { try { cookData = await api.calc.get(); } catch (_) { /* 무시 */ } }
    if (/(계산기|포인트\s*계산|무역\s*계산|몇\s*번\s*출항)/.test(q)) {
      wait.innerHTML = `<div class="ask-ans-head"><span class="src live">계산기</span><b>무역 계산기</b></div><p class="ask-note">바구니에 요리를 담으면 티켓 보너스·출항 횟수까지 계산해요.</p><div class="ask-foot"><button class="btn primary sm" data-calc="trade">무역 계산기 열기</button><button class="btn ghost sm" data-calc="cook">요리 최적화</button></div>`;
      return;
    }
    const price = priceAnswer(q);
    if (price) { wait.innerHTML = price; log.scrollTop = log.scrollHeight; return; }
    if (!kb) await loadKB();
    if (!kb) { wait.innerHTML = `<p class="ask-note">위키를 아직 못 받아왔어요. 인터넷 연결을 확인하고 위의 '위키 새로 받기'를 눌러 주세요.</p>`; return; }
    const r = window.NugulAsk.search(kb, q, { maxLines: 7 });
    if (!r.best) {
      wait.innerHTML = `<p class="ask-note">위키와 규칙에서 맞는 내용을 못 찾았어요. 다른 말로 물어보거나, 디스코드 문의 채널에 물어봐 주세요.</p>
        <div class="ask-foot"><button class="btn ghost sm" data-link="discord">디스코드 열기</button><button class="btn ghost sm" data-link="wiki">위키 열기</button></div>`;
      return;
    }
    const c = r.best.chunk;
    const more = c.lines && r.best.lines.length < c.lines.length && !r.outline;
    wait.innerHTML = answerHtml(c, r.best.lines, {
      note: r.confident ? "" : "딱 맞는 답이 아닐 수도 있어요. 아래 항목도 확인해 보세요.",
      outline: r.outline, more, related: r.related,
    });
    log.scrollTop = log.scrollHeight;
  }

  function showChunk(i) {
    const c = kb && kb.chunks[i];
    if (!c) return;
    bubble(esc(c.label), "me");
    bubble(answerHtml(c, c.lines.slice(0, 30), { more: false }), "bot");
  }

  function renderChips() {
    $("#askChips").innerHTML = SUGGEST.map((s) => `<button class="chip-btn" data-ask="${esc(s)}">${esc(s)}</button>`).join("");
  }
  function greet() {
    log.innerHTML = "";
    bubble(`<div class="ask-ans-head"><span class="src live">도우미</span><b>안녕하세요! 너굴마을에서 궁금한 걸 물어보세요</b></div>
      <p class="ask-note">위키·규칙에 있는 내용을 찾아서 알려 드려요. 요리 이름을 넣으면 오늘 시세도, 명령어(예: /섬 초대)도 바로 찾아요.</p>`, "bot");
  }

  $("#askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#askInput");
    const q = inp.value;
    inp.value = "";
    ask(q);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ask],[data-chunk],[data-calc]");
    if (!b) return;
    if (b.dataset.ask) ask(b.dataset.ask);
    else if (b.dataset.chunk != null) showChunk(Number(b.dataset.chunk));
    else if (b.dataset.calc) openCalc(b.dataset.calc);
  });
  $("#askClear").addEventListener("click", greet);
  $("#askReload").addEventListener("click", async () => {
    kb = null;
    const k = await loadKB(true);
    if (k) toast(kbInfo.error ? "새로 받기에 실패해서 저장된 위키를 쓰고 있어요." : "위키를 새로 받아왔어요.", kbInfo.error ? "" : "ok");
  });

  let started = false;
  function onPage(name) {
    if (name === "ask") {
      if (!started) { started = true; greet(); renderChips(); loadKB(); }
      setTimeout(() => $("#askInput").focus(), 50);
    }
    if (name === "calc") sendTheme();
  }

  api.calc.get().then((d) => (cookData = d)).catch(() => {});
  window.NugulTools = { onPage, openCalc, ask };
})();
