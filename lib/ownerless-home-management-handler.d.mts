import type {createOwnerlessHomeManagement} from './ownerless-home-management.mjs';
export function ownerlessHomeManagementResponse(request:Request,options:{origin:string;management:ReturnType<typeof createOwnerlessHomeManagement>;timeoutMS?:number}):Promise<Response>;
