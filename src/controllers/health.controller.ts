import type { RequestHandler } from "express";

export const getHealth: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
    },
  });
};
