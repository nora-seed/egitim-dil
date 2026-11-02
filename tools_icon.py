import struct, zlib, math, os

def png(w, h, px):
    raw = b""
    def row(i):
        # her satır öncesi filter byte 0
        return b"\x00" + bytes(px[i])
    out = []
    for i in range(h):
        r = bytearray()
        r.append(0)
        r += px[i]
        out.append(bytes(r))
    raw = b"".join(out)
    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
            chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def draw(w, maskable=False):
    px = [bytearray(w * 3) for _ in range(w)]
    r_inset = 0.42 if maskable else 0.48
    cx = cy = w / 2 - 0.5
    grad_top = (37, 99, 235)     # mavi
    grad_bot = (13, 148, 136)    # teal
    white = (255, 255, 255)
    amber = (245, 158, 11)
    for y in range(w):
        for x in range(w):
            d = math.hypot(x - cx, y - cy) / (w / 2)
            t = y / (w - 1)
            c = tuple(int(grad_top[i] + (grad_bot[i] - grad_top[i]) * t) for i in range(3))
            # maskable: tüm alan dolu; normal: köşeler dış
            rr = w / 2 * r_inset
            if not maskable and d > 1.0:
                c = (245, 246, 251)
            elif maskable and d > 1.0:
                # köşelerde düz renk
                pass
            px[y][x*3:x*3+3] = c
    def put(x, y, color):
        if 0 <= x < w and 0 <= y < w:
            px[y][x*3:x*3+3] = color
    # ortada "kart" + kapak çizgi bloğu (kitap/sözlük temsili)
    cw, ch = int(w*0.52), int(w*0.62)
    x0, y0 = int(cx-cw/2), int(cy-ch/2)
    rad = int(w*0.045)
    for yy in range(ch):
        for xx in range(cw):
            X, Y = x0+xx, y0+yy
            # yuvarlatılmış dikdörtgen testi
            ex = max(x0+rad-X, X-(x0+cw-1-rad), 0)
            ey = max(y0+rad-Y, Y-(y0+ch-1-rad), 0)
            if math.hypot(ex, ey) > rad:
                continue
            # omurga şeridi (kitap sırtı)
            spine = xx < int(cw*0.14)
            # başlık bloğu + satırlar
            line = (int(ch*0.18) < yy < int(ch*0.30) and xx > int(cw*0.22) and xx < cw - int(cw*0.08)) \
                or (int(ch*0.42) < yy < int(ch*0.50) and xx > int(cw*0.22)) \
                or (int(ch*0.58) < yy < int(ch*0.66) and xx > int(cw*0.22) and xx < cw - int(cw*0.22))
            col = tuple(int(white[i]*0.92+(13,148,136)[i]*0.08) for i in range(3))
            if spine:
                col = amber
            elif line:
                col = grad_top if not maskable else (29, 78, 216)
            put(X, Y, col)
    # küçük rozet (öğretilen onay noktası)
    bR = int(w*0.13); bcx, bcy = int(x0+cw)+ int(w*0.02), int(y0+ch)-int(w*0.02)
    for yy in range(-bR, bR+1):
        for xx in range(-bR, bR+1):
            if math.hypot(xx, yy) <= bR:
                put(bcx+xx, bcy+yy, white)
    bl = int(bR*0.5)
    for i in range(bl):
        put(bcx-bl//2+i, bcy+i-bl//2-bl//4, (13,148,136))
        if i < bl//2:
            put(bcx+i-bl//2, bcy+bl//2-i, (13,148,136))
    return png(w, w, px)

os.makedirs("icons", exist_ok=True)
for size in (192, 512):
    open(f"icons/icon-{size}.png","wb").write(draw(size, False))
    open(f"icons/icon-{size}-maskable.png","wb").write(draw(size, True))
print("ikonlar yazıldı:", os.listdir("icons"))
