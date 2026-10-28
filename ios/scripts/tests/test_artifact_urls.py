import importlib.util
import plistlib
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("artifact", Path(__file__).resolve().parents[1] / "verify-store-artifact.py")
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
FIELDS = ("OUCHI_TERMS_URL", "OUCHI_PRIVACY_URL", "OUCHI_SUPPORT_URL")

def valid_info():
    return {"SUPABASE_URL":"https://" + "a" * 20 + ".supabase.co", "SUPABASE_PUBLISHABLE_KEY":"sb_publishable_" + "synthetic" * 5,
            "ITSAppUsesNonExemptEncryption":False, **dict.fromkeys(FIELDS,"https://example.com/legal")}

class ArtifactURLTests(unittest.TestCase):
    def test_valid_built_plist_configuration(self):
        info = plistlib.loads(plistlib.dumps(valid_info()))
        self.assertEqual(artifact.configuration_checks(info,"submission"), [])

    def test_each_legal_destination_refuses_private_or_unsafe_url(self):
        for field in FIELDS:
            for value in ["https://10.0.0.1", "https://127.1", "https://[::1]", "https://0x7f.0.0.0x01", "https://private.internal", "http://example.com", "https://example.com:bad", "https://u:p@example.com", "https://example.com\\@localhost"]:
                with self.subTest(field=field,value=value):
                    info = valid_info(); info[field] = value
                    info = plistlib.loads(plistlib.dumps(info))
                    errors = artifact.configuration_checks(info,"submission")
                    self.assertEqual(len(errors),1)
                    self.assertIn(field,errors[0])

    def test_missing_and_nontext_values_refuse_without_crash(self):
        for field in FIELDS:
            for value in [None, True, 123, [], {}]:
                with self.subTest(field=field,value=value):
                    info = valid_info(); info[field] = value
                    self.assertTrue(any(field in error for error in artifact.configuration_checks(info,"submission")))

    def test_development_stage_does_not_claim_submission_acceptance(self):
        info = valid_info()
        for field in FIELDS: info.pop(field)
        self.assertEqual(artifact.configuration_checks(info,"development"), [])
        self.assertEqual(len(artifact.configuration_checks(info,"submission")),3)

if __name__ == "__main__": unittest.main()
