import Foundation
import OuchiCore

/// In-memory presentation fixture only. Never authenticates or sends a request.
@main struct NativeReviewFamilySmoke {
    static func main() async throws {
        let fixture=NativeReviewFixture(includeSecondHome:true)
        let configuration=try CloudConfiguration(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co")!,
            publishableKey:"sb_publishable_synthetic_review_only")
        let api=HouseholdAPI(config:configuration,transport:{request in try await fixture.reply(request)})
        let members=try await api.members(home:NativeReviewFixture.home,token:NativeReviewFixture.token)
        precondition(members.count==1 && members[0].nickname=="家族のサンプル")
        precondition(members[0].user_id != NativeReviewFixture.account)
        let second=try await api.members(home:"66666666-6666-4666-8666-666666666666",token:NativeReviewFixture.token)
        precondition(second.count==1)
        for (home,token) in [(UUID().uuidString,NativeReviewFixture.token),(NativeReviewFixture.home,"wrong-fixture-token")] {
            do { _=try await api.members(home:home,token:token);preconditionFailure("Unscoped sample request accepted") }
            catch { }
        }
        var write=URLRequest(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/home_members")!)
        write.httpMethod="DELETE";write.setValue("Bearer "+NativeReviewFixture.token,forHTTPHeaderField:"Authorization")
        do { _=try await fixture.reply(write);preconditionFailure("Sample mutation accepted") } catch { }
        var broad=URLRequest(url:URL(string:"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/home_members?select=user_id,nickname")!)
        broad.httpMethod="GET";broad.setValue("Bearer "+NativeReviewFixture.token,forHTTPHeaderField:"Authorization")
        do { _=try await fixture.reply(broad);preconditionFailure("Unscoped sample list accepted") } catch { }
        print("Native family presentation fixture: real HouseholdAPI decoding, two known homes, unknown home/token and write/unscoped requests refused; no network or real account.")
    }
}
