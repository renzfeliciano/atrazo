import { api } from "@/server/next-api";

export const POST = api.openSession;
export const DELETE = api.closeSession;
