import UIKit
import Capacitor

class AtlasBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AtlasNativePlugin())
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(clearStaleKeyboardFrame),
            name: UIResponder.keyboardDidHideNotification,
            object: nil
        )
    }

    // iOS 26+ can leave WKWebView treating ~24pt of the hidden keyboard as still on
    // screen, which shifts sticky and fixed bars on scroll (webkit.org/b/297779).
    @objc private func clearStaleKeyboardFrame() {
        NotificationCenter.default.post(
            name: UIResponder.keyboardDidChangeFrameNotification,
            object: nil,
            userInfo: [UIResponder.keyboardFrameEndUserInfoKey: NSValue(cgRect: .zero)]
        )
    }
}
