import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("listing", Path(__file__).resolve().parents[1] / "verify-listing-draft.py")
listing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(listing)

class ListingURLTests(unittest.TestCase):
    def test_public_https_paths_and_anchors_remain_usable(self):
        for url in ["https://ouchi-maintenance.vercel.app/support", "https://example.com/legal/privacy#retention", "https://example.com:8443/privacy", "https://例え.jp/privacy"]:
            with self.subTest(url=url): self.assertTrue(listing.public_https_url(url))

    def test_local_private_and_browser_numeric_aliases_refuse(self):
        for host in ["localhost", "a.localhost", "printer.local", "service.internal", "host.test", "a.invalid", "a.example", "router.home.arpa", "127.0.0.1", "127.1", "2130706433", "0x7f000001", "0x7f.0.0.0x01", "10.0.0.2", "172.16.0.1", "192.168.1.1", "169.254.169.254", "[::1]", "[fc00::1]", "[::ffff:127.0.0.1]"]:
            with self.subTest(host=host): self.assertFalse(listing.public_https_url("https://" + host + "/privacy"))

    def test_non_text_configuration_values_refuse(self):
        for value in [None, True, 443, [], {}, b"https://example.com"]:
            with self.subTest(value=value): self.assertFalse(listing.public_https_url(value))

    def test_unsafe_or_malformed_urls_refuse(self):
        for url in ["http://example.com/privacy", "https://user:password@example.com", "https://example.com:bad", "https://example.com:99999", "https://[bad", " https://example.com", "https://example.com/\nprivacy", "https://example.com\\@localhost", "file:///privacy", "https://bad_host.com", "https://example.com./\t"]:
            with self.subTest(url=url): self.assertFalse(listing.public_https_url(url))

    def test_owner_check_preserves_missing_fields_and_checks_both_destinations(self):
        owner = {"developerName":"Test Developer", "copyright":"2026 Test", "supportURL":"https://example.com/support", "privacyPolicyURL":"https://example.com/privacy"}
        self.assertEqual(listing.check_owner_fields({"ownerFields":owner}), [])
        for field in ["supportURL", "privacyPolicyURL"]:
            bad = dict(owner, **{field:"https://127.1/private"})
            self.assertEqual(len(listing.check_owner_fields({"ownerFields":bad})), 1)
        self.assertTrue(listing.check_owner_fields({"ownerFields":{}}))

if __name__ == "__main__": unittest.main()
