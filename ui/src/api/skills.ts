import { api } from "./client";

export interface SkillIndexEntry {
  name: string;
  description: string;
  path: string;
  tags: string[];
}

export interface SkillsIndexResponse {
  skills: SkillIndexEntry[];
}

export const skillsApi = {
  getIndex: () => api.get<SkillsIndexResponse>("/skills/index"),
};
