import { IMAGE_GENERATIONS_ENDPOINT, IMAGE_MODEL } from "./constants.js";
import type { JsonObject } from "./http.js";
import { AgnesHTTPClient } from "./http.js";

export interface ImageGenerateOptions {
  prompt: string;
  model?: string;
  size?: string;
  responseFormat?: "url" | "b64_json" | string;
  returnBase64?: boolean;
  image?: string | string[];
  extraBody?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ImagesResource {
  constructor(private readonly http: AgnesHTTPClient) {}

  generate(options: ImageGenerateOptions): Promise<JsonObject> {
    const {
      prompt,
      model = IMAGE_MODEL,
      size,
      responseFormat,
      returnBase64,
      image,
      extraBody,
      ...extra
    } = options;
    const mergedExtraBody = {
      ...(extraBody ?? {}),
      ...(responseFormat === undefined ? {} : { response_format: responseFormat }),
      ...(image === undefined ? {} : { image }),
    };

    return this.http.request("POST", IMAGE_GENERATIONS_ENDPOINT, {
      body: dropUndefined({
        model,
        prompt,
        size,
        return_base64: returnBase64,
        extra_body: Object.keys(mergedExtraBody).length > 0 ? mergedExtraBody : undefined,
        ...extra,
      }),
    });
  }
}

function dropUndefined(data: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
