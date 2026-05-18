import Foundation

public class WorkflowEngine: @unchecked Sendable {
    private var steps: [String: StepInstance] = [:]
    private var stepDefinitionOrder: [String] = []
    private let connections: [WorkflowConnection]
    private let propertyStore: PropertyStore
    private var trace: [TraceEntry] = []
    private var traceOrder: Int = 0
    private var workflowState: WorkflowState = .IDLE
    private var pendingUserSteps: Set<String> = []
    private var waitAllTracking: [String: WaitAllTracker] = [:]
    private var routingContext: [String: RoutingResult] = [:]
    private var completionQueue: [String] = []

    private struct WaitAllTracker {
        let expected: Set<String>
        var completed: Set<String>
    }

    public init(workflow: MasterWorkflowSpecification, setup: TestFixtureSetup? = nil) {
        self.connections = workflow.connections
        self.propertyStore = PropertyStore()

        // Initialize steps
        for step in workflow.steps {
            let normalized = StepInstance(
                oid: step.oid,
                stepType: canonicalStepType(step.step_type),
                state: .IDLE,
                step: step
            )
            steps[step.oid] = normalized
            stepDefinitionOrder.append(step.oid)
        }

        // Initialize property store
        propertyStore.initializeFromWorkflow(workflow)
        if let initialProps = setup?.initial_properties {
            propertyStore.initializeFromSetup(initialProps)
        }
    }

    public func start() {
        workflowState = .RUNNING

        // Find START step
        guard let startOid = steps.values.first(where: { $0.stepType == "START" })?.oid else {
            fatalError("No START step found")
        }

        // START auto-completes immediately
        recordTrace(stepOid: startOid, state: "COMPLETED")
        steps[startOid]!.state = .COMPLETED
        completionQueue.append(startOid)
        drainCompletionQueue()
    }

    public func submitAction(_ action: UserAction, actionIndex: Int) {
        guard var stepInstance = steps[action.step_oid] else {
            fatalError("Step \(action.step_oid) not found")
        }
        guard stepInstance.state == .EXECUTING else {
            fatalError("Step \(action.step_oid) is not EXECUTING")
        }

        // Handle the action
        let routing = handleUserAction(step: stepInstance.step, action: action, propertyStore: propertyStore)

        // Complete the step
        recordTrace(stepOid: stepInstance.oid, state: "COMPLETED", afterAction: actionIndex)
        stepInstance.state = .COMPLETED
        steps[stepInstance.oid] = stepInstance
        pendingUserSteps.remove(stepInstance.oid)

        // Store routing context
        if routing.conditionValue != nil || routing.connectionId != nil {
            routingContext[stepInstance.oid] = routing
        }

        completionQueue.append(stepInstance.oid)
        drainCompletionQueue()
    }

    public func getTrace() -> [TraceEntry] { return trace }
    public func getWorkflowState() -> WorkflowState { return workflowState }
    public func getProperties() -> [String: String] { return propertyStore.toFlatMap() }

    private func recordTrace(stepOid: String, state: String, afterAction: Int? = nil) {
        traceOrder += 1
        let entry = TraceEntry(step_oid: stepOid, state: state, order: traceOrder, after_action: afterAction)
        trace.append(entry)
    }

    private func drainCompletionQueue() {
        while !completionQueue.isEmpty {
            let stepOid = completionQueue.removeFirst()
            let outgoing = getRoutedConnections(stepOid: stepOid)

            for conn in outgoing {
                let targetOid = conn.to_step_id
                guard steps[targetOid] != nil else { continue }

                if steps[targetOid]!.stepType == "WAIT ALL" {
                    handleWaitAllArrival(waitAllOid: targetOid, sourceOid: stepOid)
                } else {
                    activateStep(targetOid: targetOid)
                }
            }
        }

        // Post-wave: pre-activate WAIT ALL steps still in IDLE
        activatePendingWaitAlls()
        checkWorkflowCompletion()
    }

    private func activateStep(targetOid: String) {
        guard var target = steps[targetOid], target.state == .IDLE else { return }

        if isAutoCompleting(target.stepType) {
            // Handle SELECT 1 routing
            if target.stepType == "SELECT 1" || target.stepType == "SELECT_1" {
                let routing = handleSelect1(step: target.step, propertyStore: propertyStore)
                if routing.connectionId != nil {
                    routingContext[target.oid] = routing
                }
            }

            recordTrace(stepOid: target.oid, state: "COMPLETED")
            target.state = .COMPLETED
            steps[target.oid] = target
            completionQueue.append(target.oid)
        } else if needsUserAction(target.stepType) {
            recordTrace(stepOid: target.oid, state: "EXECUTING")
            target.state = .EXECUTING
            steps[target.oid] = target
            pendingUserSteps.insert(target.oid)
        }
    }

    private func handleWaitAllArrival(waitAllOid: String, sourceOid: String) {
        guard var waitAll = steps[waitAllOid] else { return }
        if waitAll.state == .COMPLETED { return }

        if waitAll.state == .IDLE {
            // First arrival — check how many branches are already completed
            let expected = getIncomingStepOids(targetOid: waitAll.oid)
            var completed = Set<String>([sourceOid])
            for oid in expected {
                if steps[oid]?.state == .COMPLETED {
                    completed.insert(oid)
                }
            }

            waitAllTracking[waitAll.oid] = WaitAllTracker(expected: expected, completed: completed)

            if completed.count >= expected.count {
                // All branches already done
                completeWaitAll(waitAllOid: waitAll.oid)
            } else {
                // Some branches still pending
                recordTrace(stepOid: waitAll.oid, state: "EXECUTING")
                waitAll.state = .EXECUTING
                steps[waitAll.oid] = waitAll
            }
        } else if waitAll.state == .EXECUTING {
            // Subsequent arrival
            waitAllTracking[waitAll.oid]!.completed.insert(sourceOid)

            let tracking = waitAllTracking[waitAll.oid]!
            if tracking.completed.count >= tracking.expected.count {
                completeWaitAll(waitAllOid: waitAll.oid)
            }
        }
    }

    private func completeWaitAll(waitAllOid: String) {
        recordTrace(stepOid: waitAllOid, state: "COMPLETED")
        steps[waitAllOid]!.state = .COMPLETED
        completionQueue.append(waitAllOid)
    }

    private func activatePendingWaitAlls() {
        // Process in step definition order (inner before outer for nested parallels)
        for oid in stepDefinitionOrder {
            guard let step = steps[oid] else { continue }
            guard step.stepType == "WAIT ALL" && step.state == .IDLE else { continue }

            // Check if ALL incoming sources are non-IDLE
            let incomingSources = getIncomingStepOids(targetOid: step.oid)
            if incomingSources.isEmpty { continue }

            var allActive = true
            for sourceOid in incomingSources {
                if steps[sourceOid] == nil || steps[sourceOid]!.state == .IDLE {
                    allActive = false
                    break
                }
            }

            if allActive {
                // Pre-activate: find which branches are already completed
                var completedSources = Set<String>()
                for sourceOid in incomingSources {
                    if steps[sourceOid]?.state == .COMPLETED {
                        completedSources.insert(sourceOid)
                    }
                }

                waitAllTracking[step.oid] = WaitAllTracker(expected: incomingSources, completed: completedSources)

                recordTrace(stepOid: step.oid, state: "EXECUTING")
                steps[step.oid]!.state = .EXECUTING

                // Check if already fully complete
                if completedSources.count >= incomingSources.count {
                    completeWaitAll(waitAllOid: step.oid)
                }
            }
        }
    }

    private func getIncomingStepOids(targetOid: String) -> Set<String> {
        var sources = Set<String>()
        for conn in connections {
            if conn.to_step_id == targetOid {
                sources.insert(conn.from_step_id)
            }
        }
        return sources
    }

    private func getRoutedConnections(stepOid: String) -> [WorkflowConnection] {
        let all = connections.filter { $0.from_step_id == stepOid }
        guard let routing = routingContext[stepOid] else { return all }

        if let connId = routing.connectionId {
            return all.filter { $0.connection_id == connId }
        }

        if let val = routing.conditionValue {
            let matched = all.filter { conn in
                conn.condition == val || conn.condition?.lowercased() == val.lowercased()
            }
            return matched.isEmpty ? all : matched
        }

        return all
    }

    private func checkWorkflowCompletion() {
        let endCompleted = steps.values.contains { $0.stepType == "END" && $0.state == .COMPLETED }

        if endCompleted && pendingUserSteps.isEmpty {
            let anyExecuting = steps.values.contains { $0.state == .EXECUTING }
            if !anyExecuting {
                workflowState = .COMPLETED
            }
        }
    }
}
