"""Minimal Lua 5.1 bytecode reader for data-only .lub files (32-bit size_t).

Undumps the main chunk and runs just the opcodes a data table uses
(LOADK/LOADBOOL/LOADNIL/MOVE/NEWTABLE/SETTABLE/SETLIST/GETGLOBAL/SETGLOBAL/
GETTABLE/RETURN), returning the globals it assigns."""
import struct, sys, json

class Reader:
    def __init__(self, data):
        self.b, self.p = data, 0
        assert data[:4] == b'\x1bLua' and data[4] == 0x51, 'not Lua 5.1 bytecode'
        self.little = data[6] == 1
        self.int_size, self.size_t, self.instr, self.num = data[7], data[8], data[9], data[10]
        self.p = 12
    def take(self, n):
        v = self.b[self.p:self.p + n]; self.p += n; return v
    def byte(self): return self.take(1)[0]
    def uint(self, size):
        return int.from_bytes(self.take(size), 'little' if self.little else 'big')
    def int(self): return self.uint(self.int_size)
    def string(self):
        n = self.uint(self.size_t)
        return self.take(n)[:-1] if n else None
    def number(self): return struct.unpack('<d' if self.little else '>d', self.take(8))[0]
    def function(self):
        f = {}
        self.string(); self.int(); self.int()
        f['nups'], f['params'], f['vararg'], f['stack'] = self.byte(), self.byte(), self.byte(), self.byte()
        f['code'] = [self.uint(self.instr) for _ in range(self.int())]
        consts = []
        for _ in range(self.int()):
            t = self.byte()
            consts.append(None if t == 0 else bool(self.byte()) if t == 1 else self.number() if t == 3 else self.string())
        f['k'] = consts
        f['protos'] = [self.function() for _ in range(self.int())]
        for _ in range(self.int()): self.int()
        for _ in range(self.int()): self.string(); self.int(); self.int()
        for _ in range(self.int()): self.string()
        return f

def run(f):
    g = {}
    R = [None] * 256
    k = f['k']
    rk = lambda x: k[x & 0xFF] if x & 0x100 else R[x]
    code, pc = f['code'], 0
    while pc < len(code):
        i = code[pc]; pc += 1
        op, a = i & 0x3F, (i >> 6) & 0xFF
        c, b, bx = (i >> 14) & 0x1FF, (i >> 23) & 0x1FF, (i >> 14) & 0x3FFFF
        if op == 0: R[a] = R[b]
        elif op == 1: R[a] = k[bx]
        elif op == 2:
            R[a] = bool(b)
            if c: pc += 1
        elif op == 3:
            for j in range(a, b + 1): R[j] = None
        elif op == 5: R[a] = g.get(k[bx])
        elif op == 6: R[a] = R[b].get(rk(c)) if isinstance(R[b], dict) else None
        elif op == 7: g[k[bx]] = R[a]
        elif op == 9: R[a][rk(b)] = rk(c)
        elif op == 10: R[a] = {}
        elif op == 34:
            if c == 0: c = code[pc]; pc += 1
            n = b if b else 0
            base = (c - 1) * 50
            for j in range(1, n + 1): R[a][base + j] = R[a + j]
        elif op == 30: break
        else: raise ValueError(f'unsupported opcode {op} at {pc - 1}')
    return g

def plain(v):
    if isinstance(v, dict):
        if v and all(isinstance(x, (int, float)) and float(x).is_integer() for x in v):
            keys = sorted(int(x) for x in v)
            if keys == list(range(1, len(keys) + 1)): return [plain(v[x]) for x in keys]
        return {str(plain(x)): plain(y) for x, y in v.items()}
    if isinstance(v, bytes): return v.decode('big5', 'replace')
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v

if __name__ == '__main__':
    r = Reader(open(sys.argv[1], 'rb').read())
    g = run(r.function())
    json.dump({str(plain(x)): plain(y) for x, y in g.items()}, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
    for name, v in g.items(): print(plain(name), type(v).__name__, len(v) if hasattr(v, '__len__') else '')
