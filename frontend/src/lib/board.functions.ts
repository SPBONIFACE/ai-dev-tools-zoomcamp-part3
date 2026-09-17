import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { api, type BoardJoinResponse, type BoardSessionSummary } from "./api";
import type { BoardEl, BoardOp } from "./board-types";

export type { BoardSessionSummary as BoardSession };

export const joinBoard = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(4).max(64) }).parse(d))
  .handler(async ({ data }): Promise<BoardJoinResponse> => {
    try {
      return await api.boards.join(data.token);
    } catch {
      return { found: false, revoked: false, elements: [] };
    }
  });

export const pushOps = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token: z.string().min(4).max(64),
        ops: z.array(z.any()).max(400),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    return api.boards.pushOps(data.token, data.ops as BoardOp[]);
  });

export const getOwnedSession = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ token: z.string().min(4).max(64) }).parse(d))
  .handler(async ({ data }) => {
    return api.boards.getOwned(data.token);
  });
