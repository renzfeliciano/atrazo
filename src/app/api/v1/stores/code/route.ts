import { serverContainer } from "@/server/production";
import { apiHandlers } from "@/server/routes";

const api = apiHandlers(serverContainer);
export const PUT = api.rotateCode;
