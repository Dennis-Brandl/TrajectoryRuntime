import SwiftUI

struct TraceView: View {
    let trace: [TraceSnapshot]

    var body: some View {
        if trace.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("Execution Trace")
                    .font(.headline)
                    .padding(.bottom, 4)

                ForEach(trace) { entry in
                    HStack {
                        Text("#\(entry.order)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .frame(width: 30, alignment: .trailing)
                        Text(entry.stepOid)
                            .font(.caption.monospaced())
                        Spacer()
                        Text(entry.state)
                            .font(.caption)
                            .foregroundColor(entry.state == "COMPLETED" ? .green : .blue)
                    }
                }
            }
            .padding()
            .background(Color(.secondarySystemBackground))
            .cornerRadius(8)
        }
    }
}
