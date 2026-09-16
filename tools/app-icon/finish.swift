// Resample a PNG to an exact square size, optionally flattening it onto a solid background (App Store icons
// must carry no alpha channel).   swift tools/app-icon/finish.swift in.png out.png 1024 [#RRGGBB]
import AppKit
let a = CommandLine.arguments
let src = NSImage(contentsOfFile: a[1])!, out = a[2], px = Int(a[3])!
let bg: NSColor? = a.count > 4 ? {
  let h = a[4].dropFirst(); let v = UInt32(h, radix: 16)!
  return NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
}() : nil
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
  samplesPerPixel: bg == nil ? 4 : 3, hasAlpha: bg == nil, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 32)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
ctx.imageInterpolation = .high
if let bg = bg { bg.setFill(); NSRect(x: 0, y: 0, width: px, height: px).fill() }
src.draw(in: NSRect(x: 0, y: 0, width: px, height: px), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
