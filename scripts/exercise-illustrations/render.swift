// Turns the frames `collect.py` gathered into the published set: one colour on a transparent 360 × 360 canvas, the poses of a
// movement cropped to one shared frame, and a catalogue that carries each image's source, author, licence and changes.
//
//     swift render.swift            (run from this folder, after collect.py)
//
// Why one shared crop: the app alternates a movement's poses, and two frames cropped each to its own drawing would move the
// figure around the screen between them.
//
// Why one colour: the three sources draw black on white, white on transparent, and grey on white. As an alpha mask the app can
// tint every one of them to the theme, and they read as one set. A frame that is a photograph or in colour is left out, with its
// movement — it cannot become line art.
//
// CoreGraphics only: no image library to install.
import AppKit
import Foundation

let here = FileManager.default.currentDirectoryPath
let work = here + "/work"
let out = here + "/../../public/exercise-illustrations"
let side = 360, canvas = 1024

struct Source: Decodable {
    let slug, name, primary, source, sourceUrl, author, license, licenseUrl: String
    let equipment: [String]
    let raw: [String]
}

func load(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

/// The drawing as ink in 0…1 on a `canvas` square, or nil for a photograph.
///
/// **Every pose of a movement is drawn at one scale, standing on one line.** Everkinetic trims each pose to its own drawing, so
/// the start of a squat is a 1018 × 491 file and the end a 1015 × 856 one; fitted to the canvas one by one, the figure grew and
/// shrank between frames (seen 2026-09-15). The scale is the movement's — `scale` — and each pose sits bottom-centre, which is
/// where the feet, the bench or the floor are.
func ink(_ image: CGImage, scale: Double) -> [Float]? {
    var px = [UInt8](repeating: 0, count: canvas * canvas * 4)
    let ctx = CGContext(data: &px, width: canvas, height: canvas, bitsPerComponent: 8, bytesPerRow: canvas * 4,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let w = Double(image.width) * scale, h = Double(image.height) * scale
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: (Double(canvas) - w) / 2, y: 0, width: w, height: h))

    // Judged inside the drawing only. The letterbox around a wide image is transparent because this canvas is, and counting it
    // made a white-paper drawing 873 × 166 look like one on a transparent ground — every pixel of its paper became ink (seen on
    // Everkinetic's Supermans, 2026-09-15).
    let left = Int((Double(canvas) - w) / 2), bottom = 0
    var transparent = 0, colourful = 0, opaque = 0, samples = 0
    for y in Swift.stride(from: bottom, to: bottom + Int(h), by: 2) {
        for x in Swift.stride(from: left, to: left + Int(w), by: 2) {
            // CoreGraphics' origin is the bottom-left and the buffer's first row is the top.
            let i = ((canvas - 1 - y) * canvas + x) * 4
            samples += 1
            if px[i + 3] < 128 { transparent += 1; continue }
            opaque += 1
            let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
            if max(r, g, b) - min(r, g, b) > 40 { colourful += 1 }
        }
    }
    let onTransparent = transparent > samples / 2
    if !onTransparent && colourful > opaque / 10 { return nil }

    var result = [Float](repeating: 0, count: canvas * canvas)
    for p in 0..<(canvas * canvas) {
        let i = p * 4
        let a = Float(px[i + 3]) / 255
        if onTransparent {
            result[p] = a
        } else {
            guard a > 0 else { continue }
            // Un-premultiply, then darkness; the paper's faint grey is cut so it does not become a haze.
            let lum = (0.299 * Float(px[i]) + 0.587 * Float(px[i + 1]) + 0.114 * Float(px[i + 2])) / 255 / a
            result[p] = max(0, min(1, (1 - lum - 0.12) / 0.88)) * a
        }
    }
    return result
}

func png(_ mask: [Float], box: (x: Int, y: Int, size: Int), to path: String) {
    var px = [UInt8](repeating: 0, count: side * side * 4)
    for y in 0..<side {
        for x in 0..<side {
            let sx = box.x + x * box.size / side, sy = box.y + y * box.size / side
            guard sx >= 0, sy >= 0, sx < canvas, sy < canvas else { continue }
            // Box filter over the source pixels this output pixel covers, so thin lines survive the downscale.
            let step = max(1, box.size / side)
            var sum: Float = 0, n: Float = 0
            for dy in 0..<step where sy + dy < canvas {
                for dx in 0..<step where sx + dx < canvas { sum += mask[(sy + dy) * canvas + sx + dx]; n += 1 }
            }
            let a = UInt8(max(0, min(255, (sum / max(n, 1)) * 1.6 * 255)))
            px[(y * side + x) * 4 + 3] = a   // black ink: RGB stays 0 (premultiplied)
        }
    }
    let ctx = CGContext(data: &px, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

let sources = try! JSONDecoder().decode([Source].self, from: Data(contentsOf: URL(fileURLWithPath: work + "/sources.json")))
try? FileManager.default.removeItem(atPath: out)
try! FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

var catalogue: [[String: Any]] = []
var skipped: [String] = []
for item in sources {
    let images = item.raw.compactMap { load(work + "/" + $0) }
    let widest = Double(images.map(\.width).max() ?? 1), tallest = Double(images.map(\.height).max() ?? 1)
    let scale = min(Double(canvas) / widest, Double(canvas) / tallest)
    let masks = images.compactMap { ink($0, scale: scale) }
    guard masks.count == item.raw.count, !masks.isEmpty else { skipped.append("\(item.name) (\(item.source))"); continue }

    // The shared crop: every pose's ink, one square around all of it, with a margin.
    var minX = canvas, minY = canvas, maxX = 0, maxY = 0
    for mask in masks {
        for y in 0..<canvas { for x in 0..<canvas where mask[y * canvas + x] > 0.15 {
            minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
        } }
    }
    guard maxX > minX, maxY > minY else { skipped.append("\(item.name) (\(item.source), blank)"); continue }
    let size = Int(Double(max(maxX - minX, maxY - minY)) * 1.1)
    let box = (x: (minX + maxX) / 2 - size / 2, y: (minY + maxY) / 2 - size / 2, size: size)

    let dir = out + "/" + item.slug
    try! FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    for (index, mask) in masks.enumerated() { png(mask, box: box, to: "\(dir)/\(index + 1).png") }

    var changes = "Converted to a single-colour line drawing on a transparent 360 × 360 canvas; the poses cropped to one shared frame."
    if item.source == "Workout Guide" { changes += " Frames 1 and 3 of 3." }
    catalogue.append([
        "slug": item.slug, "name": item.name, "primary": item.primary, "equipment": item.equipment, "frames": masks.count,
        "source": item.source, "sourceUrl": item.sourceUrl, "author": item.author,
        "license": item.license, "licenseUrl": item.licenseUrl, "changes": changes,
    ])
}
let json = try! JSONSerialization.data(withJSONObject: catalogue, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try! json.write(to: URL(fileURLWithPath: out + "/catalogue.json"))
print("published \(catalogue.count) · left out \(skipped.count)")
skipped.forEach { print("  left out: \($0)") }
