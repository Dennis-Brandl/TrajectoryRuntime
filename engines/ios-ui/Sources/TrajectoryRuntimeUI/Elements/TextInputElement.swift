import SwiftUI

struct TextInputElement: View {
    let label: String
    let placeholder: String
    @Binding var value: String

    var body: some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption)
            TextField(placeholder, text: $value)
                .textFieldStyle(.roundedBorder)
        }
    }
}
