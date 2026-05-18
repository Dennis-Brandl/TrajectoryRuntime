import SwiftUI

@main
struct TrajectoryRuntimeApp: App {
    @StateObject private var coordinator = WorkflowCoordinator()

    var body: some Scene {
        WindowGroup {
            WorkflowRunner(coordinator: coordinator)
        }
    }
}
