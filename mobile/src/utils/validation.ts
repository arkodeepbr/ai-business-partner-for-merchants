import { z } from 'zod';

export const assistantRequestSchema = z.object({
  question: z.string().trim().min(1, 'Write a question first.').max(2000, 'Keep questions under 2,000 characters.'),
});
