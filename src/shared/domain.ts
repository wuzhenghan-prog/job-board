export const STAGES = [
  { value: "to_evaluate", label: "待评估", tone: "slate" },
  { value: "preparing", label: "准备投递", tone: "blue" },
  { value: "submitted", label: "已投递", tone: "teal" },
  { value: "interviewing", label: "面试中", tone: "amber" },
  { value: "offer", label: "Offer", tone: "sage" },
  { value: "closed", label: "已结束", tone: "warm" }
] as const;

export type StageValue = (typeof STAGES)[number]["value"];
export type StageTone = (typeof STAGES)[number]["tone"];

export const CATEGORY_PRESETS = [
  "研发",
  "产品",
  "项目管理",
  "运营",
  "数据",
  "设计",
  "销售",
  "其他"
] as const;
