import BackgroundTasks
import Foundation
import UIKit
import UserNotifications

enum CatalogWatch {
    static let taskId = "com.maxwellward.championsatlas.catalog-check"
    static let bannerId = "catalog-new-teams"
    private static let configKey = "catalogWatch.config"
    private static let checkedHashKey = "catalogWatch.checkedHash"
    private static let checkInterval: TimeInterval = 4 * 60 * 60

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskId, using: nil) { task in
            schedule()
            let work = Task {
                let success = await check()
                task.setTaskCompleted(success: success)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func configure(enabled: Bool, endpoint: String, bundleHash: String?, knownIds: [String]) {
        let defaults = UserDefaults.standard
        defaults.set(["enabled": enabled, "endpoint": endpoint, "knownIds": knownIds], forKey: configKey)
        if let bundleHash = bundleHash {
            defaults.set(bundleHash, forKey: checkedHashKey)
        }
        schedule()
    }

    static func schedule() {
        let enabled = UserDefaults.standard.dictionary(forKey: configKey)?["enabled"] as? Bool ?? false
        guard enabled else {
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: taskId)
            return
        }
        let request = BGAppRefreshTaskRequest(identifier: taskId)
        request.earliestBeginDate = Date(timeIntervalSinceNow: checkInterval)
        try? BGTaskScheduler.shared.submit(request)
    }

    static func authorize() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])) ?? false
    }

    static func clearBanner() {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [bannerId])
    }

    static func check() async -> Bool {
        let defaults = UserDefaults.standard
        guard let config = defaults.dictionary(forKey: configKey),
              config["enabled"] as? Bool == true,
              let endpoint = URL(string: config["endpoint"] as? String ?? ""),
              endpoint.scheme == "https",
              let knownIds = config["knownIds"] as? [String] else { return true }
        do {
            let manifest = try await fetchJson(endpoint)
            guard let hash = manifest["bundleHash"] as? String,
                  hash.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  let idsUrl = URL(string: "current-\(hash).json", relativeTo: endpoint) else { return false }
            if hash == defaults.string(forKey: checkedHashKey) { return true }
            let current = try await fetchJson(idsUrl)
            guard let regulation = current["regulation"] as? String,
                  let ids = current["ids"] as? [String] else { return false }
            let count = Set(ids).subtracting(knownIds).count
            if count > 0 {
                let content = UNMutableNotificationContent()
                content.title = "\(count) new Reg \(regulation) \(count == 1 ? "team" : "teams")"
                content.body = "Open Browse to see them."
                try await UNUserNotificationCenter.current().add(
                    UNNotificationRequest(identifier: bannerId, content: content, trigger: nil)
                )
            }
            defaults.set(hash, forKey: checkedHashKey)
            return true
        } catch {
            return false
        }
    }

    private static func fetchJson(_ url: URL) async throws -> [String: Any] {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw URLError(.badServerResponse)
        }
        return object
    }
}
