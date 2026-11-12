import AppIntents
import Foundation

enum GameResultStore {
    private static let lock = NSLock()
    private static let teamKey = "gameResults.activeTeam"
    private static let pendingKey = "gameResults.pending"

    static func setActiveTeam(_ team: [String: Any]?) {
        lock.lock()
        defer { lock.unlock() }
        guard let team = team, let id = team["id"] as? String, let name = team["name"] as? String else {
            UserDefaults.standard.removeObject(forKey: teamKey)
            return
        }
        UserDefaults.standard.set(
            ["id": id, "name": name, "wins": team["wins"] as? Int ?? 0, "losses": team["losses"] as? Int ?? 0],
            forKey: teamKey
        )
    }

    static func pending() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return readPending().map { ["teamId": $0.key, "wins": $0.value["wins"] ?? 0, "losses": $0.value["losses"] ?? 0] }
    }

    static func acknowledge(_ results: [[String: Any]]) {
        lock.lock()
        defer { lock.unlock() }
        var pending = readPending()
        for result in results {
            guard let id = result["teamId"] as? String, var tally = pending[id] else { continue }
            for key in ["wins", "losses"] {
                tally[key] = max(0, (tally[key] ?? 0) - (result[key] as? Int ?? 0))
            }
            pending[id] = tally.values.contains { $0 > 0 } ? tally : nil
        }
        UserDefaults.standard.set(pending, forKey: pendingKey)
    }

    static func activeTeamName() -> String? {
        UserDefaults.standard.dictionary(forKey: teamKey)?["name"] as? String
    }

    static func log(_ key: String) -> (name: String, wins: Int, losses: Int)? {
        lock.lock()
        defer { lock.unlock() }
        guard let team = UserDefaults.standard.dictionary(forKey: teamKey),
              let id = team["id"] as? String, let name = team["name"] as? String else { return nil }
        var pending = readPending()
        var tally = pending[id] ?? [:]
        tally[key] = (tally[key] ?? 0) + 1
        pending[id] = tally
        UserDefaults.standard.set(pending, forKey: pendingKey)
        let total = { (k: String) in min(9999, (team[k] as? Int ?? 0) + (tally[k] ?? 0)) }
        return (name, total("wins"), total("losses"))
    }

    private static func readPending() -> [String: [String: Int]] {
        UserDefaults.standard.dictionary(forKey: pendingKey) as? [String: [String: Int]] ?? [:]
    }
}

@available(iOS 16.0, *)
enum GameResult: String, AppEnum {
    case win = "wins"
    case loss = "losses"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Result"
    static var caseDisplayRepresentations: [GameResult: DisplayRepresentation] = [.win: "Win", .loss: "Loss"]
}

@available(iOS 16.0, *)
struct LogGameResultIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Game Result"
    static var description = IntentDescription("Adds a win or a loss to the team selected in My Teams, without opening the app.")
    static var openAppWhenRun = false

    @Parameter(title: "Result")
    var result: GameResult?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let teamName = GameResultStore.activeTeamName() else {
            return .result(dialog: "Open Champion's Atlas and choose a team in My Teams first.")
        }
        guard let result = result else {
            throw $result.needsValueError("\(teamName): win or loss?")
        }
        guard let logged = GameResultStore.log(result.rawValue) else {
            return .result(dialog: "Open Champion's Atlas and choose a team in My Teams first.")
        }
        return .result(dialog: "\(result == .win ? "Win" : "Loss") logged for \(logged.name). Now \(logged.wins)W – \(logged.losses)L.")
    }
}

@available(iOS 16.0, *)
struct AtlasShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogGameResultIntent(),
            phrases: ["Log a game in \(.applicationName)"]
        )
    }
}
