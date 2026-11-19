export type ExtractionJobRow = {
  id: string;
  status: string;
  category_name: string;
  result: string | null;
  error: string | null;
  image_count: number;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExtractionImageRow = {
  id: string;
  job_id: string;
  r2_key: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
};

function parseResult(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mapExtractionJob(
  row: ExtractionJobRow,
  images: ExtractionImageRow[]
) {
  return {
    id: row.id,
    status: row.status,
    categoryName: row.category_name,
    result: parseResult(row.result),
    error: row.error,
    imageCount: row.image_count,
    opportunityId: row.opportunity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images: images.map((image) => ({
      id: image.id,
      jobId: image.job_id,
      url: `/api/extraction-images/${image.id}`,
      mimeType: image.mime_type,
      sortOrder: image.sort_order
    }))
  };
}
