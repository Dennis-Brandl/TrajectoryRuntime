// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "TrajectoryRuntimeEngine",
    products: [
        .library(name: "TrajectoryRuntimeEngine", targets: ["TrajectoryRuntimeEngine"]),
    ],
    targets: [
        .target(
            name: "TrajectoryRuntimeEngine"
        ),
        .testTarget(
            name: "TrajectoryRuntimeEngineTests",
            dependencies: ["TrajectoryRuntimeEngine"],
            resources: [
                .copy("conformance"),
            ]
        ),
    ]
)
