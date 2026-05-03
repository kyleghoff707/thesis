import { Inngest, EventSchemas } from 'inngest';

// Define event types so TS knows the shape of event.data in functions
type Events = {
  'thes1s/onepager.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId?: string;
    };
  };
  'thes1s/pitchdeck.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId: string;
    };
  };
  'thes1s/fullstory.start': {
    data: {
      runId: string;
      ticker: string;
      userId: string;
      reportId: string;
      parentReportId: string;
    };
  };
  'thes1s/hello.world': {
    data: { message: string };
  };
};

export const inngest = new Inngest({
  id: 'thes1s-agents',
  schemas: new EventSchemas().fromRecord<Events>(),
});
