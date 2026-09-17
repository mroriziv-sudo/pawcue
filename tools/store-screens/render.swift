// Render an HTML file to a PNG of an exact pixel size (WebKit, macOS).  swift render.swift in.html out.png W H
import WebKit
import AppKit
let a = CommandLine.arguments
let html = a[1], out = a[2], w = Int(a[3])!, h = Int(a[4])!
let app = NSApplication.shared
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h))
class D: NSObject, WKNavigationDelegate {
  func webView(_ v: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
      let c = WKSnapshotConfiguration(); c.rect = v.bounds; c.snapshotWidth = NSNumber(value: w)
      v.takeSnapshot(with: c) { img, _ in
        guard let img = img else { exit(1) }
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 32)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        img.draw(in: NSRect(x: 0, y: 0, width: w, height: h))
        NSGraphicsContext.restoreGraphicsState()
        try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
        exit(0)
      }
    }
  }
}
let d = D(); wv.navigationDelegate = d
let win = NSWindow(contentRect: wv.frame, styleMask: [.borderless], backing: .buffered, defer: false)
win.contentView = wv
wv.loadFileURL(URL(fileURLWithPath: html), allowingReadAccessTo: URL(fileURLWithPath: html).deletingLastPathComponent())
app.run()
