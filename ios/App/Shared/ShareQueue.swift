import Darwin
import Foundation

struct SharedLink: Codable {
    let id: String
    let url: String
    let createdAt: Double
}

struct ShareQueue {
    private let directory: URL?
    private let fileManager = FileManager.default

    init(directory: URL? = nil) {
        self.directory = directory
    }

    static func sharedLink(_ input: String) throws -> String {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.range(of: "^[0-9a-fA-F]{16}$", options: .regularExpression) != nil {
            return "https://pokepast.es/\(text.lowercased())"
        }
        let start = "(?<![A-Za-z0-9_./@-])(?:https?://)?"
        let pastes = try captures("\(start)pokepast\\.es/([0-9a-f]{16})(?![0-9a-z])", in: text)
            .map { "https://pokepast.es/\($0.lowercased())" }
        let videos = try captures(
            "\(start)(?:(?:www\\.|m\\.)?youtube\\.com/(?:watch\\?(?:[^\\s#]*&)?v=|live/|shorts/)|youtu\\.be/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])",
            in: text
        ).map { "https://www.youtube.com/watch?v=\($0)" }
        let links = Set(pastes.isEmpty ? videos : pastes)
        guard links.count == 1, let link = links.first else { throw QueueError.invalidURL }
        return link
    }

    private static func captures(_ pattern: String, in text: String) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern, options: .caseInsensitive)
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).compactMap {
            Range($0.range(at: 1), in: text).map { String(text[$0]) }
        }
    }

    func enqueue(url: String) throws {
        try withLock { directory in
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let link = SharedLink(id: UUID().uuidString, url: url, createdAt: Date().timeIntervalSince1970)
            let data = try JSONEncoder().encode(link)
            let target = directory.appendingPathComponent("\(link.id).json")
            let temporary = directory.appendingPathComponent(".\(link.id).tmp")
            let fd = open(temporary.path, O_WRONLY | O_CREAT | O_EXCL, S_IRUSR | S_IWUSR)
            guard fd >= 0 else { throw posixError() }
            var isOpen = true
            defer {
                if isOpen { _ = close(fd) }
                try? fileManager.removeItem(at: temporary)
            }
            try data.withUnsafeBytes { bytes in
                var written = 0
                while written < bytes.count {
                    let count = write(fd, bytes.baseAddress!.advanced(by: written), bytes.count - written)
                    if count < 0 && errno == EINTR { continue }
                    guard count > 0 else { throw posixError() }
                    written += count
                }
            }
            guard fsync(fd) == 0 else { throw posixError() }
            let closeResult = close(fd)
            isOpen = false
            guard closeResult == 0 else { throw posixError() }
            guard rename(temporary.path, target.path) == 0 else { throw posixError() }
            try syncDirectory(directory)
        }
    }

    func list() throws -> [SharedLink] {
        try withLock { directory in
            let entries: [URL]
            do {
                entries = try fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError {
                return []
            }
            return try entries.filter { entry in
                let name = entry.lastPathComponent
                return !(name.hasPrefix(".") && name.hasSuffix(".tmp") &&
                    validID(String(name.dropFirst().dropLast(4))))
            }.map(readLink).sorted {
                $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt
            }
        }
    }

    func acknowledge(id: String) throws {
        guard validID(id) else { throw QueueError.invalidRecord }
        try withLock { directory in
            let target = directory.appendingPathComponent("\(id).json")
            do {
                _ = try readLink(target)
            } catch let error as NSError where error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError {
                return
            }
            try fileManager.removeItem(at: target)
            try syncDirectory(directory)
        }
    }

    private func readLink(_ url: URL) throws -> SharedLink {
        let filename = url.lastPathComponent
        guard url.pathExtension == "json" else { throw QueueError.invalidRecord }
        let id = String(filename.dropLast(5))
        guard validID(id) else { throw QueueError.invalidRecord }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw QueueError.invalidRecord }
        let link = try JSONDecoder().decode(SharedLink.self, from: Data(contentsOf: url))
        guard link.id == id, validID(link.id), link.createdAt.isFinite else { throw QueueError.invalidRecord }
        return link
    }

    private func validID(_ id: String) -> Bool {
        guard let uuid = UUID(uuidString: id) else { return false }
        return uuid.uuidString == id
    }

    private func withLock<T>(_ body: (URL) throws -> T) throws -> T {
        let directory: URL
        if let supplied = self.directory {
            directory = supplied
        } else {
            guard let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: "group.com.maxwellward.championsatlas") else {
                throw QueueError.containerUnavailable
            }
            directory = container.appendingPathComponent("Library/Application Support/IncomingShares", isDirectory: true)
        }
        let parent = directory.deletingLastPathComponent()
        try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
        let lockPath = parent.appendingPathComponent(".\(directory.lastPathComponent).lock").path
        let fd = open(lockPath, O_RDWR | O_CREAT, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw posixError() }
        defer { _ = close(fd) }
        while flock(fd, LOCK_EX) != 0 {
            if errno != EINTR { throw posixError() }
        }
        defer { _ = flock(fd, LOCK_UN) }
        return try body(directory)
    }

    private func syncDirectory(_ directory: URL) throws {
        let fd = open(directory.path, O_RDONLY)
        guard fd >= 0 else { throw posixError() }
        defer { _ = close(fd) }
        guard fsync(fd) == 0 else { throw posixError() }
    }

    private func posixError() -> NSError {
        NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
    }

    private enum QueueError: LocalizedError {
        case containerUnavailable
        case invalidRecord
        case invalidURL

        var errorDescription: String? {
            switch self {
            case .containerUnavailable: return "Shared link storage is unavailable."
            case .invalidRecord: return "Shared link storage contains an invalid record."
            case .invalidURL: return "Share a Poképaste link or a YouTube video."
            }
        }
    }
}
