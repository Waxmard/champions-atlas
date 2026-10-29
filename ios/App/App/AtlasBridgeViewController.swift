import Capacitor

class AtlasBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AtlasNativePlugin())
    }
}
