// ─────────────────────────────────────────────────────────────────────────────
// 너굴 도우미 - 위키 검색형 답변 엔진
// 너굴마을 위키(/wiki)와 규칙(/rules) 페이지를 문단·표 줄 단위로 쪼개서 색인하고,
// 질문과 가장 잘 맞는 항목을 찾아 그 안에서 관련 있는 줄만 골라 답해요.
// (서버·API 키 없이 PC 안에서만 동작)
// ─────────────────────────────────────────────────────────────────────────────
(function (root) {
  "use strict";

  const BLOCK = new Set(["DIV", "P", "UL", "OL", "LI", "TABLE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "DL", "DT", "DD", "BLOCKQUOTE", "DETAILS", "SUMMARY", "ASIDE", "MAIN", "NAV", "FORM", "PRE", "HR"]);
  const SKIP = new Set(["SCRIPT", "STYLE", "BUTTON", "IMG", "SVG", "NAV", "SELECT", "INPUT", "TEXTAREA", "NOSCRIPT", "TEMPLATE", "CANVAS", "IFRAME", "VIDEO", "AUDIO"]);
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // 표 칸 글자 (줄바꿈·목록은 " · " 로)
  function cellText(cell) {
    let out = "";
    (function w(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.nodeValue;
        else if (c.nodeType === 1) {
          if (SKIP.has(c.tagName)) continue;
          if (c.tagName === "BR" || c.tagName === "LI" || c.tagName === "P" || c.tagName === "DIV") out += " · ";
          w(c);
        }
      }
    })(cell);
    return clean(out).replace(/^(· )+|( ·)+$/g, "").replace(/(· ){2,}/g, "· ").replace(/\s·\s·\s/g, " · ");
  }

  function tableLines(table) {
    const rows = [...table.querySelectorAll("tr")];
    if (!rows.length) return [];
    let head = null;
    const first = rows[0];
    if (first.querySelector("th") && !first.querySelector("td")) head = [...first.children].map(cellText);
    const lines = [];
    for (const r of head ? rows.slice(1) : rows) {
      const cells = [...r.children].map(cellText);
      if (!cells.some(Boolean)) continue;
      let t;
      if (head && head.length === cells.length && cells.length > 2) {
        t = cells[0] + " — " + cells.slice(1).map((c, i) => (head[i + 1] && c ? `${head[i + 1]} ${c}` : c)).filter(Boolean).join(" · ");
      } else if (cells.length === 2) {
        t = cells[0] + " — " + cells[1];
      } else {
        t = cells.filter(Boolean).join(" · ");
      }
      lines.push({ text: clean(t), table: true });
    }
    return lines;
  }

  // 문서(article 등) 하나를 h2(규칙은 h3) 기준으로 쪼개기
  function splitDoc(rootEl, base, splitTags) {
    const chunks = [];
    let cur = null, sub = "";
    const start = (h) => {
      cur = { ...base, section: h || "", lines: [] };
      chunks.push(cur);
      sub = "";
    };
    start("");
    const push = (text, extra) => {
      text = clean(text);
      if (!text || text.length < 2) return;
      if (cur.lines.length && cur.lines[cur.lines.length - 1].text === text) return;
      cur.lines.push({ text, sub, ...(extra || {}) });
    };
    function walk(el) {
      let buf = "";
      const flush = () => { push(buf); buf = ""; };
      for (const c of el.childNodes) {
        if (c.nodeType === 3) { buf += c.nodeValue; continue; }
        if (c.nodeType !== 1) continue;
        const tag = c.tagName;
        if (SKIP.has(tag) || c.hasAttribute("aria-hidden")) continue;
        if (tag === "BR") { flush(); continue; }
        if (!BLOCK.has(tag)) { buf += " " + inlineText(c) + " "; continue; }
        flush();
        if (tag === "H1") continue;
        if (splitTags.includes(tag)) { start(clean(c.textContent)); continue; }
        if (/^H[2-6]$/.test(tag)) { sub = clean(c.textContent); push("■ " + sub, { head: true }); continue; }
        if (tag === "TABLE") { tableLines(c).forEach((l) => push(l.text, { table: true })); continue; }
        if (c.classList && (c.classList.contains("wk-doc__crumb"))) continue;
        walk(c);
      }
      flush();
    }
    function inlineText(n) {
      let s = "";
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.nodeValue;
        else if (c.nodeType === 1 && !SKIP.has(c.tagName)) s += c.tagName === "BR" ? " " : inlineText(c);
      }
      return s;
    }
    walk(rootEl);
    return chunks.filter((c) => c.lines.length);
  }

  /** pages: { wiki: Document, rules: Document } → 색인 */
  function buildKB(pages) {
    const chunks = [];
    const wiki = pages.wiki;
    if (wiki) {
      for (const a of wiki.querySelectorAll("article.wk-doc")) {
        const title = clean((a.querySelector("h1") || {}).textContent) || a.id;
        const crumb = clean((a.querySelector(".wk-doc__crumb") || {}).textContent);
        splitDoc(a, { src: "wiki", anchor: a.id, title, crumb }, ["H2"]).forEach((c) => chunks.push(c));
      }
    }
    const rules = pages.rules;
    if (rules) {
      const main = rules.querySelector("main") || rules.body;
      let part = "서버 규칙";
      // 규칙 페이지는 h2(큰 묶음) 안에 h3(조항)
      splitDoc(main, { src: "rules", anchor: "", title: "서버 규칙", crumb: "규칙" }, ["H2", "H3"]).forEach((c) => {
        if (/운영정책|규칙/.test(c.section) && !/^\d/.test(c.section)) part = c.section;
        c.title = part;
        chunks.push(c);
      });
    }
    chunks.forEach((c, i) => {
      c.i = i;
      c.label = c.section && c.section !== c.title ? `${c.title} · ${c.section}` : c.title;
    });
    return index(chunks);
  }

  // ───────── 검색 ─────────
  const STOP = new Set(("은 는 이 가 을 를 에 에서 으로 로 의 도 만 좀 요 죠 나 뭐 뭔 뭐야 뭐에요 뭐예요 무엇 어떻게 어떡해 어디 어디서 언제 몇 얼마나 왜 " +
    "알려줘 알려주세요 알려 줘 주세요 해줘 해 하나요 하면 되나요 돼 돼요 되요 있어 있나요 있어요 없어 없나요 하는 하는법 방법 법 건가요 거야 " +
    "인가요 이야 이에요 예요 그 저 이거 저거 그거 것 거 수 때 좀 혹시 너굴마을 너굴 서버에서 서버").split(" "));
  const JOSA = /(으로|에서|에게|한테|까지|부터|이랑|랑|이나|하고|은|는|이|가|을|를|에|의|도|만|로|과|와|야|요)$/;
  const SYN = {
    디코: "디스코드", 디스코드: "디코인증", 인증: "디코인증 연동", 렙: "레벨", 레벨업: "레벨 경험치", 렙업: "레벨 경험치", 경치: "경험치",
    그릇: "플레이팅", 플레이팅: "그릇", 접두: "", 쿨: "쿨타임", 쿨탐: "쿨타임", 티켓: "무역선 티켓", 몹: "몬스터", 사냥: "던전 토벌",
    광질: "광산 채광", 채광: "광산", 엘베: "엘리베이터", 보챗: "보이스챗", 멤버쉽: "멤버십", 멤버쉽혜택: "멤버십 혜택", 템: "아이템",
    낚싯대: "낚싯대 강화", 낚시대: "낚싯대", 주소: "서버주소", 버전: "서버버전", 접속: "접속방법", 들어가: "접속방법", 셋홈: "셋홈 홈",
    확률: "확률 성공", 강화확률: "강화 확률", 도박: "사설 도박장", 매크로: "매크로 오토마우스", 오토: "오토마우스", 부캐: "부계정", 부계: "부계정",
    피로: "피로도", 피로도: "피로회복제", 회복제: "피로회복제", 유통: "유통기한", 기한: "유통기한", 무역포인트: "무역 포인트", 핫타: "핫타임",
    추천: "추천 보상 마인리스트", 출석: "접속보상", 섬업: "섬 업그레이드", 알바: "알바 고용", 상점: "유저상점", 거래: "거래 유저상점",
    한닉: "한글닉네임", 한글닉: "한글닉네임", 닉변: "한글닉네임", 치장: "치장 옷장", 펫: "펫", 날개: "치장", 스킬키: "스킬 키 세팅",
    큐브: "큐브각인", 초월: "초월강화", 전승: "강화전승", 장비: "장비제작", 무기: "장비제작 무기", 방어구: "장비제작 방어구",
    돈: "원 판매", 돈벌기: "판매 요리 무역", 시세: "시세표 유저상점", 허수: "허수아비", 잉걸불: "잉걸불 채집",
  };

  // 질문 종류에 맞는 줄을 더 쳐주기 (언제 → 시간, 얼마 → 숫자, 어디 → 장소)
  const CUES = [
    { q: /언제|몇\s*시|시간|요일|초기화|며칠|기간|끝나|마감|시작/, line: /(\d+\s*시|매일|매주|매월|요일|00시|\d+\s*일|오전|오후)/, w: 10 },
    { q: /얼마|몇|가격|비용|확률|퍼센트|%|개수|최대|상한/, line: /(\d|%|원|개|회)/, w: 4 },
    { q: /어디|어떻게 가|위치|이동|npc|구매|얻|획득|드랍|구해/i, line: /(워프|NPC|상점|이동|획득|드랍|구매|교환|비행장|광산|던전)/, w: 5 },
  ];
  function cueOf(q) { return CUES.filter((c) => c.q.test(q)); }
  const HOWTO = /어떻게|방법|하는\s*법|하는법|순서|절차|설치|적용|사용법|쓰는법/;

  function words(q) {
    return String(q).toLowerCase().replace(/[^\p{L}\p{N}/%.+-]+/gu, " ").split(" ").filter(Boolean);
  }
  function stem(w) {
    if (w.startsWith("/")) return w;
    let s = w;
    for (let k = 0; k < 2 && s.length > 1 && JOSA.test(s); k++) {
      const n = s.replace(JOSA, "");
      if (n.length < 1) break;
      s = n;
    }
    return s;
  }
  function grams(w) {
    const out = [];
    if (/[가-힣]/.test(w)) {
      if (w.length === 1) out.push(w);
      for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
    } else if (w.length >= 2 || /\d/.test(w)) out.push(w);
    return out;
  }
  function tokens(text) {
    const out = [];
    for (const raw of words(text)) {
      const w = stem(raw);
      if (!w || STOP.has(w) || STOP.has(raw)) continue;
      out.push(...grams(w));
      if (w.length > 2) out.push("§" + w); // 단어 전체 일치 보너스
    }
    return out;
  }
  function queryTokens(q) {
    const ws = words(q).map(stem).filter((w) => w && !STOP.has(w));
    const extra = [];
    for (const w of ws) if (SYN[w]) extra.push(SYN[w]);
    return { base: tokens(ws.join(" ")), extra: tokens(extra.join(" ")), words: ws };
  }

  function index(chunks) {
    const df = new Map();
    let total = 0;
    for (const c of chunks) {
      const body = tokens(c.lines.map((l) => l.text).join(" "));
      const title = tokens(`${c.title} ${c.section} ${c.crumb || ""}`);
      c.tf = new Map();
      for (const t of body) c.tf.set(t, (c.tf.get(t) || 0) + 1);
      c.tt = new Set(title);
      c.len = body.length;
      total += body.length;
      for (const t of new Set([...body, ...title])) df.set(t, (df.get(t) || 0) + 1);
      c.lines.forEach((l) => (l.tk = new Set(tokens(l.text))));
    }
    return { chunks, df, N: chunks.length, avg: total / Math.max(1, chunks.length) };
  }

  function idf(kb, t) {
    const n = kb.df.get(t) || 0;
    return Math.log(1 + (kb.N - n + 0.5) / (n + 0.5));
  }

  function scoreChunk(kb, c, qt, cues) {
    const k1 = 1.3, b = 0.7;
    let s = 0;
    const all = [...qt.base.map((t) => [t, 1]), ...qt.extra.map((t) => [t, 0.45])];
    const seen = new Set();
    for (const [t, w] of all) {
      if (seen.has(t)) continue;
      seen.add(t);
      const f = c.tf.get(t) || 0;
      const w2 = idf(kb, t) * w;
      if (f) s += w2 * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.len) / kb.avg)));
      if (c.tt.has(t)) s += w2 * 2.2; // 제목 · 소제목에 있으면 크게
    }
    // 제목+소제목이 질문 단어를 모두 담고 있으면 그 항목을 우선
    const sec = (c.title + (c.section || "")).replace(/\s/g, "");
    const ws = qt.words.filter((w) => w.length > 1);
    if (ws.length && ws.every((w) => sec.includes(w))) s += 6 + ws.length * 2;
    // 문서 이름과 딱 맞으면 그 문서의 개요(첫 부분)를 먼저
    const t = c.title.replace(/\s/g, "");
    if (ws.some((w) => w === t)) s += c.section ? 4 : 8;
    if (s > 0) {
      const q = new Set(qt.base);
      // 한 줄 안에 질문 단어가 다 들어 있으면
      if (ws.length > 1 && c.lines.some((l) => ws.every((w) => l.text.includes(w)))) s += 5;
      // 질문 종류(언제/얼마/어디)에 맞는 줄이 있으면
      for (const cue of cues || []) {
        if (c.lines.some((l) => cue.line.test(l.text) && [...l.tk].some((t) => q.has(t)))) s += cue.w;
      }
    }
    return s;
  }

  function pickLines(kb, c, qt, max, cues) {
    const q = new Set([...qt.base, ...qt.extra]);
    const scored = c.lines.map((l, i) => {
      let s = 0;
      for (const t of l.tk) if (q.has(t)) s += idf(kb, t);
      if (s > 0 && cues && cues.some((c) => c.line.test(l.text))) s *= 1.7;
      return { l, i, s };
    });
    const best = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    let keep;
    if (!best.length) keep = scored.slice(0, max);
    else {
      const top = best[0].s;
      keep = best.filter((x) => x.s >= top * 0.35).slice(0, max);
      // 소제목 줄만 걸리면 그 아래 몇 줄을 같이
      if (keep.length === 1 && keep[0].l.head) keep = scored.slice(keep[0].i, keep[0].i + max);
    }
    keep.sort((a, b) => a.i - b.i);
    return keep.map((x) => x.l);
  }

  /** 질문 → { best: {chunk, lines, score}, related: [chunk], confident, outline? } */
  function search(kb, q, opts) {
    const max = (opts && opts.maxLines) || 7;
    const qt = queryTokens(q);
    if (!qt.base.length && !qt.extra.length) return { best: null, related: [], confident: false, qt };
    const cues = cueOf(q);
    const lower = String(q).toLowerCase();

    // 명령어: "/섬 초대" 처럼 / 로 시작하면 명령어 표에서 바로 찾기 (길게 맞는 것부터)
    let m = lower.match(/\/[^\s?!.]+(?:\s+[가-힣a-z0-9]+){0,2}/);
    // "플라이"처럼 명령어 이름만 물어도
    if (!m && qt.words.length && qt.words.length <= 2 && !kb.chunks.some((c) => c.title.replace(/\s/g, "") === qt.words.join(""))) {
      const key = "/" + qt.words.join(" ");
      if (kb.chunks.some((c) => c.lines.some((l) => l.text.toLowerCase().startsWith(key + " ") || l.text.toLowerCase().startsWith(key + " —")))) m = [key];
    }
    if (m) {
      const parts = m[0].trim().split(/\s+/);
      for (let n = parts.length; n >= 1; n--) {
        const key = parts.slice(0, n).join(" ");
        const hits = [];
        for (const c of kb.chunks) for (const l of c.lines) if (l.text.toLowerCase().startsWith(key) || l.text.toLowerCase().includes(key + " ")) hits.push({ c, l });
        if (hits.length) {
          const exact = hits.filter((h) => h.l.text.toLowerCase().startsWith(key));
          const seenT = new Set();
          const use = (exact.length ? exact : hits).filter((h) => !seenT.has(h.l.text) && seenT.add(h.l.text)).slice(0, max);
          return { best: { chunk: use[0].c, lines: use.map((h) => h.l), score: 99 }, related: [], confident: true, qt };
        }
      }
    }

    const ranked = kb.chunks.map((c) => ({ c, s: scoreChunk(kb, c, qt, cues) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) return { best: null, related: [], confident: false, qt };

    // "디코인증 어떻게 해?"처럼 문서 이름 + 방법을 물으면 그 문서의 단계(소제목)를 차례로 보여주기
    const ws = qt.words.filter((w) => w.length > 1);
    if (HOWTO.test(q) && ws.length && ws.length <= 3) {
      const docTitle = (c) => c.title.replace(/\s/g, "");
      const doc = ranked.map((x) => x.c).find((c) => c.src === "wiki" && ws.every((w) => docTitle(c).includes(w) || w.includes(docTitle(c))));
      if (doc) {
        const parts = kb.chunks.filter((c) => c.src === "wiki" && c.anchor === doc.anchor);
        const steps = parts.filter((c) => c.section);
        if (steps.length >= 2) {
          const lines = [];
          const intro = parts.find((c) => !c.section);
          if (intro) lines.push(...intro.lines.filter((l) => !l.head).slice(0, 1));
          for (const st of steps.slice(0, 6)) {
            const first = st.lines.find((l) => !l.head);
            lines.push({ text: st.section + (first ? " — " + first.text : ""), step: true });
          }
          return { best: { chunk: { ...doc, section: "", label: doc.title }, lines, score: 50 }, related: ranked.filter((x) => x.c.anchor !== doc.anchor).slice(0, 3).map((x) => x.c), confident: true, outline: true, qt };
        }
      }
    }

    const top = ranked[0];
    const confident = top.s >= 4.5 && (ranked.length < 2 || top.s >= ranked[1].s * 1.08 || top.s >= 9);
    return {
      best: { chunk: top.c, lines: pickLines(kb, top.c, qt, max, cues), score: top.s },
      related: ranked.slice(1, 4).filter((x) => x.s >= top.s * 0.35).map((x) => x.c),
      confident,
      qt,
    };
  }

  function chunkLines(c, max) { return c.lines.slice(0, max || 10); }

  const api = { buildKB, search, chunkLines, tokens, queryTokens };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NugulAsk = api;
})(typeof self !== "undefined" ? self : this);
