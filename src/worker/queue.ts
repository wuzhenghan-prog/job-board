import {
  extractWithVision,
  sanitizeProfileForAI,
  type ProfileForMatch
} from "./ai";
import { decryptSecret } from "./crypto";
import type { JobBoardEnv } from "./env";
import { parseExtractionResponse } from "../shared/extraction";

type QueueMessage = string;

export async function handleExtractionQueue(
  batch: MessageBatch<QueueMessage>,
  env: JobBoardEnv
): Promise<void> {
  for (const message of batch.messages) {
    const jobId = message.body;
    try {
      const job = await env.DB.prepare(
        "SELECT id, status FROM extraction_jobs WHERE id = ?"
      )
        .bind(jobId)
        .first<{ id: string; status: string }>();
      if (!job || job.status !== "queued") {
        message.ack();
        continue;
      }

      await env.DB.prepare(
        "UPDATE extraction_jobs SET status = 'processing', updated_at = ? WHERE id = ?"
      )
        .bind(new Date().toISOString(), jobId)
        .run();

      const aiSettings = await env.DB.prepare(
        "SELECT base_url, model, encrypted_api_key, daily_limit FROM ai_settings WHERE id = 1"
      ).first<{
        base_url: string;
        model: string;
        encrypted_api_key: string;
        daily_limit: number;
      }>();
      if (!aiSettings) {
        throw new Error("尚未配置 AI 视觉模型");
      }

      const imageRows = await env.DB.prepare(
        "SELECT r2_key, mime_type FROM extraction_images WHERE job_id = ? ORDER BY sort_order ASC"
      )
        .bind(jobId)
        .all<{ r2_key: string; mime_type: string }>();
      if (imageRows.results.length === 0) {
        throw new Error("识别任务没有截图");
      }

      const images = [];
      for (const imageRow of imageRows.results) {
        const object = await env.SCREENSHOTS.get(imageRow.r2_key, "arrayBuffer");
        if (!object) {
          throw new Error("截图文件不存在");
        }
        images.push({
          mimeType: imageRow.mime_type,
          bytes: new Uint8Array(object)
        });
      }

      const profileRow = await env.DB.prepare(
        "SELECT summary, skills, experiences, strengths, gaps FROM profile WHERE id = 1"
      ).first<{
        summary: string;
        skills: string;
        experiences: string;
        strengths: string;
        gaps: string;
      }>();
      const profile = profileRow
        ? sanitizeProfileForAI({
            summary: profileRow.summary,
            skills: JSON.parse(profileRow.skills) as string[],
            experiences: JSON.parse(profileRow.experiences) as string[],
            strengths: JSON.parse(profileRow.strengths) as string[],
            gaps: JSON.parse(profileRow.gaps) as string[]
          })
        : {
            summary: "",
            skills: [],
            experiences: [],
            strengths: [],
            gaps: []
          };

      const categoryRows = await env.DB.prepare(
        "SELECT name FROM categories ORDER BY sort_order ASC"
      ).all<{ name: string }>();

      const apiKey = await decryptSecret(
        aiSettings.encrypted_api_key,
        env.AI_SECRET
      );
      const extraction = await extractWithVision({
        config: {
          baseUrl: aiSettings.base_url,
          model: aiSettings.model,
          apiKey
        },
        categories: (categoryRows.results as Array<{ name: string }>).map(
          (category) => category.name
        ),
        profile: profile as ProfileForMatch,
        images
      });

      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE extraction_jobs SET status = 'awaiting_review', category_name = ?, result = ?, updated_at = ? WHERE id = ?"
        ).bind(
          extraction.categoryName,
          JSON.stringify(extraction),
          now,
          jobId
        )
      ]);
      message.ack();
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "识别失败，请稍后重试";
      await env.DB.prepare(
        "UPDATE extraction_jobs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?"
      )
        .bind(messageText, new Date().toISOString(), jobId)
        .run();
      message.ack();
    }
  }
}
