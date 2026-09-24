# 炎剑仙境客户端插件与服务器工具（flameblade-ro-mods）

[繁體中文](README.md)｜**简体中文**｜[English](README.en.md)｜[日本語](README.ja.md)

炎剑文化工作室（Flameblade Studio）为自家亲友服“炎剑仙境”制作的网页客户端插件与 [rAthena](https://github.com/rathena/rathena) 服务器工具。服务器是 rAthena 加上 roBrowserLegacy 系列网页客户端。公开分享，供搭建相同环境的人参考。

NPC 翻译插件另外整理成独立项目 [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate)，只需要中文化的话，请使用那个项目。

## 内容

| 文件夹 | 内容 |
|---|---|
| `npc-live-translate/` | 翻译插件：NPC 对话、菜单、公告、头顶名称、设置窗口与功能按钮提示，逐句替换为台湾繁体中文。附 222,145 条整句翻译、3,543 个句型；`publish.py` 是炎剑仙境自用的部署脚本 |
| `welcome-message/` | 登录后把欢迎词放进聊天框，等服务器的登录消息发完才显示，所以会是最后几行 |
| `bgm-autostart/` | 浏览器拦截自动播放时，在玩家第一次点击或按键时补播背景音乐，并提供随时可用的静音按钮 |
| `easy-signup/` | 登录窗口的“注册”表单，玩家不必了解 rAthena 的“账号_M”建号规则 |
| `map-prefetch/` | 玩家停留在地图上时，悄悄预先下载相邻地图的文件，切换地图时直接从浏览器缓存读取；`build_manifests.py` 在服务器上生成所需清单 |
| `rathena-custom/lub_to_lua.py`、`lub51.py` | 把编译过的道具表（.lub）转回 UTF-8 Lua 源代码，避免网页客户端把它当作 Big5 读成乱码 |
| `rathena-custom/missing_items.py`、`build_custom_items.py` | 找出服务器有、客户端道具表没有的道具，生成 `tbl_custom` 条目：名称，加上向同类道具借用的图标 |
| `rathena-custom/stylist.txt` | rAthena 造型师脚本的修改版：从当前外观开始调整，只打开再关闭不会改变任何东西 |

## 有意不收录的内容

台湾官方客户端的道具名、怪物名与地图名称表，版权属于游戏运营商，所以**不在这个项目里**，也已从全部历史中移除。翻译插件会读取放在它旁边的 `names.json`、`maps.json`；请用 [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate) 的 `tools/build_names.py`，从你合法持有的台湾客户端自行生成。没有这两个文件也能使用，只是道具、怪物与地图名称会保持英文。

`build_custom_items.py` 所需的道具中文名称（`names.json`）也不收录，请自行准备。

## 安装插件

需要支持插件接口第 1 版（plugin API v1）的网页客户端。以 `welcome-message` 为例：

1. 把 `welcome-message/client/` 的内容放进客户端的 `plugins/welcome-message/`。
2. 在客户端配置的 `plugins` 中加入：
   ```js
   'welcome-message': { path: 'plugins/welcome-message/index', pars: { lines: ['欢迎来到我们的服务器！'] } },
   ```

其他插件同理，文件夹名称就是插件名称。每个插件文件开头的注释写有它的用途、配置参数与限制。

## 许可证

GPL-3.0（见 [LICENSE](LICENSE)）。翻译插件改写自 [ragnarokoffline.app](https://github.com/Flux159/ragnarokoffline.app) 的插件（GPL-3.0）；翻译原文与造型师脚本来自 rAthena（GPL-3.0）；插件运行在 [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy)（GPL-3.0）上。因此整个项目采用相同许可证。

本项目与 Gravity、台湾运营商及 rAthena 项目均无关联。《仙境传说》（Ragnarok Online）及相关名称归其权利人所有。

© 2026 炎劍文化工作室 Flameblade Studio
