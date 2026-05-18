import SwiftUI

struct WorkflowLoader: View {
    let coordinator: WorkflowCoordinator
    @State private var jsonInput = ""
    @State private var showPasteSheet = false

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 64))
                .foregroundColor(.accentColor)

            Text("Load a Workflow")
                .font(.title2)

            Button("Paste JSON") {
                showPasteSheet = true
            }
            .buttonStyle(.borderedProminent)
        }
        .sheet(isPresented: $showPasteSheet) {
            NavigationStack {
                TextEditor(text: $jsonInput)
                    .font(.system(.body, design: .monospaced))
                    .padding()
                    .navigationTitle("Paste Workflow JSON")
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { showPasteSheet = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Load") {
                                coordinator.load(json: jsonInput)
                                coordinator.start()
                                showPasteSheet = false
                            }
                            .disabled(jsonInput.isEmpty)
                        }
                    }
            }
        }
    }
}
