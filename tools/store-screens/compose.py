"""
Compose App Store screenshot frames: a caption in the app's own type on Warm Ivory, the real screenshot below.

  python3 tools/store-screens/compose.py <shots-dir> <out-dir>

<shots-dir>/{en,he}/NN-name.png are raw 1320x2868 simulator screenshots (iPhone 17 Pro Max, the 6.9" size App
Store Connect requires). Captions come from docs/release/app-store-launch-pack.md §5. Output: <out-dir>/{en,he}/
NN-name.png at 1320x2868, ready to upload. Rendering goes through tools/store-screens/render.swift (WebKit).
"""
import base64, os, subprocess, sys

SHOTS, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
CAPTIONS = {
    "en": {
        "01-clicker": "A free dog clicker. Really free.",
        "02-session": "Lessons that tell you exactly what to do",
        "03-today": "A daily plan built for your dog",
        "04-help": "Stuck? Every lesson has “Not working?”",
        "05-progress": "See your progress add up",
        "06-train": "Unlock every lesson with Premium",
    },
    "he": {
        "01-clicker": "קליקר לכלבים. בחינם, באמת.",
        "02-session": "שיעורים שאומרים לכם בדיוק מה לעשות",
        "03-today": "תוכנית יומית שנבנתה לכלב שלכם",
        "04-help": "נתקעתם? בכל שיעור יש „לא עובד?“",
        "05-progress": "ההתקדמות שלכם מצטברת",
        "06-train": "פתחו את כל השיעורים עם פרימיום",
    },
}
W, H = 1320, 2868

def page(caption, img_path, rtl):
    uri = "data:image/png;base64," + base64.b64encode(open(img_path, "rb").read()).decode()
    return f"""<!doctype html><html lang="{'he' if rtl else 'en'}" dir="{'rtl' if rtl else 'ltr'}"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#FAF8F4}}
body{{font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;color:#1F2523}}
.cap{{position:absolute;left:96px;right:96px;top:150px;font-size:104px;line-height:1.12;font-weight:700;letter-spacing:-1.5px;text-align:{'right' if rtl else 'left'}}}
.shot{{position:absolute;left:112px;right:112px;top:560px;border-radius:120px;overflow:hidden;box-shadow:0 30px 80px rgba(31,37,35,.18);border:6px solid #1F2523}}
.shot img{{display:block;width:100%;height:auto}}
</style></head><body><div class="cap">{caption}</div><div class="shot"><img src="{uri}"></div></body></html>"""

for lang in ("en", "he"):
    os.makedirs(os.path.join(OUT, lang), exist_ok=True)
    for name, caption in CAPTIONS[lang].items():
        src = os.path.join(SHOTS, lang, name + ".png")
        if not os.path.exists(src):
            print("missing", src); continue
        html = os.path.join(OUT, lang, name + ".html")
        open(html, "w").write(page(caption, src, lang == "he"))
        dst = os.path.join(OUT, lang, name + ".png")
        subprocess.run(["swift", os.path.join(HERE, "render.swift"), html, dst, str(W), str(H)], check=True, capture_output=True)
        os.remove(html)
        print("wrote", dst)
