import { zodToJsonSchema } from 'zod-to-json-schema';
import { OnePagerOutputSchema } from '../src/agents/schemas/one-pager.ts';

const s = zodToJsonSchema(OnePagerOutputSchema, {
  target: 'jsonSchema2019-09',
  $refStrategy: 'none',
});
delete s.$schema;
console.log(JSON.stringify(s, null, 2));
