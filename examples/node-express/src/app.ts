import { AgnesAPIError, AgnesClient, AgnesError } from "@agnes-ai/sdk";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

export interface ExampleAgnesClient {
  chat: {
    create(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  images: {
    generate(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  videos: {
    create(payload: Record<string, unknown>): Promise<Record<string, unknown>>;
    retrieve(videoId: string): Promise<Record<string, unknown>>;
    wait(videoId: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

export type ClientFactory = () => ExampleAgnesClient;

export function createApp(clientFactory: ClientFactory = () => new AgnesClient()) {
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: process.env.PLAYGROUND_ORIGIN ?? "http://localhost:5173",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/api/chat", async (request, response, next) => {
    try {
      response.json(await clientFactory().chat.create(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/images", async (request, response, next) => {
    try {
      response.json(await clientFactory().images.generate(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/videos", async (request, response, next) => {
    try {
      response.json(await clientFactory().videos.create(request.body));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/videos/:videoId", async (request, response, next) => {
    try {
      response.json(await clientFactory().videos.retrieve(request.params.videoId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/videos/:videoId/wait", async (request, response, next) => {
    try {
      response.json(await clientFactory().videos.wait(request.params.videoId, request.body));
    } catch (error) {
      next(error);
    }
  });

  app.use(errorHandler);

  return app;
}

function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  const statusCode =
    error instanceof AgnesAPIError && error.statusCode !== undefined ? error.statusCode : 500;
  response.status(statusCode).json({
    error: {
      message: safeMessage(error),
      type: error instanceof Error ? error.name : "Error",
    },
  });
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const apiKey = process.env.AGNES_API_KEY;
  return apiKey ? message.replaceAll(apiKey, "[redacted]") : message;
}
