import SwiftUI
import Combine
// import TrajectoryRuntimeEngine  // Uncomment when KMP framework is available

/// Coordinator state snapshot consumed by SwiftUI views.
struct CoordinatorSnapshot {
    var workflowState: String = "IDLE"
    var activeSteps: [ActiveStepSnapshot] = []
    var trace: [TraceSnapshot] = []
    var properties: [String: String] = [:]
    var inputParameters: [String: String] = [:]
    var error: String? = nil
    var stepParams: [String: StepParamSnapshot] = [:]
}

struct ActiveStepSnapshot: Identifiable {
    let id: String  // step oid
    let stepType: String
    let state: String
    let localId: String
    let description: String?
    let formLayoutConfig: Any?  // JSON form config
    let yesNoConfig: YesNoSnapshot?
    let workflowName: String
}

struct YesNoSnapshot {
    let yesLabel: String?
    let noLabel: String?
    let yesValue: String?
    let noValue: String?
}

struct TraceSnapshot: Identifiable {
    let id: Int  // order
    let stepOid: String
    let state: String
    let order: Int
    let afterAction: Int?
}

struct StepParamSnapshot {
    let inputParameters: [String: String]
    let outputParameters: [String: String]
    let description: String
    let label: String
    let stepType: String
}

/// Main coordinator wrapping the KMP workflow engine with SwiftUI-compatible state management.
@MainActor
class WorkflowCoordinator: ObservableObject {
    @Published var snapshot = CoordinatorSnapshot()
    @Published var isLoaded = false

    // TODO: Replace with KMP engine when framework is available
    // private var engine: TrajectoryRuntimeEngine.WorkflowEngine?
    private var workflowJson: String?
    private var setupJson: String?
    private var actionIndex = 0

    /// Load a workflow from JSON string.
    func load(json: String) {
        workflowJson = json
        isLoaded = true
    }

    /// Start the loaded workflow.
    func start() {
        guard let json = workflowJson else { return }
        actionIndex = 0
        snapshot = CoordinatorSnapshot(workflowState: "RUNNING")

        // TODO: Create engine from KMP framework
        // engine = WorkflowEngine(...)
        // engine?.start()
        // sync()
    }

    /// Submit a user action.
    func submitAction(stepOid: String, action: String, formValues: [String: Any]? = nil, buttonOutput: String? = nil) {
        actionIndex += 1
        // TODO: Delegate to KMP engine
        // engine?.submitAction(...)
        // sync()
    }

    /// Reset to idle state.
    func reset() {
        workflowJson = nil
        isLoaded = false
        actionIndex = 0
        snapshot = CoordinatorSnapshot()
    }

    /// Restart the current workflow.
    func restart() {
        guard workflowJson != nil else { return }
        start()
    }

    /// Pause all executing steps.
    func pauseAll() {
        for step in snapshot.activeSteps where step.state == "EXECUTING" {
            submitAction(stepOid: step.id, action: "pause")
        }
    }

    /// Resume all paused steps.
    func resumeAll() {
        for step in snapshot.activeSteps where step.state == "PAUSED" {
            submitAction(stepOid: step.id, action: "resume")
        }
    }

    // MARK: - Private

    private func sync() {
        // TODO: Read state from KMP engine and update snapshot
        // snapshot = CoordinatorSnapshot(
        //     workflowState: engine.getWorkflowState(),
        //     activeSteps: engine.getActiveSteps().map { ... },
        //     trace: engine.getTrace().map { ... },
        //     properties: engine.getAllProperties(),
        //     inputParameters: engine.getActiveInputParameters(),
        //     stepParams: engine.getStepParameterSnapshots().map { ... },
        // )
    }
}
