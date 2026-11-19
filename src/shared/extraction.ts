import { z } from "zod";

const nullableText = z.string().trim().min(1).nullable();

export const extractionSchema = z.object({
  company: nullableText,
  title: nullableText,
  location: nullableText,
  salary: nullableText,
  categoryName: z.string().trim().min(1),
  responsibilities: z.array(z.string().trim().min(1)),
  requirements: z.array(z.string().trim().min(1)),
  abilities: z.object({
    hard: z.array(z.string().trim().min(1)),
    general: z.array(z.string().trim().min(1)),
    experience: z.array(z.string().trim().min(1))
  }),
  match: z.object({
    level: z.enum(["high", "medium", "low"]),
    strengths: z.array(z.string().trim().min(1)),
    gaps: z.array(z.string().trim().min(1)),
    evidence: z.array(z.string().trim().min(1))
  }),
  missingFields: z.array(z.string().trim().min(1))
});

export type JobExtraction = z.infer<typeof extractionSchema>;

export function parseExtractionResponse(raw: string): JobExtraction {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("模型未返回有效 JSON");
  }

  const result = extractionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("模型返回格式不完整");
  }

  return result.data;
}

function normalizePart(value: string | null): string {
  if (!value) return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

export function normalizeOpportunityKey(input: {
  company: string | null;
  title: string | null;
  location: string | null;
}): string {
  return [
    normalizePart(input.company),
    normalizePart(input.title),
    normalizePart(input.location)
  ].join("|");
}
