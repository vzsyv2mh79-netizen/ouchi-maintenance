import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Creates an upload copy from decoded pixels, never from source metadata.
/// PDFs are handled separately and must not be silently rewritten.
public enum AttachmentImagePreparation {
    public static let maximumBytes = 5 * 1024 * 1024
    public static let maximumPixels = 24_000_000

    public static func sanitizedCopy(_ bytes: Data, mime: String) throws -> Data {
        let type: String
        switch mime {
        case "image/jpeg": type = UTType.jpeg.identifier
        case "image/png": type = UTType.png.identifier
        default: throw CloudError.invalidInput
        }
        guard !bytes.isEmpty, bytes.count <= maximumBytes,
              let source = CGImageSourceCreateWithData(bytes as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetStatus(source) == .statusComplete,
              CGImageSourceGetCount(source) == 1,
              CGImageSourceGetType(source) as String? == type,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
              let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
              let height = properties[kCGImagePropertyPixelHeight as String] as? Int,
              width > 0, height > 0, width <= maximumPixels / height else { throw CloudError.invalidInput }
        let orientation = (properties[kCGImagePropertyOrientation as String] as? Int) ?? 1
        guard (1...8).contains(orientation),
              let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
              image.width == width, image.height == height else { throw CloudError.invalidInput }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, type as CFString, 1, nil) else { throw CloudError.unavailable }
        // Orientation is necessary for display; no GPS, EXIF, IPTC or original
        // document/author metadata dictionary is forwarded to the encoder.
        var kept: [String: Any] = [kCGImagePropertyOrientation as String: orientation]
        if mime == "image/jpeg" { kept[kCGImageDestinationLossyCompressionQuality as String] = 0.95 }
        CGImageDestinationAddImage(destination, image, kept as CFDictionary)
        guard CGImageDestinationFinalize(destination), output.length > 0,
              output.length <= maximumBytes else { throw CloudError.invalidInput }
        return output as Data
    }
}
