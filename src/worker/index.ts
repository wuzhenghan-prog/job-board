import app from "./app";
import { handleExtractionQueue } from "./queue";
import { handleDiscoveryQueue, triggerScheduledDiscovery } from "./discoveryQueue";
import type { JobBoardEnv } from "./env";

export default {
  fetch(request: Request, env: JobBoardEnv, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async queue(batch: MessageBatch<string>, env: JobBoardEnv): Promise<void> {
    if (batch.queue === "job-board-discovery") {
      await handleDiscoveryQueue(batch, env);
      return;
    }
    await handleExtractionQueue(batch as MessageBatch<string>, env);
  },
  scheduled(controller: ScheduledController, env: JobBoardEnv, ctx: ExecutionContext) {
    ctx.waitUntil(triggerScheduledDiscovery(env, new Date(controller.scheduledTime)));
  }
};
