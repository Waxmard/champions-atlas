import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let action = UIButton(type: .system)
    private let cancel = UIButton(type: .system)
    private var saved = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        let stack = UIStackView(arrangedSubviews: [message, action, cancel])
        stack.axis = .vertical
        stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48),
            action.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
            cancel.heightAnchor.constraint(greaterThanOrEqualToConstant: 44)
        ])
        message.numberOfLines = 0
        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        for button in [action, cancel] {
            button.titleLabel?.font = .preferredFont(forTextStyle: .body)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
        }
        action.addTarget(self, action: #selector(performAction), for: .touchUpInside)
        cancel.setTitle("Cancel", for: .normal)
        cancel.addTarget(self, action: #selector(cancelShare), for: .touchUpInside)
        loadShare()
    }

    private func loadShare() {
        message.text = "Reading shared link…"
        action.isEnabled = false
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        let urlProviders = providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }
        let selected = urlProviders.isEmpty
            ? providers.filter { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }
            : urlProviders
        let type = urlProviders.isEmpty ? UTType.plainText.identifier : UTType.url.identifier
        guard !selected.isEmpty else {
            showInvalid()
            return
        }
        let group = DispatchGroup()
        let lock = NSLock()
        var values: [String] = []
        var failed = false
        for provider in selected {
            group.enter()
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
                lock.lock()
                if error != nil {
                    failed = true
                } else if let url = item as? URL {
                    values.append(url.absoluteString)
                } else if let text = item as? String {
                    values.append(text)
                } else {
                    failed = true
                }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            if failed {
                self.message.text = "The shared link could not be read. Try again."
                self.action.setTitle("Try again", for: .normal)
                self.action.isEnabled = true
                return
            }
            do {
                let links = try Set(values.map { try ShareQueue.sharedLink($0) })
                guard links.count == 1, let link = links.first else {
                    self.showInvalid()
                    return
                }
                self.save(link)
            } catch {
                self.showInvalid()
            }
        }
    }

    private func showInvalid() {
        message.text = "Share one Poképaste link or YouTube video."
        action.setTitle("Try again", for: .normal)
        action.isEnabled = true
    }

    @objc private func performAction() {
        if saved {
            extensionContext?.completeRequest(returningItems: nil)
        } else {
            loadShare()
        }
    }

    private func save(_ link: String) {
        cancel.isEnabled = false
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            var stored = true
            do {
                try ShareQueue().enqueue(url: link)
            } catch {
                stored = false
            }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.saved = stored
                self.message.text = stored
                    ? "Saved. Open Champion's Atlas to finish importing."
                    : "The link could not be saved. Try again."
                self.action.setTitle(stored ? "Done" : "Try again", for: .normal)
                self.action.isEnabled = true
                self.cancel.isEnabled = true
                self.cancel.isHidden = stored
            }
        }
    }

    @objc private func cancelShare() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
