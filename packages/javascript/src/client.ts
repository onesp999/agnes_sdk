import { ChatResource } from "./chat.js";
import type { AgnesClientConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { AgnesHTTPClient } from "./http.js";
import { ImagesResource } from "./images.js";
import { VideosResource } from "./videos.js";

export class AgnesClient {
  readonly chat: ChatResource;
  readonly images: ImagesResource;
  readonly videos: VideosResource;

  private readonly http: AgnesHTTPClient;

  constructor(config: AgnesClientConfig = {}) {
    const resolvedConfig = resolveConfig(config);
    this.http = new AgnesHTTPClient(resolvedConfig);
    this.chat = new ChatResource(this.http);
    this.images = new ImagesResource(this.http);
    this.videos = new VideosResource(this.http);
  }
}
