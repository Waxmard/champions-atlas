import Capacitor
import Foundation
import GoogleSignIn

@objc(AtlasNativePlugin)
public class AtlasNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AtlasNativePlugin"
    public let jsName = "AtlasNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signInWithGoogle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    @objc func signInWithGoogle(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  !clientID.isEmpty,
                  let serverClientID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
                  !serverClientID.isEmpty else {
                call.reject("Google sign-in is not configured for this iOS app. See docs/firebase.md.")
                return
            }
            let scheme = clientID.split(separator: ".").reversed().joined(separator: ".")
            let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
            guard urlTypes.contains(where: { ($0["CFBundleURLSchemes"] as? [String] ?? []).contains(scheme) }) else {
                call.reject("Google sign-in is not configured for this iOS app. See docs/firebase.md.")
                return
            }
            guard let presenting = self.bridge?.viewController else {
                call.reject("Google sign-in could not be opened.")
                return
            }
            GIDSignIn.sharedInstance.signIn(withPresenting: presenting) { result, error in
                if let error = error as NSError? {
                    if error.domain == kGIDSignInErrorDomain && error.code == GIDSignInError.canceled.rawValue {
                        call.reject(error.localizedDescription, "SIGN_IN_CANCELLED")
                    } else {
                        call.reject(error.localizedDescription, nil, error)
                    }
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString, !idToken.isEmpty else {
                    call.reject("Google sign-in returned no ID token.")
                    return
                }
                call.resolve(["idToken": idToken])
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signOut()
            call.resolve()
        }
    }
}
