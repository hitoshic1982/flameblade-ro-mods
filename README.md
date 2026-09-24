# 炎劍仙境客戶端外掛與伺服器工具（flameblade-ro-mods）

**繁體中文**｜[简体中文](README.zh-CN.md)｜[English](README.en.md)｜[日本語](README.ja.md)

炎劍文化工作室（Flameblade Studio）為自家親友服「炎劍仙境」製作的網頁客戶端外掛與 [rAthena](https://github.com/rathena/rathena) 伺服器工具。伺服器是 rAthena 加上 roBrowserLegacy 系列網頁客戶端。公開分享，給架設同樣環境的人參考。

NPC 翻譯外掛也另外整理成獨立專案 [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate)，只想要中文化的話，請用那個專案。

## 內容

| 資料夾 | 內容 |
|---|---|
| `npc-live-translate/` | 翻譯外掛：NPC 對話、選單、公告、頭上名稱、設定視窗與功能按鈕提示，逐句換成台灣繁體中文。附 222,145 筆整句翻譯、3,543 個句型；`publish.py` 是炎劍仙境自用的部署腳本 |
| `welcome-message/` | 登入後把歡迎詞放進聊天框，等伺服器的登入訊息送完才顯示，所以會是最後幾行 |
| `bgm-autostart/` | 瀏覽器擋掉自動播放時，在玩家第一次點擊或按鍵時補播背景音樂，並提供隨時可用的靜音鈕 |
| `easy-signup/` | 登入視窗的「註冊」表單，玩家不必知道 rAthena 的「帳號_M」建帳規則 |
| `map-prefetch/` | 玩家停留在地圖上時，悄悄預先下載相鄰地圖的檔案，換圖時直接從瀏覽器快取讀取；`build_manifests.py` 在伺服器上產生所需清單 |
| `rathena-custom/lub_to_lua.py`、`lub51.py` | 把編譯過的道具表（.lub）轉回 UTF-8 Lua 原始碼，避免網頁客戶端把它當成 Big5 讀成亂碼 |
| `rathena-custom/missing_items.py`、`build_custom_items.py` | 找出伺服器有、客戶端道具表沒有的道具，產生 `tbl_custom` 條目：名稱，加上向同類道具借用的圖示 |
| `rathena-custom/stylist.txt` | rAthena 造型師腳本的修改版：從目前的外觀開始調整，只開啟再關閉不會改變任何東西 |

## 刻意不收錄的內容

台灣官方客戶端的道具名、怪物名與地圖名稱表，版權屬於遊戲營運商，所以**不在這個專案裡**，也已從全部歷史中移除。翻譯外掛會讀取放在它旁邊的 `names.json`、`maps.json`；請用 [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate) 的 `tools/build_names.py`，從你合法持有的台灣客戶端自行產生。沒有這兩個檔案也能用，只是道具、怪物與地圖名稱會維持英文。

`build_custom_items.py` 需要的道具中文名稱（`names.json`）也不收錄，請自行準備。

## 安裝外掛

需要支援外掛介面第 1 版（plugin API v1）的網頁客戶端。以 `welcome-message` 為例：

1. 把 `welcome-message/client/` 的內容放進客戶端的 `plugins/welcome-message/`。
2. 在客戶端設定的 `plugins` 加入：
   ```js
   'welcome-message': { path: 'plugins/welcome-message/index', pars: { lines: ['歡迎來到我們的伺服器！'] } },
   ```

其他外掛同理，資料夾名稱就是外掛名稱。每支外掛檔案開頭的註解，寫有它的用途、設定參數與限制。

## 授權

GPL-3.0（見 [LICENSE](LICENSE)）。翻譯外掛改寫自 [ragnarokoffline.app](https://github.com/Flux159/ragnarokoffline.app) 的外掛（GPL-3.0）；翻譯原文與造型師腳本來自 rAthena（GPL-3.0）；外掛執行在 [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy)（GPL-3.0）上。因此整個專案採用相同授權。

本專案與 Gravity、台灣營運商及 rAthena 專案均無關聯。《仙境傳說》（Ragnarok Online）及相關名稱為其權利人所有。

© 2026 炎劍文化工作室 Flameblade Studio
