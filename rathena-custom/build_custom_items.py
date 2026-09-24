"""Write a tbl_custom block for items the client's item table lacks.

The client runs main_item() over tbl_override, tbl and tbl_custom, so a
tbl_custom entry is enough to give a missing item a name and an icon.
Each missing item borrows the icon most often used by the client's own
items of the same rAthena kind (Type, SubType, first Location), falling
back to coarser kinds and finally to the apple icon.

usage: python3 build_custom_items.py <itemInfo.lua> <rathena dir>
                                     <names.json> <out.lua>
names.json maps item id (string) to its Taiwan Chinese name.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

from missing_items import rathena_items

ENTRY = re.compile(r'^\t\[(\d+)\] = \{(.*?)^\t\},', re.M | re.S)
RESOURCE = re.compile(r'identifiedResourceName = "((?:[^"\\]|\\.)*)"')
APPLE = '사과'
TYPE_NAMES = {
    'Armor': '防具', 'Weapon': '武器', 'Cash': '商城道具', 'Usable': '消耗品',
    'Card': '卡片', 'Etc': '其他', 'DelayConsume': '消耗品', 'Delayconsume': '消耗品',
    'ShadowGear': '影子裝備', 'Healing': '恢復道具', 'Petegg': '寵物蛋',
    'PetEgg': '寵物蛋', 'Ammo': '彈藥', 'Petarmor': '寵物裝備',
}


def kinds(item: dict) -> list[tuple]:
    """Kinds from most to least specific."""
    location = sorted(item['Locations'])[0] if item['Locations'] else None
    return [(item.get('Type'), item.get('SubType'), location),
            (item.get('Type'), item.get('SubType')),
            (item.get('Type'),)]


def client_resources(table: str) -> dict[int, str]:
    resources = {}
    for match in ENTRY.finditer(table):
        found = RESOURCE.search(match.group(2))
        if found and found.group(1):
            resources[int(match.group(1))] = found.group(1)
    return resources


def icon_by_kind(items: list[dict], resources: dict[int, str]) -> dict[tuple, str]:
    counts: dict[tuple, Counter] = {}
    for item in items:
        resource = resources.get(item['id'])
        if resource:
            for kind in kinds(item):
                counts.setdefault(kind, Counter())[resource] += 1
    return {kind: counter.most_common(1)[0][0] for kind, counter in counts.items()}


def lua_string(text: str) -> str:
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'


def entry(item: dict, name: str, icon: str) -> str:
    kind = TYPE_NAMES.get(item.get('Type'), '其他')
    return '\n'.join([
        f'\t[{item["id"]}] = {{',
        f'\t\tunidentifiedDisplayName = {lua_string(name)},',
        f'\t\tunidentifiedResourceName = {lua_string(icon)},',
        '\t\tunidentifiedDescriptionName = {',
        '\t\t\t[1] = "尚未鑑定；可用[放大鏡]來鑑定物品。",',
        '\t\t},',
        f'\t\tidentifiedDisplayName = {lua_string(name)},',
        f'\t\tidentifiedResourceName = {lua_string(icon)},',
        '\t\tidentifiedDescriptionName = {',
        f'\t\t\t[1] = "類型：^777777{kind}^000000",',
        '\t\t\t[2] = "此道具的說明尚未收錄。",',
        '\t\t},',
        f'\t\tslotCount = {int(item.get("Slots", 0))},',
        f'\t\tClassNum = {int(item.get("View", 0))},',
        '\t\tcostume = false,',
        '\t},',
    ])


def main() -> None:
    table_path, rathena, names_path, out = sys.argv[1], Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    table = open(table_path, encoding='utf-8').read()
    names = json.load(open(names_path, encoding='utf-8'))
    known = {int(x) for x in re.findall(r'^\t\[(\d+)\] = \{', table, re.M)}
    resources = client_resources(table)
    items = rathena_items(rathena)
    icons = icon_by_kind(items, resources)

    blocks, seen, fallback = [], set(), 0
    for item in items:
        if item['id'] in known or item['id'] in seen or str(item['id']) not in names:
            continue
        seen.add(item['id'])
        icon = next((icons[k] for k in kinds(item) if k in icons), None)
        if icon is None:
            icon, fallback = APPLE, fallback + 1
        blocks.append(entry(item, names[str(item['id'])], icon))

    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('tbl_custom = {\n' + '\n'.join(blocks) + '\n}\n')
    print(f'{len(blocks)} custom items written ({fallback} with the fallback icon)')


if __name__ == '__main__':
    main()
