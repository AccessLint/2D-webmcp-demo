type SiteEnvironment = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

export default {
  async fetch(request: Request, environment: SiteEnvironment) {
    const response = await environment.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (request.method !== "GET" || response.status !== 404 || !acceptsHtml) {
      return response;
    }

    return environment.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};
