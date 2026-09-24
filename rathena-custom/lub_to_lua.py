"""Turn a data-only compiled item table (.lub) back into Lua source text.

The web client decides whether an item table is UTF-8 by decoding the whole
file as UTF-8 (isUtf8Table). Compiled bytecode always holds bytes that are not
valid UTF-8, so a UTF-8 table shipped as bytecode (the Taiwan client's
iteminfo_new.lub) is read as Big5: names turn to garbage and resource names,
which become icon paths, point nowhere. As source text the same table is
valid UTF-8 and is read correctly.

Strings that are valid UTF-8 are written as they are; any other string is
written with \\ddd escapes, which keep the file itself valid UTF-8 while Lua
rebuilds the original bytes. Every global the chunk assigns is written.

usage: python3 lub_to_lua.py <in.lub> <out.lua>
"""
import re
import sys

from lub51 import Reader, run

IDENTIFIER = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def lua_string(value: bytes) -> str:
    try:
        text = value.decode('utf-8')
        plain = True
    except UnicodeDecodeError:
        plain = False
    out = ['"']
    if plain:
        for ch in text:
            if ch in '"\\':
                out.append('\\' + ch)
            elif ord(ch) < 32 or ord(ch) == 127:
                out.append(f'\\{ord(ch):03d}')
            else:
                out.append(ch)
    else:
        for byte in value:
            if 32 <= byte < 127 and chr(byte) not in '"\\':
                out.append(chr(byte))
            else:
                out.append(f'\\{byte:03d}')
    out.append('"')
    return ''.join(out)


def lua_value(value, indent: str) -> str:
    if isinstance(value, bytes):
        return lua_string(value)
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return str(int(value)) if float(value).is_integer() else repr(value)
    if value is None:
        return 'nil'
    if isinstance(value, dict):
        inner = indent + '\t'
        parts = [f'{inner}{lua_key(k)} = {lua_value(v, inner)},' for k, v in sorted(value.items(), key=sort_key)]
        return '{\n' + '\n'.join(parts) + f'\n{indent}}}' if parts else '{}'
    raise TypeError(f'cannot write {type(value).__name__}')


def lua_key(key) -> str:
    if isinstance(key, bytes) and IDENTIFIER.match(key.decode('latin-1')):
        return key.decode('latin-1')
    return f'[{lua_value(key, "")}]'


def sort_key(item):
    key = item[0]
    return (0, float(key), b'') if isinstance(key, (int, float)) else (1, 0.0, key if isinstance(key, bytes) else str(key).encode())


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    globals_ = run(Reader(open(source, 'rb').read()).function())
    with open(target, 'w', encoding='utf-8', newline='\n') as out:
        out.write(f'-- Generated from {source.rsplit("/", 1)[-1]} by lub_to_lua.py; edit the source table, not this file.\n')
        for name, value in globals_.items():
            out.write(f'{name.decode("latin-1") if isinstance(name, bytes) else name} = {lua_value(value, "")}\n')
    text = open(target, 'rb').read()
    text.decode('utf-8')  # the whole point: the result must be valid UTF-8
    print(f'{target}: {len(text):,} bytes, globals: {[n.decode() if isinstance(n, bytes) else n for n in globals_]}')


if __name__ == '__main__':
    main()
