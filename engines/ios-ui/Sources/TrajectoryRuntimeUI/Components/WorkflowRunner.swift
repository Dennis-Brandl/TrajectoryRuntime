import SwiftUI

struct WorkflowRunner: View {
    @ObservedObject var coordinator: WorkflowCoordinator

    var body: some View {
        NavigationStack {
            Group {
                switch coordinator.snapshot.workflowState {
                case "IDLE":
                    WorkflowLoader(coordinator: coordinator)
                case "RUNNING":
                    runningView
                case "COMPLETED":
                    completedView
                case "ABORTED", "STOPPED", "ERRORED":
                    errorView
                default:
                    Text("Unknown state: \(coordinator.snapshot.workflowState)")
                }
            }
            .navigationTitle("Trajectory RT")
        }
    }

    private var runningView: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(coordinator.snapshot.activeSteps) { step in
                    StepRenderer(step: step, coordinator: coordinator)
                        .padding(.horizontal)
                }
            }
            .padding(.vertical)
        }
    }

    private var completedView: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.green)
            Text("Workflow Complete")
                .font(.title)
            TraceView(trace: coordinator.snapshot.trace)
            Button("Restart") { coordinator.restart() }
                .buttonStyle(.borderedProminent)
            Button("Reset") { coordinator.reset() }
                .buttonStyle(.bordered)
        }
        .padding()
    }

    private var errorView: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 64))
                .foregroundColor(.red)
            Text("Workflow \(coordinator.snapshot.workflowState)")
                .font(.title)
            if let error = coordinator.snapshot.error {
                Text(error)
                    .foregroundColor(.secondary)
            }
            Button("Reset") { coordinator.reset() }
                .buttonStyle(.bordered)
        }
        .padding()
    }
}
