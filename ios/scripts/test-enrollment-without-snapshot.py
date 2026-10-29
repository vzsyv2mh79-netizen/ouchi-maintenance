#!/usr/bin/env python3
"""Execute the actual NativeStore enrollment method with narrow Swift doubles.
This checks orchestration, not the UI, real Auth, SQL or network transport.
"""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
source = (root / 'OuchiMaintenance/NativeStore.swift').read_text()
start = source.index('    func confirmExplicitEnrollment(password: String? = nil)')
end = source.index('\n    var formalChannelEnvironment:', start)
method = source[start:end]
prefix = r'''
import Foundation
struct User { let id: UUID }
struct Credentials { let user: User; let access_token: String }
struct EnrollmentState { let epochID: UUID? }
@MainActor final class Session {
 let account = UUID(); var local: UUID?; var changed = false
 init() { local = account }
 func credentials() async throws -> Credentials {
  Credentials(user: User(id: account), access_token: changed ? "changed" : "original")
 }
 func localAccount() async -> UUID? { local }
}
@MainActor final class Service {
 let epoch = UUID(); var loads = 0; var writes = 0; var loseAcknowledgement = false
 func register(account: UUID, token: String, password: String, requestID: UUID) async throws -> UUID {
  writes += 1
  if loseAcknowledgement { throw CocoaError(.fileReadUnknown) }
  return epoch
 }
 func load(account: UUID, token: String) async throws -> EnrollmentState {
  loads += 1; return EnrollmentState(epochID: epoch)
 }
}
@MainActor final class NativeStore {
 var busy = false; var signedIn = true; var explicitEnrollmentConfigured = true
 var session: Session? = Session(); var generation = UUID(); var accountBindingRevision = UUID()
 var snapshotAccount: UUID? = nil; var message: String?
 let service = Service()
 func configuredEnrollmentAPI() -> Service { service }
'''
suffix = r'''
}
@main struct Run {
 @MainActor static func main() async {
  let read = NativeStore()
  precondition(read.snapshotAccount == nil)
  precondition(await read.confirmExplicitEnrollment() != nil)
  precondition(read.service.loads == 1 && read.service.writes == 0 && !read.busy)
  let consent = NativeStore()
  precondition(await consent.confirmExplicitEnrollment(password: "synthetic") != nil)
  precondition(consent.service.loads == 1 && consent.service.writes == 1)
  let mismatch = NativeStore(); mismatch.session!.local = UUID()
  precondition(await mismatch.confirmExplicitEnrollment(password: "synthetic") == nil)
  precondition(mismatch.service.loads == 0 && mismatch.service.writes == 0)
  let lost = NativeStore(); lost.service.loseAcknowledgement = true
  precondition(await lost.confirmExplicitEnrollment(password: "synthetic") == nil)
  precondition(lost.service.writes == 1 && lost.service.loads == 0 && lost.message != nil)
  precondition(await lost.confirmExplicitEnrollment() != nil)
  precondition(lost.service.writes == 1 && lost.service.loads == 1)
  print("PASS: nil-snapshot registration/readback, foreign local account refusal and lost-ack read-only recovery")
 }
}
'''
# Await cannot appear in precondition's synchronous autoclosure.
import re
suffix = re.sub(r'  precondition\(await (.+) (==|!=) nil\)',
                lambda m: '  let result' + str(m.start()) + ' = await ' + m[1] + '\n  precondition(result' + str(m.start()) + ' ' + m[2] + ' nil)', suffix)
with tempfile.TemporaryDirectory(prefix='ouchi-enrollment-method-') as directory:
    path = Path(directory)
    (path / 'test.swift').write_text(prefix + method + suffix)
    subprocess.run(['xcrun', 'swiftc', '-module-cache-path', str(path / 'cache'), '-swift-version', '6', '-parse-as-library',
                    str(path / 'test.swift'), '-o', str(path / 'test')], check=True, timeout=60)
    subprocess.run([str(path / 'test')], check=True, timeout=10)
