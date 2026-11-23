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
