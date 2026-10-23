import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import OuchiCore

@main struct AttachmentImagePreparationSmoke {
    static func refused(_ bytes: Data, _ mime: String) {
        do { _ = try AttachmentImagePreparation.sanitizedCopy(bytes, mime: mime); fatalError("unsafe image accepted") }
        catch {}
    }
    static func pixels(_ image: CGImage) -> Data {
        let context = CGContext(data: nil, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return Data(bytes: context.data!, count: image.width * image.height * 4)
    }
    static func main() throws {
        let context = CGContext(data: nil, width: 16, height: 12, bitsPerComponent: 8,
            bytesPerRow: 64, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(red: 0.2, green: 0.6, blue: 0.8, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 16, height: 12))
        context.clear(CGRect(x: 0, y: 0, width: 4, height: 3))
        context.setFillColor(CGColor(red: 0.8, green: 0.1, blue: 0.2, alpha: 0.25))
        context.fill(CGRect(x: 4, y: 0, width: 4, height: 3))
        let image = context.makeImage()!
        for (mime, type) in [("image/jpeg", UTType.jpeg.identifier), ("image/png", UTType.png.identifier)] {
          for orientation in 1...8 {
            let original = NSMutableData()
            let destination = CGImageDestinationCreateWithData(original, type as CFString, 1, nil)!
            let privateProperties: [String: Any] = [
                kCGImagePropertyOrientation as String: orientation,
                kCGImagePropertyGPSDictionary as String: [kCGImagePropertyGPSLatitude as String: 35.123,
                    kCGImagePropertyGPSLatitudeRef as String: "N", kCGImagePropertyGPSLongitude as String: 139.123,
                    kCGImagePropertyGPSLongitudeRef as String: "E"],
                kCGImagePropertyTIFFDictionary as String: [kCGImagePropertyTIFFArtist as String: "SYNTHETIC_PRIVATE_AUTHOR"],
                kCGImagePropertyIPTCDictionary as String: [kCGImagePropertyIPTCCaptionAbstract as String: "SYNTHETIC_PRIVATE_CAPTION"]]
            CGImageDestinationAddImage(destination, image, privateProperties as CFDictionary)
            precondition(CGImageDestinationFinalize(destination))
            let source = CGImageSourceCreateWithData(original as CFData, nil)!
            let before = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
            precondition(before[kCGImagePropertyGPSDictionary] != nil, "fixture must contain real encoded GPS")
            precondition(((before[kCGImagePropertyOrientation] as? Int) ?? 1) == orientation)
            let clean = try AttachmentImagePreparation.sanitizedCopy(original as Data, mime: mime)
            let cleanedSource = CGImageSourceCreateWithData(clean as CFData, nil)!
            let after = CGImageSourceCopyPropertiesAtIndex(cleanedSource, 0, nil)! as NSDictionary
            precondition(after[kCGImagePropertyGPSDictionary] == nil)
            precondition(((after[kCGImagePropertyOrientation] as? Int) ?? 1) == orientation)
            let tiff = after[kCGImagePropertyTIFFDictionary] as? NSDictionary
            precondition(tiff?[kCGImagePropertyTIFFArtist] == nil)
            let iptc = after[kCGImagePropertyIPTCDictionary] as? NSDictionary
            precondition(iptc?[kCGImagePropertyIPTCCaptionAbstract] == nil)
            precondition(clean.range(of: Data("SYNTHETIC_PRIVATE".utf8)) == nil)
            let decoded = CGImageSourceCreateImageAtIndex(cleanedSource, 0, nil)!
            precondition(decoded.width == 16 && decoded.height == 12)
            if mime == "image/png" { precondition(pixels(decoded) == pixels(CGImageSourceCreateImageAtIndex(source, 0, nil)!)) }
            refused(original as Data, mime == "image/png" ? "image/jpeg" : "image/png")
          }
        }
        // A valid highly compressed image above the decoded-pixel budget must
        // be refused even though its encoded bytes fit the upload limit.
        let oversizedContext = CGContext(data: nil, width: 6001, height: 4000, bitsPerComponent: 8,
            bytesPerRow: 6001 * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        oversizedContext.setFillColor(CGColor(red: 0.3, green: 0.3, blue: 0.3, alpha: 1))
        oversizedContext.fill(CGRect(x: 0, y: 0, width: 6001, height: 4000))
        let oversizedBytes = NSMutableData()
        let oversizedDestination = CGImageDestinationCreateWithData(oversizedBytes, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(oversizedDestination, oversizedContext.makeImage()!, nil)
        precondition(CGImageDestinationFinalize(oversizedDestination))
        precondition(oversizedBytes.length <= AttachmentImagePreparation.maximumBytes)
        let oversizedSource = CGImageSourceCreateWithData(oversizedBytes as CFData, nil)!
        precondition(CGImageSourceGetStatus(oversizedSource) == .statusComplete)
        refused(oversizedBytes as Data, "image/jpeg")
        refused(Data("%PDF synthetic untouched document".utf8), "application/pdf")
        refused(Data([137,80,78,71,13,10,26,10]), "image/png")
        refused(Data(), "image/jpeg")
        refused(Data(repeating: 0, count: AttachmentImagePreparation.maximumBytes + 1), "image/png")
        print("PASS: synthetic JPEG/PNG upload copies remove real encoded GPS/author/caption, retain all eight rotations/reflections and dimensions, preserve transparent PNG pixels, and reject mismatched, truncated, oversized bytes, valid over-budget pixel dimensions and PDF input. No owner files, network or upload.")
    }
}
