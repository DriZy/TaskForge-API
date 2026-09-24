import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();
const port = env.PORT;

app.listen(port, () => {
  console.log(
    `[server] TaskForge API listening on http://0.0.0.0:${port} (${env.NODE_ENV})`,
  );
});
