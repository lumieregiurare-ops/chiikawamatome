# ちいかわ速報（ちいかわ関連ニュースまとめ）

ちいかわのグッズ・くじ・コラボ・ポップアップ・アニメのニュースを集めてまとめる静的サイトです。pokematome を元にしています。`docs/` がサイトルートで、そのままロリポップ（FTP）に置いて公開できます。

- 掲載するのは **見出し・要約の一部・元記事へのリンク・元記事の og:image** のみ（本文の転載はしない）
- キャラクターの画像はリポジトリに置いていません。画面に出る画像はすべて各記事の og:image を参照したものです
- **当サイトはファンによる非公式のまとめサイトで、ナガノ氏・ちいかわ製作委員会とは関係ありません。**

## 使い方

```bash
npm install          # esbuild / sharp（ビルド用のみ）
npm run collect      # ニュースを収集して docs/data/news.json を更新
npm run build        # site/ を最小化して docs/ に出力
npm start            # ビルドしてローカルサーバー（http://localhost:3280）
python scripts/make-og.py   # OGP 画像を作り直す（普段は不要）
```

編集するのは `site/` です。**`docs/` の中身は直接編集しないでください**（次のビルドで上書きされます）。

## 画面の構成

| 場所 | 内容 |
| --- | --- |
| キャラの丸 | 押すとそのキャラの名前が見出しに出てくる記事に絞り込む。丸の中の画像は、そのキャラが出てくるいちばん新しい記事の画像。「推しにする」で推しを登録すると、トップに推しのニュースの帯が出る |
| いま話題のニュース | 複数の媒体が同じことを報じた話題。♥ の数が媒体数 |
| これからの予定 | 見出しに「9月25日発売」「9/24（木）から販売」のような日付と発売・開催などの語があるものを日付順に並べる（きょうから 90 日先まで） |
| 新着ニュース | ジャンル（グッズ / くじ / コラボ・カフェ / ポップアップ / アニメ・映画 / 漫画・本 / ゲーム）とことばで絞り込み |
| まいにちスタンプ | 見に来た日にスタンプが 1 つたまる。10 こでカード 1 まい |
| きょうのおみくじ | 1 日 1 回。結果は日付と端末ごとの乱数で決まり、同じ日は何度開いても同じ。めざましmedia の「ちいかわ占い」の記事が拾えている日はそのリンクも出す |
| ニュースガチャ・見たくないことば | pokematome と同じ |

キャラクターは `config.json` の `series` と `site/assets/app.js` の `CHARAS` の両方に書きます（id を合わせる）。紹介文は `CHARAS` の `intro` です。

## 収集のしくみ

Google ニュースの検索フィード（`config.json` の `googleNews.queries`）が掲載件数の大半です。ほかにインサイド・アニメ！アニメ！・コミックナタリー・電撃ホビーウェブ・ねとらぼ・4Gamer・Game*Spark・PR TIMES の RSS を読み、ちいかわに関係するものだけを残します。

`blockSources` に当たる媒体名（YouTube・X の投稿など）と、`blockTitlePatterns` に当たる見出し（画像ギャラリーのページなど）は載せません。

## 更新の間隔・公開の設定

pokematome と同じです。GitHub Actions の cron は当てにならないので、ロリポップの cron から `repository_dispatch` を叩きます。trend-video-watcher の `tools/trigger-collect.php` の `REPOS` に `lumieregiurare-ops/chiikawamatome` を足してください。

**Secrets**: `LOLIPOP_FTP_SERVER` / `LOLIPOP_FTP_USER` / `LOLIPOP_FTP_PASSWORD`
**Variables**: `DEPLOY_TARGET` = `lolipop`、`LOLIPOP_SERVER_DIR` = サブドメインの公開ディレクトリ（末尾のスラッシュ必須）

サブドメインは仮に `chiikawamatome.gamelab.website` にしています。変える場合は `config.json` の `site.url`、`site/index.html` の OGP・canonical、`site/robots.txt`、`site/sitemap.xml`、`scripts/make-og.py` を直してください。

## ブラウザに保存しているもの

| キー | 内容 |
| --- | --- |
| `chii:fav` | おきにいり |
| `chii:read` | 開いた記事（ガチャで未読を優先するため） |
| `chii:state` | 選んでいるジャンル・キャラ・ことば・並び順 |
| `chii:ng` | 見たくないことば |
| `chii:oshi` | 推しキャラ |
| `chii:stamps` | スタンプを押した日 |
| `chii:kuji` / `chii:seed` | おみくじをひいた日と、結果を決める乱数 |

**localStorage にだけ**保存しています。サーバーには何も送りません。
