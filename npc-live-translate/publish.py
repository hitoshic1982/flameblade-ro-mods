"""Publish the npc-live-translate plugin to the Mac Mini.

Writes client/data-version.json (a short content hash per data file, which
the plugin compares with its IndexedDB copy), backs up the remote files,
copies the plugin, restarts remoteclient (it caches served files), and checks every file's hash on the Mac Mini and at the
public URL. Always deploy through this script: a data file uploaded without a
new data-version.json would leave players on their stored old copy.

usage: python publish.py <backup-tag> [--force]

Refuses to run while game connections are open (the restart drops them),
unless --force is given.
"""
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

CLIENT = Path(__file__).parent / 'client'
DATA = ('dict.json', 'templates.json', 'maps.json')
FILES = ('index.js', *DATA, 'data-version.json')
HOST = 'hitoshic1982@192.168.0.246'
KEY = str(Path.home() / '.ssh' / 'id_ed25519_macmini')
REMOTE = 'served-root/plugins/npc-live-translate'
PUBLIC = 'https://ro.flamebladestudio.com.tw/plugins/npc-live-translate/'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    tag = sys.argv[1]
    versions = {name: sha256((CLIENT / name).read_bytes())[:16] for name in DATA}
    (CLIENT / 'data-version.json').write_text(json.dumps(versions, indent=1) + '\n', encoding='utf-8')
    print('versions', versions)

    ssh = ['ssh', '-i', KEY, HOST]
    # The restart below drops every game connection: never with players on.
    online = subprocess.run([*ssh, 'curl -s 127.0.0.1:3338/api/shield-stats'],
                            check=True, capture_output=True, text=True).stdout
    live = json.loads(online).get('liveSessions', 0) if online.strip() else 0
    if live and '--force' not in sys.argv:
        sys.exit(f'{live} game connection(s) open: publishing restarts remoteclient and '
                 'would disconnect them. Try again later, or add --force.')
    backup =' '.join(f'[ -f {n} ] && cp {n} {n}.bak-{tag};' for n in FILES)
    subprocess.run([*ssh, f'cd {REMOTE} && {backup} true'], check=True)
    subprocess.run(['scp', '-q', '-i', KEY, *[str(CLIENT / n) for n in FILES], f'{HOST}:{REMOTE}/'], check=True)
    # remoteclient keeps served files in memory; restart so the new ones are served.
    subprocess.run([*ssh, 'sudo systemctl restart remoteclient && sleep 4 && systemctl is-active remoteclient'], check=True)

    local = {n: sha256((CLIENT / n).read_bytes()) for n in FILES}
    remote = subprocess.run([*ssh, f'cd {REMOTE} && sha256sum {" ".join(FILES)}'],
                            check=True, capture_output=True, text=True).stdout
    remote = {line.split()[1]: line.split()[0] for line in remote.splitlines()}
    agent = {'User-Agent': 'Mozilla/5.0 Chrome/140.0'}
    for name in FILES:
        request = urllib.request.Request(PUBLIC + name, headers=agent)
        public = sha256(urllib.request.urlopen(request, timeout=60).read())
        ok = local[name] == remote.get(name) == public
        print('ok  ' if ok else 'FAIL', name)
        if not ok:
            sys.exit(f'hash mismatch for {name}')


if __name__ == '__main__':
    main()
