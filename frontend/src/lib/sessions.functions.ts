import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api, type SessionRow } from "./api";

export type { SessionRow };

export const listSessions = createServerFn({ method: "GET" }).handler(async () => {
  return api.sessions.list();
});

export const createSession = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(1).max(120),
        candidate_name: z.string().max(120).default(""),
        role_title: z.string().max(120).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return api.sessions.create(data);
  });

export const updateSession = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(20000).optional(),
        status: z.enum(["draft", "live", "completed"]).optional(),
        link_revoked: z.boolean().optional(),
        title: z.string().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { id, ...patch } = data;
    await api.sessions.update(id, patch);
    return { ok: true };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await api.sessions.delete(data.id);
    return { ok: true };
  });
