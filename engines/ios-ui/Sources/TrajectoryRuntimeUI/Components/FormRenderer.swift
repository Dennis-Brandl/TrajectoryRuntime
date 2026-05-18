import SwiftUI

struct FormRenderer: View {
    let step: ActiveStepSnapshot
    let coordinator: WorkflowCoordinator
    @State private var formValues: [String: String] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // TODO: Parse form_layout_config and render elements
            // For now, show a placeholder
            Text("Form elements will render here")
                .foregroundColor(.secondary)
                .italic()

            Button("Submit") {
                coordinator.submitAction(
                    stepOid: step.id,
                    action: "submit",
                    formValues: formValues
                )
            }
            .buttonStyle(.borderedProminent)
        }
    }
}
