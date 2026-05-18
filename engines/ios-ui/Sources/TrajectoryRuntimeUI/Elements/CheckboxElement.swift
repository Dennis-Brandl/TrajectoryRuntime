import SwiftUI

struct CheckboxElement: View {
    let label: String
    @Binding var isChecked: Bool

    var body: some View {
        Toggle(label, isOn: $isChecked)
            .toggleStyle(.switch)
    }
}
