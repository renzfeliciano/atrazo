import { api } from "@/server/next-api";

/** POST: start a listahan ("Start my listahan"). DELETE: delete it with every backup and phone. */
export const POST = api.createStore;
export const DELETE = api.deleteStore;
