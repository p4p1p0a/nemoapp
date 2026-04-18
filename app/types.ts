export type Note = {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  updatedAt: number;
  type?: 'document' | 'board' | 'daily';
};

export type Tab = {
  id: string | null;
  title: string;
};
