import { z } from 'zod';

import { codePointString } from '../contracts/primitives.js';
import { InvalidInputError } from '../domain/errors.js';

const namingCardSelectionSchema = z.strictObject({
  emotionWords: z.array(codePointString({
    min: 1,
    max: 20,
    trim: true,
    name: 'emotionWord',
  })).min(1).max(5)
    .refine((words) => new Set(words).size === words.length, {
      message: 'emotionWords must not contain duplicates',
    }),
  need: z.enum(['LISTEN', 'ORGANIZE', 'SEARCH']).nullable().optional(),
});

/**
 * 情绪命名卡的确定性路由。这里只决定目标模式，不调用模型、不写数据库。
 */
export class NamingCard {
  static select(input) {
    const parsed = namingCardSelectionSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidInputError('Invalid naming card selection', parsed.error.flatten());
    }

    const { emotionWords, need = null } = parsed.data;
    if (!need) {
      return Object.freeze({
        targetMode: null,
        emotionWords: Object.freeze([...emotionWords]),
        requiresQuestion: false,
      });
    }

    return Object.freeze({
      targetMode: need === 'SEARCH' ? 'SEARCH' : 'COMPANION',
      emotionWords: Object.freeze([...emotionWords]),
      requiresQuestion: need === 'SEARCH',
    });
  }
}
