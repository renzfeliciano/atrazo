import { serverContainer } from "@/server/production";
import { apiHandlers } from "@/server/routes";

const api = apiHandlers(serverContainer);
export const POST = api.openSession;
export const DELETE = api.closeSession;
