import Foundation
import Darwin

/// Process-shared reservation for a dedicated, app-owned registration directory.
/// This primitive does not fence anything until EVERY writer/cleanup path uses
/// the same directory and retains its lease through the entire operation.
/// Never unlink the lock file or replace this directory while an operation lives.
public final class AppAttestMutationLease: @unchecked Sendable {
    private let lock = NSLock()
    private var descriptor: Int32
    private init(descriptor: Int32) { self.descriptor = descriptor }

    /// Nonblocking: callers receive unavailable instead of blocking an executor.
    /// Closing the descriptor (including process death) releases the reservation.
    public static func acquire(root: URL) throws -> AppAttestMutationLease {
        guard root.isFileURL else { throw CloudError.invalidInput }
        let folder = open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard folder >= 0 else { throw CloudError.unavailable }
        defer { Darwin.close(folder) }
        var directory = stat()
        guard fstat(folder, &directory) == 0,
              directory.st_uid == geteuid(),
              directory.st_mode & 0o077 == 0 else { throw CloudError.unavailable }
        let fd = openat(folder, ".registration-mutation.lock", O_RDWR | O_CREAT | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard fd >= 0 else { throw CloudError.unavailable }
        var retained = false
        defer { if !retained { Darwin.close(fd) } }
        var file = stat()
        guard fstat(fd, &file) == 0,
              file.st_mode & S_IFMT == S_IFREG,
              file.st_uid == geteuid(), file.st_nlink == 1,
              file.st_mode & 0o077 == 0,
              file.st_size == 0,
              flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw CloudError.unavailable }
        retained = true
        return AppAttestMutationLease(descriptor: fd)
    }

    public func release() {
        lock.lock(); defer { lock.unlock() }
        guard descriptor >= 0 else { return }
        // Do not unlink: another process may already hold an open descriptor.
        Darwin.close(descriptor)
        descriptor = -1
    }
    deinit { release() }
}
