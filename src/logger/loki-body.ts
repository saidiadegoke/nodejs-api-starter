export const lokiBody = (timestamp, level, message) => {
  return {
    streams: [
      {
        stream: {
          level,
          app: 'commod',
        },
        values: [[timestamp, { level, message }]],
      },
    ],
  };
};
