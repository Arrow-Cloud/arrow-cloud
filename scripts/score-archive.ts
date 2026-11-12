/** Runs the Lambda handler locally */
import { handler } from '../api/src/score-archive';

handler(JSON.parse(process.argv[2] ?? '{}')).then(
  (result) => console.log(JSON.stringify(result)),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
