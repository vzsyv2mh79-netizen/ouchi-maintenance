export class HomeHandoffRefusal extends Error {
  constructor(reason: string);
  reason: string;
}
export class HomeHandoffAdditionalVerificationRequired extends Error {}
export type HomeHandoffIdentity = {userID: string; sessionID: string; epochID: string};
export type HomeHandoffScope = HomeHandoffIdentity & {requestID: string};
export type HomeHandoffStatus = {
  requestID: string;
  homeID: string;
  state: 'pending' | 'expired' | 'cancelled' | 'completed';
  expiresAt: string;
};
export function homeHandoffResponse(request: Request, ports: {
  origin: string;
  timeoutMS?: number;
  verifyCurrent(bearer: string, signal: AbortSignal): Promise<HomeHandoffIdentity | null>;
  read(scope: HomeHandoffScope, signal: AbortSignal): Promise<HomeHandoffStatus | null>;
  create(scope: HomeHandoffScope & {homeID: string; recipientID: string}, signal: AbortSignal): Promise<HomeHandoffStatus>;
  decide(scope: HomeHandoffScope & {accept: boolean}, signal: AbortSignal): Promise<HomeHandoffStatus>;
}): Promise<Response>;
