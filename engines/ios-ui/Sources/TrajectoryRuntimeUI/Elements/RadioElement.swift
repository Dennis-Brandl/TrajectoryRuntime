import SwiftUI

struct RadioElement: View {
    let options: [String]
    @Binding var selected: String

    var body: some View {
        Picker("", selection: $selected) {
            ForEach(options, id: \.self) { option in
                Text(option).tag(option)
            }
        }
        .pickerStyle(.segmented)
    }
}
