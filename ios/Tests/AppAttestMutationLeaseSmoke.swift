import Foundation
import Darwin
import OuchiCore

@main struct AppAttestMutationLeaseSmoke {
    static func refused(_ root: URL) {
        do { let lease = try AppAttestMutationLease.acquire(root: root); lease.release(); preconditionFailure("overlap or unsafe path accepted") }
        catch { }
    }
    static func main() throws {
        if CommandLine.arguments.count == 3 {
            let root = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
            switch CommandLine.arguments[1] {
            case "hold":
                let lease = try AppAttestMutationLease.acquire(root: root)
                FileHandle.standardOutput.write(Data("ready\n".utf8))
                _ = try FileHandle.standardInput.read(upToCount: 1)
                lease.release()
            case "refuse": refused(root)
            default: preconditionFailure("unexpected fixture phase")
            }
            return
        }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ouchi-mutation-fixture-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: root) }
        let executable = URL(fileURLWithPath: CommandLine.arguments[0])
        let first = try AppAttestMutationLease.acquire(root: root)
        refused(root) // distinct descriptor, same process
        let contender = Process(); contender.executableURL = executable; contender.arguments = ["refuse", root.path]
        try contender.run(); contender.waitUntilExit(); precondition(contender.terminationStatus == 0)
        first.release(); first.release() // idempotent
        let second = try AppAttestMutationLease.acquire(root: root); second.release()
        let child = Process(), output = Pipe(), input = Pipe()
        child.executableURL = executable; child.arguments = ["hold", root.path]
        child.standardOutput = output; child.standardInput = input
        try child.run()
        defer { if child.isRunning { child.terminate(); child.waitUntilExit() } }
        let ready = try output.fileHandleForReading.read(upToCount: 6)
        precondition(ready == Data("ready\n".utf8))
        refused(root)
        precondition(kill(child.processIdentifier, SIGKILL) == 0)
        child.waitUntilExit()
        precondition(child.terminationReason == .uncaughtSignal)
        let afterCrash = try AppAttestMutationLease.acquire(root: root); afterCrash.release()
        let lockFile = root.appendingPathComponent(".registration-mutation.lock")
        let lockBytes = try Data(contentsOf: lockFile)
        precondition(lockBytes.isEmpty)
        try FileManager.default.removeItem(at: lockFile)
        let target = root.appendingPathComponent("fixture-target")
        try Data().write(to: target)
        try FileManager.default.createSymbolicLink(at: lockFile, withDestinationURL: target)
        refused(root)
        try FileManager.default.removeItem(at: lockFile)
        try FileManager.default.linkItem(at: target, to: lockFile)
        refused(root)
        try FileManager.default.removeItem(at: lockFile)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: root.path)
        refused(root)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
        let folderLink = root.appendingPathComponent("folder-link")
        try FileManager.default.createSymbolicLink(at: folderLink, withDestinationURL: root)
        refused(folderLink)
        print("PASS: process-shared mutation reservation, overlap refusal, crash release and unsafe-path refusal (fixture only; not integrated registration fencing)")
    }
}
