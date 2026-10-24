import { MockModelAdapter } from '../src/ai/mock-model-adapter.js';
import { NamingCard } from '../src/ai/naming-card-router.js';
import { createSyntheticModelRequest } from '../test/fixtures/model-requests.js';

const request = createSyntheticModelRequest();
const samples = {
  namingCardToCompanion: NamingCard.select({
    emotionWords: ['疲惫'],
    need: 'LISTEN',
  }),
  namingCardToSearch: NamingCard.select({
    emotionWords: ['担心'],
    need: 'SEARCH',
  }),
  normal: await new MockModelAdapter().respond(request),
  timeout: await new MockModelAdapter({ behavior: 'timeout' }).respond(request),
  unavailable: await new MockModelAdapter({ behavior: 'unavailable' }).respond(request),
};

console.log(JSON.stringify(samples, null, 2));
