import SwiftUI

struct ButtonElement: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(label, action: action)
            .buttonStyle(.borderedProminent)
    }
}
