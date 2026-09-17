"""
Compose App Store screenshot frames from raw simulator captures.

  python3 tools/store-screens/compose.py <shots-dir> <out-dir>

<shots-dir>/{en,he}/NN-name.png: raw 1320x2868 captures (iPhone 17 Pro Max, the 6.9" size App Store Connect
requires). Output: <out-dir>/{en,he}/NN-name.png at 1320x2868. Each frame is one message: a headline, one line
of proof, the real screen, and the dog — drawn from the app's own geometry (dog.mjs) in a pose that matches
the message. The first and last frames sit on Deep Evergreen so the set bookends; the rest on Warm Ivory.
Rendering: tools/store-screens/render.swift (WebKit).
"""
import base64, os, subprocess, sys

SHOTS, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
W, H = 1320, 2868
IVORY, EVERGREEN, INK, INK2, IVORY_TEXT2 = "#FAF8F4", "#23473C", "#1F2523", "#5C605E", "rgba(250,248,244,.78)"

# name: (headline, proof line, dog pose, expression, props, dark background?)
FRAMES = {
    "01-clicker": {
        "en": ("A free dog clicker.\nReally free.", "No account, no sign-up. It works the moment you open the app."),
        "he": ("קליקר לכלבים.\nבחינם, באמת.", "בלי חשבון, בלי הרשמה. עובד ברגע שפותחים את האפליקציה."),
        "dog": ("sit", "attentive", ""), "dark": True,
    },
    "02-session": {
        "en": ("Lessons that tell you\nexactly what to do", "When to click, when to treat, how many times."),
        "he": ("שיעורים שאומרים לכם\nבדיוק מה לעשות", "מתי ללחוץ, מתי לתגמל, וכמה פעמים."),
        "dog": ("sit", "happy", "treat"), "dark": False,
    },
    "03-today": {
        "en": ("A daily plan\nbuilt for your dog", "A few minutes a day, in the order that works."),
        "he": ("תוכנית יומית\nשנבנתה לכלב שלכם", "כמה דקות ביום, בסדר שעובד."),
        "dog": ("stand", "attentive", "leash"), "dark": False,
    },
    "04-help": {
        "en": ("Stuck?\nEvery lesson has “Not working?”", "The common ways training goes sideways, with a fix for each."),
        "he": ("נתקעתם?\nבכל שיעור יש „לא עובד?“", "הדרכים הנפוצות שבהן אימון משתבש, ותיקון לכל אחת."),
        "dog": ("bust", "puzzled", ""), "dark": False,
    },
    "05-progress": {
        "en": ("See your progress\nadd up", "Every session and every lesson learned, kept."),
        "he": ("ההתקדמות שלכם\nמצטברת", "כל אימון וכל שיעור שנלמד, נשמרים."),
        "dog": ("sit", "happy", ""), "dark": False,
    },
    "06-train": {
        "en": ("Unlock every lesson\nwith Premium", "One subscription. Cancel whenever you like."),
        "he": ("פתחו את כל השיעורים\nעם פרימיום", "מנוי אחד. ביטול מתי שרוצים."),
        "dog": ("run", "happy", ""), "dark": True,
    },
}

def dog_svg(pose, expr, props):
    out = subprocess.run(["node", "--experimental-strip-types", os.path.join(HERE, "dog.mjs"), pose, expr, props],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return out

def page(name, spec, lang, img_path):
    rtl = lang == "he"
    headline, proof = spec[lang]
    dark = spec["dark"]
    bg = EVERGREEN if dark else IVORY
    fg = IVORY if dark else INK
    fg2 = IVORY_TEXT2 if dark else INK2
    uri = "data:image/png;base64," + base64.b64encode(open(img_path, "rb").read()).decode()
    svg = dog_svg(*spec["dog"])
    pose = spec["dog"][0]
    # The dog sits in the lower corner opposite the reading edge, overlapping the device; a bust peeks smaller.
    # Alternate sides so the set has rhythm and the dog never hides the same part of the screen twice.
    flip = int(name[:2]) % 2 == 0
    dog_w = 760 if pose != "bust" else 540
    dog_bottom = {"bust": "40", "sit": "-30", "run": "10", "stand": "10"}.get(pose, "0")
    side = ("right" if flip else "left") if not rtl else ("left" if flip else "right")
    shot_side = "left" if side == "right" else "right"
    headline_html = headline.replace("\n", "<br>")
    return f"""<!doctype html><html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:{bg}}}
body{{font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;color:{fg}}}
.cap{{position:absolute;left:100px;right:100px;top:170px;font-size:112px;line-height:1.08;font-weight:800;letter-spacing:-2.5px;text-align:{'right' if rtl else 'left'}}}
.proof{{position:absolute;left:100px;right:100px;top:560px;font-size:46px;line-height:1.3;font-weight:500;color:{fg2};text-align:{'right' if rtl else 'left'}}}
.shot{{position:absolute;{shot_side}:70px;width:1000px;top:800px;border-radius:110px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,{'.35' if dark else '.16'});border:8px solid {'#183129' if dark else INK}}}
.shot img{{display:block;width:100%;height:auto}}
.dog{{position:absolute;{side}:{'10' if pose != 'bust' else '50'}px;bottom:{dog_bottom}px;width:{dog_w}px;filter:drop-shadow(0 30px 40px rgba(0,0,0,{'.35' if dark else '.18'}))}}
.dog svg{{width:100%;height:auto;display:block;{'transform:scaleX(-1);' if side == 'right' else ''}}}
</style></head><body>
<div class="cap">{headline_html}</div>
<div class="proof">{proof}</div>
<div class="shot"><img src="{uri}"></div>
<div class="dog">{svg}</div>
</body></html>"""

for lang in ("en", "he"):
    os.makedirs(os.path.join(OUT, lang), exist_ok=True)
    for name, spec in FRAMES.items():
        src = os.path.join(SHOTS, lang, name + ".png")
        if not os.path.exists(src):
            print("missing", src); continue
        html = os.path.join(OUT, lang, name + ".html")
        open(html, "w").write(page(name, spec, lang, src))
        dst = os.path.join(OUT, lang, name + ".png")
        subprocess.run(["swift", os.path.join(HERE, "render.swift"), html, dst, str(W), str(H)], check=True, capture_output=True)
        os.remove(html)
        print("wrote", dst)
