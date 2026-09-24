// 検索エンジン向けの静的ページを docs/ に書き出す。収集（collect.mjs）とビルド（build.mjs）の最後に呼ぶ。
// トップの画面は app.js が news.json を読んで描くが、それだけだと検索エンジンからは中身が
// 「読み込み中…」にしか見えないので、記事の一覧を HTML にも書いておく（app.js が描き直す）。
// あわせて、ジャンル別・キャラ別・これからの予定・日別の過去ニュースのページと、
// sitemap.xml・feed.xml を作る。Node の標準機能だけで動く（GitHub Actions の収集で npm ci しないため）。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { loadArchive, jstDay } from "./archive.mjs";

export function minifyHtml(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "") // 条件付きコメント以外のコメントを除去
    .replace(/>\s+</g, "><") // タグ間の空白
    .replace(/\s{2,}/g, " ")
    .trim();
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const FONT_URL = "https://fonts.googleapis.com/css2?family=Hachi+Maru+Pop&family=Zen+Maru+Gothic:wght@500;700;900&display=swap";
// ジャンル・キャラのページに載せる件数と、さかのぼる日数
const LIST_MAX = 60;
const LIST_DAYS = 180;
// これより記事が少ないページは noindex にして sitemap にも載せない（中身の薄いページを検索に出さない）
const MIN_INDEXABLE = 3;

// ---------- 小物 ----------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function jst(iso) {
  return new Date(new Date(iso).getTime() + 9 * 3600000);
}
const pad = (n) => String(n).padStart(2, "0");
function hhmm(iso) {
  const d = jst(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function dayParts(day) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, wd: WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
const mdw = (day) => {
  const p = dayParts(day);
  return `${p.m}/${p.d}（${p.wd}）`;
};
const jpDay = (day) => {
  const p = dayParts(day);
  return `${p.y}年${p.m}月${p.d}日（${p.wd}）`;
};
function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function truncate(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
function ld(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}
async function readText(p) {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}
async function verOf(p) {
  const t = await readText(p);
  return t ? createHash("sha1").update(t).digest("hex").slice(0, 8) : "0";
}

// ---------- サムネイル ----------
// app.js と同じ、画像が無い記事のためのパステルの札
const PASTELS = ["#ffd6e0", "#d6ecff", "#fff0b3", "#d8f5dc", "#e8dcff", "#ffe2cc"];
const MOTIF = {
  goods: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><rect x="3" y="7" width="18" height="4.5" rx="2"/>',
  kuji: '<path d="M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6z"/>',
  collab: '<path d="M5 9h12v4.5a6 6 0 0 1-12 0z"/>',
  event: '<path d="M12 2.5a6.5 6.5 0 0 1 6.5 6.5c0 4.3-3.8 7.5-6.5 7.5S5.5 13.3 5.5 9A6.5 6.5 0 0 1 12 2.5z"/>',
  anime: '<rect x="3" y="7" width="18" height="13" rx="3"/>',
  book: '<path d="M3 5.5c3-1.3 6.2-1.2 9 .8 2.8-2 6-2.1 9-.8V20c-3-1.3-6.2-1.2-9 .8-2.8-2-6-2.1-9-.8z"/>',
  game: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/>',
  other: '<path d="M12 2l2.9 6.5L22 9.6l-5.2 4.8 1.4 7.6L12 18.1l-6.2 3.9 1.4-7.6L2 9.6l7.1-1.1z"/>',
};
function thumb(it, cls) {
  if (it.image) {
    return `<div class="${cls}"><img src="${esc(it.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()"></div>`;
  }
  const cat = (it.categories || [])[0];
  return `<div class="${cls} thumb-ph" style="background:${PASTELS[fnv(it.title) % PASTELS.length]}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="#fff">${MOTIF[cat] || MOTIF.other}</svg></div>`;
}

// ---------- これからの予定（app.js の extractSchedule と同じ考え方） ----------
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
function extractSchedule(items, now, { maxDays = 90, limit = 60 } = {}) {
  const t = jst(now.toISOString());
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const out = [];
  for (const it of items) {
    // 記事が出た年を基準にする（年末の記事の「1月10日発売」は翌年）
    const pubYear = jst(it.publishedAt).getUTCFullYear();
    for (const m of it.title.matchAll(DATE_RE)) {
      const mo = Number(m[1] || m[3]);
      const d = Number(m[2] || m[4]);
      if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) continue;
      const act = it.title.slice(m.index + m[0].length).match(ACT_RE);
      if (!act) continue;
      let date = Date.UTC(pubYear, mo - 1, d);
      if (date - new Date(it.publishedAt).getTime() < -120 * 86400000) date = Date.UTC(pubYear + 1, mo - 1, d);
      const days = Math.round((date - today) / 86400000);
      if (days < 0 || days > maxDays) continue;
      out.push({ it, date, day: new Date(date).toISOString().slice(0, 10), days, act: act[1], bi: bigrams(it.title) });
      break;
    }
  }
  out.sort((a, b) => a.date - b.date || new Date(b.it.publishedAt) - new Date(a.it.publishedAt));
  const kept = [];
  for (const x of out) {
    const dup = kept.find((k) => k.date === x.date && sim(k.bi, x.bi) > 0.45);
    if (dup) {
      if (!dup.it.image && x.it.image) dup.it = x.it;
      continue;
    }
    kept.push(x);
  }
  return kept.slice(0, limit);
}

// ---------- 本体 ----------
export async function renderPages(root, { log = () => {} } = {}) {
  const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
  const DOCS = join(root, "docs");
  const SITE = config.site?.title || "ちいかわ速報";
  const BASE = (config.site?.url || "/").replace(/\/?$/, "/");
  const abs = (path) => BASE + path.replace(/^\//, "");
  const now = new Date();
  const year = jst(now.toISOString()).getUTCFullYear();

  let news = null;
  try {
    news = JSON.parse(await readFile(join(DOCS, "data", "news.json"), "utf8"));
  } catch {
    /* まだ収集していない */
  }
  const archive = await loadArchive(join(root, "data", "archive"));
  const indexTpl = await readText(join(root, "site", "index.html"));
  const GA = (indexTpl.match(/gtag\/js\?id=(G-[A-Z0-9]+)/) || [])[1] || "";
  const ver = {
    css: await verOf(join(DOCS, "assets", "app.css")),
    app: await verOf(join(DOCS, "assets", "app.js")),
  };

  const cats = (config.categories || []).map((c) => ({ ...c, ...(config.pages?.genres?.[c.id] || {}) }));
  const catLabel = (id) => cats.find((c) => c.id === id)?.label || "";
  const charas = config.series || [];
  const charaOf = (id) => charas.find((c) => c.id === id);

  // 過去の記事をひとつの列にする（新しい順・同じ記事は 1 回だけ）
  const seen = new Set();
  const all = [];
  for (const d of archive)
    for (const it of d.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      all.push(it);
    }
  all.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const recentLimit = now.getTime() - LIST_DAYS * 86400000;
  const recent = all.filter((it) => new Date(it.publishedAt).getTime() >= recentLimit);
  const monthAgo = now.getTime() - 30 * 86400000;
  const countIn = (pred) => recent.filter((it) => new Date(it.publishedAt).getTime() >= monthAgo && pred(it)).length;

  const written = [];
  const sitemap = [];
  async function out(path, html, { lastmod, index = true } = {}) {
    const file = path.endsWith("/") ? join(DOCS, path, "index.html") : join(DOCS, path);
    const text = path.endsWith(".xml") ? html : minifyHtml(html);
    if ((await readText(file)) !== text) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text, "utf8");
      written.push(path);
    }
    if (index) sitemap.push({ loc: abs(path), lastmod });
  }

  // ---------- 共通の部品 ----------
  const genreLinks = cats.filter((c) => config.pages?.genres?.[c.id]);
  function navHtml() {
    const links = [
      ["/schedule/", "これからの予定"],
      ...genreLinks.map((c) => [`/${c.id}/`, c.label]),
      ["/chara/", "キャラ別"],
      ["/archive/", "過去のニュース"],
    ];
    return `<nav class="wrap site-nav" aria-label="ページ">${links.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join("")}</nav>`;
  }
  function footerLinks() {
    return `<nav class="footer-nav" aria-label="サイト内のページ">
      <a href="/">トップ</a><a href="/schedule/">これからの予定</a>
      ${genreLinks.map((c) => `<a href="/${c.id}/">${esc(c.title || c.label)}</a>`).join("")}
      ${charas.map((c) => `<a href="/chara/${c.id}/">${esc(c.label)}のニュース</a>`).join("")}
      <a href="/archive/">過去のニュース</a><a href="/about/">このサイトについて</a><a href="/feed.xml">RSS</a>
    </nav>`;
  }
  const verify = config.pages?.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(config.pages.googleSiteVerification)}">` : "";
  const gtag = GA
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>`
    : "";
  const fontLinks = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preload" as="style" href="${FONT_URL}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>`;

  function page({ path, title, desc, h1, lead = "", body, crumbs = [], jsonld = [], noindex = false, side = true }) {
    const fullTitle = `${title}｜${SITE}`;
    const trail = [{ name: SITE, path: "/" }, ...crumbs];
    const bc =
      crumbs.length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
          }
        : null;
    return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${gtag}
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(desc)}">
  ${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
  ${verify}
  <meta name="theme-color" content="#ffd6e0">
  ${path === "/404.html" ? "" : `<link rel="canonical" href="${abs(path)}">`}
  <meta property="og:site_name" content="${esc(SITE)}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${abs(path)}">
  <meta property="og:image" content="${abs("/assets/og.png")}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(fullTitle)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${abs("/assets/og.png")}">
  <link rel="alternate" type="application/atom+xml" title="${esc(SITE)}" href="/feed.xml">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  ${bc ? ld(bc) : ""}
  ${jsonld.map(ld).join("")}
  ${fontLinks}
  <link rel="stylesheet" href="/assets/app.css?v=${ver.css}">
</head>
<body>
  <header class="header">
    <div class="wrap header-inner">
      <div class="logo">
        <a href="/">
          <span class="logo-text">ちいかわ<span class="logo-accent">速報</span></span>
          <svg class="logo-spark" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true"><path d="M20 4 L23 16 L35 20 L23 24 L20 36 L17 24 L5 20 L17 16Z" fill="#ffd43b"/><circle cx="34" cy="7" r="3" fill="#ff8fab"/></svg>
        </a>
      </div>
      <p class="tagline">グッズ・コラボ・イベントのニュースまとめ</p>
    </div>
    ${navHtml()}
    <svg class="header-cloud" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 H1200 V14 C1170 14 1170 34 1140 34 C1110 34 1110 14 1080 14 C1050 14 1050 34 1020 34 C990 34 990 14 960 14 C930 14 930 34 900 34 C870 34 870 14 840 14 C810 14 810 34 780 34 C750 34 750 14 720 14 C690 14 690 34 660 34 C630 34 630 14 600 14 C570 14 570 34 540 34 C510 34 510 14 480 14 C450 14 450 34 420 34 C390 34 390 14 360 14 C330 14 330 34 300 34 C270 34 270 14 240 14 C210 14 210 34 180 34 C150 34 150 14 120 14 C90 14 90 34 60 34 C30 34 30 14 0 14Z"/></svg>
  </header>
  <main class="wrap">
    ${
      crumbs.length
        ? `<nav class="crumbs" aria-label="パンくずリスト"><ol>${trail
            .map((c, i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.path}">${esc(c.name)}</a></li>`))
            .join("")}</ol></nav>`
        : ""
    }
    <div class="layout${side ? "" : " layout-single"}">
      <div class="col-main">
        <div class="page-intro">
          <h1 class="page-title">${esc(h1)}</h1>
          ${lead ? `<p class="page-lead">${lead}</p>` : ""}
        </div>
        ${body}
      </div>
      ${side ? sideHtml() : ""}
    </div>
  </main>
  <footer class="footer">
    <div class="wrap">
      ${footerLinks()}
      <p><strong>${esc(SITE)}</strong> は、ちいかわ関連のニュースを集めているまとめサイトです。30 分おきに更新しています。</p>
      <p>掲載しているのは見出し・要約の一部・元記事へのリンクと、元記事が設定している紹介用の画像のみで、本文の転載はしていません。リンク先の記事と画像の権利はそれぞれの発行元に帰属します。</p>
      <p class="notice">当サイトはファンによる非公式のまとめサイトで、ナガノ氏・ちいかわ製作委員会・各権利者とは関係ありません。</p>
      <p class="copy">© ${year} ${esc(SITE)}</p>
    </div>
  </footer>
</body>
</html>`;
  }

  function sideHtml() {
    const gl = genreLinks
      .map((c) => `<li><a href="/${c.id}/">${esc(c.label)}<span class="n">${countIn((it) => (it.categories || []).includes(c.id))}</span></a></li>`)
      .join("");
    const cl = charas.map((c) => `<li><a href="/chara/${c.id}/" style="--c:${c.color || "#ffb3c7"}"><i class="dot"></i>${esc(c.label)}<span class="n">${countIn((it) => (it.series || []).includes(c.id))}</span></a></li>`).join("");
    return `<aside class="side">
      <section class="mod"><h2 class="mod-head">ジャンルで見る</h2><p class="mod-desc">数字はこの 30 日の件数です。</p><ul class="side-links">${gl}</ul></section>
      <section class="mod"><h2 class="mod-head">キャラで見る</h2><ul class="side-links">${cl}</ul></section>
      <section class="mod"><h2 class="mod-head">ほかのページ</h2><ul class="side-links">
        <li><a href="/">トップ（しぼりこみ・おみくじ）</a></li><li><a href="/schedule/">これからの予定</a></li><li><a href="/archive/">過去のニュース</a></li><li><a href="/about/">このサイトについて</a></li>
      </ul></section>
    </aside>`;
  }

  function rowHtml(it, withSum = true) {
    const c0 = (it.categories || [])[0];
    const badges = [];
    if (c0 && c0 !== "other" && catLabel(c0)) badges.push(`<span class="badge badge-cat cat-${c0}">${esc(catLabel(c0))}</span>`);
    for (const s of (it.series || []).slice(0, 2)) {
      const c = charaOf(s);
      if (c) badges.push(`<span class="badge badge-chara" style="--c:${c.color || "#ffb3c7"}">${esc(c.label)}</span>`);
    }
    if (it.isPR) badges.push('<span class="badge badge-pr">PR</span>');
    return `<article class="row">${thumb(it, "row-thumb")}<div class="row-body">
      ${badges.length ? `<div class="row-top">${badges.join("")}</div>` : ""}
      <a class="row-title" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>
      ${withSum && it.summary ? `<p class="row-sum">${esc(it.summary)}</p>` : ""}
      <div class="row-meta">${esc(it.source)} ・ <time datetime="${esc(it.publishedAt)}">${mdw(jstDay(it.publishedAt))} ${hhmm(it.publishedAt)}</time></div>
    </div></article>`;
  }
  function groupedHtml(items, tag = "h2") {
    const groups = new Map();
    for (const it of items) {
      const k = jstDay(it.publishedAt);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(it);
    }
    let html = "";
    for (const [day, list] of groups) {
      html += `<section class="day"><${tag} class="day-head"><span class="day-label">${mdw(day)}</span><span class="day-n">${list.length} 件</span></${tag}><div class="rows">${list.map((it) => rowHtml(it)).join("")}</div></section>`;
    }
    return html;
  }
  function itemList(items, name) {
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name,
      numberOfItems: Math.min(items.length, 20),
      itemListElement: items.slice(0, 20).map((it, i) => ({ "@type": "ListItem", position: i + 1, url: it.url, name: it.title })),
    };
  }
  function scheduleHtml(list) {
    return `<div class="cal-list">${list
      .map(
        (x) => `<a class="cal-card${x.days <= 1 ? " is-soon" : ""}" href="${esc(x.it.url)}" target="_blank" rel="noopener">
        <div class="cal-date"><span class="cal-md">${dayParts(x.day).m}/${dayParts(x.day).d}</span><span class="cal-wd">（${dayParts(x.day).wd}）</span><span class="cal-left">${x.days === 0 ? "きょう" : x.days === 1 ? "あした" : `あと ${x.days} 日`}</span></div>
        ${thumb(x.it, "cal-thumb")}
        <div class="cal-body"><span class="cal-act">${esc(x.act)}</span><span class="cal-title">${esc(x.it.title)}</span></div></a>`
      )
      .join("")}</div>`;
  }
  const lastOf = (items) => items.reduce((a, it) => (it.publishedAt > a ? it.publishedAt : a), "") || now.toISOString();

  // ---------- トップ ----------
  if (indexTpl) {
    const items = news?.items || [];
    const listHtml = items.length
      ? groupedHtml(items.slice(0, 30), "h3")
      : '<div class="loading loading-feed"><span class="spinner" role="status" aria-label="読み込み中"></span><span>ニュースを読み込んでいます…</span></div>';
    let meta = "読み込み中…";
    if (news) {
      const u = jst(news.updatedAt);
      meta = `${news.total} 本のニュース ・ きょう ${news.todayCount} 本 ・ 最終更新 ${u.getUTCMonth() + 1}/${u.getUTCDate()} ${hhmm(news.updatedAt)}`;
    }
    const head = [
      verify,
      `<link rel="alternate" type="application/atom+xml" title="${esc(SITE)}" href="feed.xml">`,
      ld({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE,
        url: BASE,
        logo: abs("/apple-touch-icon.png"),
      }),
      items.length ? ld(itemList(items, "ちいかわの新着ニュース")) : "",
    ].join("");
    const html = indexTpl
      .replace("<!--ssr:head-->", head)
      .replace("<!--ssr:nav-->", navHtml())
      .replace("<!--ssr:list-->", listHtml)
      .replace("<!--ssr:footer-links-->", footerLinks())
      .replace('<span id="meta">読み込み中…</span>', `<span id="meta">${esc(meta)}</span>`)
      .replace(/href="assets\/app\.css"/, `href="assets/app.css?v=${ver.css}"`)
      .replace(/src="assets\/app\.js"/, `src="assets/app.js?v=${ver.app}"`);
    await out("/", html, { lastmod: news?.updatedAt });
  }

  // ---------- これからの予定 ----------
  const sched = extractSchedule(
    recent.filter((it) => new Date(it.publishedAt).getTime() >= now.getTime() - 60 * 86400000),
    now
  );
  {
    const byMonth = new Map();
    for (const x of sched) {
      const k = x.day.slice(0, 7);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(x);
    }
    let body = "";
    for (const [k, list] of byMonth) {
      const [y, m] = k.split("-").map(Number);
      body += `<section class="cal-month"><h2 class="day-head"><span class="day-label">${y}年${m}月</span><span class="day-n">${list.length} 件</span></h2>${scheduleHtml(list)}</section>`;
    }
    if (!body) body = '<p class="empty">いまは、日付が書いてある予定のニュースがありません。</p>';
    await out(
      "/schedule/",
      page({
        path: "/schedule/",
        title: "ちいかわの発売日・イベント開催日の予定まとめ",
        desc: "ちいかわのグッズの発売日・一番くじ・コラボカフェ・ポップアップストアの開催日など、これからの予定をニュースの見出しから拾って日付順に並べています。",
        h1: "ちいかわのこれからの予定",
        lead: "グッズの発売日やポップアップの開催日など、ニュースの見出しに日付が書いてあるものを日付順に並べています（きょうから 90 日先まで）。くわしい日時や販売方法は、リンク先の記事で確かめてください。",
        body,
        crumbs: [{ name: "これからの予定", path: "/schedule/" }],
        jsonld: sched.length ? [itemList(sched.map((x) => x.it), "ちいかわのこれからの予定")] : [],
      }),
      { lastmod: sched.length ? lastOf(sched.map((x) => x.it)) : undefined, index: sched.length > 0 }
    );
  }

  // ---------- ジャンル別 ----------
  for (const c of genreLinks) {
    const items = recent.filter((it) => (it.categories || []).includes(c.id)).slice(0, LIST_MAX);
    const up = sched.filter((x) => (x.it.categories || []).includes(c.id)).slice(0, 8);
    let body = "";
    if (up.length) body += `<section class="page-sec"><h2 class="sec-title"><span class="sec-deco" aria-hidden="true"></span>これからの予定</h2>${scheduleHtml(up)}</section>`;
    body += `<section class="page-sec"><h2 class="sec-title"><span class="sec-deco" aria-hidden="true"></span>新着ニュース</h2>${items.length ? groupedHtml(items, "h3") : '<p class="empty">いまはこのジャンルのニュースがありません。</p>'}</section>`;
    await out(
      `/${c.id}/`,
      page({
        path: `/${c.id}/`,
        title: `${c.title}（最新ニュースまとめ）`,
        desc: c.desc,
        h1: c.title,
        lead: `${esc(c.desc)}新しいものから ${items.length} 件を載せています。`,
        body,
        crumbs: [{ name: c.label, path: `/${c.id}/` }],
        jsonld: items.length ? [itemList(items, c.title)] : [],
        noindex: items.length < MIN_INDEXABLE,
      }),
      { lastmod: lastOf(items), index: items.length >= MIN_INDEXABLE }
    );
  }

  // ---------- キャラ別 ----------
  const charaCards = [];
  for (const c of charas) {
    const items = recent.filter((it) => (it.series || []).includes(c.id)).slice(0, LIST_MAX);
    const firstImg = items.find((it) => it.image)?.image;
    charaCards.push(`<a class="chara-card" href="/chara/${c.id}/" style="--c:${c.color || "#ffb3c7"}">
      <span class="chara-card-face">${firstImg ? `<img src="${esc(firstImg)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<b>${esc(c.label[0])}</b></span>
      <span class="chara-card-text"><strong>${esc(c.label)}</strong><span>${esc(c.intro || "")}</span><span class="n">${items.length} 件のニュース</span></span></a>`);
    const desc = `ちいかわの「${c.label}」の名前が見出しに出てくるグッズ・コラボ・イベント・アニメのニュースをまとめています。${c.intro || ""}`;
    await out(
      `/chara/${c.id}/`,
      page({
        path: `/chara/${c.id}/`,
        title: `${c.label}のグッズ・コラボ・イベント情報（ちいかわ）`,
        desc: truncate(desc, 120),
        h1: `${c.label}のニュース`,
        lead: `${esc(c.intro || "")}<br>見出しに「${esc(c.label)}」の名前が出てくるニュースを、新しいものから ${items.length} 件載せています。`,
        body: items.length ? groupedHtml(items) : `<p class="empty">いまは ${esc(c.label)} の名前が出ているニュースがありません。</p>`,
        crumbs: [
          { name: "キャラ別", path: "/chara/" },
          { name: c.label, path: `/chara/${c.id}/` },
        ],
        jsonld: items.length ? [itemList(items, `${c.label}のニュース`)] : [],
        noindex: items.length < MIN_INDEXABLE,
      }),
      { lastmod: lastOf(items), index: items.length >= MIN_INDEXABLE }
    );
  }
  await out(
    "/chara/",
    page({
      path: "/chara/",
      title: "キャラ別のニュース（ハチワレ・うさぎ・モモンガほか）",
      desc: "ハチワレ・うさぎ・モモンガ・くりまんじゅう・ラッコ・シーサーなど、ちいかわのキャラクターごとにグッズやコラボのニュースを見られます。",
      h1: "キャラ別のニュース",
      lead: "見出しにキャラクターの名前が出てくるニュースを、キャラごとに集めています。",
      body: `<div class="chara-cards">${charaCards.join("")}</div>`,
      crumbs: [{ name: "キャラ別", path: "/chara/" }],
    }),
    { lastmod: news?.updatedAt }
  );

  // ---------- 過去のニュース（日別・月別） ----------
  const months = new Map();
  for (const d of archive) {
    const k = d.day.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(d);
  }
  for (let i = 0; i < archive.length; i++) {
    const d = archive[i];
    const p = dayParts(d.day);
    const newer = archive[i - 1];
    const older = archive[i + 1];
    const path = `/archive/${p.y}/${pad(p.m)}/${pad(p.d)}/`;
    const pager = `<nav class="pager" aria-label="前後の日">
      ${older ? `<a href="/archive/${older.day.replace(/-/g, "/")}/">← ${mdw(older.day)}</a>` : "<span></span>"}
      <a href="/archive/${p.y}/${pad(p.m)}/">${p.y}年${p.m}月の一覧</a>
      ${newer ? `<a href="/archive/${newer.day.replace(/-/g, "/")}/">${mdw(newer.day)} →</a>` : "<span></span>"}
    </nav>`;
    await out(
      path,
      page({
        path,
        title: `${jpDay(d.day)}のちいかわニュース ${d.items.length} 件`,
        desc: truncate(`${p.y}年${p.m}月${p.d}日のちいかわ関連ニュース ${d.items.length} 件。${d.items.slice(0, 3).map((it) => it.title).join(" / ")}`, 120),
        h1: `${jpDay(d.day)}のちいかわニュース`,
        lead: `この日に出たちいかわ関連のニュース ${d.items.length} 件です。`,
        body: `<div class="rows">${d.items.map((it) => rowHtml(it)).join("")}</div>${pager}`,
        crumbs: [
          { name: "過去のニュース", path: "/archive/" },
          { name: `${p.y}年${p.m}月`, path: `/archive/${p.y}/${pad(p.m)}/` },
          { name: `${p.d}日`, path },
        ],
        jsonld: [itemList(d.items, `${jpDay(d.day)}のちいかわニュース`)],
      }),
      { lastmod: lastOf(d.items) }
    );
  }
  for (const [k, days] of months) {
    const [y, m] = k.split("-").map(Number);
    const total = days.reduce((a, d) => a + d.items.length, 0);
    const body = `<ul class="archive-days">${days
      .map(
        (d) => `<li><a class="archive-day" href="/archive/${d.day.replace(/-/g, "/")}/"><span class="day-label">${mdw(d.day)}</span><span class="n">${d.items.length} 件</span></a>
        <ul>${d.items
          .slice(0, 3)
          .map((it) => `<li>${esc(truncate(it.title, 60))}</li>`)
          .join("")}</ul></li>`
      )
      .join("")}</ul>`;
    const path = `/archive/${y}/${pad(m)}/`;
    await out(
      path,
      page({
        path,
        title: `${y}年${m}月のちいかわニュース一覧`,
        desc: `${y}年${m}月に出たちいかわのグッズ・コラボ・イベント・アニメのニュース ${total} 件を、日ごとにまとめています。`,
        h1: `${y}年${m}月のちいかわニュース`,
        lead: `この月のニュース ${total} 件を日ごとに分けています。日付を押すとその日のニュースを見られます。`,
        body,
        crumbs: [
          { name: "過去のニュース", path: "/archive/" },
          { name: `${y}年${m}月`, path },
        ],
      }),
      { lastmod: lastOf(days.flatMap((d) => d.items)) }
    );
  }
  await out(
    "/archive/",
    page({
      path: "/archive/",
      title: "過去のちいかわニュース",
      desc: "これまでに集めたちいかわ関連のニュースを、月ごと・日ごとに見られます。",
      h1: "過去のニュース",
      lead: "これまでに集めたニュースを月ごとにまとめています。",
      body: months.size
        ? `<ul class="archive-months">${[...months]
            .map(([k, days]) => {
              const [y, m] = k.split("-").map(Number);
              return `<li><a href="/archive/${y}/${pad(m)}/">${y}年${m}月<span class="n">${days.reduce((a, d) => a + d.items.length, 0)} 件</span></a></li>`;
            })
            .join("")}</ul>`
        : '<p class="empty">まだありません。</p>',
      crumbs: [{ name: "過去のニュース", path: "/archive/" }],
    }),
    { lastmod: archive[0] ? lastOf(archive[0].items) : undefined }
  );

  // ---------- このサイトについて ----------
  const sourceNames = (news?.sources || []).map((s) => s.name);
  await out(
    "/about/",
    page({
      path: "/about/",
      title: "このサイトについて",
      desc: `${SITE}は、ちいかわのグッズ・くじ・コラボ・ポップアップ・アニメのニュースを集めている、ファンによる非公式のまとめサイトです。`,
      h1: "このサイトについて",
      body: `<div class="prose">
        <h2>どんなサイト？</h2>
        <p>${esc(SITE)}は、ちいかわ関連のニュースを、あちこちのニュースサイトやプレスリリースから集めて一か所で見られるようにしているまとめサイトです。グッズの新作・再販、一番くじ、コラボカフェ、ポップアップストア、アニメの情報などを、30 分おきに更新しています。</p>
        <h2>載せているもの</h2>
        <p>載せているのは、記事の見出し・要約の一部・元記事へのリンクと、元記事が設定している紹介用の画像（og:image）だけです。記事の本文は転載していません。くわしい内容は、リンク先の元記事でご覧ください。記事と画像の権利は、それぞれの発行元に帰属します。</p>
        <p>ジャンル・キャラの分け方と「これからの予定」は、見出しのことばから機械的に判定しています。まちがっていることもあるので、日時や販売方法は必ず元記事や公式の発表で確かめてください。</p>
        <h2>非公式のサイトです</h2>
        <p>当サイトはファンによる非公式のまとめサイトで、ナガノ氏・ちいかわ製作委員会・各権利者とは関係ありません。キャラクターの紹介文は当サイトが書いたものです。</p>
        <h2>ブラウザに保存しているもの</h2>
        <p>おきにいり・推しキャラ・スタンプ・おみくじの結果などは、お使いのブラウザ（localStorage）にだけ保存しています。サーバーには送っていません。アクセスの集計に Google アナリティクスを使っています。</p>
        ${sourceNames.length ? `<h2>おもな収集元</h2><p>${sourceNames.slice(0, 40).map(esc).join(" / ")}</p>` : ""}
        ${config.site?.contactUrl ? `<h2>お問い合わせ</h2><p><a href="${esc(config.site.contactUrl)}">お問い合わせフォーム</a></p>` : ""}
      </div>`,
      crumbs: [{ name: "このサイトについて", path: "/about/" }],
    }),
    { lastmod: undefined }
  );

  // ---------- 404 ----------
  await out(
    "/404.html",
    page({
      path: "/404.html",
      title: "ページが見つかりません",
      desc: "お探しのページは見つかりませんでした。",
      h1: "ページが見つかりません",
      lead: "お探しのページは、移動したか、なくなった可能性があります。",
      body: '<p><a class="link-btn" href="/">トップへもどる</a></p>',
      noindex: true,
    }),
    { index: false }
  );

  // ---------- feed.xml（Atom） ----------
  {
    const items = (news?.items || []).slice(0, 50);
    const xe = (s) => esc(s);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
  <title>${xe(SITE)}</title>
  <subtitle>${xe(config.site?.tagline || "")}</subtitle>
  <link href="${BASE}" rel="alternate"/>
  <link href="${abs("/feed.xml")}" rel="self"/>
  <id>${BASE}</id>
  <updated>${news?.updatedAt || now.toISOString()}</updated>
  <author><name>${xe(SITE)}</name></author>
${items
  .map(
    (it) => `  <entry>
    <title>${xe(it.title)}</title>
    <link href="${xe(it.url)}"/>
    <id>${BASE}#${it.id}</id>
    <updated>${new Date(it.publishedAt).toISOString()}</updated>
    <summary>${xe(`${it.source}${it.summary ? ` ／ ${it.summary}` : ""}`)}</summary>
  </entry>`
  )
  .join("\n")}
</feed>
`;
    await out("/feed.xml", xml, { index: false });
  }

  // ---------- sitemap.xml ----------
  {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemap
  .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().replace(/\.\d{3}Z$/, "+00:00")}</lastmod>` : ""}</url>`)
  .join("\n")}
</urlset>
`;
    await out("/sitemap.xml", xml, { index: false });
  }

  log(`pages: ${sitemap.length} indexable, ${written.length} written`);
  return written;
}
