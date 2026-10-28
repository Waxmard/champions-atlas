import Foundation

@main
struct ShareQueueCheck {
    static func main() throws {
        let canonical = "https://pokepast.es/138b4ef886ba95e4"
        for input in [
            canonical,
            " 138B4EF886BA95E4 ",
            "pokepast.es/138B4EF886BA95E4/?from=safari#team",
            "HTTP://POKEPAST.ES/138B4EF886BA95E4/?from=safari#team",
            "  HTTP://POKEPAST.ES/138B4EF886BA95E4/?source=one#team  ",
            "https://pokepast.es/138b4ef886ba95e4?other=https://example.com/#x"
        ] {
            let result = try ShareQueue.canonicalURL(input)
            precondition(result == canonical, input)
        }
        for input in [
            "", "/138b4ef886ba95e4", "#138b4ef886ba95e4",
            "Check https://pokepast.es/138b4ef886ba95e4",
            "ftp://pokepast.es/138b4ef886ba95e4", "file://pokepast.es/138b4ef886ba95e4",
            "javascript:alert(1)", "https://www.pokepast.es/138b4ef886ba95e4",
            "https://pokepast.es.evil.test/138b4ef886ba95e4", "https://pokepast.es./138b4ef886ba95e4",
            "https://user@pokepast.es/138b4ef886ba95e4", "https://user:password@pokepast.es/138b4ef886ba95e4",
            "https://@pokepast.es/138b4ef886ba95e4", "https://pokepast.es:443/138b4ef886ba95e4",
            "http://pokepast.es:80/138b4ef886ba95e4", "https://pokepast.es:8080/138b4ef886ba95e4",
            "https://pokepast.es:/138b4ef886ba95e4", "https://pokepast.es/138b4ef886ba95e",
            "https://pokepast.es/138b4ef886ba95e44", "https://pokepast.es/138b4ef886ba95eg",
            "https://pokepast.es//138b4ef886ba95e4", "https://pokepast.es/138b4ef886ba95e4/json",
            "https://pokepast.es/138b4ef886ba95e4//", "https://pokepast.es/other/../138b4ef886ba95e4",
            "https://pokepast.es\\138b4ef886ba95e4", "https://pokepast.es/138b4ef886ba95e4\\",
            "https://pokepast.es/%31%33%38b4ef886ba95e4"
        ] {
            do {
                _ = try ShareQueue.canonicalURL(input)
                fatalError("Accepted invalid input: \(input)")
            } catch { }
        }

        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let directory = root.appendingPathComponent("IncomingShares", isDirectory: true)
        let queue = ShareQueue(directory: directory)
        let initial = try queue.list()
        precondition(initial.isEmpty)
        try queue.enqueue(url: canonical)
        try queue.enqueue(url: "second")
        var links = try queue.list()
        precondition(links.count == 2 && Set(links.map(\.url)) == [canonical, "second"])
        precondition(links[0].createdAt <= links[1].createdAt)
        try queue.acknowledge(id: links[0].id)
        try queue.acknowledge(id: links[0].id)
        let remaining = try queue.list()
        precondition(remaining.map(\.id) == [links[1].id])
        do {
            try queue.acknowledge(id: "../invalid")
            fatalError("Accepted invalid ID")
        } catch { }

        let temporary = directory.appendingPathComponent(".\(UUID().uuidString).tmp")
        try Data("partial write".utf8).write(to: temporary)
        let afterAbandonedWrite = try queue.list()
        precondition(afterAbandonedWrite.map(\.id) == [links[1].id])
        precondition(FileManager.default.fileExists(atPath: temporary.path))
        let invalidTemporary = directory.appendingPathComponent(".not-a-uuid.tmp")
        try Data().write(to: invalidTemporary)
        do {
            _ = try queue.list()
            fatalError("Accepted invalid temporary filename")
        } catch { }
        try FileManager.default.removeItem(at: invalidTemporary)

        let malformedID = UUID().uuidString
        let malformed = directory.appendingPathComponent("\(malformedID).json")
        try Data("not JSON".utf8).write(to: malformed)
        do {
            _ = try queue.list()
            fatalError("Accepted malformed record")
        } catch { }
        do {
            try queue.acknowledge(id: malformedID)
            fatalError("Deleted malformed record")
        } catch { }
        precondition(FileManager.default.fileExists(atPath: malformed.path))
        try FileManager.default.removeItem(at: malformed)

        let mismatchID = UUID().uuidString
        let mismatch = directory.appendingPathComponent("\(mismatchID).json")
        try JSONEncoder().encode(SharedLink(id: UUID().uuidString, url: canonical, createdAt: 1)).write(to: mismatch)
        do {
            try queue.acknowledge(id: mismatchID)
            fatalError("Deleted mismatched record")
        } catch { }
        precondition(FileManager.default.fileExists(atPath: mismatch.path))
        try FileManager.default.removeItem(at: mismatch)

        let equalTime = 1.0
        let orderedIDs = [UUID().uuidString, UUID().uuidString].sorted()
        for id in orderedIDs.reversed() {
            let record = SharedLink(id: id, url: canonical, createdAt: equalTime)
            try JSONEncoder().encode(record).write(to: directory.appendingPathComponent("\(id).json"))
        }
        links = try queue.list()
        precondition(Array(links.prefix(2).map(\.id)) == orderedIDs)

        let retained = Set(links.map(\.id))
        for index in 0..<20 {
            try queue.enqueue(url: "remove-\(index)")
        }
        let removable = try queue.list().filter { $0.url.hasPrefix("remove-") }
        let errorLock = NSLock()
        var errors: [Error] = []
        DispatchQueue.concurrentPerform(iterations: 40) { index in
            do {
                if index.isMultiple(of: 2) {
                    try queue.enqueue(url: "concurrent-\(index)")
                } else {
                    try queue.acknowledge(id: removable[index / 2].id)
                }
            } catch {
                errorLock.lock()
                errors.append(error)
                errorLock.unlock()
            }
        }
        precondition(errors.isEmpty, "Concurrent queue error: \(errors)")
        links = try queue.list()
        precondition(links.count == retained.count + 20)
        precondition(retained.isSubset(of: Set(links.map(\.id))))
        print("Share queue checks passed")
    }
}
