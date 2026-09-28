# 炎劍仙境 クライアントプラグインとサーバーツール（flameblade-ro-mods）

[繁體中文](README.md)｜[简体中文](README.zh-CN.md)｜[English](README.en.md)｜**日本語**

炎劍文化工作室（Flameblade Studio）が、身内向けサーバー「炎劍仙境」のために作った Web クライアント用プラグインと [rAthena](https://github.com/rathena/rathena) サーバー用ツールです。サーバーは rAthena と roBrowserLegacy 系の Web クライアントで動いています。同じ構成を運用する方の参考になるよう公開しています。

NPC 翻訳プラグインは単独のプロジェクト [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate) としても公開しています。翻訳だけが必要な場合はそちらをお使いください。

## 内容

| フォルダ | 内容 |
|---|---|
| `npc-live-translate/` | 翻訳プラグイン：NPC の会話、メニュー、アナウンス、頭上の名前、設定ウィンドウ、メニューボタンのヒントを一文ずつ台湾繁体字中国語に置き換えます。文単位の翻訳 222,145 件と文型 3,543 個を同梱。`publish.py` は炎劍仙境専用のデプロイスクリプトです |
| `welcome-message/` | ログイン後、サーバーのログインメッセージが届いてから歓迎メッセージをチャット欄に表示します。そのため最後の数行として残ります |
| `bgm-autostart/` | ブラウザが自動再生をブロックした場合、プレイヤーの最初のクリックやキー入力で BGM を再生し直します。いつでも使えるミュートボタンも追加します |
| `easy-signup/` | ログイン画面に「新規登録」フォームを追加し、rAthena の「アカウント名_M」ルールを知らなくても登録できるようにします |
| `mobile-ui/` | スマートフォン・タブレット向けのタッチ操作画面（大きなボタン、ジョイスティック、メニュー）。表示文字はすべて繁体字中国語。もとは ragnarokoffline.app クライアントに同梱のプラグイン |
| `login-box-contrast/` | 台湾版クライアントの透明なログイン枠を見やすくします（暗い背景、白い入力欄、中国語ラベル）。スマホ表示では自動的に無効になります |
| `map-prefetch/` | プレイヤーがマップに留まっている間に、隣接マップのファイルを目立たないよう先読みし、マップ移動時にはブラウザのキャッシュから読み込ませます。必要なリストはサーバー上で `build_manifests.py` が作成します |
| `webkit-canvas-fix/` | iPhone／iPad のキャラクター選択画面で頭が二重に描かれる問題を修正（iOS の WebKit が作業用キャンバスの古い内容を読むため）。iOS でのみ有効 |
| `rathena-custom/lub_to_lua.py`、`lub51.py` | コンパイル済みのアイテムテーブル（.lub）を UTF-8 の Lua ソースに戻し、Web クライアントが Big5 として読んで文字化けするのを防ぎます |
| `rathena-custom/missing_items.py`、`build_custom_items.py` | サーバーにあってクライアントのアイテムテーブルにないアイテムを探し、名前と同種アイテムから借りたアイコンを持つ `tbl_custom` エントリを作成します |
| `rathena-custom/stylist.txt` | rAthena のスタイリストスクリプトの改良版：現在の外見から調整を始めるので、開いて閉じるだけなら何も変わりません |

## 意図的に含めていないもの

台湾公式クライアントのアイテム名・モンスター名・マップ名の表は、ゲーム運営会社に権利があるため**本プロジェクトには含めておらず**、履歴全体からも削除済みです。翻訳プラグインは隣に置かれた `names.json` と `maps.json` を読み込みます。[flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate) の `tools/build_names.py` を使い、正規にお持ちの台湾クライアントから生成してください。これらがなくても動作しますが、アイテム・モンスター・マップの名前は英語のままになります。

`build_custom_items.py` が読むアイテムの中国語名（`names.json`）も含めていません。各自でご用意ください。

## プラグインの導入

プラグイン API 第 1 版（plugin API v1）に対応した Web クライアントが必要です。`welcome-message` の場合：

1. `welcome-message/client/` の中身をクライアントの `plugins/welcome-message/` に置きます。
2. クライアント設定の `plugins` に追加します：
   ```js
   'welcome-message': { path: 'plugins/welcome-message/index', pars: { lines: ['ようこそ！'] } },
   ```

ほかのプラグインも同じ手順で、フォルダ名がそのままプラグイン名です。各プラグインファイル冒頭のコメントに、用途・設定項目・制限を記載しています。

## ライセンス

GPL-3.0（[LICENSE](LICENSE) を参照）。翻訳プラグインは [ragnarokoffline.app](https://github.com/Flux159/ragnarokoffline.app) のプラグイン（GPL-3.0）を改変したもので、翻訳の原文とスタイリストスクリプトは rAthena（GPL-3.0）に由来し、プラグインは [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy)（GPL-3.0）上で動作します。そのため、プロジェクト全体に同じライセンスを適用しています。

本プロジェクトは Gravity、台湾の運営会社、rAthena プロジェクトのいずれとも関係ありません。『ラグナロクオンライン』（Ragnarok Online）および関連する名称は、それぞれの権利者に帰属します。

© 2026 炎劍文化工作室 Flameblade Studio
