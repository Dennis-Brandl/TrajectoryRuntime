import SwiftUI

struct HeaderElement: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
    }
}
