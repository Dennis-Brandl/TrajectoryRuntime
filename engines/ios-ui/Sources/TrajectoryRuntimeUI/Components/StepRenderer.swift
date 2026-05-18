import SwiftUI

struct StepRenderer: View {
    let step: ActiveStepSnapshot
    let coordinator: WorkflowCoordinator

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Step header
            HStack {
                Text(step.localId)
                    .font(.headline)
                Spacer()
                Text(step.state)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(stateColor.opacity(0.2))
                    .cornerRadius(8)
            }

            if let desc = step.description {
                Text(desc)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            // Step content based on type
            switch step.stepType {
            case "YES_NO":
                yesNoView
            case "USER_INTERACTION":
                FormRenderer(step: step, coordinator: coordinator)
            default:
                Text("Step type: \(step.stepType)")
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(radius: 2)
    }

    private var yesNoView: some View {
        HStack(spacing: 16) {
            Button(step.yesNoConfig?.yesLabel ?? "Yes") {
                coordinator.submitAction(
                    stepOid: step.id,
                    action: "button_press",
                    buttonOutput: step.yesNoConfig?.yesValue ?? "true"
                )
            }
            .buttonStyle(.borderedProminent)

            Button(step.yesNoConfig?.noLabel ?? "No") {
                coordinator.submitAction(
                    stepOid: step.id,
                    action: "button_press",
                    buttonOutput: step.yesNoConfig?.noValue ?? "false"
                )
            }
            .buttonStyle(.bordered)
        }
    }

    private var stateColor: Color {
        switch step.state {
        case "EXECUTING": return .blue
        case "WAITING": return .orange
        case "PAUSED": return .gray
        default: return .secondary
        }
    }
}
