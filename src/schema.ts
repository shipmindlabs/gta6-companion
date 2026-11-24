export type Source = {
  url: string;
  // Calendar date in YYYY-MM-DD form.
  checkedOn: string;
};

export type Chapter = {
  id: string;
  number: number;
  title: string;
  mandatoryMissions: number;
  sources: Source[];
};

export type Mission = {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  optional: boolean;
  note?: string;
  sources: Source[];
};

export type Requirement = {
  id: string;
  category: string;
  title: string;
  needed: number;
  // null when no total is reported for the requirement.
  total: number | null;
  unit: string;
  strict: boolean;
  sources: Source[];
};

export type RequirementSet = {
  // false while the file holds fewer requirements than the guides list.
  complete: boolean;
  note: string;
  requirements: Requirement[];
};
