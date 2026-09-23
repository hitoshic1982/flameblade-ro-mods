"""Build the data the map-prefetch plugin reads. Runs on the Mac Mini.

Writes, under ~/served-root/plugins/map-prefetch/data/:

* neighbors.json — map -> maps one warp away (from rAthena's warp scripts,
  pre-renewal copies excluded), both directions of each warp.
* towns.json — main towns the plugin prefetches after the neighbours.
* files/<map>.json — the URLs the game requests while loading <map>:
  .rsw/.gat/.gnd, the minimap, ground textures, every model and
  each model's textures, spelled exactly as the client spells them.

The client keeps file names as raw CP949 bytes read as Latin-1 and
percent-encodes that; a URL in any other spelling is a different browser and
Cloudflare cache entry, so prefetching it would do nothing.

usage: python3 build_manifests.py [--neighbors-only]

--neighbors-only rewrites neighbors.json and towns.json from existing files/ lists.
"""
import json
import sys
import re
import urllib.parse
import urllib.request
from pathlib import Path

LOCAL = 'http://127.0.0.1:3338/'
NPC = Path.home() / 'rathena' / 'npc'
OUT = Path.home() / 'served-root' / 'plugins' / 'map-prefetch' / 'data'
WARP = re.compile(r'^([a-z0-9_@-]+),\d+,\d+(?:,\d+)?\t(?:warp|warp2)\t[^\t]+\t\d+,\d+,([a-z0-9_@-]+),\d+,\d+', re.M)
# Main towns, in prefetch order (the plugin fetches them after neighbours,
# within its session budget).
TOWNS = ['prontera', 'izlude', 'payon', 'geffen', 'morocc', 'alberta', 'aldebaran', 'yuno']
ASSET = re.compile(rb'([\x21-\xff][\x20-\xff]{0,120}?\.(?:rsm2?|wav|bmp|tga|jpg|png))\x00', re.I)


def url_path(path: str) -> str:
    return '/'.join(urllib.parse.quote(s, safe="!'()*-._~") for s in path.replace('\\', '/').split('/'))


def client_url(path: str) -> str:
    """'/' + the percent-encoded Latin-1 reading of the path's CP949 bytes."""
    return '/' + url_path(path.encode('cp949').decode('latin-1'))


def get(path: str) -> bytes:
    with urllib.request.urlopen(LOCAL + url_path(path), timeout=60) as response:
        return response.read()


def names(blob: bytes) -> list[str]:
    found = []
    for match in ASSET.finditer(blob):
        try:
            found.append(match.group(1).decode('cp949'))
        except UnicodeDecodeError:
            continue  # not a file name, just bytes that looked like one
    return found


def neighbors() -> dict[str, list[str]]:
    graph: dict[str, set[str]] = {}
    for script in NPC.rglob('*.txt'):
        if 'pre-re' in script.parts:
            continue
        for source, target in WARP.findall(script.read_text(encoding='utf-8', errors='replace')):
            if source != target:
                graph.setdefault(source, set()).add(target)
                graph.setdefault(target, set()).add(source)
    # Busiest first: a map with many warps (town, field, main building) is a
    # likelier next stop than a one-door quest room, and the plugin only
    # prefetches the first few.
    degree = {m: len(n) for m, n in graph.items()}
    return {m: sorted(n, key=lambda x: (-degree[x], x)) for m, n in sorted(graph.items())}


def map_urls(name: str, index: set[str], model_textures: dict[str, list[str]]) -> list[str]:
    wanted: dict[str, None] = {}

    def add(path: str) -> bool:
        if path.lower() not in index:
            return False
        wanted[client_url(path)] = None
        return True

    for ext in ('rsw', 'gat', 'gnd'):
        add(f'data\\{name}.{ext}')
    add(f'data\\texture\\유저인터페이스\\map\\{name}.bmp')
    # Water frames are shared by every map and cached on first sight, so
    # they are not listed per map.
    for kind in ('rsw', 'gnd'):
        if f'data\\{name}.{kind}' not in index:
            continue  # a few maps ship without one of the two
        for asset in names(get(f'data/{name}.{kind}')):
            low = asset.lower()
            if low.endswith(('.rsm', '.rsm2')):
                if add('data\\model\\' + asset):
                    if low not in model_textures:
                        model_textures[low] = names(get('data/model/' + asset.replace('\\', '/')))
                    for texture in model_textures[low]:
                        add('data\\texture\\' + texture)
            elif low.endswith('.wav'):
                add('data\\wav\\' + asset)
            else:
                add('data\\texture\\' + asset)
    return list(wanted)


def main() -> None:
    index_list = json.loads(urllib.request.urlopen(LOCAL + 'list-files', timeout=120).read())
    index = {p.lower() for p in index_list}
    graph = neighbors()
    (OUT / 'files').mkdir(parents=True, exist_ok=True)
    maps = [m for m in graph if f'data\\{m}.rsw' in index]
    if '--neighbors-only' in sys.argv:
        maps = [m for m in maps if (OUT / 'files' / f'{m}.json').exists()]
    model_textures: dict[str, list[str]] = {}
    sizes = []
    for count, name in enumerate(maps, 1):
        if '--neighbors-only' in sys.argv:
            sizes.append(len(json.loads((OUT / 'files' / f'{name}.json').read_text(encoding='ascii'))))
            continue
        urls = map_urls(name, index, model_textures)
        (OUT / 'files' / f'{name}.json').write_text(json.dumps(urls, ensure_ascii=True), encoding='ascii')
        sizes.append(len(urls))
        if count % 100 == 0:
            print(f'{count}/{len(maps)}', flush=True)
    graph = {m: [n for n in near if n in set(maps)] for m, near in graph.items() if m in set(maps)}
    (OUT / 'neighbors.json').write_text(json.dumps(graph, separators=(',', ':')), encoding='ascii')
    (OUT / 'towns.json').write_text(json.dumps([t for t in TOWNS if t in set(maps)]), encoding='ascii')
    print(f'maps {len(maps)}  files per map: median {sorted(sizes)[len(sizes) // 2]}, max {max(sizes)}')


if __name__ == '__main__':
    main()
