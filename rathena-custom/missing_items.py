"""List rAthena items the client's item table does not know.

Reads the item table (Lua source written by lub_to_lua.py) and rAthena's
db/re/item_db_*.yml, and writes one JSON record per missing item: id,
AegisName, English Name, Type, SubType, Slots, View and Locations, which is
what build_custom_items.py needs to give each one a name and an icon.

usage: python3 missing_items.py <itemInfo.lua> <rathena dir> <out.json>
"""
import json
import re
import sys
from pathlib import Path

FIELD = re.compile(r'^    (AegisName|Name|Type|SubType|Slots|View):\s*(.+?)\s*$')
LOCATION = re.compile(r'^      (\w+):\s*true\s*$')


def rathena_items(rathena: Path) -> list[dict]:
    items = []
    for path in sorted((rathena / 'db/re').glob('item_db_*.yml')):
        current = None
        in_locations = False
        for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
            head = re.match(r'^  - Id:\s*(\d+)\s*$', line)
            if head:
                current = {'id': int(head.group(1)), 'Locations': []}
                items.append(current)
                in_locations = False
                continue
            if current is None:
                continue
            field = FIELD.match(line)
            if field:
                # a value may carry a trailing "# ..." developer comment
                value = re.sub(r'\s+#.*$', '', field.group(2)).strip('"')
                current[field.group(1)] = int(value) if field.group(1) in ('Slots', 'View') and value.isdigit() else value
                in_locations = False
            elif line.startswith('    Locations:'):
                in_locations = True
            elif in_locations:
                location = LOCATION.match(line)
                if location:
                    current['Locations'].append(location.group(1))
                elif not line.startswith('      '):
                    in_locations = False
    return items


def main() -> None:
    table, rathena, out = sys.argv[1], Path(sys.argv[2]), sys.argv[3]
    known = {int(x) for x in re.findall(r'^\t\[(\d+)\] = \{', open(table, encoding='utf-8').read(), re.M)}
    seen, missing = set(), []
    for item in rathena_items(rathena):
        if item['id'] not in known and item['id'] not in seen:
            seen.add(item['id'])
            missing.append(item)
    json.dump(missing, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(missing)} items missing from the client table')


if __name__ == '__main__':
    main()
