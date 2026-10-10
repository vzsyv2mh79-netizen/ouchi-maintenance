// swift-tools-version: 6.0
import PackageDescription

let package = Package(name: "OuchiCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [
    .library(name: "OuchiCore", targets: ["OuchiCore"])
], targets: [
    .target(name: "OuchiCore", path: "OuchiCore"),
    .testTarget(name: "OuchiCoreTests", dependencies: ["OuchiCore"], sources: ["HouseholdAPITests.swift"])
])
