# -*- coding: utf-8 -*-
"""Base-map generator for the bird_web "where" view.

Run:  python3 src/assets/map/_build-map.py

Rewrites src/data/locations.json (x/y/lat/lng/mapSpace), src/data/map-meta.json,
src/assets/map/us.svg and src/assets/map/triangle.svg. Deterministic.
The coastline / lake / road point lists below are coarse and typed by hand;
they are the source of truth for the artwork, so edit them, not the SVGs.
"""

# ---------------------------------------------------------------- locations
# slug -> (lat, lng, note)
LOCAL = {
    "sandy-creek-park":        (35.9765, -78.9736, "Sandy Creek Park, Durham"),
    # 1055 Stillwell Dr, Durham, NC 27707 — address confirmed by the owners.
    # Geocoded 2026-09-19: ArcGIS World Geocoder (score 100) 35.951278, -78.981471;
    # OSM/Photon house-number match 35.951198, -78.981472. Rounded to 4 dp below.
    # The street address itself is kept out of placeNote, which is shown publicly.
    "location":                (35.9513, -78.9815, "金玉公寓 — owners' apartment, S Durham (confirmed address; street address kept private)"),
    "lake-crabtree":           (35.8396, -78.8000, "Lake Crabtree County Park, Morrisville"),
    "brumley-nature-preserve": (36.0185, -79.0650, "Brumley Forest Nature Preserve, Orange Co."),
    "mason-farm-biological-reserve": (35.8900, -79.0150, "Mason Farm Biological Reserve, Chapel Hill"),
    "jordan-lake":             (35.7550, -79.0200, "B. Everett Jordan Lake, Ebenezer Church / Seaforth access"),
    "patterson-place-five-oaks": (35.9370, -78.9600, "Patterson Place & Five Oaks, Durham (15-501 @ I-40)"),
    "blackwood-farm-park":     (36.0220, -79.1180, "Blackwood Farm Park, Hillsborough"),
    "finley-golf-club":        (35.8970, -79.0130, "UNC Finley Golf Course, Chapel Hill"),
    "duke-garden":             (36.0010, -78.9310, "Sarah P. Duke Gardens, Durham"),
    "nc-botanical-garden":     (35.8980, -79.0320, "North Carolina Botanical Garden, Chapel Hill"),
    "lyon-farms":              (35.9050, -78.9560, "Lyon's Farm, south Durham"),
    "chapel-hill-public-library": (35.9230, -79.0470, "Chapel Hill Public Library, Library Dr"),
    "lake-betz":               (35.9000, -78.8560, "Lake Betz, Research Triangle Park (Kit Creek Rd, Morrisville)"),
    "beaver-marsh-nature-preserve": (36.0300, -78.8750, "Beaver Marsh Nature Preserve, 3400 Ambridge St, N Durham"),
    "university-of-north-carolina-at-chapel-hill": (35.9050, -79.0470, "UNC Chapel Hill campus"),
    "fearrington":             (35.8010, -79.0900, "Fearrington Village, Pittsboro"),
    "bolin-creek-trail":       (35.9200, -79.0680, "Bolin Creek Trail, Carrboro / Chapel Hill"),
}

# slug -> (lat, lng, note, inset)
TRAVEL = {
    "seattle-wa":          (47.6062, -122.3321, "Seattle, WA", None),
    "denver-co":           (39.7392, -104.9903, "Denver, CO", None),
    "tampa-fl":            (27.9506,  -82.4572, "Tampa, FL", None),
    "cape-may-nj":         (38.9351,  -74.9060, "Cape May, NJ", None),
    "islands-of-hawaii":   (20.7984, -156.3319, "Islands of Hawaii (anchor: Maui)", "hawaii"),
    "boston-ma":           (42.3601,  -71.0589, "Boston, MA", None),
    "us-101-or":           (44.6200, -124.0500, "US-101, Oregon coast", None),
    "rocky-mountain-np-co":(40.3428, -105.6836, "Rocky Mountain NP, CO", None),
    "horn-pond-ma":        (42.4560,  -71.1490, "Horn Pond, Woburn, MA", None),
    "chincoteague-va":     (37.9332,  -75.3782, "Chincoteague NWR, VA", None),
    "colorado-springs-co": (38.8339, -104.8214, "Colorado Springs, CO", None),
    "new-york-city-ny":    (40.7128,  -74.0060, "New York City, NY", None),
    "portland-me":         (43.6591,  -70.2568, "Portland, ME", None),
    "silver-springs-fl":   (29.2158,  -82.0573, "Silver Springs, FL", None),
    "wilmington":          (34.2257,  -77.9447, "Wilmington, NC", None),
    "nc-zoo":              (35.6280,  -79.7640, "North Carolina Zoo, Asheboro", None),
    "parker-river-ma":     (42.7500,  -70.8100, "Parker River NWR, Plum Island, MA", None),
    "puerto-rico":         (18.2208,  -66.5901, "Puerto Rico", "puerto_rico"),
    "miami-beach-fl":      (25.7907,  -80.1300, "Miami Beach, FL", None),
}

# Manual pre-nudges (degrees lat, lng) applied before relaxation so that the
# de-clustering pushes pins in a geographically honest direction.
PRE_NUDGE = {
    "us-101-or":      ( 0.00,  0.55),   # nudged inland so the pin sits on land
    "horn-pond-ma":   ( 0.55, -1.30),   # inland NW of Boston
    "parker-river-ma":( 1.05,  0.35),   # up the coast NE of Boston
    "boston-ma":      (-0.35,  0.15),
    "portland-me":    ( 0.35,  0.35),
    "colorado-springs-co": (-0.55, 0.10),
    "rocky-mountain-np-co":( 0.45,-0.55),
}

# ------------------------------------------------------------- US coastline
# Coarse hand-listed outline of the contiguous US, clockwise from Puget Sound.
US_OUTLINE = [
    (48.99,-123.10),(48.40,-124.70),(47.00,-124.20),(46.25,-124.05),(45.00,-124.05),
    (44.00,-124.12),(43.00,-124.45),(42.00,-124.55),(41.00,-124.15),(40.00,-124.35),
    (38.95,-123.73),(37.80,-122.50),(36.95,-122.05),(36.30,-121.90),(35.40,-120.90),
    (34.45,-120.47),(34.02,-118.50),(33.35,-117.60),(32.53,-117.12),
    (32.62,-114.72),(31.33,-111.07),(31.33,-108.21),(31.78,-108.21),(31.78,-106.53),
    (29.78,-104.68),(29.19,-102.99),(29.80,-101.40),(28.50,-100.50),(26.40,-99.10),
    (25.96,-97.15),(27.80,-97.40),(28.95,-95.30),(29.70,-93.85),(29.25,-90.00),
    (29.10,-89.25),(30.25,-88.10),(30.40,-86.50),(29.70,-84.85),(29.15,-83.05),
    (27.80,-82.60),(26.30,-81.85),(25.15,-80.95),(25.80,-80.15),(28.10,-80.60),
    (30.40,-81.40),(32.05,-80.90),(32.78,-79.93),(33.85,-78.60),(34.62,-76.55),
    (35.25,-75.53),(36.85,-75.97),(37.90,-75.35),(38.80,-75.05),(39.35,-74.42),
    (40.45,-73.95),(40.60,-73.30),(41.05,-71.95),(41.35,-71.40),(41.60,-70.65),
    (41.75,-70.00),(42.07,-70.18),(41.90,-70.55),(42.35,-71.05),(42.80,-70.80),
    (43.65,-70.25),(44.35,-68.20),(44.80,-67.00),(45.30,-67.80),(47.35,-68.35),
    (47.05,-69.25),(46.40,-70.20),(45.30,-71.10),(45.01,-73.35),(44.98,-74.98),
    (44.20,-76.15),(43.35,-77.60),(43.25,-79.07),(42.90,-78.90),(42.15,-80.08),
    (41.48,-82.70),(41.70,-83.47),(41.65,-87.52),(43.05,-87.90),(44.55,-87.90),
    (45.28,-86.95),(45.80,-84.75),(46.50,-84.35),(46.65,-86.50),(46.55,-87.40),
    (47.45,-87.90),(46.85,-89.30),(46.80,-90.55),(46.75,-92.10),(47.98,-89.58),
    (48.15,-90.85),(48.65,-93.40),(49.00,-95.15),(49.00,-104.00),(49.00,-114.00),
    (49.00,-122.75),
]

# Michigan's lower peninsula, drawn as its own blob.
US_MITTEN = [
    (41.75,-83.45),(42.30,-83.10),(43.00,-82.42),(43.90,-82.50),(43.65,-83.90),
    (44.30,-83.35),(45.00,-83.35),(45.65,-84.15),(45.80,-84.75),(45.10,-85.60),
    (44.80,-86.05),(43.95,-86.50),(43.05,-86.25),(42.10,-86.45),(41.75,-86.80),
]

# The lakes are drawn to hug the US shoreline used in US_OUTLINE, so each one
# fills the notch it belongs in instead of spilling into empty Canada.
GREAT_LAKES = {
    "superior": [(46.76,-92.06),(47.90,-89.66),(47.85,-87.60),(47.35,-85.60),
                 (46.62,-84.50),(46.62,-86.50),(46.52,-87.42),(47.32,-87.92),
                 (46.86,-89.32),(46.82,-90.55)],
    "michigan": [(41.70,-87.45),(42.95,-87.80),(44.50,-87.80),(45.20,-86.98),
                 (45.72,-85.05),(45.05,-85.58),(44.00,-86.42),(42.15,-86.48)],
    "huron":    [(43.02,-82.48),(43.86,-82.56),(44.26,-83.38),(45.56,-84.22),
                 (45.90,-83.30),(45.70,-82.10),(44.90,-81.40),(44.10,-81.75)],
    "erie":     [(41.74,-83.42),(41.52,-82.72),(42.12,-80.12),(42.86,-78.94),
                 (42.60,-79.70),(42.44,-81.40),(42.30,-83.00)],
    "ontario":  [(43.28,-79.05),(43.36,-77.62),(43.96,-76.28),(44.12,-76.52),
                 (43.86,-77.90),(43.66,-79.30)],
}

# ------------------------------------------------------------------ insets
HAWAII = {
    # island -> (centre lat, centre lng, half-width deg lng, half-height deg lat, rotation)
    "Kauai":    (22.06,-159.50,0.28,0.20,-15),
    "Oahu":     (21.47,-157.98,0.30,0.22, 25),
    "Molokai":  (21.13,-157.02,0.30,0.10,  5),
    "Lanai":    (20.82,-156.92,0.13,0.10,  0),
    "Maui":     (20.80,-156.33,0.32,0.20, -20),
    "Hawaii":   (19.60,-155.50,0.55,0.45,  10),
}
HAWAII_BOUNDS = (18.60, 23.10, -160.60, -154.50)   # lat0, lat1, lng0, lng1

PUERTO_RICO = [(18.52,-67.26),(18.49,-66.60),(18.45,-65.95),(18.38,-65.62),
               (18.06,-65.78),(17.95,-66.30),(17.96,-66.95),(18.10,-67.24)]
PR_BOUNDS = (17.80, 18.70, -67.45, -65.45)

# ------------------------------------------------- Triangle-area base shapes
JORDAN_LAKE = [  # dendritic reservoir, coarse
    (35.652,-79.072),(35.672,-79.048),(35.700,-79.040),(35.712,-79.002),
    (35.742,-78.996),(35.758,-79.008),(35.772,-78.998),(35.790,-79.006),
    (35.812,-78.992),(35.828,-79.000),(35.842,-78.986),(35.856,-79.004),
    (35.848,-79.030),(35.826,-79.038),(35.808,-79.030),(35.790,-79.046),
    (35.776,-79.036),(35.762,-79.058),(35.744,-79.052),(35.736,-79.082),
    (35.752,-79.108),(35.742,-79.134),(35.716,-79.132),(35.706,-79.104),
    (35.716,-79.074),(35.698,-79.070),(35.680,-79.086),
]
FALLS_LAKE = [
    (35.938,-78.582),(35.962,-78.606),(35.976,-78.650),(36.006,-78.676),
    (36.030,-78.706),(36.044,-78.744),(36.030,-78.760),(36.010,-78.730),
    (35.986,-78.706),(35.960,-78.676),(35.938,-78.636),(35.924,-78.598),
]
LAKE_CRABTREE_SHAPE = [
    (35.836,-78.818),(35.846,-78.806),(35.848,-78.790),(35.838,-78.782),
    (35.828,-78.792),(35.828,-78.808),
]
ENO_RIVER = [(36.078,-79.090),(36.070,-79.030),(36.076,-78.974),(36.062,-78.930),
             (36.052,-78.888),(36.058,-78.848),(36.040,-78.800),(36.016,-78.760)]
HAW_RIVER = [(35.930,-79.220),(35.880,-79.200),(35.840,-79.164),(35.800,-79.148),
             (35.760,-79.130),(35.730,-79.110)]

ROADS = {
    "I-40":   [(36.048,-79.220),(35.980,-79.140),(35.930,-79.080),(35.905,-79.040),
               (35.888,-78.960),(35.872,-78.880),(35.848,-78.800),(35.820,-78.740),
               (35.792,-78.690),(35.760,-78.620),(35.726,-78.580)],
    "US 15-501": [(35.760,-79.178),(35.800,-79.120),(35.850,-79.080),(35.900,-79.056),
                  (35.938,-78.992),(35.978,-78.934),(36.012,-78.902),(36.060,-78.878)],
    "I-85":   [(36.104,-79.180),(36.076,-79.100),(36.040,-79.020),(36.010,-78.950),
               (36.012,-78.880),(36.040,-78.820),(36.070,-78.760)],
    "NC-54":  [(35.908,-79.088),(35.906,-79.040),(35.898,-78.980),(35.890,-78.910),
               (35.878,-78.840),(35.852,-78.790),(35.820,-78.760),(35.790,-78.700)],
    "I-440":  [(35.828,-78.700),(35.836,-78.650),(35.818,-78.600),(35.780,-78.588),
               (35.750,-78.630),(35.760,-78.688),(35.800,-78.712),(35.828,-78.700)],
}

TOWNS = {
    "Chapel Hill": (35.913,-79.056, 2.6),
    "Carrboro":    (35.916,-79.090, 1.5),
    "Durham":      (35.994,-78.899, 3.4),
    "Raleigh":     (35.780,-78.639, 3.6),
    "Cary":        (35.791,-78.781, 2.2),
    "Morrisville": (35.823,-78.826, 1.5),
    "Hillsborough":(36.075,-79.100, 1.4),
    "Pittsboro":   (35.720,-79.177, 1.3),
    "RTP":         (35.888,-78.862, 2.0),
}

# Rough woodland patches for the local map (lat, lng, r in km-ish degrees)
WOODS = [
    (36.020,-79.066,0.032),   # Brumley
    (35.884,-79.018,0.026),   # Mason Farm / Botanical Garden
    (35.762,-79.052,0.030),   # Jordan Lake game land
    (36.030,-78.876,0.018),   # Beaver Marsh
    (35.976,-78.974,0.020),   # Sandy Creek / Duke Forest
    (36.022,-79.120,0.020),   # Blackwood
    (35.838,-78.800,0.018),   # Lake Crabtree woods
    (35.800,-79.092,0.022),   # Fearrington
]

TRIANGLE_BOUNDS = (35.640, 36.120, -79.240, -78.560)   # lat0, lat1, lng0, lng1

# -*- coding: utf-8 -*-
"""Project bird_web locations into two cartoon-map coordinate spaces and
generate the base artwork. Deterministic: re-running gives identical output."""
import json, math, os, sys, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
OUT_MAP = os.path.join(ROOT, "src/assets/map")
os.makedirs(OUT_MAP, exist_ok=True)

# ----------------------------------------------------------------- helpers
class Rng:
    """Tiny deterministic LCG so the 'hand-drawn' wobble never changes."""
    def __init__(self, seed): self.s = seed & 0xFFFFFFFF
    def next(self):
        self.s = (1103515245 * self.s + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF
    def sym(self, amp): return (self.next() * 2 - 1) * amp

def jitter(pts, amp, seed):
    r = Rng(seed)
    return [(x + r.sym(amp), y + r.sym(amp)) for x, y in pts]

def catmull(pts, closed=True, tension=1.0, nd=2):
    """Catmull-Rom through the points -> cubic bezier path data."""
    n = len(pts)
    if n < 3: 
        return "M " + " L ".join("%.*f %.*f" % (nd, p[0], nd, p[1]) for p in pts)
    def P(i):
        if closed: return pts[i % n]
        return pts[max(0, min(n - 1, i))]
    d = ["M %.*f %.*f" % (nd, pts[0][0], nd, pts[0][1])]
    last = n if closed else n - 1
    for i in range(last):
        p0, p1, p2, p3 = P(i - 1), P(i), P(i + 1), P(i + 2)
        c1 = (p1[0] + (p2[0] - p0[0]) / 6 * tension, p1[1] + (p2[1] - p0[1]) / 6 * tension)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6 * tension, p2[1] - (p3[1] - p1[1]) / 6 * tension)
        d.append("C %.*f %.*f %.*f %.*f %.*f %.*f" % (nd, c1[0], nd, c1[1], nd, c2[0],
                                                      nd, c2[1], nd, p2[0], nd, p2[1]))
    if closed: d.append("Z")
    return " ".join(d)

# ------------------------------------------------------------- projections
def albers(lat, lng, lat1=29.5, lat2=45.5, lat0=37.5, lng0=-96.0):
    """Albers equal-area conic, the standard projection for US maps."""
    p1, p2, p0 = map(math.radians, (lat1, lat2, lat0))
    n = (math.sin(p1) + math.sin(p2)) / 2
    C = math.cos(p1) ** 2 + 2 * n * math.sin(p1)
    rho0 = math.sqrt(C - 2 * n * math.sin(p0)) / n
    p, l = math.radians(lat), math.radians(lng - lng0)
    rho = math.sqrt(C - 2 * n * math.sin(p)) / n
    th = n * l
    return (rho * math.sin(th), rho0 - rho * math.cos(th))   # y already up-positive

class Fit:
    """Uniform scale + translate from projected units into viewBox px (y down)."""
    def __init__(self, pts, x0, y0, w, h):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        sx = w / (max(xs) - min(xs)); sy = h / (max(ys) - min(ys))
        self.s = min(sx, sy)
        self.bx, self.by = min(xs), max(ys)     # top-left of data box
        self.ox = x0 + (w - (max(xs) - min(xs)) * self.s) / 2
        self.oy = y0 + (h - (max(ys) - min(ys)) * self.s) / 2
        self.extent = ((max(xs) - min(xs)) * self.s, (max(ys) - min(ys)) * self.s)
    def __call__(self, p):
        return (self.ox + (p[0] - self.bx) * self.s, self.oy + (self.by - p[1]) * self.s)

def equirect(lat, lng, lat_ref):
    return (lng * math.cos(math.radians(lat_ref)), lat)

# --------------------------------------------------------------- US layout
US_W = 1000.0
_out = [albers(a, b) for a, b in US_OUTLINE]
_xs = [p[0] for p in _out]; _ys = [p[1] for p in _out]
_aspect = (max(_xs) - min(_xs)) / (max(_ys) - min(_ys))
MARGIN_X, TOP = 26.0, 22.0
land_w = US_W - 2 * MARGIN_X
land_h = land_w / _aspect
US_H = round((TOP + land_h + 104) / 10) * 10.0      # room for the inset boxes
fit_us = Fit(_out, MARGIN_X, TOP, land_w, land_h)
pus = lambda lat, lng: fit_us(albers(lat, lng))

# inset boxes, in px  (bottom-left = Hawaii, bottom-centre-right = Puerto Rico)
HI_BOX = (36.0, US_H - 214.0, 196.0, 150.0)
PR_BOX = (612.0, US_H - 132.0, 176.0, 98.0)

def box_fit(bounds, box, pad=12.0):
    lat0, lat1, lng0, lng1 = bounds
    x, y, w, h = box
    pts = [equirect(lat, lng, (lat0 + lat1) / 2)
           for lat, lng in ((lat0, lng0), (lat0, lng1), (lat1, lng0), (lat1, lng1))]
    f = Fit(pts, x + pad, y + pad, w - 2 * pad, h - 2 * pad)
    ref = (lat0 + lat1) / 2
    return lambda lat, lng: f(equirect(lat, lng, ref))

phi = box_fit(HAWAII_BOUNDS, HI_BOX)
ppr = box_fit(PR_BOUNDS, PR_BOX)

# --------------------------------------------------------- Triangle layout
TRI_W = 1000.0
lat0, lat1, lng0, lng1 = TRIANGLE_BOUNDS
_ref = (lat0 + lat1) / 2
_tp = [equirect(a, b, _ref) for a, b in ((lat0, lng0), (lat0, lng1), (lat1, lng0), (lat1, lng1))]
_taspect = (max(p[0] for p in _tp) - min(p[0] for p in _tp)) / \
           (max(p[1] for p in _tp) - min(p[1] for p in _tp))
TRI_H = round(TRI_W / _taspect / 10) * 10.0
fit_tri = Fit(_tp, 0, 0, TRI_W, TRI_H)
ptri = lambda lat, lng: fit_tri(equirect(lat, lng, _ref))

# ------------------------------------------------------------- relaxation
def relax(items, minsep, bounds, keep_in=None, keep_out=(), iters=4000, anchor_pull=0.03):
    """items: [dict(key, x, y (percent), fixed)] -> spread until >= minsep apart."""
    P = {it["key"]: [it["x"], it["y"]] for it in items}
    A = {it["key"]: (it["x"], it["y"]) for it in items}
    F = {it["key"]: it.get("fixed", False) for it in items}
    ks = [it["key"] for it in items]
    x0, y0, x1, y1 = bounds
    for _ in range(iters):
        moved = 0.0
        for i in range(len(ks)):
            for j in range(i + 1, len(ks)):
                a, b = ks[i], ks[j]
                dx, dy = P[b][0] - P[a][0], P[b][1] - P[a][1]
                d = math.hypot(dx, dy)
                if d >= minsep: continue
                if d < 1e-6: dx, dy, d = 0.01 * (i + 1), 0.01 * (j + 1), 0.014
                push = (minsep - d) / 2 * 1.02
                ux, uy = dx / d, dy / d
                for pt, sgn in ((P[a], -1), (P[b], 1)):
                    if F[a if sgn < 0 else b]: continue
                    pt[0] += sgn * ux * push; pt[1] += sgn * uy * push
                moved += push
        for k in ks:
            if F[k]: continue
            P[k][0] += (A[k][0] - P[k][0]) * anchor_pull
            P[k][1] += (A[k][1] - P[k][1]) * anchor_pull
            P[k][0] = max(x0, min(x1, P[k][0])); P[k][1] = max(y0, min(y1, P[k][1]))
            for (bx0, by0, bx1, by1) in keep_out:
                if bx0 < P[k][0] < bx1 and by0 < P[k][1] < by1:
                    # eject through the nearest edge
                    opts = [(P[k][0] - bx0, (bx0 - 0.4, P[k][1])), (bx1 - P[k][0], (bx1 + 0.4, P[k][1])),
                            (P[k][1] - by0, (P[k][0], by0 - 0.4)), (by1 - P[k][1], (P[k][0], by1 + 0.4))]
                    opts.sort(key=lambda t: t[0])
                    P[k][0], P[k][1] = opts[0][1]
        if moved < 1e-4: break
    return {k: (round(P[k][0], 2), round(P[k][1], 2)) for k in ks}

def min_pair(coords):
    ks = list(coords); best = (1e9, None, None)
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            d = math.dist(coords[ks[i]], coords[ks[j]])
            if d < best[0]: best = (d, ks[i], ks[j])
    return best

# ------------------------------------------------------------ project pins
travel_items, travel_meta = [], {}
for slug, (lat, lng, note, inset) in TRAVEL.items():
    if inset == "hawaii":      px, py = phi(lat, lng)
    elif inset == "puerto_rico": px, py = ppr(lat, lng)
    else:
        dlat, dlng = PRE_NUDGE.get(slug, (0.0, 0.0))
        px, py = pus(lat + dlat, lng + dlng)
    travel_items.append({"key": slug, "x": px / US_W * 100, "y": py / US_H * 100,
                         "fixed": inset is not None})
    travel_meta[slug] = (lat, lng, note, inset)

pct_box = lambda b: (b[0] / US_W * 100, b[1] / US_H * 100,
                     (b[0] + b[2]) / US_W * 100, (b[1] + b[3]) / US_H * 100)
travel_xy = relax(travel_items, minsep=2.60, bounds=(3, 3, 97, 96),
                  keep_out=(pct_box(HI_BOX), pct_box(PR_BOX)))

local_items = []
for slug, (lat, lng, note) in LOCAL.items():
    px, py = ptri(lat, lng)
    local_items.append({"key": slug, "x": px / TRI_W * 100, "y": py / TRI_H * 100})
local_xy = relax(local_items, minsep=3.60, bounds=(4, 4, 96, 96), anchor_pull=0.035)

# ------------------------------------------------- write back locations.json
LOC = os.path.join(ROOT, "src/data/locations.json")
locs = json.load(open(LOC, encoding="utf-8"))
assert len(locs) == 37, len(locs)
out = []
for rec in locs:
    slug = rec["slug"]
    new = collections.OrderedDict(rec)          # preserves original key order
    if slug in LOCAL:
        lat, lng, note = LOCAL[slug]
        new["x"], new["y"] = local_xy[slug]
        new["lat"], new["lng"] = lat, lng
        new["mapSpace"] = "triangle"
    else:
        lat, lng, note, inset = travel_meta[slug]
        new["x"], new["y"] = travel_xy[slug]
        new["lat"], new["lng"] = lat, lng
        new["mapSpace"] = "us"
        if inset: new["inset"] = inset
    new["placeNote"] = note
    out.append(new)
json.dump(out, open(LOC, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(LOC, "a", encoding="utf-8").write("\n")

print("US   viewBox %gx%g  min pin gap %.2f%% (%s / %s)" % ((US_W, US_H) + min_pair(travel_xy)))
print("TRI  viewBox %gx%g  min pin gap %.2f%% (%s / %s)" % ((TRI_W, TRI_H) + min_pair(local_xy)))

# ====================================================================== SVG
PALETTE_LIGHT = {
    "paper":"#f3ece0","land":"#e7dcc7","land2":"#ded1b8","edge":"#8d7f68","ink":"#5f5443",
    "water":"#a9c9dc","water-edge":"#7fa8c0","park":"#9cb891","park-edge":"#7d9a74",
    "road":"#c89a6e","road-minor":"#d8b territory","town":"#e0cfae","town-edge":"#b9a482",
    "label":"#584e3c","inset":"#cbbda3",
}
PALETTE_LIGHT["road-minor"] = "#d7b78d"
PALETTE_DARK = {
    "paper":"#20242a","land":"#333a42","land2":"#2c333a","edge":"#8f8henry","ink":"#cfc4ad",
    "water":"#3c5b6d","water-edge":"#54798e","park":"#4a6a51","park-edge":"#5f8567",
    "road":"#9a7248","road-minor":"#7d5e3f","town":"#4a4438","town-edge":"#6d6350",
    "label":"#c3b79f","inset":"#5b5champ",
}
PALETTE_DARK["edge"] = "#8f8674"; PALETTE_DARK["inset"] = "#5b5344"

def css(extra=""):
    dark = ";".join("--map-%s:%s" % (k, v) for k, v in PALETTE_DARK.items())
    # Paper wins on paper. The dark rules above live inside the artwork, where
    # the print block in global.css cannot reach them and would be outranked by
    # .map-root anyway, so printing a place page from a dark desktop laid a
    # near-black rectangle across 38% of the sheet (AUDIT2 §6.2). This puts the
    # light palette back for print, at the same specificity and later in source.
    light = ";".join("--map-%s:%s" % (k, v) for k, v in PALETTE_LIGHT.items())
    return """
  <style>
    .map-root{font-family:'Iowan Old Style','Palatino Linotype',Georgia,serif}
    .map-root[data-map-theme="dark"]{%(dark)s}
    @media (prefers-color-scheme: dark){
      .map-root:not([data-map-theme="light"]){%(dark)s}
    }
    @media print{
      .map-root,.map-root[data-map-theme="dark"],
      .map-root:not([data-map-theme="light"]){%(light)s}
    }
    .land{fill:var(--map-land,%(land)s)}
    .wash{fill:var(--map-land2,%(land2)s);opacity:.5}
    .land-edge{fill:none;stroke:var(--map-edge,%(edge)s);stroke-width:2.4;
      stroke-linejoin:round;stroke-linecap:round;opacity:.85}
    .land-edge.ghost{stroke-width:1.2;opacity:.35}
    .water{fill:var(--map-water,%(water)s);opacity:.9}
    .water-edge{fill:none;stroke:var(--map-water-edge,%(water_edge)s);stroke-width:1.6;
      stroke-linejoin:round;opacity:.7}
    .park{fill:var(--map-park,%(park)s);opacity:.75}
    .road{fill:none;stroke:var(--map-road,%(road)s);stroke-width:5;stroke-linecap:round;
      stroke-linejoin:round;opacity:.85}
    .road.minor{stroke:var(--map-road-minor,%(road_minor)s);stroke-width:3;opacity:.75}
    .road-casing{fill:none;stroke:var(--map-paper,%(paper)s);stroke-width:9;
      stroke-linecap:round;stroke-linejoin:round;opacity:.55}
    .town{fill:var(--map-town,%(town)s);opacity:.85;
      stroke:var(--map-town-edge,%(town_edge)s);stroke-width:1.4}
    .label{fill:var(--map-label,%(label)s);
      font-size:calc(15px * var(--map-label-scale,1));letter-spacing:.06em;
      text-transform:uppercase;
      paint-order:stroke;stroke:var(--map-paper,%(paper)s);
      stroke-width:calc(3px * var(--map-label-scale,1));
      stroke-linejoin:round;stroke-linecap:round}
    .label.sm{font-size:calc(12.5px * var(--map-label-scale,1));letter-spacing:.09em;
      stroke-width:calc(2.6px * var(--map-label-scale,1))}
    .inset-box{fill:none;stroke:var(--map-inset,%(inset)s);stroke-width:2;
      stroke-dasharray:7 6;stroke-linecap:round;opacity:.75;rx:10}
    %(extra)s
  </style>""" % dict(dark=dark, light=light, extra=extra,
                     land=PALETTE_LIGHT["land"], land2=PALETTE_LIGHT["land2"],
                     edge=PALETTE_LIGHT["edge"],
                     water=PALETTE_LIGHT["water"], water_edge=PALETTE_LIGHT["water-edge"],
                     park=PALETTE_LIGHT["park"], road=PALETTE_LIGHT["road"],
                     road_minor=PALETTE_LIGHT["road-minor"], paper=PALETTE_LIGHT["paper"],
                     town=PALETTE_LIGHT["town"], town_edge=PALETTE_LIGHT["town-edge"],
                     label=PALETTE_LIGHT["label"], inset=PALETTE_LIGHT["inset"])

WOBBLE = """
  <filter id="wobble" x="-4%%" y="-4%%" width="108%%" height="108%%">
    <feTurbulence type="fractalNoise" baseFrequency="%(f)s" numOctaves="3" seed="%(s)d" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="%(sc)s" xChannelSelector="R" yChannelSelector="G"/>
  </filter>"""

def blob(cx, cy, rx, ry, rot, seed, n=13):
    r = Rng(seed); pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rr = 1 + r.sym(0.16)
        x, y = math.cos(a) * rx * rr, math.sin(a) * ry * rr
        t = math.radians(rot)
        pts.append((cx + x * math.cos(t) - y * math.sin(t),
                    cy + x * math.sin(t) + y * math.cos(t)))
    return catmull(pts, True, 0.95)

# ------------------------------------------------------------------ us.svg
def build_us():
    L = []
    L.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" '
             'class="map-root" role="img" aria-labelledby="us-title" '
             'preserveAspectRatio="xMidYMid meet">' % (US_W, US_H))
    L.append('  <title id="us-title">United States — travel birding map</title>')
    L.append('  <defs>' + WOBBLE % dict(f="0.012 0.018", s=7, sc="5") + '\n  </defs>')
    L.append(css())
    land = jitter([pus(a, b) for a, b in US_OUTLINE], 2.2, 11)
    mitten = jitter([pus(a, b) for a, b in US_MITTEN], 1.8, 23)
    dl, dm = catmull(land), catmull(mitten)
    L.append('  <g filter="url(#wobble)">')
    L.append('    <g transform="translate(5.5,6.5)">')
    L.append('      <path class="wash" d="%s"/>'
             % catmull(jitter([pus(a, b) for a, b in US_OUTLINE], 3.0, 61)))
    L.append('      <path class="wash" d="%s"/>'
             % catmull(jitter([pus(a, b) for a, b in US_MITTEN], 2.4, 67)))
    L.append('    </g>')
    L.append('    <path class="land" d="%s"/>' % dl)
    L.append('    <path class="land" d="%s"/>' % dm)
    for name, poly in GREAT_LAKES.items():
        L.append('    <path class="water" d="%s"/>'
                 % catmull(jitter([pus(a, b) for a, b in poly], 1.6, 31 + len(name))))
    L.append('    <path class="land-edge" d="%s"/>' % dl)
    L.append('    <path class="land-edge" d="%s"/>' % dm)
    L.append('    <path class="land-edge ghost" d="%s"/>'
             % catmull(jitter([pus(a, b) for a, b in US_OUTLINE], 3.4, 97)))
    L.append('  </g>')
    # Hawaii inset
    hx, hy, hw, hh = HI_BOX
    L.append('  <g class="inset" data-inset="hawaii">')
    L.append('    <rect class="inset-box" x="%g" y="%g" width="%g" height="%g" rx="10"/>' % HI_BOX)
    L.append('    <g filter="url(#wobble)">')
    for i, (nm, (la, ln, rx, ry, rot)) in enumerate(HAWAII.items()):
        c = phi(la, ln); e = phi(la + ry, ln + rx)
        d = blob(c[0], c[1], abs(e[0] - c[0]), abs(e[1] - c[1]), rot, 101 + i * 7)
        L.append('      <path class="land" d="%s"/><path class="land-edge" d="%s"/>' % (d, d))
    L.append('    </g>')
    L.append('    <text class="label sm" x="%g" y="%g">Hawaiʻi</text>' % (hx + 10, hy + hh - 9))
    L.append('  </g>')
    # Puerto Rico inset
    px_, py_, pw, ph = PR_BOX
    L.append('  <g class="inset" data-inset="puerto_rico">')
    L.append('    <rect class="inset-box" x="%g" y="%g" width="%g" height="%g" rx="10"/>' % PR_BOX)
    dpr = catmull(jitter([ppr(a, b) for a, b in PUERTO_RICO], 1.4, 55))
    L.append('    <g filter="url(#wobble)"><path class="land" d="%s"/>'
             '<path class="land-edge" d="%s"/></g>' % (dpr, dpr))
    L.append('    <text class="label sm" x="%g" y="%g">Puerto Rico</text>' % (px_ + 10, py_ + ph - 9))
    L.append('  </g>')
    L.append('</svg>')
    open(os.path.join(OUT_MAP, "us.svg"), "w", encoding="utf-8").write("\n".join(L) + "\n")

# ------------------------------------------------------------ triangle.svg
def build_triangle():
    L = []
    L.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %g %g" '
             'class="map-root" role="img" aria-labelledby="tri-title" '
             'preserveAspectRatio="xMidYMid meet">' % (TRI_W, TRI_H))
    L.append('  <title id="tri-title">The Research Triangle — local birding map</title>')
    L.append('  <defs>' + WOBBLE % dict(f="0.02 0.026", s=3, sc="4") + '\n  </defs>')
    L.append(css())
    L.append('  <rect class="land" x="0" y="0" width="%g" height="%g"/>' % (TRI_W, TRI_H))
    # woodland patches
    L.append('  <g filter="url(#wobble)">')
    for i, (la, ln, rr) in enumerate(WOODS):
        c = ptri(la, ln); e = ptri(la + rr, ln + rr / math.cos(math.radians(la)))
        L.append('    <path class="park" d="%s"/>'
                 % blob(c[0], c[1], abs(e[0] - c[0]) * 1.15, abs(e[1] - c[1]) * 1.15,
                        i * 37, 201 + i * 11, 11))
    L.append('  </g>')
    # water
    L.append('  <g filter="url(#wobble)">')
    for nm, poly, seed in (("jordan", JORDAN_LAKE, 301), ("falls", FALLS_LAKE, 311),
                           ("crabtree", LAKE_CRABTREE_SHAPE, 321)):
        d = catmull(jitter([ptri(a, b) for a, b in poly], 2.0, seed), True, 0.9)
        L.append('    <path class="water" data-feature="%s" d="%s"/>' % (nm, d))
        L.append('    <path class="water-edge" data-feature="%s" d="%s"/>' % (nm, d))
    for nm, line, seed in (("eno", ENO_RIVER, 331), ("haw", HAW_RIVER, 341)):
        d = catmull(jitter([ptri(a, b) for a, b in line], 1.6, seed), False, 0.9)
        L.append('    <path class="water-edge" data-feature="%s" d="%s" '
                 'style="stroke-width:3.2;opacity:.8"/>' % (nm, d))
    L.append('  </g>')
    # towns
    L.append('  <g filter="url(#wobble)">')
    for i, (nm, (la, ln, km)) in enumerate(TOWNS.items()):
        c = ptri(la, ln)
        deg = km / 111.0
        e = ptri(la + deg, ln + deg / math.cos(math.radians(la)))
        L.append('    <path class="town" data-town="%s" d="%s"/>'
                 % (nm, blob(c[0], c[1], abs(e[0] - c[0]), abs(e[1] - c[1]), i * 41,
                             401 + i * 13, 11)))
    L.append('  </g>')
    # roads
    for nm, line in ROADS.items():
        closed = nm == "I-440"
        d = catmull(jitter([ptri(a, b) for a, b in line], 1.8, 501 + sum(map(ord, nm))),
                    closed, 0.95)
        cls = "road" if nm in ("I-40", "I-85", "US 15-501") else "road minor"
        L.append('  <g data-road="%s"><path class="road-casing" d="%s"/>'
                 '<path class="%s" d="%s"/></g>' % (nm, d, cls, d))
    # labels
    def lab(nm, la, ln, dx=0, dy=0, cls="label"):
        c = ptri(la, ln)
        return '  <text class="%s" x="%.1f" y="%.1f" text-anchor="middle">%s</text>' \
               % (cls, c[0] + dx, c[1] + dy, nm)
    L.append(lab("Chapel Hill", 35.913, -79.056, -96, 44))
    L.append(lab("Durham", 35.994, -78.899, 46, -40))
    L.append(lab("Raleigh", 35.780, -78.639, 0, -48))
    L.append(lab("Cary", 35.791, -78.781, 0, -30, "label sm"))
    L.append(lab("Carrboro", 35.916, -79.096, -34, -18, "label sm"))
    L.append(lab("Hillsborough", 36.075, -79.100, 0, -22, "label sm"))
    L.append(lab("Pittsboro", 35.720, -79.177, 0, -20, "label sm"))
    L.append(lab("RTP", 35.888, -78.862, 0, 26, "label sm"))
    L.append(lab("Jordan Lake", 35.700, -79.030, 0, 0, "label sm"))
    L.append(lab("Falls Lake", 36.010, -78.660, 26, 0, "label sm"))
    L.append(lab("I-40", 35.848, -78.800, 0, 22, "label sm"))
    L.append(lab("I-85", 36.040, -78.820, 0, -14, "label sm"))
    L.append(lab("15-501", 35.850, -79.080, -26, 0, "label sm"))
    L.append('</svg>')
    open(os.path.join(OUT_MAP, "triangle.svg"), "w", encoding="utf-8").write("\n".join(L) + "\n")

build_us(); build_triangle()

# ------------------------------------------------------------ map-meta.json
meta = collections.OrderedDict()
meta["_readme"] = [
  "Base-map geometry for the 'where' view. Written by hand (see scripts note below);",
  "the renderer should treat this file as the single source of truth for viewBoxes.",
  "",
  "locations.json gives every location: x, y, lat, lng, mapSpace and (sometimes) inset.",
  "  mapSpace  'us' for scope=travel, 'triangle' for scope=local.",
  "  x, y      PERCENTAGES 0-100 of that space's viewBox, y measured downwards.",
  "            px = x / 100 * spaces[mapSpace].viewBox.width",
  "            py = y / 100 * spaces[mapSpace].viewBox.height",
  "  lat, lng  the real place, WGS84 degrees, kept so the projection can be redone.",
  "  inset     'hawaii' | 'puerto_rico' — pin sits inside that inset box, NOT at its",
  "            true position. Draw the inset frame from spaces.us.insets[].rect.",
  "",
  "Pins are nudged apart for legibility: no two pins in the same space are closer",
  "than minPinGapPct. Use lat/lng, never x/y, for anything that must be accurate.",
  "",
  "spaces.triangle.anchorOnUs is where the whole Triangle sits as one point on the",
  "US map (percent of the US viewBox). At country scale all 18 local pins land",
  "there; a view that draws both spaces together can spread them around it.",
  "",
  "Theming: both SVGs carry class='map-root' and read CSS custom properties",
  "(--map-land, --map-water, --map-park, --map-road, --map-ink, --map-label, ...).",
  "Inline the SVG to let a site-level theme toggle override them; set",
  "data-map-theme='light'|'dark' on the <svg> to pin a theme. Standalone (as <img>)",
  "they follow prefers-color-scheme on their own.",
]
meta["version"] = 1
meta["units"] = {"x": "percent of viewBox width", "y": "percent of viewBox height (down)"}
meta["spaces"] = {
  "us": {
    "id": "us",
    "label": "United States",
    "scope": "travel",
    "artwork": "src/assets/map/us.svg",
    "viewBox": {"x": 0, "y": 0, "width": US_W, "height": US_H},
    "minPinGapPct": 2.60,
    "projection": {
      "type": "albers-equal-area-conic",
      "parallels": [29.5, 45.5], "origin": {"lat": 37.5, "lng": -96.0},
      "note": "Projected, then uniformly fitted to the land rect below, then pins were "
              "relaxed apart for legibility.",
      "landRect": {"x": MARGIN_X, "y": TOP,
                   "width": round(fit_us.extent[0], 2), "height": round(fit_us.extent[1], 2)},
    },
    "insets": [
      {"id": "hawaii", "label": "Hawaiʻi",
       "rect": {"x": HI_BOX[0], "y": HI_BOX[1], "width": HI_BOX[2], "height": HI_BOX[3]},
       "rectPct": {"x": round(HI_BOX[0] / US_W * 100, 2), "y": round(HI_BOX[1] / US_H * 100, 2),
                   "width": round(HI_BOX[2] / US_W * 100, 2),
                   "height": round(HI_BOX[3] / US_H * 100, 2)},
       "bounds": {"latMin": HAWAII_BOUNDS[0], "latMax": HAWAII_BOUNDS[1],
                  "lngMin": HAWAII_BOUNDS[2], "lngMax": HAWAII_BOUNDS[3]},
       "projection": "equirectangular, cos(lat) corrected, padded 12px"},
      {"id": "puerto_rico", "label": "Puerto Rico",
       "rect": {"x": PR_BOX[0], "y": PR_BOX[1], "width": PR_BOX[2], "height": PR_BOX[3]},
       "rectPct": {"x": round(PR_BOX[0] / US_W * 100, 2), "y": round(PR_BOX[1] / US_H * 100, 2),
                   "width": round(PR_BOX[2] / US_W * 100, 2),
                   "height": round(PR_BOX[3] / US_H * 100, 2)},
       "bounds": {"latMin": PR_BOUNDS[0], "latMax": PR_BOUNDS[1],
                  "lngMin": PR_BOUNDS[2], "lngMax": PR_BOUNDS[3]},
       "projection": "equirectangular, cos(lat) corrected, padded 12px"},
    ],
  },
  "triangle": {
    "id": "triangle",
    "label": "The Research Triangle, North Carolina",
    "scope": "local",
    "artwork": "src/assets/map/triangle.svg",
    "viewBox": {"x": 0, "y": 0, "width": TRI_W, "height": TRI_H},
    "minPinGapPct": 3.60,
    "projection": {
      "type": "equirectangular",
      "lngScale": "cos(35.88°)",
      "bounds": {"latMin": lat0, "latMax": lat1, "lngMin": lng0, "lngMax": lng1},
      "note": "Whole viewBox is the bounds rect; pins then relaxed apart for legibility.",
    },
    # Where this whole space sits as a single point on the US map. Every local
    # pin collapses to (roughly) here at country scale, so a renderer that has
    # to show both spaces at once can hang the Triangle off this anchor.
    "anchorOnUs": {
      "lat": round((lat0 + lat1) / 2, 4), "lng": round((lng0 + lng1) / 2, 4),
      "x": round(pus((lat0 + lat1) / 2, (lng0 + lng1) / 2)[0] / US_W * 100, 2),
      "y": round(pus((lat0 + lat1) / 2, (lng0 + lng1) / 2)[1] / US_H * 100, 2),
      "note": "Percent of the US viewBox, same units as locations.json x/y. Not relaxed.",
    },
    "insets": [],
    "features": ["Jordan Lake", "Falls Lake", "Lake Crabtree", "Eno River", "Haw River",
                 "I-40", "I-85", "US 15-501", "NC-54", "I-440",
                 "Chapel Hill", "Carrboro", "Durham", "Raleigh", "Cary", "Morrisville",
                 "Hillsborough", "Pittsboro", "RTP"],
  },
}
meta["artwork"] = {
  "provenance": "Both SVGs are original work, drawn for this project. No third-party "
                "artwork was downloaded or traced. The coastlines, lakes, roads and town "
                "blobs are coarse lat/lng point lists typed by hand from general "
                "geographic knowledge, run through the same projection as the pins, then "
                "smoothed with Catmull-Rom curves and given a deterministic wobble "
                "(seeded jitter + an SVG feTurbulence displacement filter) for the "
                "hand-drawn look.",
  "licence": "Original, same licence as the rest of this repository.",
  "sources": [],
  "accuracy": "Deliberately loose. Good enough to recognise the shape of the country and "
              "the Triangle; not survey data.",
  "palette": {"light": PALETTE_LIGHT, "dark": PALETTE_DARK},
  "cssVariables": ["--map-paper", "--map-land", "--map-land2", "--map-edge", "--map-ink",
                   "--map-water", "--map-water-edge", "--map-park", "--map-park-edge",
                   "--map-road", "--map-road-minor", "--map-town", "--map-town-edge",
                   "--map-label", "--map-inset"],
}
meta["generator"] = {
  "note": "python3 src/assets/map/_build-map.py — re-projects the lat/lng tables it "
          "carries, rewrites x/y in locations.json and redraws both SVGs. Deterministic: "
          "same input, byte-identical output.",
  "counts": {"travel": len(TRAVEL), "local": len(LOCAL), "total": len(locs)},
}
json.dump(meta, open(os.path.join(ROOT, "src/data/map-meta.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
open(os.path.join(ROOT, "src/data/map-meta.json"), "a", encoding="utf-8").write("\n")
print("wrote us.svg, triangle.svg, map-meta.json, locations.json")
