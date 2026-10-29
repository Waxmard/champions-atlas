import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let message = UILabel()
    private let action = UIButton(type: .system)
    private let cancel = UIButton(type: .system)
    private var link: String?
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
        link = nil
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
                let links = try Set(values.map { try ShareQueue.canonicalURL($0) })
                guard links.count == 1, let link = links.first else {
                    self.showInvalid()
                    return
                }
                self.link = link
                self.message.text = link
                self.action.setTitle("Save link", for: .normal)
                self.action.isEnabled = true
            } catch {
                self.showInvalid()
            }
        }
    }

    private func showInvalid() {
        message.text = "Share one direct Poképaste link or 16-character paste ID."
        action.setTitle("Try again", for: .normal)
        action.isEnabled = true
    }

    @objc private func performAction() {
        if saved {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        guard let link = link else {
            loadShare()
            return
        }
        action.isEnabled = false
        cancel.isEnabled = false
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            do {
                try ShareQueue().enqueue(url: link)
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.saved = true
                    self.message.text = "Link saved. Open Champion’s Atlas to finish importing."
                    self.action.setTitle("Done", for: .normal)
                    self.action.isEnabled = true
                    self.cancel.isHidden = true
                }
            } catch {
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.message.text = "The link could not be saved. Try again."
                    self.action.setTitle("Try again", for: .normal)
                    self.action.isEnabled = true
                    self.cancel.isEnabled = true
                }
            }
        }
    }

    @objc private func cancelShare() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
