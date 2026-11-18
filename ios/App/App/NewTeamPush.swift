import UIKit
import UserNotifications

@MainActor
enum NewTeamPush {
    static var launchPath: String?
    static let bannerIds = ["catalog-new-teams", "catalog-pokemon-teams"]
    private static var waiting: [UUID: CheckedContinuation<String?, Never>] = [:]

    nonisolated static func path(_ response: UNNotificationResponse) -> String {
        response.notification.request.content.userInfo["path"] as? String ?? "?new=1"
    }

    static func authorize() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])) ?? false
    }

    static func token() async -> String? {
        let id = UUID()
        return await withCheckedContinuation { continuation in
            waiting[id] = continuation
            UIApplication.shared.registerForRemoteNotifications()
            Task {
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                waiting.removeValue(forKey: id)?.resume(returning: nil)
            }
        }
    }

    static func resolve(_ token: String?) {
        let pending = waiting.values
        waiting = [:]
        pending.forEach { $0.resume(returning: token) }
    }

    static func clearBanner() {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: bannerIds)
    }
}
