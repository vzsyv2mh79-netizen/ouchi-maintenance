import SwiftUI

@main struct OuchiMaintenanceApp: App {
    @StateObject private var store = NativeStore()
    var body: some Scene {
        WindowGroup { NativeRootView().environmentObject(store).task { await store.restore() } }
    }
}
