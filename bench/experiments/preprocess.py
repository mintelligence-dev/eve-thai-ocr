"""Preprocessing experiment: does cropping/straightening or contrast help the model read photos?

    python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy
    .venv/bin/python bench/experiments/preprocess.py /tmp/pre
    pnpm bench -- --cases /tmp/pre/scan --models google/gemini-2.5-flash --runs 3   # per variant

Variants: base (what the app does today) | scan | enhance | scan_enhance.
Real photos come from bench/private (git-ignored); the rest are synthetic. See README.md next to this file."""
import cv2, json, os, shutil, sys
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..") + "/"
OUT = sys.argv[1]
MAX_SIDE = 2048

def resize(img, max_side=MAX_SIDE):
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    return img if s >= 1 else cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)

def order_pts(pts):
    s = pts.sum(axis=1); d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)], pts[np.argmax(s)], pts[np.argmax(d)]], dtype="float32")

def find_paper(img):
    """Quadrilateral around the brightest large low-saturation region (white paper). None if unsure."""
    h, w = img.shape[:2]
    s = 800 / max(h, w)
    small = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(cv2.GaussianBlur(small, (7, 7), 0), cv2.COLOR_BGR2HSV)
    v = hsv[:, :, 2]
    # Otsu on brightness, keeping low-saturation pixels: paper is bright and nearly colourless.
    thr, _ = cv2.threshold(v, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = ((v > thr * 0.85) & (hsv[:, :, 1] < 70)).astype("uint8") * 255
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts: return None
    c = max(cnts, key=cv2.contourArea)
    area = cv2.contourArea(c) / (small.shape[0] * small.shape[1])
    if area < 0.12 or area > 0.97: return None
    hull = cv2.convexHull(c)
    peri = cv2.arcLength(hull, True)
    quad = None
    for eps in (0.02, 0.04, 0.06, 0.08):
        approx = cv2.approxPolyDP(hull, eps * peri, True)
        if len(approx) == 4: quad = approx.reshape(4, 2).astype("float32"); break
    if quad is None: quad = cv2.boxPoints(cv2.minAreaRect(hull)).astype("float32")
    return order_pts(quad) / s

def scan(img):
    q = find_paper(img)
    if q is None: return img, False
    tl, tr, br, bl = q
    w = int(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
    h = int(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
    if w < 200 or h < 200: return img, False
    M = cv2.getPerspectiveTransform(q, np.array([[0, 0], [w, 0], [w, h], [0, h]], dtype="float32"))
    out = cv2.warpPerspective(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    m = int(0.01 * min(w, h))  # trim a sliver of paper edge / background
    return out[m:h - m, m:w - m], True

def enhance(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(g)
    blur = cv2.GaussianBlur(g, (0, 0), 1.2)
    g = cv2.addWeighted(g, 1.6, blur, -0.6, 0)  # unsharp mask
    return cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)

def synth_cases():
    """Harder versions of the clean synthetic receipt: perspective + clutter + shadow, and a faded copy."""
    src = cv2.imread(ROOT + "bench/cases/receipt-thai-clean.png")
    exp = json.load(open(ROOT + "bench/cases/receipt-thai-clean.expected.json"))
    rng = np.random.default_rng(3)
    H, W = 1400, 1800
    bg = np.full((H, W, 3), (70, 110, 150), dtype="uint8")  # wooden-desk brown (BGR)
    bg = cv2.add(bg, rng.integers(0, 40, (H, W, 3), dtype="uint8"))
    for _ in range(25):  # clutter
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        cv2.circle(bg, (x, y), int(rng.integers(20, 90)), tuple(int(c) for c in rng.integers(0, 255, 3)), -1)
    h, w = src.shape[:2]
    dst = np.float32([[430, 130], [1190, 190], [1260, 1230], [380, 1180]])  # skewed quad
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), dst)
    warped = cv2.warpPerspective(src, M, (W, H), borderMode=cv2.BORDER_TRANSPARENT)
    mask = cv2.warpPerspective(np.full((h, w), 255, "uint8"), M, (W, H))
    persp = np.where(mask[:, :, None] > 0, warped, bg)
    grad = np.tile(np.linspace(1.0, 0.45, W, dtype="float32"), (H, 1))[:, :, None]  # side shadow
    persp = cv2.GaussianBlur((persp * grad).astype("uint8"), (0, 0), 1.0)
    faded = (255 - (255 - src.astype("float32")) * 0.28)
    faded = np.clip(faded + rng.normal(0, 6, faded.shape), 0, 255).astype("uint8")
    return {"synth-perspective": (persp, exp), "synth-faded": (cv2.resize(faded, None, fx=1.4, fy=1.4), exp)}

cases = {}
for name in ["watsons", "gaga", "tops"]:
    img = cv2.imread(ROOT + f"bench/private/{name}.jpg")
    cases[name] = (img, json.load(open(ROOT + f"bench/private/{name}.expected.json")))
cases["blurred"] = (cv2.imread(ROOT + "bench/cases/receipt-thai-blurred.png"),
                    json.load(open(ROOT + "bench/cases/receipt-thai-blurred.expected.json")))
cases.update(synth_cases())

variants = {
    "base": lambda i: (i, False),
    "scan": scan,
    "enhance": lambda i: (enhance(i), False),
    "scan_enhance": lambda i: (lambda r: (enhance(r[0]), r[1]))(scan(i)),
}
shutil.rmtree(OUT, ignore_errors=True)
for vname, fn in variants.items():
    os.makedirs(f"{OUT}/{vname}")
    for cname, (img, exp) in cases.items():
        out, scanned = fn(img)
        out = resize(out)
        cv2.imwrite(f"{OUT}/{vname}/{cname}.jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 90])
        json.dump(exp, open(f"{OUT}/{vname}/{cname}.expected.json", "w"), ensure_ascii=False)
        if vname.startswith("scan"): print(f"{vname:13s} {cname:18s} paper {'FOUND' if scanned else 'not found'}  -> {out.shape[1]}x{out.shape[0]}")
