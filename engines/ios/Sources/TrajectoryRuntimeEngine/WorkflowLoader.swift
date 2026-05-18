import Foundation

public func loadWorkflow(filePath: String) throws -> [String: Any] {
    let url = URL(fileURLWithPath: filePath)

    if filePath.hasSuffix(".WFmasterX") {
        // ZIP extraction — use Foundation's archive support
        // For simplicity, read the ZIP manually (PKZip format)
        let data = try Data(contentsOf: url)
        guard let jsonData = extractWFmasterFromZip(data) else {
            throw NSError(domain: "WorkflowLoader", code: 1,
                         userInfo: [NSLocalizedDescriptionKey: "No .WFmaster file found inside the .WFmasterX archive"])
        }
        guard let result = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            throw NSError(domain: "WorkflowLoader", code: 2,
                         userInfo: [NSLocalizedDescriptionKey: "Invalid JSON in .WFmaster"])
        }
        return result
    }

    let data = try Data(contentsOf: url)
    guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        throw NSError(domain: "WorkflowLoader", code: 2,
                     userInfo: [NSLocalizedDescriptionKey: "Invalid JSON"])
    }
    return result
}

// Minimal PKZip local file header reader
private func extractWFmasterFromZip(_ data: Data) -> Data? {
    var offset = 0
    while offset + 30 <= data.count {
        // Check for local file header signature: PK\x03\x04
        guard data[offset] == 0x50, data[offset + 1] == 0x4B,
              data[offset + 2] == 0x03, data[offset + 3] == 0x04 else {
            break
        }

        let compressionMethod = UInt16(data[offset + 8]) | (UInt16(data[offset + 9]) << 8)
        let compressedSize = UInt32(data[offset + 18]) | (UInt32(data[offset + 19]) << 8) |
                            (UInt32(data[offset + 20]) << 16) | (UInt32(data[offset + 21]) << 24)
        let fileNameLen = Int(UInt16(data[offset + 26]) | (UInt16(data[offset + 27]) << 8))
        let extraLen = Int(UInt16(data[offset + 28]) | (UInt16(data[offset + 29]) << 8))

        let nameStart = offset + 30
        let nameEnd = nameStart + fileNameLen
        guard nameEnd <= data.count else { break }

        let fileName = String(data: data[nameStart..<nameEnd], encoding: .utf8) ?? ""
        let dataStart = nameEnd + extraLen
        let dataEnd = dataStart + Int(compressedSize)
        guard dataEnd <= data.count else { break }

        if fileName.hasSuffix(".WFmaster") && compressionMethod == 0 {
            // Stored (no compression) — just extract
            return Data(data[dataStart..<dataEnd])
        }

        offset = dataEnd
    }
    return nil
}
