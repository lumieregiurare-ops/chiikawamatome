(() => {
  const $ = (s) => document.querySelector(s);
  const PAGE = 30;
  const TOPICS_FIRST = 4;
  const SPIN_MS = 320;
  const FAV_KEY = "chii:fav";
  const READ_KEY = "chii:read";
  const STATE_KEY = "chii:state";
  const NG_KEY = "chii:ng";
  const OSHI_KEY = "chii:oshi";
  const STAMP_KEY = "chii:stamps";
  const KUJI_KEY = "chii:kuji";
  const SEED_KEY = "chii:seed";

  let data = null;
  let shown = PAGE;
  let topicsShown = TOPICS_FIRST;
  let shuffleSeed = Math.random();

  const store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key) || "null");
        return v === null ? fallback : v;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* プライベートモードなどでは保存しない */
      }
    },
  };

  let fav = store.get(FAV_KEY, []);
  let read = store.get(READ_KEY, []);
  let ngWords = store.get(NG_KEY, []);
  let oshi = store.get(OSHI_KEY, "");
  const state = Object.assign({ cat: "all", chara: "all", q: "", sort: "new" }, store.get(STATE_KEY, {}));

  // ---------- キャラクター ----------
  // 紹介文は当サイトが書いたもの。id は config.json の series と対応している。
  // ちいかわ本人はほぼ全記事に出てくるので「すべて」の扱いにする
  const CHARAS = [
    { id: "all", label: "ちいかわ", color: "#ffb3c7", intro: "「なんか小さくてかわいいやつ」。泣き虫だけど、友だち思いのがんばり屋さん。" },
    { id: "hachiware", label: "ハチワレ", color: "#9cc9ff", intro: "明るくて前向き。おしゃべりが得意な、ちいかわの友だち。" },
    { id: "usagi", label: "うさぎ", color: "#ffd96b", intro: "「ヤハ」「ウラ」と叫ぶ、自由でパワフルな子。なにをするか読めない。" },
    { id: "momonga", label: "モモンガ", color: "#c9b6ff", intro: "自分がかわいいことをよく知っている。ちょっとわがままで目立ちたがり。" },
    { id: "kurimanju", label: "くりまんじゅう", color: "#e8b88a", intro: "おいしいものとお酒が好き。ひと口ごとに「ハーッ」と息をつく。" },
    { id: "rakko", label: "ラッコ", color: "#b4c3d8", intro: "討伐ランキング上位の実力者。ちいかわたちのあこがれ。" },
    { id: "shisa", label: "シーサー", color: "#ffb88c", intro: "ラーメン屋さんで修行中のがんばり屋さん。" },
    { id: "kuma", label: "自分ツッコミくま", color: "#d9b48f", intro: "ナガノさんのもうひとつの人気キャラ。自分で自分にツッコむくま。" },
  ];
  const charaOf = (id) => CHARAS.find((c) => c.id === id);

  // ---------- 小物 ----------
  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function hhmm(iso) {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function dayKey(iso) {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  function dayLabel(key) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - date) / 86400000);
    const wd = WD[date.getDay()];
    if (diff === 0) return `きょう ${m}/${d}（${wd}）`;
    if (diff === 1) return `きのう ${m}/${d}（${wd}）`;
    return `${m}/${d}（${wd}）`;
  }
  function labelOfCat(id) {
    return data.categories.find((c) => c.id === id)?.label || "";
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function extLink(url, text, cls) {
    const a = el("a", cls, text);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  // ---------- サムネイル ----------
  // 画像が取れなかった記事には、ジャンルごとの小さな絵を描いたパステルの札を出す
  const PASTELS = ["#ffd6e0", "#d6ecff", "#fff0b3", "#d8f5dc", "#e8dcff", "#ffe2cc"];
  const MOTIF = {
    goods: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><rect x="3" y="7" width="18" height="4.5" rx="2"/><path d="M12 7c-2-4-6-4-5-1 .4 1 2 1 5 1zm0 0c2-4 6-4 5-1-.4 1-2 1-5 1z"/>',
    kuji: '<path d="M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6z"/>',
    collab: '<path d="M5 9h12v4.5a6 6 0 0 1-12 0z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H16.6" fill="none" stroke="#fff" stroke-width="2"/><path d="M8.5 3.5c-1 1.2 1 1.8 0 3.2M12.5 3.5c-1 1.2 1 1.8 0 3.2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
    event: '<path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5c0 4.3-3.8 7.5-6.5 7.5S5.5 13.3 5.5 9A6.5 6.5 0 0 1 12 2.5z"/><path d="M12 16.5c-1 2 1 3-.5 5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
    anime: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M8 3l4 4 4-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    book: '<path d="M3 5.5c3-1.3 6.2-1.2 9 .8 2.8-2 6-2.1 9-.8V20c-3-1.3-6.2-1.2-9 .8-2.8-2-6-2.1-9-.8z"/>',
    game: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/>',
    other: '<path d="M12 2l2.9 6.5L22 9.6l-5.2 4.8 1.4 7.6L12 18.1l-6.2 3.9 1.4-7.6L2 9.6l7.1-1.1z"/>',
  };
  function applyPlaceholder(box, seed, cat) {
    box.classList.add("thumb-ph");
    box.style.background = PASTELS[hash(seed) % PASTELS.length];
    box.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="#fff">${MOTIF[cat] || MOTIF.other}</svg>`;
  }
  // url があれば画像、なければプレースホルダー。画像の読み込みに失敗したらプレースホルダーに差し替える
  function thumbNode(url, seed, cat, className) {
    const box = el("div", className);
    if (url) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        img.remove();
        applyPlaceholder(box, seed, cat);
      });
      box.appendChild(img);
    } else {
      applyPlaceholder(box, seed, cat);
    }
    return box;
  }
  function spinnerNode() {
    const sp = el("span", "spinner");
    sp.setAttribute("role", "status");
    sp.setAttribute("aria-label", "読み込み中");
    return sp;
  }
  // 高さを保ったままクルクルを挟んでから中身を入れ替える
  function swapWithSpinner(box, render, { min = 76, max = 300 } = {}) {
    const h = Math.min(max, Math.max(min, box.offsetHeight || 0));
    box.style.minHeight = `${h}px`;
    box.classList.add("is-loading");
    box.innerHTML = "";
    box.appendChild(spinnerNode());
    setTimeout(() => {
      render();
      box.classList.remove("is-loading");
      box.style.minHeight = "";
    }, SPIN_MS);
  }

  function save() {
    store.set(STATE_KEY, state);
  }
  function set(patch) {
    Object.assign(state, patch);
    shown = PAGE;
    save();
    renderChara();
    renderFilters();
    renderList();
  }

  // ---------- 絞り込み ----------
  // 見たくないことばを含む記事を隠す
  function matchesNg(it) {
    if (!ngWords.length) return false;
    const text = `${it.title} ${it.summary || ""}`.toLowerCase();
    return ngWords.some((w) => text.includes(w.toLowerCase()));
  }
  function byChara(id) {
    return data.items.filter((it) => (id === "all" || (it.series || []).includes(id)) && !matchesNg(it));
  }
  function visible() {
    const q = state.q.trim().toLowerCase();
    return data.items.filter((it) => {
      if (state.cat !== "all" && !it.categories.includes(state.cat)) return false;
      if (state.chara !== "all" && !(it.series || []).includes(state.chara)) return false;
      if (matchesNg(it)) return false;
      if (q && !`${it.title} ${it.summary || ""} ${it.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  // おまかせ順。並べ替えのたびに変わらないよう、seed から決める
  function shuffled(list) {
    const arr = list.map((it, i) => ({ it, k: Math.sin((i + 1) * 9301 + shuffleSeed * 49297) }));
    arr.sort((a, b) => a.k - b.k);
    return arr.map((x) => x.it);
  }

  // ---------- ハート（おきにいり） ----------
  const HEART = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 4.2 2.3.6-1.1 2-2.3 4.2-2.3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  function favButton(id) {
    const b = el("button", "fav-btn" + (fav.includes(id) ? " on" : ""));
    b.type = "button";
    b.innerHTML = HEART;
    b.title = "おきにいり";
    b.setAttribute("aria-label", "おきにいり");
    b.setAttribute("aria-pressed", String(fav.includes(id)));
    b.addEventListener("click", (e) => {
      e.preventDefault();
      toggleFav(id);
      const on = fav.includes(id);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
      if (on) burst(b);
      onFavChanged();
    });
    return b;
  }
  function burst(target) {
    target.classList.remove("pop");
    void target.offsetWidth;
    target.classList.add("pop");
    const box = el("span", "burst");
    const colors = ["#ff8fab", "#ffd43b", "#9cc9ff", "#b197fc", "#8ce99a", "#ffa94d"];
    for (let i = 0; i < 8; i++) {
      const p = el("i", "burst-dot");
      p.style.setProperty("--angle", `${45 * i}deg`);
      p.style.background = colors[i % colors.length];
      box.appendChild(p);
    }
    target.appendChild(box);
    setTimeout(() => box.remove(), 700);
  }
  function markRead(id) {
    if (read.includes(id)) return;
    read = [id, ...read].slice(0, 400);
    store.set(READ_KEY, read);
  }
  function toggleFav(id) {
    fav = fav.includes(id) ? fav.filter((x) => x !== id) : [id, ...fav].slice(0, 200);
    store.set(FAV_KEY, fav);
  }

  // ---------- 記事の行 ----------
  function charaTags(it, box) {
    for (const s of (it.series || []).slice(0, 2)) {
      const c = charaOf(s);
      if (!c) continue;
      const t = el("span", "badge badge-chara", c.label);
      t.style.setProperty("--c", c.color);
      box.appendChild(t);
    }
  }
  function makeRow(it) {
    const row = el("article", "row" + (it.isNew ? " is-new" : "") + (read.includes(it.id) ? " is-read" : ""));
    const thumb = thumbNode(it.image, it.title, it.categories[0], "row-thumb");
    const body = el("div", "row-body");

    const top = el("div", "row-top");
    if (it.isNew) top.appendChild(el("span", "badge badge-new", "NEW"));
    const label = labelOfCat(it.categories[0]);
    if (label && it.categories[0] !== "other") {
      const b = el("span", `badge badge-cat cat-${it.categories[0]}`, label);
      top.appendChild(b);
    }
    charaTags(it, top);
    if (it.isPR) top.appendChild(el("span", "badge badge-pr", "PR"));

    const a = extLink(it.url, it.title, "row-title");
    a.addEventListener("click", () => {
      markRead(it.id);
      row.classList.add("is-read");
    });
    const meta = el("div", "row-meta", `${it.source} ・ ${hhmm(it.publishedAt)}`);
    body.append(top, a);
    if (it.summary) body.appendChild(el("p", "row-sum", it.summary));
    body.appendChild(meta);

    row.append(thumb, body, favButton(it.id));
    return row;
  }

  // ---------- 一覧 ----------
  function renderList() {
    const all = visible();
    const ordered = state.sort === "shuffle" ? shuffled(all) : all;
    const list = ordered.slice(0, shown);
    const box = $("#list");
    box.innerHTML = "";

    const countEl = $("#count");
    countEl.innerHTML = "";
    const parts = [];
    if (state.chara !== "all") parts.push(charaOf(state.chara)?.label);
    if (state.cat !== "all") parts.push(labelOfCat(state.cat));
    if (state.q) parts.push(`「${state.q}」`);
    countEl.append(`${all.length} 件${parts.length ? `（${parts.join(" × ")}）` : ""}`);
    if (parts.length) {
      const clear = el("button", "q-clear", "しぼりこみを解除");
      clear.type = "button";
      clear.addEventListener("click", () => {
        $("#searchInput").value = "";
        set({ q: "", cat: "all", chara: "all" });
      });
      countEl.appendChild(clear);
    }
    $("#empty").hidden = all.length > 0;

    if (state.sort === "shuffle") {
      const rows = el("div", "rows");
      for (const it of list) rows.appendChild(makeRow(it));
      box.appendChild(rows);
    } else {
      const groups = new Map();
      for (const it of list) {
        const k = dayKey(it.publishedAt);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(it);
      }
      for (const [key, items] of groups) {
        const sec = el("section", "day");
        const h = el("h3", "day-head");
        h.append(el("span", "day-label", dayLabel(key)), el("span", "day-n", `${items.length} 件`));
        const rows = el("div", "rows");
        for (const it of items) rows.appendChild(makeRow(it));
        sec.append(h, rows);
        box.appendChild(sec);
      }
    }

    const more = $("#listMore");
    more.hidden = all.length <= list.length;
    more.textContent = `もっと見る（あと ${all.length - list.length} 件）`;
  }

  // ---------- いま話題のニュース ----------
  function hearts(n) {
    const box = el("span", "hearts");
    const k = Math.min(5, n);
    box.setAttribute("aria-label", `${n} 媒体`);
    box.innerHTML = '<i class="h-on">♥</i>'.repeat(k) + '<i class="h-off">♥</i>'.repeat(5 - k);
    return box;
  }
  function topicCard(t, big) {
    const card = el("article", big ? "topic topic-hero" : "topic");
    const link = extLink(t.url || t.articles?.[0]?.url || "#", "", "topic-img-link");
    link.setAttribute("aria-hidden", "true");
    link.tabIndex = -1;
    link.appendChild(thumbNode(t.image, t.title, (t.categories || [])[0], "topic-thumb"));
    link.addEventListener("click", () => markRead(t.id));

    const body = el("div", "topic-body");
    const top = el("div", "topic-top");
    top.append(hearts(t.sourceCount), el("span", "topic-count", `${t.sourceCount} 媒体`), el("span", "topic-time", `${dayLabel(dayKey(t.publishedAt)).replace(/（.）/, "")} ${hhmm(t.publishedAt)}`));
    const h = el(big ? "h3" : "h3", "topic-title");
    const a = extLink(t.url || "#", t.title);
    a.addEventListener("click", () => markRead(t.id));
    h.appendChild(a);
    body.append(top, h);
    if (big && t.summary) body.appendChild(el("p", "topic-sum", t.summary));

    const arts = (t.articles || []).slice(0, big ? 4 : 2);
    if (arts.length) {
      const ul = el("ul", "topic-links");
      for (const it of arts) {
        const li = el("li");
        li.append(el("span", "src", it.source), extLink(it.url, it.title));
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
    card.append(link, body);
    return card;
  }
  function renderTopics() {
    const list = (data.topics || []).filter((t) => !matchesNg({ title: t.title, summary: t.summary }));
    const sec = $("#topicsSection");
    if (!list.length) {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    const hero = $("#topicHero");
    hero.innerHTML = "";
    hero.appendChild(topicCard(list[0], true));
    const grid = $("#topicGrid");
    grid.innerHTML = "";
    for (const t of list.slice(1, topicsShown + 1)) grid.appendChild(topicCard(t, false));
    const more = $("#topicMore");
    const rest = list.length - 1 - topicsShown;
    more.hidden = rest <= 0;
    more.textContent = `ほかの話題も見る（あと ${rest} 件）`;
  }

  // ---------- 推しキャラ ----------
  // キャラの丸には、そのキャラの名前が出てくるいちばん新しい記事の画像を使う
  function charaImage(id) {
    if (id === "all") return data.topics?.find((t) => t.image)?.image || data.items.find((it) => it.image)?.image || "";
    return data.items.find((it) => (it.series || []).includes(id) && it.image)?.image || "";
  }
  function renderChara() {
    const row = $("#charaRow");
    row.innerHTML = "";
    for (const c of CHARAS) {
      const n = c.id === "all" ? data.items.length : data.items.filter((it) => (it.series || []).includes(c.id)).length;
      const b = el("button", "chara" + (state.chara === c.id ? " active" : "") + (oshi === c.id ? " is-oshi" : ""));
      b.type = "button";
      b.style.setProperty("--c", c.color);
      b.setAttribute("aria-pressed", String(state.chara === c.id));
      const face = el("span", "chara-face");
      const img = charaImage(c.id);
      if (img) {
        const im = document.createElement("img");
        im.src = img;
        im.alt = "";
        im.loading = "lazy";
        im.referrerPolicy = "no-referrer";
        im.addEventListener("error", () => {
          im.remove();
          face.textContent = c.label[0];
        });
        face.appendChild(im);
      } else {
        face.textContent = c.label[0];
      }
      if (oshi === c.id) {
        const crown = el("span", "chara-oshi", "推し");
        face.appendChild(crown);
      }
      const name = el("span", "chara-name", c.label);
      const cnt = el("span", "chara-n", c.id === "all" ? "すべて" : `${n} 件`);
      b.append(face, name, cnt);
      b.addEventListener("click", () => {
        set({ chara: state.chara === c.id && c.id !== "all" ? "all" : c.id });
      });
      row.appendChild(b);
    }
    renderCharaPanel();
  }
  function renderCharaPanel() {
    const panel = $("#charaPanel");
    const c = charaOf(state.chara);
    panel.innerHTML = "";
    if (!c || c.id === "all") {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    panel.style.setProperty("--c", c.color);
    const n = byChara(c.id).length;
    const txt = el("div", "chara-panel-text");
    txt.append(el("strong", "chara-panel-name", c.label), el("p", "chara-panel-intro", c.intro));
    const meta = el("p", "chara-panel-meta", n ? `いま ${n} 件のニュースに名前が出ています` : "いまはこのキャラの名前が出ているニュースがありません");
    txt.appendChild(meta);
    const tools = el("div", "chara-panel-tools");
    const ob = el("button", "oshi-btn" + (oshi === c.id ? " on" : ""), oshi === c.id ? "推しに設定中 ♥" : "推しにする ♡");
    ob.type = "button";
    ob.addEventListener("click", () => {
      oshi = oshi === c.id ? "" : c.id;
      store.set(OSHI_KEY, oshi);
      if (oshi) burst(ob);
      applyOshi();
      renderChara();
      renderOshi();
    });
    const go = el("button", "link-btn", "ニュースを見る");
    go.type = "button";
    go.addEventListener("click", () => $("#feedSection").scrollIntoView({ behavior: "smooth", block: "start" }));
    tools.append(ob, go);
    panel.append(txt, tools);
  }
  function applyOshi() {
    const c = charaOf(oshi);
    document.documentElement.style.setProperty("--oshi", c ? c.color : "#ffb3c7");
  }
  function renderOshi() {
    const sec = $("#oshiSection");
    const c = charaOf(oshi);
    if (!c || c.id === "all") {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    sec.style.setProperty("--c", c.color);
    $("#oshiTitle").textContent = `推しの${c.label}のニュース`;
    const box = $("#oshiList");
    box.innerHTML = "";
    const items = byChara(c.id).slice(0, 10);
    if (!items.length) {
      box.appendChild(el("p", "oshi-empty", `いまは ${c.label} の名前が出ているニュースがありません。入ったらここに並びます。`));
      $("#oshiAll").hidden = true;
      return;
    }
    $("#oshiAll").hidden = false;
    for (const it of items) {
      const card = extLink(it.url, "", "oshi-card");
      card.addEventListener("click", () => markRead(it.id));
      card.appendChild(thumbNode(it.image, it.title, it.categories[0], "oshi-thumb"));
      if (it.isNew) card.appendChild(el("span", "badge badge-new oshi-new", "NEW"));
      card.appendChild(el("span", "oshi-title", it.title));
      card.appendChild(el("span", "oshi-meta", `${it.source} ・ ${dayLabel(dayKey(it.publishedAt)).replace(/（.）/, "")}`));
      box.appendChild(card);
    }
  }

  // ---------- これからの予定 ----------
  // 見出しに書かれた「9月25日発売」「9/24（木）から販売」のような日付を拾う。
  // 日付のすぐ後ろに発売・開催などの語があるものだけを予定とみなす
  const ACT_RE = /^[^。！!]{0,14}?(再販|発売|販売|開催|オープン|開始|スタート|登場|公開|放送|配信|予約|受付|抽選)/;
  const DATE_RE = /(?:(\d{1,2})月(\d{1,2})日|(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/]))/g;
  function bigrams(s) {
    const t = s.replace(/[「」『』【】（）()\s!！?？・、。〜～:：|｜"“”]/g, "").replace(/ちいかわ/g, "");
    const set = new Set();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  }
  function sim(a, b) {
    let n = 0;
    for (const x of a) if (b.has(x)) n++;
    return n / Math.max(1, Math.min(a.size, b.size));
  }
  function extractSchedule() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const out = [];
    for (const it of data.items) {
      if (matchesNg(it)) continue;
      for (const m of it.title.matchAll(DATE_RE)) {
        const mo = Number(m[1] || m[3]);
        const d = Number(m[2] || m[4]);
        if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
        const act = it.title.slice(m.index + m[0].length).match(ACT_RE);
        if (!act) continue;
        let date = new Date(today.getFullYear(), mo - 1, d);
        // 年末に「1月10日発売」とあれば翌年のこと
        if (date - today < -120 * 86400000) date = new Date(today.getFullYear() + 1, mo - 1, d);
        const days = Math.round((date - today) / 86400000);
        if (days < 0 || days > 90) continue;
        out.push({ it, date, days, act: act[1], bi: bigrams(it.title) });
        break;
      }
    }
    out.sort((a, b) => a.date - b.date || new Date(b.it.publishedAt) - new Date(a.it.publishedAt));
    // 同じ日付の似た見出しは 1 つにまとめる（同じ発表を複数の媒体が報じているため）
    const kept = [];
    for (const x of out) {
      const dup = kept.find((k) => k.date - x.date === 0 && sim(k.bi, x.bi) > 0.45);
      if (dup) {
        if (!dup.it.image && x.it.image) dup.it = x.it;
        continue;
      }
      kept.push(x);
    }
    return kept.slice(0, 14);
  }
  function renderSchedule() {
    const list = extractSchedule();
    const sec = $("#calSection");
    sec.hidden = !list.length;
    const box = $("#calList");
    box.innerHTML = "";
    for (const x of list) {
      const card = extLink(x.it.url, "", "cal-card" + (x.days <= 1 ? " is-soon" : ""));
      card.addEventListener("click", () => markRead(x.it.id));
      const date = el("div", "cal-date");
      date.append(
        el("span", "cal-md", `${x.date.getMonth() + 1}/${x.date.getDate()}`),
        el("span", "cal-wd", `（${WD[x.date.getDay()]}）`),
        el("span", "cal-left", x.days === 0 ? "きょう" : x.days === 1 ? "あした" : `あと ${x.days} 日`)
      );
      const body = el("div", "cal-body");
      body.append(el("span", "cal-act", x.act), el("span", "cal-title", x.it.title));
      card.append(date, thumbNode(x.it.image, x.it.title, x.it.categories[0], "cal-thumb"), body);
      box.appendChild(card);
    }
  }

  // ---------- ジャンル・ことば ----------
  const CAT_ICON = {
    all: "♥", goods: "🎀", kuji: "🎫", collab: "☕", event: "🎈", anime: "📺", book: "📖", game: "🎮", other: "✨",
  };
  function renderFilters() {
    const cl = $("#catList");
    cl.innerHTML = "";
    const pool = data.items.filter((it) => (state.chara === "all" || (it.series || []).includes(state.chara)) && !matchesNg(it));
    const cats = [{ id: "all", label: "すべて" }, ...data.categories];
    for (const c of cats) {
      const n = c.id === "all" ? pool.length : pool.filter((it) => it.categories.includes(c.id)).length;
      if (c.id !== "all" && !n && state.cat !== c.id) continue;
      const b = el("button", `cat-tab cat-${c.id}` + (state.cat === c.id ? " active" : ""));
      b.type = "button";
      b.setAttribute("aria-pressed", String(state.cat === c.id));
      b.append(el("span", "cat-ico", CAT_ICON[c.id] || "✨"), el("span", "", c.label), el("span", "n", String(n)));
      b.addEventListener("click", () => set({ cat: c.id }));
      cl.appendChild(b);
    }

    for (const b of document.querySelectorAll("#sortSeg button")) b.classList.toggle("active", b.dataset.sort === state.sort);
    $("#searchInput").value = state.q;
  }
  // よく探されそうなことば。いまの記事に 2 件以上あるものだけ出す
  const QUICK = ["ぬいぐるみ", "マスコット", "一番くじ", "ポップアップ", "カフェ", "ガチャ", "シール", "パジャマ", "コスメ", "映画", "ハロウィン", "クリスマス", "再販", "受注"];
  function renderQuick() {
    const box = $("#quickWords");
    box.innerHTML = "";
    for (const w of QUICK) {
      const n = data.items.filter((it) => `${it.title} ${it.summary || ""}`.includes(w)).length;
      if (n < 2) continue;
      const b = el("button", "qw", `#${w}`);
      b.type = "button";
      b.appendChild(el("span", "n", String(n)));
      b.addEventListener("click", () => {
        set({ q: state.q === w ? "" : w });
      });
      box.appendChild(b);
    }
  }

  // ---------- まいにちスタンプ ----------
  const STAMP_SHAPES = [
    '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 4.2 2.3.6-1.1 2-2.3 4.2-2.3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/>',
    '<path d="M12 2l2.9 6.5L22 9.6l-5.2 4.8 1.4 7.6L12 18.1l-6.2 3.9 1.4-7.6L2 9.6l7.1-1.1z"/>',
    '<circle cx="12" cy="6.5" r="4"/><circle cx="17.2" cy="10.3" r="4"/><circle cx="15.2" cy="16.4" r="4"/><circle cx="8.8" cy="16.4" r="4"/><circle cx="6.8" cy="10.3" r="4"/><circle cx="12" cy="12" r="3" fill="#fff5bf"/>',
    '<path d="M12 3c2 3 5 4 8 4-1 3 0 6 1 8-3 0-6 2-9 6-3-4-6-6-9-6 1-2 2-5 1-8 3 0 6-1 8-4z"/>',
    '<path d="M4 8c0-3 4-4 8 0 4-4 8-3 8 0 0 2-2 3-4 4l4 8-8-5-8 5 4-8c-2-1-4-2-4-4z"/>',
  ];
  const STAMP_COLORS = ["#ff8fab", "#74c0fc", "#ffd43b", "#8ce99a", "#b197fc", "#ffa94d"];
  let stampIsNew = false;
  function touchStamp() {
    let days = store.get(STAMP_KEY, []);
    if (!Array.isArray(days)) days = [];
    const today = dayKey();
    if (!days.includes(today)) {
      days = [...days, today].slice(-500);
      store.set(STAMP_KEY, days);
      stampIsNew = true;
    }
    return days;
  }
  function streakOf(days) {
    const set = new Set(days);
    let n = 0;
    const d = new Date();
    while (set.has(dayKey(d.toISOString()))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }
  function renderStamp() {
    const days = touchStamp();
    const total = days.length;
    const cards = Math.floor((total - 1) / 10);
    const inCard = total - cards * 10;
    const box = $("#stampBody");
    box.innerHTML = "";
    const grid = el("div", "stamp-grid");
    for (let i = 0; i < 10; i++) {
      const cell = el("div", "stamp-cell");
      cell.appendChild(el("span", "stamp-no", String(i + 1)));
      if (i < inCard) {
        const k = cards * 10 + i;
        const color = STAMP_COLORS[k % STAMP_COLORS.length];
        const shape = STAMP_SHAPES[hash(days[k] || String(k)) % STAMP_SHAPES.length];
        const s = el("span", "stamp" + (stampIsNew && i === inCard - 1 ? " just" : ""));
        s.style.setProperty("--r", `${(hash(String(k)) % 30) - 15}deg`);
        s.innerHTML = `<svg viewBox="0 0 24 24" fill="${color}" aria-hidden="true">${shape}</svg>`;
        cell.classList.add("on");
        cell.appendChild(s);
      }
      grid.appendChild(cell);
    }
    box.appendChild(grid);
    const streak = streakOf(days);
    const info = el("p", "stamp-info");
    info.innerHTML = `これまで <b>${total}</b> 日 ・ れんぞく <b>${streak}</b> 日`;
    box.appendChild(info);
    if (cards > 0 || inCard === 10) {
      const done = cards + (inCard === 10 ? 1 : 0);
      box.appendChild(el("p", "stamp-cards", `カードいっぱい × ${done} まい`));
    }
    if (inCard === 10) box.appendChild(el("p", "stamp-msg", "カードがいっぱいになりました。あしたから新しいカードです。"));
    else if (stampIsNew) box.appendChild(el("p", "stamp-msg", "きょうのスタンプをおしました。"));
  }

  // ---------- きょうのおみくじ ----------
  const FORTUNES = [
    ["大吉", 15],
    ["中吉", 25],
    ["小吉", 25],
    ["吉", 25],
    ["末吉", 10],
  ];
  const COLORS = [
    ["ももいろ", "#ffb3c7"],
    ["そらいろ", "#a5d8ff"],
    ["レモンいろ", "#ffe066"],
    ["ミントいろ", "#b2f2bb"],
    ["ラベンダー", "#d0bfff"],
    ["ミルクティーいろ", "#e6cbb0"],
    ["しろ", "#ffffff"],
    ["オレンジ", "#ffc078"],
  ];
  const ITEMS = ["おにぎり", "あったかいスープ", "パジャマ", "シール", "ふわふわのタオル", "あまいパン", "ヘアピン", "ぬいぐるみ", "手紙", "ホットミルク", "ラーメン", "お花", "ハンカチ", "マフラー", "ちいさいポーチ", "おやつ"];
  const MESSAGES = [
    "ちいさなことを、ひとつだけがんばってみよう。",
    "好きなものの話をすると、いい流れになりそう。",
    "きょうは早めにおふとんへ入るのが吉。",
    "おいしいものを分けっこすると、いいことがあるかも。",
    "迷ったら、かわいいほうを選んで大丈夫。",
    "なくしものが見つかるかも。",
    "近くの人に「ありがとう」を言ってみて。",
    "寄り道すると、ちいさな発見がありそう。",
    "がんばりすぎないのが、きょうのコツ。",
    "新しいものをひとつ使ってみると気分が上がりそう。",
    "空を見上げると、ちょっと元気が出るかも。",
    "推しのニュースをチェックするとラッキー。",
  ];
  function seed() {
    let s = store.get(SEED_KEY, 0);
    if (!s) {
      s = Math.floor(Math.random() * 1e9) + 1;
      store.set(SEED_KEY, s);
    }
    return s;
  }
  // 同じ日なら何度開いても同じ結果になるよう、日付と端末ごとの seed から決める
  function drawKuji(day) {
    const h = (k) => hash(`${day}:${seed()}:${k}`);
    const total = FORTUNES.reduce((a, f) => a + f[1], 0);
    let r = h("f") % total;
    let fortune = FORTUNES[0][0];
    for (const [name, w] of FORTUNES) {
      if (r < w) {
        fortune = name;
        break;
      }
      r -= w;
    }
    return {
      fortune,
      chara: CHARAS[h("c") % CHARAS.length].id,
      color: h("k") % COLORS.length,
      item: ITEMS[h("i") % ITEMS.length],
      msg: MESSAGES[h("m") % MESSAGES.length],
    };
  }
  function renderKuji(animate) {
    const box = $("#kujiBody");
    box.innerHTML = "";
    const today = dayKey();
    const saved = store.get(KUJI_KEY, null);
    if (!saved || saved.day !== today) {
      const b = el("button", "kuji-draw");
      b.type = "button";
      b.innerHTML = '<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><rect x="27" y="3" width="10" height="20" rx="4" fill="#ffd43b"/><rect x="12" y="14" width="40" height="46" rx="12" fill="#ff8fab"/><path d="M32 26l3.4 7.2 7.8 1-5.7 5.4 1.5 7.8L32 43.6l-7 3.8 1.5-7.8-5.7-5.4 7.8-1z" fill="#fff"/></svg><span>おみくじをひく</span>';
      b.addEventListener("click", () => {
        b.classList.add("shake");
        setTimeout(() => {
          store.set(KUJI_KEY, { day: today });
          renderKuji(true);
        }, 700);
      });
      box.appendChild(b);
      return;
    }
    const r = drawKuji(today);
    const c = charaOf(r.chara);
    const [cname, ccode] = COLORS[r.color];
    const card = el("div", "kuji-card" + (animate ? " reveal" : "") + (r.fortune === "大吉" ? " is-great" : ""));
    card.appendChild(el("div", "kuji-fortune", r.fortune));
    card.appendChild(el("p", "kuji-msg", r.msg));
    const dl = el("dl", "kuji-lucky");
    const add = (k, v) => {
      dl.append(el("dt", "", k));
      const dd = el("dd");
      if (typeof v === "string") dd.textContent = v;
      else dd.appendChild(v);
      dl.appendChild(dd);
    };
    const cb = el("button", "kuji-chara", c.label);
    cb.type = "button";
    cb.style.setProperty("--c", c.color);
    cb.title = "このキャラのニュースを見る";
    cb.addEventListener("click", () => {
      set({ chara: c.id });
      $("#feedSection").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    add("ラッキーキャラ", cb);
    const sw = el("span", "kuji-color");
    const dot = el("i");
    dot.style.background = ccode;
    sw.append(dot, cname);
    add("ラッキーカラー", sw);
    add("ラッキーアイテム", r.item);
    card.appendChild(dl);
    card.appendChild(el("p", "kuji-next", "あしたまた ひけます"));
    box.appendChild(card);
    // めざましmedia の「ちいかわ占い」が拾えていれば、その日の分へのリンクも出す
    const m = new Date();
    const official = data?.items.find((it) => /ちいかわ占い/.test(it.title) && it.title.includes(`${m.getMonth() + 1}月${m.getDate()}日`));
    if (official) {
      const a = extLink(official.url, "きょうの「ちいかわ占い」（めざましmedia）も見る", "kuji-official");
      box.appendChild(a);
    }
  }

  // ---------- ニュースガチャ ----------
  let gachaId = "";
  const CAPSULE = ["#ff8fab", "#74c0fc", "#ffd43b", "#8ce99a", "#b197fc"];
  function renderGacha() {
    const pool = data.items.filter((it) => !it.isPR && !matchesNg(it));
    const box = $("#gachaBody");
    box.innerHTML = "";
    if (!pool.length) return;
    // まだ開いていない記事を優先する（毎回同じものが出ないように）
    const unread = pool.filter((it) => !read.includes(it.id) && it.id !== gachaId);
    const from = unread.length ? unread : pool.filter((it) => it.id !== gachaId);
    const src = from.length ? from : pool;
    const it = src[Math.floor(Math.random() * src.length)];
    gachaId = it.id;

    const a = extLink(it.url, "", "gacha-item");
    a.style.setProperty("--cap", CAPSULE[Math.floor(Math.random() * CAPSULE.length)]);
    a.addEventListener("click", () => markRead(it.id));
    const thumb = thumbNode(it.image, it.title, it.categories[0], "gacha-thumb");
    const info = el("div", "gacha-info");
    info.append(el("div", "gacha-title", it.title), el("div", "gacha-meta", `${it.source} ・ ${hhmm(it.publishedAt)}`));
    a.append(thumb, info);
    box.appendChild(a);
  }
  function spinGacha() {
    const box = $("#gachaBody");
    const h = Math.max(120, box.offsetHeight || 0);
    box.style.minHeight = `${h}px`;
    box.innerHTML = `<div class="gacha-spin"><svg viewBox="0 0 48 48" width="60" height="60" aria-hidden="true"><path d="M6 24a18 18 0 0 1 36 0z" fill="${CAPSULE[Math.floor(Math.random() * CAPSULE.length)]}"/><path d="M6 24a18 18 0 0 0 36 0z" fill="#fff" stroke="#f1d3dc" stroke-width="1.5"/><rect x="5" y="22.5" width="38" height="3" rx="1.5" fill="#fff"/></svg></div>`;
    setTimeout(() => {
      renderGacha();
      box.style.minHeight = "";
    }, 650);
  }

  // ---------- ほかの媒体の記事 ----------
  async function renderOtherNews() {
    let other;
    try {
      const r = await fetch(`data/other.json?t=${Math.floor(Date.now() / 300000)}`);
      other = await r.json();
    } catch {
      return;
    }
    // 同じ見出しを複数の媒体が転載していることが多いので、見出しの頭が同じものは 1 つにする
    const seen = new Set();
    const items = (other.items || [])
      .filter((it) => {
        const k = it.title.replace(/[\s　「」『』【】]/g, "").slice(0, 18);
        if (matchesNg(it) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 5);
    if (!items.length) return;
    $("#otherMod").hidden = false;
    const box = $("#otherList");
    box.innerHTML = "";
    for (const it of items) {
      const li = el("li");
      li.append(el("div", "other-meta", `${it.source} ・ ${hhmm(it.publishedAt)}`), extLink(it.url, it.title));
      box.appendChild(li);
    }
  }

  // ---------- おきにいり ----------
  function updateFavCount() {
    const c = $("#favCount");
    c.hidden = fav.length === 0;
    c.textContent = String(fav.length);
  }
  function renderFavView() {
    const box = $("#favViewBody");
    box.innerHTML = "";
    const items = fav.map((id) => data.items.find((it) => it.id === id)).filter(Boolean);
    $("#favViewEmpty").hidden = items.length > 0;
    if (!items.length) return;
    const rows = el("div", "rows");
    for (const it of items) rows.appendChild(makeRow(it));
    box.appendChild(rows);
  }
  function onFavChanged() {
    updateFavCount();
    if (favViewOpen) renderFavView();
  }

  // おきにいり（中央エリアだけを差し替える簡易ルーティング）
  let favViewOpen = false;
  const BASE_TITLE = document.title;
  const MAIN_SECTIONS = ["oshiSection", "topicsSection", "calSection", "feedSection", "charaSection", "mobileMods"];
  function showFavView() {
    favViewOpen = true;
    for (const id of MAIN_SECTIONS) {
      const e = document.getElementById(id);
      if (e) e.classList.add("fav-hidden");
    }
    $("#favView").hidden = false;
    renderFavView();
    document.title = `おきにいり｜${BASE_TITLE}`;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function hideFavView() {
    favViewOpen = false;
    $("#favView").hidden = true;
    for (const id of MAIN_SECTIONS) document.getElementById(id)?.classList.remove("fav-hidden");
    document.title = BASE_TITLE;
  }
  function syncFavView() {
    if (location.hash === "#favorites") showFavView();
    else hideFavView();
  }

  // ---------- 見たくないことば ----------
  function refreshAfterNg() {
    shown = PAGE;
    renderNg();
    renderTopics();
    renderFilters();
    renderList();
    renderSchedule();
    renderOshi();
  }
  function renderNg() {
    const box = $("#ngList");
    box.innerHTML = "";
    for (const w of ngWords) {
      const chip = el("span", "ng-chip", w);
      const del = el("button", "", "×");
      del.type = "button";
      del.title = "削除";
      del.setAttribute("aria-label", `${w} を削除`);
      del.addEventListener("click", () => {
        ngWords = ngWords.filter((x) => x !== w);
        store.set(NG_KEY, ngWords);
        refreshAfterNg();
      });
      chip.appendChild(del);
      box.appendChild(chip);
    }
    // よく使われそうなものを 1 タップで足せるように
    for (const w of ["転売", "買取"]) {
      if (ngWords.includes(w)) continue;
      const s = el("button", "ng-suggest", `＋${w}`);
      s.type = "button";
      s.addEventListener("click", () => addNg(w));
      box.appendChild(s);
    }
  }
  function addNg(w) {
    if (!w || ngWords.includes(w)) return;
    ngWords = [...ngWords, w].slice(0, 30);
    store.set(NG_KEY, ngWords);
    if (data) refreshAfterNg();
    else renderNg();
  }

  // ---------- 更新の様子 ----------
  function renderChurn() {
    const c = data.churn;
    const e = $("#churn");
    if (!c || !c.previousCount || !c.newCount) {
      e.hidden = true;
      return;
    }
    e.hidden = false;
    e.innerHTML = `前回から <b>${c.newCount}</b> 本ふえました`;
  }

  // ---------- 起動 ----------
  async function boot() {
    $("#year").textContent = new Date().getFullYear();
    applyOshi();
    renderNg();
    renderStamp();

    try {
      const r = await fetch(`data/news.json?t=${Math.floor(Date.now() / 300000)}`);
      data = await r.json();
    } catch {
      $("#meta").textContent = "データを読み込めませんでした。";
      $("#list").innerHTML = "";
      $("#empty").hidden = false;
      $("#empty").textContent = "ニュースを読み込めませんでした。時間をおいて開き直してください。";
      return;
    }
    // 保存されていた絞り込みが、いまのデータに無いジャンル・キャラを指していたら戻す
    if (state.cat !== "all" && !data.categories.some((c) => c.id === state.cat)) state.cat = "all";
    if (!charaOf(state.chara)) state.chara = "all";

    const u = new Date(data.updatedAt);
    $("#meta").textContent = `${data.total} 本のニュース ・ きょう ${data.todayCount} 本 ・ 最終更新 ${u.getMonth() + 1}/${u.getDate()} ${hhmm(data.updatedAt)}`;
    $("#sourceList").textContent = data.sources.map((s) => s.name).join(" / ");

    renderChurn();
    renderChara();
    renderOshi();
    renderTopics();
    renderSchedule();
    renderFilters();
    renderQuick();
    renderList();
    renderKuji(false);
    renderGacha();
    renderOtherNews();
    updateFavCount();
    syncFavView();
  }

  // ---------- 操作 ----------
  window.addEventListener("hashchange", syncFavView);
  $("#favBack").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname + location.search);
    hideFavView();
  });
  $("#ngForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#ngInput");
    const w = input.value.trim();
    input.value = "";
    addNg(w);
  });
  let searchTimer = 0;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const v = e.target.value.trim();
    searchTimer = setTimeout(() => {
      if (v !== state.q) {
        Object.assign(state, { q: v });
        shown = PAGE;
        save();
        renderList();
      }
    }, 250);
  });
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    $("#searchInput").blur();
  });
  $("#oshiAll").addEventListener("click", () => {
    set({ chara: oshi, cat: "all" });
    $("#feedSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  for (const b of document.querySelectorAll("#sortSeg button")) {
    b.addEventListener("click", () => {
      shuffleSeed = Math.random();
      set({ sort: b.dataset.sort });
    });
  }
  $("#listMore").addEventListener("click", () => {
    shown += PAGE;
    renderList();
  });
  $("#topicMore").addEventListener("click", () => {
    topicsShown += 4;
    renderTopics();
  });
  $("#gachaAgain").addEventListener("click", spinGacha);
  const toTop = $("#toTop");
  const onScroll = () => (toTop.hidden = window.scrollY < 600);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  // スマホ幅では、スタンプとおみくじを新着ニュースの直前に移す（デスクトップは右カラムのまま）
  const mobileQuery = window.matchMedia("(max-width: 860px)");
  function layoutMods() {
    const side = $(".side");
    const feed = $("#feedSection");
    const stamp = $("#stampMod");
    const kuji = $("#kujiMod");
    if (mobileQuery.matches) {
      let holder = $("#mobileMods");
      if (!holder) {
        holder = el("div", "mobile-mods");
        holder.id = "mobileMods";
        feed.before(holder);
      }
      holder.append(stamp, kuji);
    } else if (side.firstElementChild !== stamp) {
      side.prepend(stamp, kuji);
    }
  }
  mobileQuery.addEventListener("change", layoutMods);
  layoutMods();

  boot();
})();
