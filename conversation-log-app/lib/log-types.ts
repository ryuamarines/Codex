export type ConversationLog = {
  id: string;
  title: string;
  date: string;
  category: string;
  content: string;
  tags: string[];
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ConversationLogInput = {
  title: string;
  date: string;
  category: string;
  content: string;
  tagsText: string;
  note: string;
};

export type LogFilters = {
  query: string;
  category: string;
  tag: string;
};
