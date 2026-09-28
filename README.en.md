# Flameblade RO client plugins and server tools (flameblade-ro-mods)

[繁體中文](README.md)｜[简体中文](README.zh-CN.md)｜**English**｜[日本語](README.ja.md)

Web-client plugins and [rAthena](https://github.com/rathena/rathena) server tools that Flameblade Studio (炎劍文化工作室) made for its friends-and-family server, 炎劍仙境. The server runs rAthena with a roBrowserLegacy-family web client. They are shared for anyone running the same setup.

The NPC translation plugin is also packaged on its own as [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate); use that project if translation is all you need.

## Contents

| Folder | What it is |
|---|---|
| `npc-live-translate/` | Translation plugin: NPC dialogue, menus, announcements, overhead names, settings windows and menu-button hints, replaced line by line with Taiwan Traditional Chinese. Ships 222,145 whole-line translations and 3,543 sentence shapes; `publish.py` is 炎劍仙境's own deploy script |
| `welcome-message/` | Puts the welcome lines in the chat box after login, once the server's login messages are in, so they are the last lines shown |
| `bgm-autostart/` | When the browser blocks autoplay, starts the background music on the player's first click or key press, and adds an always-available mute button |
| `easy-signup/` | A Sign Up form in the login window, so players never need rAthena's "name_M" account trick |
| `mobile-ui/` | Touch layout for phones and tablets (large buttons, joystick, menu) with every label in Traditional Chinese; originally a plugin shipped with the ragnarokoffline.app client |
| `login-box-contrast/` | Makes the Taiwan client's transparent login window readable (dark panel, white fields, Chinese labels); steps aside in the phone layout |
| `map-prefetch/` | While the player stays on a map, quietly downloads the files of the maps next door, so a map change reads them from the browser cache; `build_manifests.py` builds the lists it needs on the server |
| `webkit-canvas-fix/` | Fixes the extra head drawn on characters in the iPhone/iPad character select: iOS WebKit reads a scratch canvas's stale content. Active on iOS only |
| `rathena-custom/lub_to_lua.py`, `lub51.py` | Turn a compiled item table (.lub) back into UTF-8 Lua source, so the web client does not read it as Big5 and garble it |
| `rathena-custom/missing_items.py`, `build_custom_items.py` | Find items the server has but the client's item table lacks, and write `tbl_custom` entries for them: a name, plus an icon borrowed from items of the same kind |
| `rathena-custom/stylist.txt` | A modified rAthena Stylist script: it starts from the current look, so opening the menu and closing it changes nothing |

## Deliberately not included

The official Taiwan client's item, monster and map name tables belong to the game's publisher, so they are **not part of this project** and have been removed from its whole history. The translation plugin reads `names.json` and `maps.json` placed beside it; build them from a Taiwan client you legally own with `tools/build_names.py` from [flameblade-ro-translate](https://github.com/hitoshic1982/flameblade-ro-translate). Without them everything still works; item, monster and map names just stay in English.

The Chinese item names that `build_custom_items.py` reads (`names.json`) are not included either; prepare your own.

## Installing a plugin

You need a web client that supports plugin API v1. For `welcome-message`:

1. Copy the contents of `welcome-message/client/` into the client's `plugins/welcome-message/`.
2. Add it to `plugins` in the client configuration:
   ```js
   'welcome-message': { path: 'plugins/welcome-message/index', pars: { lines: ['Welcome to our server!'] } },
   ```

The other plugins install the same way; the folder name is the plugin name. The comment at the top of each plugin file describes what it does, its settings and its limits.

## License

GPL-3.0 (see [LICENSE](LICENSE)). The translation plugin is adapted from a plugin of [ragnarokoffline.app](https://github.com/Flux159/ragnarokoffline.app) (GPL-3.0); the translated source text and the Stylist script come from rAthena (GPL-3.0); the plugins run on [roBrowserLegacy](https://github.com/MrAntares/roBrowserLegacy) (GPL-3.0). The whole project therefore uses the same license.

This project is not affiliated with Gravity, the Taiwan publisher or the rAthena project. Ragnarok Online and related names belong to their respective owners.

© 2026 炎劍文化工作室 Flameblade Studio
