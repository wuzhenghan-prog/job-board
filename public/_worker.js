const API_ORIGIN =
  "https://job-board.wuzhenghan-job-board.workers.dev";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return fetch(
        new Request(new URL(url.pathname + url.search, API_ORIGIN), request)
      );
    }
    return new Response("Not found", { status: 404 });
  }
};
