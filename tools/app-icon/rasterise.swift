// Rasterise an SVG to a PNG of an exact pixel size with WebKit (macOS only).
//   swift tools/app-icon/rasterise.swift in.svg out.png 1024
import WebKit
import AppKit
let a = CommandLine.arguments
let svgPath = a[1], out = a[2], px = Int(a[3])!
let app = NSApplication.shared
let cfg = WKWebViewConfiguration()
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: px, height: px), configuration: cfg)
class D: NSObject, WKNavigationDelegate {
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      let c = WKSnapshotConfiguration(); c.rect = w.bounds; c.snapshotWidth = NSNumber(value: px)
      w.takeSnapshot(with: c) { img, err in
        guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { print("snapshot failed", err ?? ""); exit(1) }
        try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
        exit(0)
      }
    }
  }
}
let d = D(); wv.navigationDelegate = d
let win = NSWindow(contentRect: wv.frame, styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = wv
let svg = try! String(contentsOfFile: svgPath, encoding: .utf8)
let html = "<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>\(svg)</body></html>"
wv.setValue(false, forKey: "drawsBackground")
wv.loadHTMLString(html, baseURL: nil)
app.run()
