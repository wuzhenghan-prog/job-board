import { z } from "zod";

import { STAGES } from "../shared/domain";

const stageValues = STAGES.map((stage) => stage.value) as [
  (typeof STAGES)[number]["value"],
  ...(typeof STAGES)[number]["value"][]
];

const nullableString = z.string().trim().min(1).nullable();
const nullableSalary = z.string().trim().min(1).max(80).nullable();
const stringList = z.array(z.string().trim().min(1)).default([]);
const abilityListSchema = z.object({
  hard: stringList,
  general: stringList,
  experience: stringList
});
const matchSchema = z.object({
  level: z.enum(["high", "medium", "low"]),
  strengths: stringList,
  gaps: stringList,
  evidence: stringList
});
const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
  );

export const createOpportunitySchema = z.object({
  title: z.string().trim().min(1).max(80),
  company: nullableString.default(null),
  location: nullableString.default(null),
  salary: nullableSalary.default(null),
  categoryId: z.string().min(1),
  stage: z.enum(stageValues).default("to_evaluate"),
  responsibilities: stringList,
  requirements: stringList,
  abilities: abilityListSchema.default({
    hard: [],
    general: [],
    experience: []
  }),
  match: matchSchema.default({
    level: "low",
    strengths: [],
    gaps: [],
    evidence: []
  }),
  deadline: isoDateTime.nullable().default(null),
  sourceUrl: z.string().url().nullable().default(null),
  notes: z.string().max(2000).nullable().default(null)
});

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;

export type OpportunityRow = {
  id: string;
  company: string | null;
  title: string;
  location: string | null;
  salary: string | null;
  category_id: string;
  category_name?: string;
  stage: string;
  responsibilities: string;
  requirements: string;
  hard_abilities: string;
  general_abilities: string;
  experience_requirements: string;
  match_level: string | null;
  match_strengths: string;
  match_gaps: string;
  match_evidence: string;
  deadline: string | null;
  source_url: string | null;
  notes: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type OpportunityImageRow = {
  id: string;
  opportunity_id: string;
  r2_key: string;
  mime_type: string;
  created_at: string;
};

export type InterviewRoundRow = {
  id: string;
  opportunity_id: string;
  round_type: string;
  scheduled_at: string | null;
  result: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StatusHistoryRow = {
  id: string;
  opportunity_id: string;
  previous_stage: string | null;
  new_stage: string;
  changed_at: string;
};

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mapOpportunity(
  row: OpportunityRow,
  images: OpportunityImageRow[] = [],
  interviewRounds: InterviewRoundRow[] = [],
  statusHistory: StatusHistoryRow[] = []
) {
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    location: row.location,
    salary: row.salary,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    stage: row.stage,
    responsibilities: parseArray(row.responsibilities),
    requirements: parseArray(row.requirements),
    abilities: {
      hard: parseArray(row.hard_abilities),
      general: parseArray(row.general_abilities),
      experience: parseArray(row.experience_requirements)
    },
    match: {
      level: row.match_level ?? "low",
      strengths: parseArray(row.match_strengths),
      gaps: parseArray(row.match_gaps),
      evidence: parseArray(row.match_evidence)
    },
    deadline: row.deadline,
    sourceUrl: row.source_url,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: images.map((image) => ({
      id: image.id,
      opportunityId: image.opportunity_id,
      url: `/api/images/${image.id}`,
      mimeType: image.mime_type,
      createdAt: image.created_at
    })),
    interviewRounds: interviewRounds.map((round) => ({
      id: round.id,
      opportunityId: round.opportunity_id,
      roundType: round.round_type,
      scheduledAt: round.scheduled_at,
      result: round.result,
      notes: round.notes,
      createdAt: round.created_at,
      updatedAt: round.updated_at
    })),
    statusHistory: statusHistory.map((history) => ({
      id: history.id,
      opportunityId: history.opportunity_id,
      previousStage: history.previous_stage,
      newStage: history.new_stage,
      changedAt: history.changed_at
    }))
  };
}

export function opportunityInsertValues(input: CreateOpportunityInput) {
  return {
    company: input.company,
    title: input.title,
    location: input.location,
    salary: input.salary,
    categoryId: input.categoryId,
    stage: input.stage,
    responsibilities: JSON.stringify(input.responsibilities),
    requirements: JSON.stringify(input.requirements),
    hardAbilities: JSON.stringify(input.abilities.hard),
    generalAbilities: JSON.stringify(input.abilities.general),
    experienceRequirements: JSON.stringify(input.abilities.experience),
    matchLevel: input.match.level,
    matchStrengths: JSON.stringify(input.match.strengths),
    matchGaps: JSON.stringify(input.match.gaps),
    matchEvidence: JSON.stringify(input.match.evidence),
    deadline: input.deadline,
    sourceUrl: input.sourceUrl,
    notes: input.notes
  };
}

export function mapInterviewRound(row: InterviewRoundRow) {
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    roundType: row.round_type,
    scheduledAt: row.scheduled_at,
    result: row.result,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
