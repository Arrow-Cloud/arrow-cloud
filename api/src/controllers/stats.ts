import { respond } from '../utils/responses';
import { RouteHandler } from '../utils/types';

export const statsRenderer: RouteHandler = async () => {
  const response = {
    cards: [
      {
        title: 'Active Players',
        value: '1,234',
        description: 'This year',
        icon: 'Users',
      },
      {
        title: 'Songs Played',
        value: '9,567',
        description: 'This month',
        icon: 'Music',
      },
      {
        title: 'Quints Achieved',
        value: '803',
        description: 'This year',
        icon: 'Flame',
      },
      {
        title: '8FA Quints',
        value: '2',
        description: 'Since launch',
        icon: 'Award',
      },
    ],
  };
  return respond(200, response);
};
